import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { timestamps } from "./columns";
import { deliveryTypeEnum, orderStatusEnum, paymentMethodEnum } from "./enums";
import { productVariantsTable } from "./products";
import { wilayasTable } from "./wilayas";

// Cash-on-delivery orders. Totals are computed on the server, in whole DZD.
export const ordersTable = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    orderNumber: text("order_number").notNull(),
    status: orderStatusEnum("status").notNull().default("pending"),
    paymentMethod: paymentMethodEnum("payment_method")
      .notNull()
      .default("cash_on_delivery"),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),
    // Snapshot of the wilaya and delivery rate at order time. A database
    // trigger (migration 0003) rejects any later change to these columns.
    // wilaya_id, wilaya_name_ar, delivery_type and delivery_rate_snapshot
    // are null only on orders created before Phase 2.
    wilayaId: integer("wilaya_id").references(() => wilayasTable.id, {
      onDelete: "restrict",
    }),
    wilayaCode: integer("wilaya_code").notNull(),
    wilayaName: text("wilaya_name").notNull(),
    wilayaNameAr: text("wilaya_name_ar"),
    deliveryType: deliveryTypeEnum("delivery_type"),
    deliveryRateSnapshot: jsonb("delivery_rate_snapshot"),
    commune: text("commune").notNull(),
    addressLine: text("address_line").notNull(),
    customerNote: text("customer_note"),
    subtotalDzd: integer("subtotal_dzd").notNull(),
    shippingFeeDzd: integer("shipping_fee_dzd").notNull().default(0),
    totalDzd: integer("total_dzd").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("orders_order_number_unique").on(t.orderNumber),
    index("orders_status_created_idx").on(t.status, t.createdAt),
    index("orders_created_idx").on(t.createdAt),
    index("orders_customer_phone_idx").on(t.customerPhone),
    index("orders_wilaya_idx").on(t.wilayaCode),
    index("orders_wilaya_id_idx").on(t.wilayaId),
    check("orders_wilaya_code_positive", sql`${t.wilayaCode} > 0`),
    check("orders_subtotal_non_negative", sql`${t.subtotalDzd} >= 0`),
    check("orders_shipping_fee_non_negative", sql`${t.shippingFeeDzd} >= 0`),
    check(
      "orders_total_matches",
      sql`${t.totalDzd} = ${t.subtotalDzd} + ${t.shippingFeeDzd}`,
    ),
  ],
);

// Line items keep a snapshot of name, brand, SKU and price at order time,
// so past orders stay correct when the catalogue changes.
export const orderItemsTable = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "restrict" }),
    variantId: integer("variant_id")
      .notNull()
      .references(() => productVariantsTable.id, { onDelete: "restrict" }),
    productName: text("product_name").notNull(),
    brandName: text("brand_name").notNull(),
    variantLabel: text("variant_label").notNull(),
    sku: text("sku").notNull(),
    unitPriceDzd: integer("unit_price_dzd").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalDzd: integer("line_total_dzd").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    index("order_items_variant_idx").on(t.variantId),
    uniqueIndex("order_items_order_variant_unique").on(t.orderId, t.variantId),
    check("order_items_quantity_positive", sql`${t.quantity} > 0`),
    check("order_items_unit_price_non_negative", sql`${t.unitPriceDzd} >= 0`),
    check(
      "order_items_line_total_matches",
      sql`${t.lineTotalDzd} = ${t.unitPriceDzd} * ${t.quantity}`,
    ),
  ],
);

export const orderStatusHistoryTable = pgTable(
  "order_status_history",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "restrict" }),
    // Null for the initial "pending" entry.
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status").notNull(),
    note: text("note"),
    actor: text("actor").notNull().default("system"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("order_status_history_order_created_idx").on(t.orderId, t.createdAt),
  ],
);

export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;
export type OrderStatusHistory = typeof orderStatusHistoryTable.$inferSelect;
export type OrderStatus = Order["status"];
