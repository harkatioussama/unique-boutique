import { sql } from "drizzle-orm";
import {
  boolean,
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
import { adminRoleEnum } from "./enums";

// No public sign-up: admins are created with `pnpm --filter @workspace/scripts run create-admin`.
export const adminUsersTable = pgTable(
  "admin_users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: adminRoleEnum("role").notNull().default("staff"),
    passwordHash: text("password_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("admin_users_email_unique").on(t.email),
    check("admin_users_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ],
);

// Only a SHA-256 hash of the session token is stored; the token itself lives
// in the admin's HttpOnly cookie.
export const adminSessionsTable = pgTable(
  "admin_sessions",
  {
    id: serial("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    adminUserId: integer("admin_user_id")
      .notNull()
      .references(() => adminUsersTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    idleExpiresAt: timestamp("idle_expires_at", {
      withTimezone: true,
    }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("admin_sessions_token_hash_unique").on(t.tokenHash),
    index("admin_sessions_user_idx").on(t.adminUserId),
  ],
);

export const adminLoginAttemptsTable = pgTable(
  "admin_login_attempts",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    ip: text("ip"),
    succeeded: boolean("succeeded").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("admin_login_attempts_email_created_idx").on(t.email, t.createdAt),
    index("admin_login_attempts_ip_created_idx").on(t.ip, t.createdAt),
  ],
);

// Append-only record of admin actions (logins, logouts, every write).
export const adminAuditLogTable = pgTable(
  "admin_audit_log",
  {
    id: serial("id").primaryKey(),
    adminUserId: integer("admin_user_id").references(() => adminUsersTable.id, {
      onDelete: "restrict",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("admin_audit_log_created_idx").on(t.createdAt),
    index("admin_audit_log_entity_idx").on(t.entityType, t.entityId),
    index("admin_audit_log_admin_idx").on(t.adminUserId),
  ],
);

export type AdminUser = typeof adminUsersTable.$inferSelect;
export type AdminRole = AdminUser["role"];
export type AdminSession = typeof adminSessionsTable.$inferSelect;
export type AdminAuditLog = typeof adminAuditLogTable.$inferSelect;
