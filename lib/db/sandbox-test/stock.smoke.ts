import { eq, sql } from "drizzle-orm";
import {
  adjustStock,
  brandsTable,
  categoriesTable,
  changeOrderStatus,
  db,
  deliveryRatesTable,
  inventoryTable,
  orderStatusHistoryTable,
  ordersTable,
  pool,
  placeOrder,
  productVariantsTable,
  productsTable,
  StockError,
  stockMovementsTable,
} from "../src/index";

const dbName = new URL(process.env.DATABASE_URL!).pathname.slice(1);
if (!/test|sandbox/.test(dbName)) {
  throw new Error(`Refusing to run against "${dbName}": name must contain test or sandbox`);
}

let passed = 0;
let failed = 0;
function ok(cond: unknown, name: string) {
  if (cond) { passed++; console.log(`PASS ${name}`); }
  else { failed++; console.log(`FAIL ${name}`); }
}
async function rejects(p: Promise<unknown>, name: string, code?: string) {
  try { await p; ok(false, name); }
  catch (e) {
    const got = e instanceof StockError ? e.code : (e as { cause?: { constraint?: string }; constraint?: string }).cause?.constraint ?? (e as any).constraint ?? String(e);
    ok(!code || got === code, `${name} (${got})`);
  }
}
const inv = async (variantId: number) =>
  (await db.select().from(inventoryTable).where(eq(inventoryTable.variantId, variantId)))[0];

// Phase 2: placeOrder takes a wilaya id + delivery type; the fee comes from delivery_rates.
const customer = {
  customerName: "Test Client", customerPhone: "0550000000", wilayaId: 16,
  deliveryType: "home" as const, commune: "Hydra", addressLine: "1 rue Test",
};
// For raw inserts that bypass placeOrder (constraint tests only).
const orderRow = {
  customerName: "Test Client", customerPhone: "0550000000", wilayaCode: 16,
  wilayaName: "Alger", commune: "Hydra", addressLine: "1 rue Test", shippingFeeDzd: 600,
};
await db.update(deliveryRatesTable).set({ homeAvailable: true, homeFeeDzd: 600 }).where(eq(deliveryRatesTable.wilayaId, 16));

const [brand] = await db.insert(brandsTable).values({ name: "BOSS", slug: "boss" }).returning();
const [cat] = await db.insert(categoriesTable).values({ name: "Watches", slug: "watches" }).returning();
const [sub] = await db.insert(categoriesTable).values({ name: "Automatic", slug: "automatic", parentId: cat.id }).returning();
const [product] = await db.insert(productsTable).values({
  brandId: brand.id, categoryId: sub.id, name: "BOSS Grand Tour", slug: "boss-grand-tour",
  gender: "men", priceDzd: 45000, compareAtPriceDzd: 52000,
}).returning();
const [variant] = await db.insert(productVariantsTable).values({ productId: product.id, sku: "BOSS-GT-01" }).returning();
const [perfumeVariant] = await db.insert(productVariantsTable).values({
  productId: product.id, sku: "BOSS-GT-02", label: "Gold", priceDzd: 48000,
}).returning();

console.log("\n# Database constraints");
await rejects(db.insert(productsTable).values({ brandId: brand.id, categoryId: cat.id, name: "x", slug: "neg", priceDzd: -1 }), "negative price refused", "products_price_non_negative");
await rejects(db.insert(productsTable).values({ brandId: brand.id, categoryId: cat.id, name: "x", slug: "Bad Slug", priceDzd: 1 }), "bad slug refused", "products_slug_format");
await rejects(db.insert(inventoryTable).values({ variantId: perfumeVariant.id, onHand: 1, reserved: 2 }), "reserved > on_hand refused", "inventory_reserved_within_on_hand");
await rejects(db.insert(inventoryTable).values({ variantId: perfumeVariant.id, onHand: -1 }), "negative on_hand refused", "inventory_on_hand_non_negative");
await rejects(db.insert(ordersTable).values({ ...orderRow, orderNumber: "X1", subtotalDzd: 100, totalDzd: 100 }), "order total must equal subtotal + shipping", "orders_total_matches");
await rejects(db.insert(ordersTable).values({ ...orderRow, wilayaCode: 0, orderNumber: "X2", subtotalDzd: 0, totalDzd: 600 }), "wilaya code must be positive", "orders_wilaya_code_positive");
await rejects(db.update(categoriesTable).set({ parentId: cat.id }).where(eq(categoriesTable.id, cat.id)), "category cannot be its own parent", "categories_not_own_parent");
await rejects(db.delete(brandsTable).where(eq(brandsTable.id, brand.id)), "brand with products cannot be deleted", "products_brand_id_brands_id_fk");

console.log("\n# Stock adjustments");
await adjustStock(db, { variantId: variant.id, delta: 1, reason: "restock", actor: "test" });
ok((await inv(variant.id)).onHand === 1, "restock creates inventory row with on_hand 1");
await rejects(adjustStock(db, { variantId: variant.id, delta: -2, reason: "adjustment", actor: "test" }), "adjustment below zero refused", "insufficient_stock");
await rejects(adjustStock(db, { variantId: variant.id, delta: 1.5, reason: "restock", actor: "test" }), "fractional quantity refused", "invalid_quantity");

