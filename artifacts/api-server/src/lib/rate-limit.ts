import { and, count, desc, eq, gt } from "drizzle-orm";
import { loadDb } from "./database";

// Failed admin logins: 5 per email or 5 per IP within 15 minutes lock that
// email or IP until the window passes. Counted in the database so the limit
// holds across restarts and multiple server instances.
export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60_000;

export async function isLoginLocked(
  email: string,
  ip: string | undefined,
): Promise<boolean> {
  const { db, adminLoginAttemptsTable: attempts } = await loadDb();
  const since = new Date(Date.now() - WINDOW_MS);

  // Failures for this email only count after its last successful login.
  const [lastSuccess] = await db
    .select({ at: attempts.createdAt })
    .from(attempts)
    .where(and(eq(attempts.email, email), eq(attempts.succeeded, true)))
    .orderBy(desc(attempts.createdAt))
    .limit(1);
  const emailSince =
    lastSuccess && lastSuccess.at > since ? lastSuccess.at : since;

  const [byEmail] = await db
    .select({ n: count() })
    .from(attempts)
    .where(
      and(
        eq(attempts.email, email),
        eq(attempts.succeeded, false),
        gt(attempts.createdAt, emailSince),
      ),
    );
  if (byEmail.n >= MAX_FAILURES) return true;

  if (!ip) return false;
  const [byIp] = await db
    .select({ n: count() })
    .from(attempts)
    .where(
      and(
        eq(attempts.ip, ip),
        eq(attempts.succeeded, false),
        gt(attempts.createdAt, since),
      ),
    );
  return byIp.n >= MAX_FAILURES;
}

export async function recordLoginAttempt(
  email: string,
  ip: string | undefined,
  succeeded: boolean,
): Promise<void> {
  const { db, adminLoginAttemptsTable } = await loadDb();
  await db
    .insert(adminLoginAttemptsTable)
    .values({ email, ip: ip ?? null, succeeded });
}
