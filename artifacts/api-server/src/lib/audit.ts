import { loadDb } from "./database";

// Writes one admin_audit_log row. Data changes write their audit row inside
// their own transaction (see @workspace/db delivery helpers); this is for
// events such as logins and logouts. Never pass passwords or tokens here.
export async function writeAudit(entry: {
  adminUserId: number | null;
  action: string;
  entityType?: string;
  entityId?: string;
  after?: Record<string, unknown>;
  ip?: string;
}): Promise<void> {
  const { db, adminAuditLogTable } = await loadDb();
  await db.insert(adminAuditLogTable).values({
    adminUserId: entry.adminUserId,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    after: entry.after ?? null,
    ip: entry.ip ?? null,
  });
}
