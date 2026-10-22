// Auth and security checks against a running API server on a THROWAWAY database.
// Start the server with TRUST_PROXY=1 and CORS_ORIGINS=http://localhost:5173, then:
//   BASE=http://localhost:5095 SERVER_LOG=/path/to/server.log DATABASE_URL=... tsx sandbox-test/auth.smoke.ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import {
  adminAuditLogTable,
  adminSessionsTable,
  adminUsersTable,
  db,
  hashPassword,
  pool,
} from "@workspace/db";

const dbName = new URL(process.env.DATABASE_URL!).pathname.slice(1);
if (!/test|sandbox/.test(dbName)) throw new Error(`Refusing to run against "${dbName}"`);
const BASE = process.env.BASE ?? "http://localhost:5095";
const ALLOWED = "http://localhost:5173";

let passed = 0;
let failed = 0;
function ok(cond: unknown, name: string) {
  if (cond) { passed++; console.log(`PASS ${name}`); }
  else { failed++; console.log(`FAIL ${name}`); }
}

type Opts = { method?: string; body?: unknown; cookie?: string; csrf?: boolean; origin?: string; ip?: string; raw?: string };
async function call(path: string, o: Opts = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (o.csrf !== false) headers["x-requested-with"] = "unique-admin";
  if (o.cookie) headers.cookie = o.cookie;
  if (o.origin) headers.origin = o.origin;
  headers["x-forwarded-for"] = o.ip ?? "10.0.0.1";
  const res = await fetch(BASE + path, {
    method: o.method ?? "GET",
    headers,
    body: o.raw ?? (o.body === undefined ? undefined : JSON.stringify(o.body)),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
}
const PW = { owner: "Owner-Pass-2026!", staff: "Staff-Pass-2026!" };
async function login(email: string, password: string, ip = "10.0.0.1") {
  const r = await call("/api/admin/auth/login", { method: "POST", body: { email, password }, ip });
  const setCookie = r.headers.getSetCookie().find((c) => c.startsWith("unique_admin_session="));
  return { ...r, setCookie, cookie: setCookie?.split(";")[0] };
}

const [owner] = await db.insert(adminUsersTable).values({ email: "owner@unique.test", displayName: "Owner", role: "owner", passwordHash: await hashPassword(PW.owner) }).returning();
const [staff] = await db.insert(adminUsersTable).values({ email: "staff@unique.test", displayName: "Staff", role: "staff", passwordHash: await hashPassword(PW.staff) }).returning();

console.log("# Health and headers");
let r = await call("/api/healthz");
ok(r.status === 200, `GET /api/healthz -> ${r.status}`);
r = await call("/api/healthz/db");
ok(r.status === 200 && r.json.status === "ok", `GET /api/healthz/db -> ${r.status} ${r.text}`);
ok(r.headers.get("x-content-type-options") === "nosniff" && r.headers.get("x-frame-options") === "DENY" && !r.headers.get("x-powered-by"), "security headers set, X-Powered-By removed");

console.log("\n# No session");
r = await call("/api/admin/auth/me");
ok(r.status === 401, `GET /admin/auth/me without cookie -> ${r.status}`);
r = await call("/api/admin/wilayas");
ok(r.status === 401, `GET /admin/wilayas without cookie -> ${r.status}`);
r = await call("/api/admin/wilayas/16/delivery", { method: "PATCH", body: { homeAvailable: false } });
ok(r.status === 401, `PATCH delivery without cookie -> ${r.status}`);
r = await call("/api/admin/wilayas/16/delivery", { method: "PATCH", body: { homeAvailable: false }, csrf: false });
ok(r.status === 403, `PATCH delivery without CSRF header -> ${r.status}`);
r = await call("/api/admin/auth/register", { method: "POST", body: { email: "x@y.z", password: "whatever-123456" } });
ok(r.status === 404, `no registration endpoint: POST /admin/auth/register -> ${r.status}`);

console.log("\n# Login protections");
r = await call("/api/admin/auth/login", { method: "POST", body: { email: "owner@unique.test", password: PW.owner }, csrf: false });
ok(r.status === 403, `login without X-Requested-With -> ${r.status}`);
r = await call("/api/admin/auth/login", { method: "POST", body: { email: "owner@unique.test", password: PW.owner }, origin: "https://evil.example" });
ok(r.status === 403, `login from a foreign Origin -> ${r.status}`);
r = await call("/api/admin/auth/login", { method: "POST", body: { email: "not-an-email" } });
ok(r.status === 400, `malformed login body -> ${r.status}`);
const wrong = await login("owner@unique.test", "wrong-password-xyz", "10.0.1.1");
const unknown = await login("nobody@unique.test", "wrong-password-xyz", "10.0.1.2");
ok(wrong.status === 401 && unknown.status === 401 && wrong.text === unknown.text, `wrong password and unknown email get the same answer (${wrong.status} ${wrong.text})`);

console.log("\n# Owner session");
const ownerLogin = await login("owner@unique.test", PW.owner);
ok(ownerLogin.status === 200 && ownerLogin.json.role === "owner", `owner login -> ${ownerLogin.status}`);
ok(!("passwordHash" in (ownerLogin.json ?? {})) && !ownerLogin.text.includes("scrypt"), "login response has no password hash");
const sc = ownerLogin.setCookie ?? "";
ok(/HttpOnly/i.test(sc) && /Secure/i.test(sc) && /SameSite=Strict/i.test(sc) && /Path=\/api\/admin/i.test(sc), `cookie flags: ${sc.replace(/=[^;]+;/, "=<token>;")}`);
const ownerToken = ownerLogin.cookie!.split("=")[1];
const stored = await db.select().from(adminSessionsTable).where(eq(adminSessionsTable.adminUserId, owner.id));
ok(stored.length === 1 && stored[0].tokenHash === createHash("sha256").update(ownerToken).digest("hex") && stored[0].tokenHash !== ownerToken, "database stores only the SHA-256 hash of the token");
r = await call("/api/admin/auth/me", { cookie: ownerLogin.cookie });
ok(r.status === 200 && r.json.email === "owner@unique.test" && r.headers.get("cache-control") === "no-store", `GET /admin/auth/me -> ${r.status}, Cache-Control ${r.headers.get("cache-control")}`);
r = await call("/api/admin/wilayas", { cookie: ownerLogin.cookie });
ok(r.status === 200 && r.json.length === 69, `owner lists ${r.json?.length} wilayas`);

console.log("\n# Staff can view, cannot change");
const staffLogin = await login("staff@unique.test", PW.staff);
ok(staffLogin.status === 200 && staffLogin.json.role === "staff", `staff login -> ${staffLogin.status}`);
r = await call("/api/admin/wilayas", { cookie: staffLogin.cookie });
ok(r.status === 200 && r.json.length === 69, `staff GET /admin/wilayas -> ${r.status}`);
r = await call("/api/admin/wilayas/16/delivery", { method: "PATCH", cookie: staffLogin.cookie, body: { homeAvailable: true, homeFeeDzd: 1 } });
ok(r.status === 403, `staff PATCH delivery -> ${r.status}`);
r = await call("/api/admin/wilayas/59/verification", { method: "PATCH", cookie: staffLogin.cookie, body: { verification: "verified", sourceReference: "JO n° 40 du 3 juin 2026" } });
ok(r.status === 403, `staff PATCH verification -> ${r.status}`);

console.log("\n# Owner changes delivery");
r = await call("/api/admin/wilayas/16/delivery", { method: "PATCH", cookie: ownerLogin.cookie, body: { homeAvailable: true, homeFeeDzd: 650 } });
ok(r.status === 200 && r.json.home.available && r.json.home.feeDzd === 650, `owner enables home delivery for Alger at 650 -> ${r.status}`);
r = await call("/api/admin/wilayas/16/delivery", { method: "PATCH", cookie: ownerLogin.cookie, origin: ALLOWED, body: { deskAvailable: true, deskFeeDzd: 450 } });
ok(r.status === 200 && r.json.desk.feeDzd === 450, `PATCH from allowed origin ${ALLOWED} -> ${r.status}`);
r = await call("/api/delivery/wilayas");
ok(r.status === 200 && r.json.length === 1 && r.json[0].home.feeDzd === 650 && r.json[0].desk.feeDzd === 450 && r.json[0].nameAr === "الجزائر", `public list -> ${r.status}, ${JSON.stringify(r.json?.[0]?.home)}`);
ok(!r.text.includes("sourceReference") && !r.text.includes("updatedBy"), "public list exposes no admin fields");
for (const [body, label] of [[{ homeFeeDzd: -1 }, "negative fee"], [{ homeFeeDzd: 12.5 }, "fractional fee"], [{}, "empty body"], [{ homeFeeDzd: "600" }, "fee as text"]] as const) {
  r = await call("/api/admin/wilayas/16/delivery", { method: "PATCH", cookie: ownerLogin.cookie, body });
  ok(r.status === 400, `${label} -> ${r.status}`);
}
r = await call("/api/admin/wilayas/17/delivery", { method: "PATCH", cookie: ownerLogin.cookie, body: { deskAvailable: true } });
ok(r.status === 400 && r.json.error === "invalid_rate", `enable stop-desk without a fee -> ${r.status} ${r.text}`);
r = await call("/api/admin/wilayas/999/delivery", { method: "PATCH", cookie: ownerLogin.cookie, body: { homeAvailable: false } });
ok(r.status === 404, `unknown wilaya -> ${r.status}`);
r = await call("/api/admin/wilayas/16/delivery", { method: "PATCH", cookie: ownerLogin.cookie, raw: JSON.stringify({ note: "x".repeat(200_000) }) });
ok(r.status === 413, `200 KB body -> ${r.status}`);

console.log("\n# Verification");
r = await call("/api/admin/wilayas/59/verification", { method: "PATCH", cookie: ownerLogin.cookie, body: { verification: "verified", sourceReference: "short" } });
ok(r.status === 400, `verification without a proper reference -> ${r.status}`);
r = await call("/api/admin/wilayas/59/verification", { method: "PATCH", cookie: ownerLogin.cookie, body: { verification: "verified", sourceReference: "JO n° 40, décret 26-206 (sandbox test)" } });
ok(r.status === 200 && r.json.verification === "verified" && r.json.verifiedAt, `owner verifies wilaya 59 with a reference -> ${r.status}`);

console.log("\n# CORS");
let pre = await fetch(BASE + "/api/admin/wilayas/16/delivery", { method: "OPTIONS", headers: { origin: ALLOWED, "access-control-request-method": "PATCH", "access-control-request-headers": "content-type,x-requested-with" } });
ok(pre.headers.get("access-control-allow-origin") === ALLOWED && pre.headers.get("access-control-allow-credentials") === "true", `preflight from ${ALLOWED}: allowed with credentials`);
pre = await fetch(BASE + "/api/admin/wilayas/16/delivery", { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "PATCH" } });
ok(!pre.headers.get("access-control-allow-origin"), "preflight from https://evil.example: no Access-Control-Allow-Origin");

console.log("\n# Session lifecycle");
r = await call("/api/admin/auth/logout", { method: "POST", cookie: staffLogin.cookie });
ok(r.status === 204, `staff logout -> ${r.status}`);
r = await call("/api/admin/auth/me", { cookie: staffLogin.cookie });
ok(r.status === 401, `staff cookie after logout -> ${r.status}`);
const s2 = await login("staff@unique.test", PW.staff, "10.0.2.1");
await db.update(adminSessionsTable).set({ idleExpiresAt: new Date(Date.now() - 1000) }).where(eq(adminSessionsTable.tokenHash, createHash("sha256").update(s2.cookie!.split("=")[1]).digest("hex")));
r = await call("/api/admin/auth/me", { cookie: s2.cookie });
ok(r.status === 401, `idle-expired session -> ${r.status}`);
const s3 = await login("staff@unique.test", PW.staff, "10.0.2.2");
await new Promise((res) => setTimeout(res, 20));
await db.update(adminUsersTable).set({ passwordChangedAt: new Date() }).where(eq(adminUsersTable.id, staff.id));
r = await call("/api/admin/auth/me", { cookie: s3.cookie });
ok(r.status === 401, `session from before a password change -> ${r.status}`);
const s4 = await login("staff@unique.test", PW.staff, "10.0.2.3");
await db.update(adminUsersTable).set({ isActive: false }).where(eq(adminUsersTable.id, staff.id));
r = await call("/api/admin/auth/me", { cookie: s4.cookie });
ok(r.status === 401, `deactivated admin's session -> ${r.status}`);
r = (await login("staff@unique.test", PW.staff, "10.0.2.4"));
ok(r.status === 401, `deactivated admin cannot log in -> ${r.status}`);
await db.update(adminUsersTable).set({ isActive: true }).where(eq(adminUsersTable.id, staff.id));
r = await call("/api/admin/auth/me", { cookie: "unique_admin_session=" + "A".repeat(43) });
ok(r.status === 401, `forged token -> ${r.status}`);

console.log("\n# Brute force");
for (let i = 1; i <= 5; i++) await login("staff@unique.test", "bad-password-" + i, `10.1.0.${i}`);
r = await login("staff@unique.test", PW.staff, "10.1.0.99");
ok(r.status === 429 && r.headers.get("retry-after") === "900", `6th try on the same email (correct password, new IP) -> ${r.status}, Retry-After ${r.headers.get("retry-after")}`);
for (let i = 1; i <= 5; i++) await login(`guess${i}@unique.test`, "bad-password", "10.2.0.7");
r = await login("owner@unique.test", PW.owner, "10.2.0.7");
ok(r.status === 429, `6th try from the same IP (different emails) -> ${r.status}`);
r = await login("owner@unique.test", PW.owner, "10.2.0.8");
ok(r.status === 200, `owner from another IP still works -> ${r.status}`);
r = await login("ghost@unique.test", "x", "10.3.0.1");
ok(r.status === 401, `unknown email under the limit -> ${r.status}`);

console.log("\n# Audit and logs");
const audit = await db.select().from(adminAuditLogTable);
const actions = new Set(audit.map((a) => a.action));
ok(["admin.login", "admin.login_failed", "admin.logout", "delivery_rate.update", "wilaya.verification"].every((a) => actions.has(a)), `audit actions: ${[...actions].join(", ")}`);
ok(audit.filter((a) => a.action === "delivery_rate.update").every((a) => a.adminUserId === owner.id), "every delivery change is attributed to the owner");
const auditText = JSON.stringify(audit);
ok(!auditText.includes(PW.owner) && !auditText.includes(PW.staff) && !auditText.includes(ownerToken), "no password or session token in the audit log");
if (process.env.SERVER_LOG) {
  const log = readFileSync(process.env.SERVER_LOG, "utf8");
  ok(log.length > 0 && !log.includes(PW.owner) && !log.includes(PW.staff) && !log.includes(ownerToken) && !log.includes("scrypt$"), `server log (${log.split("\n").length} lines) has no passwords, tokens or hashes`);
}

console.log(`\n${passed} passed, ${failed} failed`);
await pool.end();
process.exit(failed ? 1 : 0);
