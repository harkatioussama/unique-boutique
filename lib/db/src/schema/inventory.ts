import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { timestamps } from "./columns";
import { stockMovementReasonEnum } from "./enums";
import { ordersTable } from "./orders";
import { productVariantsTable } from "./products";

// One row per variant. The checks make negative or over-reserved stock
// impossible at the database level, even if application code is wrong.
// Change stock only through the helpers in ../stock.ts.
export const inventoryTable = pgTable(
  "inventory",
  {
    variantId: integer("variant_id")
      .primaryKey()
      .references(() => productVariantsTable.id, { onDelete: "restrict" }),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(2),
    ...timestamps,
  },
  (t) => [
    check("inventory_on_hand_non_negative", sql`${t.onHand} >= 0`),
    check("inventory_reserved_non_negative", sql`${t.reserved} >= 0`),
    check(
      "inventory_reserved_within_on_hand",
      sql`${t.reserved} <= ${t.onHand}`,
    ),
    check(
      "inventory_low_stock_threshold_non_negative",
      sql`${t.lowStockThreshold} >= 0`,
    ),
  ],
);

// Append-only log of every stock change.
export const stockMovementsTable = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    variantId: integer("variant_id")
      .notNull()
      .references(() => productVariantsTable.id, { onDelete: "restrict" }),
    reason: stockMovementReasonEnum("reason").notNull(),
    onHandDelta: integer("on_hand_delta").notNull().default(0),
    reservedDelta: integer("reserved_delta").notNull().default(0),
    onHandAfter: integer("on_hand_after").notNull(),
    reservedAfter: integer("reserved_after").notNull(),
    orderId: integer("order_id").references(() => ordersTable.id, {
      onDelete: "restrict",
    }),
    note: text("note"),
    // Free-form until admin users exist (Phase 2), e.g. "system" or an admin email.
    actor: text("actor").notNull().default("system"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("stock_movements_variant_created_idx").on(t.variantId, t.createdAt),
    index("stock_movements_order_idx").on(t.orderId),
    check(
      "stock_movements_has_delta",
      sql`${t.onHandDelta} <> 0 or ${t.reservedDelta} <> 0`,
    ),
  ],
);

export type Inventory = typeof inventoryTable.$inferSelect;
export type StockMovement = typeof stockMovementsTable.$inferSelect;
