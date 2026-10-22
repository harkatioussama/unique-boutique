import { and, asc, eq, or } from "drizzle-orm";
import {
  adminAuditLogTable,
  deliveryRatesTable,
  wilayasTable,
  type DeliveryRate,
} from "./schema";
import type { Database } from "./stock";

export type DeliveryRateChanges = Partial<
  Pick<
    DeliveryRate,
    | "homeAvailable"
    | "homeFeeDzd"
    | "deskAvailable"
    | "deskFeeDzd"
    | "minDays"
    | "maxDays"
    | "note"
  >
>;

export class DeliveryError extends Error {
  constructor(
    public readonly code: "wilaya_not_found" | "invalid_rate",
    message: string,
  ) {
    super(message);
    this.name = "DeliveryError";
  }
}

/** Wilayas with at least one delivery method switched on, for checkout. */
export async function listDeliverableWilayas(db: Database) {
  return db
    .select({
      id: wilayasTable.id,
      code: wilayasTable.code,
      nameFr: wilayasTable.nameFr,
      nameAr: wilayasTable.nameAr,
      homeAvailable: deliveryRatesTable.homeAvailable,
      homeFeeDzd: deliveryRatesTable.homeFeeDzd,
      deskAvailable: deliveryRatesTable.deskAvailable,
      deskFeeDzd: deliveryRatesTable.deskFeeDzd,
      minDays: deliveryRatesTable.minDays,
      maxDays: deliveryRatesTable.maxDays,
    })
    .from(wilayasTable)
    .innerJoin(
      deliveryRatesTable,
      eq(deliveryRatesTable.wilayaId, wilayasTable.id),
    )
    .where(
      and(
        eq(wilayasTable.isActive, true),
        or(
          eq(deliveryRatesTable.homeAvailable, true),
          eq(deliveryRatesTable.deskAvailable, true),
        ),
      ),
    )
    .orderBy(asc(wilayasTable.sortOrder), asc(wilayasTable.id));
}

/** All wilayas with their delivery settings and verification status. */
export async function listWilayasForAdmin(db: Database) {
  return db
    .select({ wilaya: wilayasTable, rate: deliveryRatesTable })
    .from(wilayasTable)
    .innerJoin(
      deliveryRatesTable,
      eq(deliveryRatesTable.wilayaId, wilayasTable.id),
    )
    .orderBy(asc(wilayasTable.sortOrder), asc(wilayasTable.id));
}

function rateForAudit(rate: DeliveryRate) {
  return {
    homeAvailable: rate.homeAvailable,
    homeFeeDzd: rate.homeFeeDzd,
    deskAvailable: rate.deskAvailable,
    deskFeeDzd: rate.deskFeeDzd,
    minDays: rate.minDays,
    maxDays: rate.maxDays,
    note: rate.note,
  };
}

/**
 * Changes one wilaya's delivery settings and records before/after in the
 * audit log, in one transaction. Existing orders are not affected: they keep
 * their own snapshot. Callers must check that the admin is an owner.
 */
export async function updateDeliveryRate(
  db: Database,
  input: {
    wilayaId: number;
    changes: DeliveryRateChanges;
    adminUserId: number;
    ip?: string | null;
  },
) {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(deliveryRatesTable)
      .where(eq(deliveryRatesTable.wilayaId, input.wilayaId))
      .for("update");
    if (!before) {
      throw new DeliveryError(
        "wilaya_not_found",
        `Wilaya ${input.wilayaId} not found`,
      );
    }

    const next = { ...rateForAudit(before), ...input.changes };
    if (next.homeAvailable && next.homeFeeDzd == null) {
      throw new DeliveryError("invalid_rate", "Home delivery needs a fee");
    }
    if (next.deskAvailable && next.deskFeeDzd == null) {
      throw new DeliveryError("invalid_rate", "Stop-desk delivery needs a fee");
    }
    if (
      next.minDays != null &&
      next.maxDays != null &&
      next.minDays > next.maxDays
    ) {
      throw new DeliveryError(
        "invalid_rate",
        "Minimum days cannot exceed maximum days",
      );
    }

    const [after] = await tx
      .update(deliveryRatesTable)
      .set({ ...input.changes, updatedByAdminId: input.adminUserId })
      .where(eq(deliveryRatesTable.wilayaId, input.wilayaId))
      .returning();

    await tx.insert(adminAuditLogTable).values({
      adminUserId: input.adminUserId,
      action: "delivery_rate.update",
      entityType: "wilaya",
      entityId: String(input.wilayaId),
      before: rateForAudit(before),
      after: rateForAudit(after),
      ip: input.ip ?? null,
    });

    return after;
  });
}

/**
 * Records that an owner checked a wilaya against an official source
 * (`verified`, with the reference they checked), or reverts it to
 * `press_reported`. Callers must check that the admin is an owner.
 */
export async function setWilayaVerification(
  db: Database,
  input: {
    wilayaId: number;
    verification: "verified" | "press_reported";
    sourceReference: string;
    adminUserId: number;
    ip?: string | null;
  },
) {
  const reference = input.sourceReference.trim();
  if (reference.length < 10) {
    throw new DeliveryError(
      "invalid_rate",
      "A source reference (e.g. JO number and date) is required",
    );
  }
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(wilayasTable)
      .where(eq(wilayasTable.id, input.wilayaId))
      .for("update");
    if (!before) {
      throw new DeliveryError(
        "wilaya_not_found",
        `Wilaya ${input.wilayaId} not found`,
      );
    }
    const verified = input.verification === "verified";
    const [after] = await tx
      .update(wilayasTable)
      .set({
        verification: input.verification,
        sourceReference: reference,
        verifiedAt: verified ? new Date() : null,
        verifiedByAdminId: verified ? input.adminUserId : null,
      })
      .where(eq(wilayasTable.id, input.wilayaId))
      .returning();

    await tx.insert(adminAuditLogTable).values({
      adminUserId: input.adminUserId,
      action: "wilaya.verification",
      entityType: "wilaya",
      entityId: String(input.wilayaId),
      before: {
        verification: before.verification,
        sourceReference: before.sourceReference,
      },
      after: {
        verification: after.verification,
        sourceReference: after.sourceReference,
      },
      ip: input.ip ?? null,
    });
    return after;
  });
}
