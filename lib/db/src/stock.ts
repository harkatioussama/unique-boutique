import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import {
  brandsTable,
  deliveryRatesTable,
  inventoryTable,
  orderItemsTable,
  orderStatusHistoryTable,
  ordersTable,
  productVariantsTable,
  productsTable,
  stockMovementsTable,
  wilayasTable,
  type Order,
  type OrderStatus,
} from "./schema";

// Every stock change goes through these helpers. Each runs in one transaction,
// changes stock with a single guarded UPDATE (so two buyers can never take the
// same last unit), and writes stock_movements / order_status_history.
// Nothing here is exposed over HTTP yet; endpoints come with admin auth.

export type Database = NodePgDatabase<typeof schema>;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type StockErrorCode =
  | "invalid_quantity"
  | "insufficient_stock"
  | "variant_unavailable"
  | "inventory_missing"
  | "order_not_found"
  | "delivery_unavailable"
  | "invalid_transition";

export class StockError extends Error {
  constructor(
    public readonly code: StockErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "StockError";
  }
}

// Cash-on-delivery lifecycle. "shipped -> cancelled" covers a parcel refused
// at the door; "returned" is only reachable after delivery.
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

const STATUS_TIMESTAMP = {
  confirmed: "confirmedAt",
  shipped: "shippedAt",
  delivered: "deliveredAt",
  cancelled: "cancelledAt",
  returned: "returnedAt",
} as const satisfies Partial<Record<OrderStatus, keyof Order>>;

function assertQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new StockError(
      "invalid_quantity",
      "Quantity must be a positive integer",
      { quantity },
    );
  }
}

type MovementInput = {
  variantId: number;
  reason: (typeof schema.stockMovementReasonEnum.enumValues)[number];
  onHandDelta: number;
  reservedDelta: number;
  orderId?: number | null;
  note?: string | null;
  actor: string;
};

// Applies a guarded delta to one inventory row and logs it. `guard` is the
// extra condition that must hold before the update, or nothing changes.
async function applyStockDelta(
  tx: Tx,
  movement: MovementInput,
  guard: ReturnType<typeof sql>,
  failure: StockErrorCode,
) {
  const [row] = await tx
    .update(inventoryTable)
    .set({
      onHand: sql`${inventoryTable.onHand} + ${movement.onHandDelta}`,
      reserved: sql`${inventoryTable.reserved} + ${movement.reservedDelta}`,
    })
    .where(and(eq(inventoryTable.variantId, movement.variantId), guard))
    .returning();

  if (!row) {
    const exists = await tx
      .select({ variantId: inventoryTable.variantId })
      .from(inventoryTable)
      .where(eq(inventoryTable.variantId, movement.variantId));
    throw new StockError(
      exists.length ? failure : "inventory_missing",
      exists.length
        ? `Stock change refused for variant ${movement.variantId}`
        : `No inventory row for variant ${movement.variantId}`,
      { variantId: movement.variantId, reason: movement.reason },
    );
  }

  await tx.insert(stockMovementsTable).values({
    variantId: movement.variantId,
    reason: movement.reason,
    onHandDelta: movement.onHandDelta,
    reservedDelta: movement.reservedDelta,
    onHandAfter: row.onHand,
    reservedAfter: row.reserved,
    orderId: movement.orderId ?? null,
    note: movement.note ?? null,
    actor: movement.actor,
  });

  return row;
}

function reserve(
  tx: Tx,
  variantId: number,
  quantity: number,
  orderId: number,
  actor: string,
) {
  return applyStockDelta(
    tx,
    {
      variantId,
      reason: "order_reserved",
      onHandDelta: 0,
      reservedDelta: quantity,
      orderId,
      actor,
    },
    sql`${inventoryTable.onHand} - ${inventoryTable.reserved} >= ${quantity}`,
    "insufficient_stock",
  );
}

function release(
  tx: Tx,
  variantId: number,
  quantity: number,
  orderId: number,
  actor: string,
) {
  return applyStockDelta(
    tx,
    {
      variantId,
      reason: "order_released",
      onHandDelta: 0,
      reservedDelta: -quantity,
      orderId,
      actor,
    },
    sql`${inventoryTable.reserved} >= ${quantity}`,
    "insufficient_stock",
  );
}

function fulfil(
  tx: Tx,
  variantId: number,
  quantity: number,
  orderId: number,
  actor: string,
) {
  return applyStockDelta(
    tx,
    {
      variantId,
      reason: "order_fulfilled",
      onHandDelta: -quantity,
      reservedDelta: -quantity,
      orderId,
      actor,
    },
    sql`${inventoryTable.reserved} >= ${quantity}`,
    "insufficient_stock",
  );
}

