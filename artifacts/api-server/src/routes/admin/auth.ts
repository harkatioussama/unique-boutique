import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { AdminLoginBody } from "@workspace/api-zod";
import { writeAudit } from "../../lib/audit";
import { loadDb } from "../../lib/database";
import {
  isLoginLocked,
  recordLoginAttempt,
  WINDOW_MS,
} from "../../lib/rate-limit";
import {
  createSession,
  readSessionToken,
  revokeSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "../../lib/session";
import { currentAdmin, requireAdmin } from "../../middlewares/require-admin";

const router: IRouter = Router();

router.post("/auth/login", async (req, res) => {
  const body = AdminLoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  const email = body.data.email.trim().toLowerCase();
  const ip = req.ip;

  if (await isLoginLocked(email, ip)) {
    res.setHeader("Retry-After", String(WINDOW_MS / 1000));
    res.status(429).json({ error: "too_many_attempts" });
    return;
  }

  const { db, adminUsersTable, verifyPassword, verifyAgainstDummy } =
    await loadDb();
  const [user] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.email, email));

  const valid =
    user && user.isActive
      ? await verifyPassword(body.data.password, user.passwordHash)
      : await verifyAgainstDummy(body.data.password);

  await recordLoginAttempt(email, ip, valid);

  if (!user || !valid) {
    await writeAudit({
      adminUserId: user?.id ?? null,
      action: "admin.login_failed",
      entityType: "admin_user",
      entityId: email,
      ip,
    });
    // Same answer whether the email exists or not.
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  // New token on every login; drop any session the browser already had.
  const previous = readSessionToken(req);
  if (previous) await revokeSession(previous);

  const token = await createSession(user.id, {
    ip,
    userAgent: req.get("user-agent"),
  });
  await db
    .update(adminUsersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(adminUsersTable.id, user.id));
  await writeAudit({ adminUserId: user.id, action: "admin.login", ip });

  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  res.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  });
});

router.post("/auth/logout", requireAdmin, async (req, res) => {
  const admin = currentAdmin(res);
  const token = readSessionToken(req);
  if (token) await revokeSession(token);
  await writeAudit({
    adminUserId: admin.id,
    action: "admin.logout",
    ip: req.ip,
  });
  const { maxAge: _maxAge, ...clearOptions } = sessionCookieOptions();
  res.clearCookie(SESSION_COOKIE, clearOptions);
  res.status(204).end();
});

router.get("/auth/me", requireAdmin, (_req, res) => {
  res.json(currentAdmin(res));
});

export default router;
