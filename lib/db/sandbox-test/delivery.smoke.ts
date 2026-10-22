import { eq, sql } from "drizzle-orm";
import {
  adjustStock,
  adminAuditLogTable,
  adminUsersTable,
  brandsTable,
  categoriesTable,
  changeOrderStatus,
  db,
  DeliveryError,
  deliveryRatesTable,
  hashPassword,
  listDeliverableWilayas,
  orderItemsTable,
  ordersTable,
  placeOrder,
  pool,
  productVariantsTable,
  productsTable,
  setWilayaVerification,
  StockError,
  updateDeliveryRate,
  wilayasTable,
} from "../src/index";

// Phase 2: wilaya seed, per-wilaya delivery rates, order snapshot. Throwaway DBs only.
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
    const err = e as { code?: string; cause?: { constraint?: string; message?: string }; constraint?: string };
    const got = e instanceof StockError || e instanceof DeliveryError ? err.code : err.cause?.constraint ?? err.constraint ?? err.cause?.message ?? String(e);
    ok(!code || String(got).includes(code), `${name} (${got})`);
  }
}
const countOrders = async () => (await db.select({ n: sql<number>`count(*)::int` }).from(ordersTable))[0].n;

console.log("# Wilaya seed");
const wilayas = await db.select().from(wilayasTable).orderBy(wilayasTable.id);
ok(wilayas.length === 69, `69 wilayas seeded (got ${wilayas.length})`);
ok(wilayas.every((w, i) => w.id === i + 1 && w.code === i + 1), "ids and codes are 1..69, stable and unique");
ok(wilayas.every((w) => w.nameFr && w.nameAr && /[؀-ۿ]/.test(w.nameAr)), "every wilaya has a French and an Arabic name");
const established = wilayas.filter((w) => w.verification === "established");
const pressReported = wilayas.filter((w) => w.verification === "press_reported");
ok(established.length === 58 && pressReported.length === 11, `58 established, 11 press_reported (got ${established.length}/${pressReported.length})`);
ok(pressReported.every((w) => w.code! >= 59 && w.effectiveFrom === "2027-01-01" && w.parentWilayaId !== null), "the 11 new wilayas: codes 59-69, effective 2027-01-01, parent set");
ok(wilayas.filter((w) => w.code! >= 49 && w.code! <= 58).every((w) => w.parentWilayaId !== null), "2019 wilayas 49-58 have their parent set");
ok(wilayas.every((w) => w.sourceReference.length > 20), "every wilaya has a source reference");
ok(!wilayas.some((w) => w.verification === "verified"), "nothing is marked verified by the seed");
const w65 = wilayas.find((w) => w.code === 65)!;
ok(w65.nameFr === "Aïn Oussara" && w65.parentWilayaId === 17, `65 = ${w65.nameFr} / ${w65.nameAr}, parent Djelfa (17)`);
const rates = await db.select().from(deliveryRatesTable);
ok(rates.length === 69 && rates.every((r) => !r.homeAvailable && !r.deskAvailable), "69 delivery rows, all switched off");
ok((await listDeliverableWilayas(db)).length === 0, "public delivery list is empty until the owner enables a wilaya");

console.log("\n# Setup");
const [owner] = await db.insert(adminUsersTable).values({
  email: "owner@test.local", displayName: "Owner", role: "owner", passwordHash: await hashPassword("owner-password-123"),
}).returning();
const [brand] = await db.insert(brandsTable).values({ name: "Armani", slug: "armani" }).returning();
const [cat] = await db.insert(categoriesTable).values({ name: "Parfums", slug: "parfums" }).returning();
const [product] = await db.insert(productsTable).values({ brandId: brand.id, categoryId: cat.id, name: "Acqua di Gio", slug: "acqua-di-gio", priceDzd: 22000 }).returning();
const [variant] = await db.insert(productVariantsTable).values({ productId: product.id, sku: "ADG-100", label: "100 ml" }).returning();
await adjustStock(db, { variantId: variant.id, delta: 10, reason: "restock", actor: "test" });
const customer = { customerName: "Client", customerPhone: "0661000000", commune: "Bab Ezzouar", addressLine: "Cité 1", items: [{ variantId: variant.id, quantity: 1 }] };

console.log("\n# Delivery availability");
await rejects(placeOrder(db, { ...customer, wilayaId: 16, deliveryType: "home" }), "order to a wilaya with delivery off is refused", "delivery_unavailable");
ok((await countOrders()) === 0, "refused order wrote nothing");
await rejects(updateDeliveryRate(db, { wilayaId: 16, changes: { homeAvailable: true }, adminUserId: owner.id }), "enabling home delivery without a fee is refused", "invalid_rate");
await rejects(updateDeliveryRate(db, { wilayaId: 999, changes: { homeAvailable: false }, adminUserId: owner.id }), "unknown wilaya refused", "wilaya_not_found");
await rejects(db.update(deliveryRatesTable).set({ deskAvailable: true }).where(eq(deliveryRatesTable.wilayaId, 16)), "database also refuses an enabled method without a fee", "delivery_rates_desk_needs_fee");
await rejects(db.update(deliveryRatesTable).set({ homeFeeDzd: -5 }).where(eq(deliveryRatesTable.wilayaId, 16)), "negative fee refused by the database", "delivery_rates_home_fee_valid");
await updateDeliveryRate(db, { wilayaId: 16, changes: { homeAvailable: true, homeFeeDzd: 500, minDays: 1, maxDays: 2 }, adminUserId: owner.id, ip: "127.0.0.1" });
await rejects(placeOrder(db, { ...customer, wilayaId: 16, deliveryType: "desk" }), "stop-desk still off for Alger: refused", "delivery_unavailable");
const deliverable = await listDeliverableWilayas(db);
ok(deliverable.length === 1 && deliverable[0].code === 16, "public list now shows only Alger");