function restockReturn(
  tx: Tx,
  variantId: number,
  quantity: number,
  orderId: number,
  actor: string,
) {
  return applyStockDelta(
    tx,
    {
      variantId,
      reason: "order_returned",
      onHandDelta: quantity,
      reservedDelta: 0,
      orderId,
      actor,
    },
    sql`true`,
    "insufficient_stock",
  );
}

/**
 * Manual stock change by staff: `restock` adds units, `adjustment` corrects a
 * count up or down. Refuses to drop on-hand stock below what is reserved.
 */
export async function adjustStock(
  db: Database,
  input: {
    variantId: number;
    delta: number;
    reason: "restock" | "adjustment";
    note?: string;
    actor: string;
  },
) {
  if (!Number.isSafeInteger(input.delta) || input.delta === 0) {
    throw new StockError(
      "invalid_quantity",
      "Delta must be a non-zero integer",
      {
        delta: input.delta,
      },
    );
  }
  if (input.reason === "restock") assertQuantity(input.delta);

  return db.transaction(async (tx) => {
    await tx
      .insert(inventoryTable)
      .values({ variantId: input.variantId })
      .onConflictDoNothing();
    return applyStockDelta(
      tx,
      {
        variantId: input.variantId,
        reason: input.reason,
        onHandDelta: input.delta,
        reservedDelta: 0,
        note: input.note,
        actor: input.actor,
      },
      sql`${inventoryTable.onHand} + ${input.delta} >= ${inventoryTable.reserved}`,
      "insufficient_stock",
    );
  });
}

export type PlaceOrderInput = {
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  wilayaId: number;
  deliveryType: "home" | "desk";
  commune: string;
  addressLine: string;
  customerNote?: string | null;
  items: { variantId: number; quantity: number }[];
  actor?: string;
};

/**
 * Creates a pending cash-on-delivery order. Prices, the wilaya and the
 * delivery fee all come from the database, never from the caller, and are
 * copied onto the order as a snapshot. Every line's stock is reserved in the
 * same transaction: if any line is short or the delivery method is off,
 * nothing is written.
 */
export async function placeOrder(db: Database, input: PlaceOrderInput) {
  const actor = input.actor ?? "system";
  if (input.items.length === 0) {
    throw new StockError(
      "invalid_quantity",
      "An order needs at least one item",
    );
  }
  // Merge repeated variants and lock rows in a fixed order to avoid deadlocks.
  const quantities = new Map<number, number>();
  for (const item of input.items) {
    assertQuantity(item.quantity);
    quantities.set(
      item.variantId,
      (quantities.get(item.variantId) ?? 0) + item.quantity,
    );
  }
  const variantIds = [...quantities.keys()].sort((a, b) => a - b);

  return db.transaction(async (tx) => {
    // FOR SHARE: an owner editing this rate waits until the order commits,
    // so the order always records a fee that was in force.
    const [destination] = await tx
      .select({ wilaya: wilayasTable, rate: deliveryRatesTable })
      .from(wilayasTable)
      .innerJoin(
        deliveryRatesTable,
        eq(deliveryRatesTable.wilayaId, wilayasTable.id),
      )
      .where(eq(wilayasTable.id, input.wilayaId))
      .for("share");

    const shippingFeeDzd = destination
      ? deliveryFeeFor(destination.rate, input.deliveryType)
      : null;
    // A wilaya without an official code cannot be delivered to.
    const wilayaCode = destination?.wilaya.code ?? null;
    if (
      !destination ||
      !destination.wilaya.isActive ||
      wilayaCode === null ||
      shippingFeeDzd === null
    ) {
      throw new StockError(
        "delivery_unavailable",
        `Delivery method ${input.deliveryType} is not available for wilaya ${input.wilayaId}`,
        { wilayaId: input.wilayaId, deliveryType: input.deliveryType },
      );
    }
    const { wilaya, rate } = destination;

    const variants = await tx
      .select({
        variantId: productVariantsTable.id,
        sku: productVariantsTable.sku,
        label: productVariantsTable.label,
        variantPrice: productVariantsTable.priceDzd,
        variantActive: productVariantsTable.isActive,
        productName: productsTable.name,
        productPrice: productsTable.priceDzd,
        productActive: productsTable.isActive,
        brandName: brandsTable.name,
        brandActive: brandsTable.isActive,
      })
      .from(productVariantsTable)
      .innerJoin(
        productsTable,
        eq(productVariantsTable.productId, productsTable.id),
      )
      .innerJoin(brandsTable, eq(productsTable.brandId, brandsTable.id))
      .where(inArray(productVariantsTable.id, variantIds));

    const byId = new Map(variants.map((v) => [v.variantId, v]));
    const lines = variantIds.map((variantId) => {
      const v = byId.get(variantId);
      if (!v || !v.variantActive || !v.productActive || !v.brandActive) {
        throw new StockError(
          "variant_unavailable",
          `Variant ${variantId} is not for sale`,
          {
            variantId,
          },
        );
      }
      const quantity = quantities.get(variantId)!;
      const unitPriceDzd = v.variantPrice ?? v.productPrice;
      return {
        variantId,
        productName: v.productName,
        brandName: v.brandName,
        variantLabel: v.label,
        sku: v.sku,
        unitPriceDzd,
        quantity,
        lineTotalDzd: unitPriceDzd * quantity,
      };
    });

    const subtotalDzd = lines.reduce((sum, l) => sum + l.lineTotalDzd, 0);

    // Take the id first so the order number can be stored with the row.
    const {
      rows: [{ id }],
    } = await tx.execute<{ id: number }>(
      sql`select nextval(pg_get_serial_sequence('orders', 'id'))::int as id`,
    );

    const [order] = await tx
      .insert(ordersTable)
      .values({
        id,
        orderNumber: formatOrderNumber(id),
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail ?? null,
        wilayaId: wilaya.id,
        wilayaCode,
        wilayaName: wilaya.nameFr,
        wilayaNameAr: wilaya.nameAr,
        deliveryType: input.deliveryType,
        deliveryRateSnapshot: {
          homeAvailable: rate.homeAvailable,
          homeFeeDzd: rate.homeFeeDzd,
          deskAvailable: rate.deskAvailable,
          deskFeeDzd: rate.deskFeeDzd,
          minDays: rate.minDays,
          maxDays: rate.maxDays,
          rateUpdatedAt: rate.updatedAt.toISOString(),
        },
        commune: input.commune,
        addressLine: input.addressLine,
        customerNote: input.customerNote ?? null,
        subtotalDzd,
        shippingFeeDzd,
        totalDzd: subtotalDzd + shippingFeeDzd,
      })
      .returning();

    await tx
      .insert(orderItemsTable)
      .values(lines.map((l) => ({ ...l, orderId: order.id })));

    for (const line of lines) {
      await reserve(tx, line.variantId, line.quantity, order.id, actor);
    }

    await tx.insert(orderStatusHistoryTable).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: "pending",
      actor,
    });

    return { order, items: lines };
  });
}