console.log("\n# Last unit: 5 buyers at once");
const results = await Promise.allSettled(
  Array.from({ length: 5 }, () => placeOrder(db, { ...customer, items: [{ variantId: variant.id, quantity: 1 }] })),
);
const wins = results.filter((r) => r.status === "fulfilled");
const losses = results.filter((r) => r.status === "rejected" && (r.reason as StockError).code === "insufficient_stock");
ok(wins.length === 1 && losses.length === 4, `exactly one order wins the last unit (${wins.length} won, ${losses.length} refused)`);
const after = await inv(variant.id);
ok(after.onHand === 1 && after.reserved === 1, `stock is on_hand 1, reserved 1 (got ${after.onHand}/${after.reserved})`);
const orderCount = (await db.select({ n: sql<number>`count(*)::int` }).from(ordersTable))[0].n;
ok(orderCount === 1, `refused orders left nothing behind (${orderCount} order in table)`);

const won = (wins[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof placeOrder>>>).value.order;
ok(won.subtotalDzd === 45000 && won.totalDzd === 45600, `server-side prices: subtotal 45000, total 45600 (got ${won.subtotalDzd}/${won.totalDzd})`);
ok(/^UQ-\d{6}$/.test(won.orderNumber), `order number format ${won.orderNumber}`);

console.log("\n# Status transitions");
await rejects(changeOrderStatus(db, { orderId: won.id, toStatus: "delivered", actor: "test" }), "pending -> delivered refused", "invalid_transition");
await rejects(changeOrderStatus(db, { orderId: won.id, toStatus: "returned", actor: "test" }), "pending -> returned refused", "invalid_transition");
await changeOrderStatus(db, { orderId: won.id, toStatus: "confirmed", actor: "test" });
await changeOrderStatus(db, { orderId: won.id, toStatus: "shipped", actor: "test" });
const delivered = await changeOrderStatus(db, { orderId: won.id, toStatus: "delivered", actor: "test" });
let s = await inv(variant.id);
ok(s.onHand === 0 && s.reserved === 0, `delivered: stock fulfilled to 0/0 (got ${s.onHand}/${s.reserved})`);
ok(delivered.deliveredAt && delivered.confirmedAt && delivered.shippedAt, "delivered order has confirmed/shipped/delivered timestamps");
await rejects(changeOrderStatus(db, { orderId: won.id, toStatus: "cancelled", actor: "test" }), "delivered -> cancelled refused", "invalid_transition");
await changeOrderStatus(db, { orderId: won.id, toStatus: "returned", actor: "test" });
s = await inv(variant.id);
ok(s.onHand === 1 && s.reserved === 0, `returned: unit back on hand 1/0 (got ${s.onHand}/${s.reserved})`);

console.log("\n# Cancellation releases the reservation");
await adjustStock(db, { variantId: perfumeVariant.id, delta: 3, reason: "restock", actor: "test" });
const multi = await placeOrder(db, { ...customer, items: [{ variantId: perfumeVariant.id, quantity: 1 }, { variantId: perfumeVariant.id, quantity: 1 }, { variantId: variant.id, quantity: 1 }] });
ok(multi.items.length === 2 && multi.order.subtotalDzd === 48000 * 2 + 45000, `repeated lines merged, variant price override used (subtotal ${multi.order.subtotalDzd})`);
await rejects(adjustStock(db, { variantId: perfumeVariant.id, delta: -2, reason: "adjustment", actor: "test" }), "adjustment below reserved refused", "insufficient_stock");
await changeOrderStatus(db, { orderId: multi.order.id, toStatus: "confirmed", actor: "test" });
await changeOrderStatus(db, { orderId: multi.order.id, toStatus: "cancelled", note: "client unreachable", actor: "test" });
s = await inv(perfumeVariant.id);
ok(s.onHand === 3 && s.reserved === 0, `cancelled: reservation released 3/0 (got ${s.onHand}/${s.reserved})`);

console.log("\n# Unavailable products and empty orders");
await db.update(productVariantsTable).set({ isActive: false }).where(eq(productVariantsTable.id, perfumeVariant.id));
await rejects(placeOrder(db, { ...customer, items: [{ variantId: perfumeVariant.id, quantity: 1 }] }), "inactive variant cannot be ordered", "variant_unavailable");
await rejects(placeOrder(db, { ...customer, items: [] }), "empty order refused", "invalid_quantity");
await rejects(placeOrder(db, { ...customer, items: [{ variantId: variant.id, quantity: 0 }] }), "zero quantity refused", "invalid_quantity");

console.log("\n# Audit trail");
const movements = await db.select().from(stockMovementsTable);
const consistent = movements.every((m) => m.onHandAfter >= 0 && m.reservedAfter >= 0 && m.reservedAfter <= m.onHandAfter);
ok(movements.length > 0 && consistent, `${movements.length} stock movements logged, all with valid after-values`);
const history = await db.select().from(orderStatusHistoryTable).where(eq(orderStatusHistoryTable.orderId, won.id)).orderBy(orderStatusHistoryTable.id);
ok(history.map((h) => h.toStatus).join(">") === "pending>confirmed>shipped>delivered>returned", `status history: ${history.map((h) => h.toStatus).join(" > ")}`);

console.log(`\n${passed} passed, ${failed} failed`);
await pool.end();
process.exit(failed ? 1 : 0);
