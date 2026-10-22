import { pgEnum } from "drizzle-orm/pg-core";

export const genderEnum = pgEnum("gender", ["men", "women", "unisex"]);

// Cash-on-delivery order lifecycle. Allowed transitions live in ../stock.ts.
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
]);

export const paymentMethodEnum = pgEnum("payment_method", ["cash_on_delivery"]);

export const stockMovementReasonEnum = pgEnum("stock_movement_reason", [
  "restock",
  "adjustment",
  "order_reserved",
  "order_released",
  "order_fulfilled",
  "order_returned",
]);

export const deliveryTypeEnum = pgEnum("delivery_type", ["home", "desk"]);

export const adminRoleEnum = pgEnum("admin_role", ["owner", "staff"]);

// established: long-standing official codes (01-58), seeded from the 1984 and
// 2019 territorial laws. press_reported: reported by the press, not yet
// checked against the Journal officiel. verified: an owner checked the JO and
// recorded the reference.
export const wilayaVerificationEnum = pgEnum("wilaya_verification", [
  "established",
  "press_reported",
  "verified",
]);
