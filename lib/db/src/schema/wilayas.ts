import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { adminUsersTable } from "./admin";
import { timestamps } from "./columns";
import { wilayaVerificationEnum } from "./enums";

// The list of wilayas lives only in the database (seeded by migration 0002),
// never in application code. `id` is the stable internal identifier; `code`
// is the official number and stays null if no official code is known.
export const wilayasTable = pgTable(
  "wilayas",
  {
    id: serial("id").primaryKey(),
    code: integer("code"),
    nameFr: text("name_fr").notNull(),
    nameAr: text("name_ar").notNull(),
    // The wilaya this one was detached from (2019 and 2026 reforms).
    parentWilayaId: integer("parent_wilaya_id").references(
      (): AnyPgColumn => wilayasTable.id,
      { onDelete: "restrict" },
    ),
    effectiveFrom: date("effective_from"),
    verification: wilayaVerificationEnum("verification").notNull(),
    sourceReference: text("source_reference").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByAdminId: integer("verified_by_admin_id").references(
      () => adminUsersTable.id,
      { onDelete: "restrict" },
    ),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("wilayas_code_unique").on(t.code),
    index("wilayas_parent_idx").on(t.parentWilayaId),
    check("wilayas_code_positive", sql`${t.code} is null or ${t.code} > 0`),
    check("wilayas_not_own_parent", sql`${t.parentWilayaId} <> ${t.id}`),
    check(
      "wilayas_verified_has_evidence",
      sql`${t.verification} <> 'verified' or (${t.verifiedAt} is not null and ${t.verifiedByAdminId} is not null)`,
    ),
  ],
);

// One row per wilaya. Both methods start switched off; only an owner can
// change them. Orders copy the values they used, so later edits never
// change past orders.
export const deliveryRatesTable = pgTable(
  "delivery_rates",
  {
    wilayaId: integer("wilaya_id")
      .primaryKey()
      .references(() => wilayasTable.id, { onDelete: "restrict" }),
    homeAvailable: boolean("home_available").notNull().default(false),
    homeFeeDzd: integer("home_fee_dzd"),
    deskAvailable: boolean("desk_available").notNull().default(false),
    deskFeeDzd: integer("desk_fee_dzd"),
    minDays: integer("min_days"),
    maxDays: integer("max_days"),
    note: text("note"),
    updatedByAdminId: integer("updated_by_admin_id").references(
      () => adminUsersTable.id,
      { onDelete: "restrict" },
    ),
    ...timestamps,
  },
  (t) => [
    check(
      "delivery_rates_home_fee_valid",
      sql`${t.homeFeeDzd} is null or ${t.homeFeeDzd} >= 0`,
    ),
    check(
      "delivery_rates_desk_fee_valid",
      sql`${t.deskFeeDzd} is null or ${t.deskFeeDzd} >= 0`,
    ),
    check(
      "delivery_rates_home_needs_fee",
      sql`not ${t.homeAvailable} or ${t.homeFeeDzd} is not null`,
    ),
    check(
      "delivery_rates_desk_needs_fee",
      sql`not ${t.deskAvailable} or ${t.deskFeeDzd} is not null`,
    ),
    check(
      "delivery_rates_days_valid",
      sql`(${t.minDays} is null or ${t.minDays} >= 0) and (${t.maxDays} is null or ${t.maxDays} >= 0) and (${t.minDays} is null or ${t.maxDays} is null or ${t.minDays} <= ${t.maxDays})`,
    ),
  ],
);

export type Wilaya = typeof wilayasTable.$inferSelect;
export type DeliveryRate = typeof deliveryRatesTable.$inferSelect;