console.log("\n# Order snapshot");
const first = (await placeOrder(db, { ...customer, wilayaId: 16, deliveryType: "home" })).order;
ok(first.shippingFeeDzd === 500 && first.totalDzd === 22500, `fee 500 from the database, total 22500 (got ${first.shippingFeeDzd}/${first.totalDzd})`);
ok(first.wilayaId === 16 && first.wilayaCode === 16 && first.wilayaName === "Alger" && first.wilayaNameAr === "الجزائر" && first.deliveryType === "home", "wilaya id, code, French and Arabic names and delivery type copied onto the order");
ok((first.deliveryRateSnapshot as { homeFeeDzd: number }).homeFeeDzd === 500, "rate snapshot stored with the order");

await updateDeliveryRate(db, { wilayaId: 16, changes: { homeFeeDzd: 900, deskAvailable: true, deskFeeDzd: 400 }, adminUserId: owner.id });
const [firstAfter] = await db.select().from(ordersTable).where(eq(ordersTable.id, first.id));
ok(firstAfter.shippingFeeDzd === 500 && firstAfter.totalDzd === 22500 && (firstAfter.deliveryRateSnapshot as { homeFeeDzd: number }).homeFeeDzd === 500, "after the owner raises the fee to 900, the existing order still shows 500");
const second = (await placeOrder(db, { ...customer, wilayaId: 16, deliveryType: "home" })).order;
const desk = (await placeOrder(db, { ...customer, wilayaId: 16, deliveryType: "desk" })).order;
ok(second.shippingFeeDzd === 900 && desk.shippingFeeDzd === 400, `new orders use the new fees: home 900, desk 400 (got ${second.shippingFeeDzd}/${desk.shippingFeeDzd})`);

console.log("\n# Snapshot is immutable in the database");
await rejects(db.update(ordersTable).set({ shippingFeeDzd: 0, totalDzd: 22000 }).where(eq(ordersTable.id, first.id)), "changing an order's fee is rejected", "immutable");
await rejects(db.update(ordersTable).set({ wilayaName: "Oran" }).where(eq(ordersTable.id, first.id)), "changing an order's wilaya is rejected", "immutable");
await rejects(db.update(orderItemsTable).set({ quantity: 2, lineTotalDzd: 44000 }).where(eq(orderItemsTable.orderId, first.id)), "changing order items is rejected", "immutable");
const confirmed = await changeOrderStatus(db, { orderId: first.id, toStatus: "confirmed", actor: "test" });
ok(confirmed.status === "confirmed" && confirmed.shippingFeeDzd === 500, "status changes still work and keep the snapshot");
await db.update(ordersTable).set({ addressLine: "Cité 2, bloc B" }).where(eq(ordersTable.id, first.id));
ok(true, "address correction is still allowed");

console.log("\n# New wilayas");
await rejects(placeOrder(db, { ...customer, wilayaId: 59, deliveryType: "desk" }), "new wilaya Aflou (59) is off by default", "delivery_unavailable");
await updateDeliveryRate(db, { wilayaId: 59, changes: { deskAvailable: true, deskFeeDzd: 700 }, adminUserId: owner.id });
const aflou = (await placeOrder(db, { ...customer, wilayaId: 59, deliveryType: "desk" })).order;
ok(aflou.wilayaCode === 59 && aflou.wilayaName === "Aflou" && aflou.shippingFeeDzd === 700, "after enabling, an order to Aflou snapshots code 59 and fee 700");

console.log("\n# Verification needs evidence");
await rejects(setWilayaVerification(db, { wilayaId: 59, verification: "verified", sourceReference: "trust me", adminUserId: owner.id }), "verification without a real source reference refused", "invalid_rate");
await rejects(db.update(wilayasTable).set({ verification: "verified" }).where(eq(wilayasTable.id, 60)), "database refuses 'verified' without who and when", "wilayas_verified_has_evidence");
const v = await setWilayaVerification(db, { wilayaId: 59, verification: "verified", sourceReference: "JO n° 40 du 3 juin 2026, décret présidentiel n° 26-206 (test entry)", adminUserId: owner.id });
ok(v.verification === "verified" && v.verifiedAt && v.verifiedByAdminId === owner.id, "owner verification records who, when and the reference");

console.log("\n# Audit log");
const audit = await db.select().from(adminAuditLogTable).orderBy(adminAuditLogTable.id);
const rateChanges = audit.filter((a) => a.action === "delivery_rate.update");
ok(rateChanges.length === 3, `3 delivery changes audited (got ${rateChanges.length})`);
const raise = rateChanges[1];
ok((raise.before as { homeFeeDzd: number }).homeFeeDzd === 500 && (raise.after as { homeFeeDzd: number }).homeFeeDzd === 900 && raise.adminUserId === owner.id, "audit row keeps before (500) and after (900) and who did it");
ok(audit.some((a) => a.action === "wilaya.verification"), "verification change audited");
ok(!JSON.stringify(audit).includes("scrypt$"), "no password hash in the audit log");

console.log(`\n${passed} passed, ${failed} failed`);
await pool.end();
process.exit(failed ? 1 : 0);
