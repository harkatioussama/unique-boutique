import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions, Request } from "express";
import { and, eq, gt, gte, isNull, sql } from "drizzle-orm";
import { config } from "./config";
import { loadDb } from "./database";

export const SESSION_COOKIE = "unique_admin_session";
const TOUCH_INTERVAL_MS = 60_000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "strict",
    path: "/api/admin",
    maxAge: config.sessionMaxDays * 24 * 60 * 60 * 1000,
  };
}

export function readSessionToken(req: Request): string | undefined {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token)
    ? token
    : undefined;
}

function idleExpiry(now: Date, absolute: Date): Date {
  const idle = new Date(now.getTime() + config.sessionIdleHours * 3600_000);
  return idle < absolute ? idle : absolute;
}

/** Creates a session and returns the raw token for the cookie. */
export async function createSession(
  adminUserId: number,
  meta: { ip?: string; userAgent?: string },
): Promise<string> {
  const { db, adminSessionsTable } = await loadDb();
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + config.sessionMaxDays * 24 * 3600_000,
  );
  await db.insert(adminSessionsTable).values({
    tokenHash: hashToken(token),
    adminUserId,
    expiresAt,
    idleExpiresAt: idleExpiry(now, expiresAt),
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  return token;
}

/**
 * Returns the admin for a valid session, or null. A session is valid when it
 * is not revoked, not past its idle or absolute expiry, its admin is active,
 * and it was created after the admin's last password change.
 */
export async function validateSession(token: string) {
  const { db, adminSessionsTable, adminUsersTable } = await loadDb();
  const now = new Date();
  const [row] = await db
    .select({ session: adminSessionsTable, user: adminUsersTable })
    .from(adminSessionsTable)
    .innerJoin(
      adminUsersTable,
      eq(adminSessionsTable.adminUserId, adminUsersTable.id),
    )
    .where(
      and(
        eq(adminSessionsTable.tokenHash, hashToken(token)),
        isNull(adminSessionsTable.revokedAt),
        gt(adminSessionsTable.expiresAt, now),
        gt(adminSessionsTable.idleExpiresAt, now),
        eq(adminUsersTable.isActive, true),
        gte(adminSessionsTable.createdAt, adminUsersTable.passwordChangedAt),
      ),
    );
  if (!row) return null;

  if (now.getTime() - row.session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db
      .update(adminSessionsTable)
      .set({
        lastSeenAt: now,
        idleExpiresAt: idleExpiry(now, row.session.expiresAt),
      })
      .where(eq(adminSessionsTable.id, row.session.id));
  }

  return {
    sessionId: row.session.id,
    admin: {
      id: row.user.id,
      email: row.user.email,
      displayName: row.user.displayName,
      role: row.user.role,
    },
  };
}

export async function revokeSession(token: string): Promise<void> {
  const { db, adminSessionsTable } = await loadDb();
  await db
    .update(adminSessionsTable)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(adminSessionsTable.tokenHash, hashToken(token)),
        isNull(adminSessionsTable.revokedAt),
      ),
    );
}