/**
 * Moves an order to a new status and applies the matching stock effect:
 * delivered fulfils the reservation, cancelled releases it (or restocks
 * nothing if it was never reserved), returned puts units back on hand.
 */
export async function changeOrderStatus(
  db: Database,
  input: {
    orderId: number;
    toStatus: OrderStatus;
    note?: string;
    actor: string;
  },
) {
  return db.transaction(async (tx) => {
    // Row lock: concurrent status changes on the same order run one at a time.
    const [current] = await tx
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, input.orderId))
      .for("update");

    if (!current) {
      throw new StockError(
        "order_not_found",
        `Order ${input.orderId} not found`,
      );
    }
    if (!canTransition(current.status, input.toStatus)) {
      throw new StockError(
        "invalid_transition",
        `Cannot move order from ${current.status} to ${input.toStatus}`,
        { from: current.status, to: input.toStatus },
      );
    }

    const items = await tx
      .select({
        variantId: orderItemsTable.variantId,
        quantity: orderItemsTable.quantity,
      })
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, current.id))
      .orderBy(orderItemsTable.variantId);

    const effect =
      input.toStatus === "delivered"
        ? fulfil
        : input.toStatus === "cancelled"
          ? release
          : input.toStatus === "returned"
            ? restockReturn
            : null;

    if (effect) {
      for (const item of items) {
        await effect(
          tx,
          item.variantId,
          item.quantity,
          current.id,
          input.actor,
        );
      }
    }

    const timestampColumn =
      input.toStatus in STATUS_TIMESTAMP
        ? STATUS_TIMESTAMP[input.toStatus as keyof typeof STATUS_TIMESTAMP]
        : null;

    const [updated] = await tx
      .update(ordersTable)
      .set({
        status: input.toStatus,
        ...(timestampColumn ? { [timestampColumn]: new Date() } : {}),
      })
      .where(eq(ordersTable.id, current.id))
      .returning();

    await tx.insert(orderStatusHistoryTable).values({
      orderId: current.id,
      fromStatus: current.status,
      toStatus: input.toStatus,
      note: input.note ?? null,
      actor: input.actor,
    });

    return updated;
  });
}

// The fee for a delivery method, or null when that method is switched off.
export function deliveryFeeFor(
  rate: {
    homeAvailable: boolean;
    homeFeeDzd: number | null;
    deskAvailable: boolean;
    deskFeeDzd: number | null;
  },
  deliveryType: "home" | "desk",
): number | null {
  if (deliveryType === "home") {
    return rate.homeAvailable ? rate.homeFeeDzd : null;
  }
  return rate.deskAvailable ? rate.deskFeeDzd : null;
}

export function formatOrderNumber(id: number): string {
  return `UQ-${String(id).padStart(6, "0")}`;
}
