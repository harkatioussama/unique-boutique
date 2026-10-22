import { Router, type IRouter } from "express";
import {
  UpdateWilayaDeliveryBody,
  UpdateWilayaDeliveryParams,
  UpdateWilayaVerificationBody,
  UpdateWilayaVerificationParams,
} from "@workspace/api-zod";
import type { DeliveryRate, Wilaya } from "@workspace/db";
import { loadDb } from "../../lib/database";
import {
  currentAdmin,
  requireAdmin,
  requireRole,
} from "../../middlewares/require-admin";

const router: IRouter = Router();

function toAdminWilaya(wilaya: Wilaya, rate: DeliveryRate) {
  return {
    id: wilaya.id,
    code: wilaya.code,
    nameFr: wilaya.nameFr,
    nameAr: wilaya.nameAr,
    parentWilayaId: wilaya.parentWilayaId,
    effectiveFrom: wilaya.effectiveFrom,
    verification: wilaya.verification,
    sourceReference: wilaya.sourceReference,
    verifiedAt: wilaya.verifiedAt?.toISOString() ?? null,
    isActive: wilaya.isActive,
    home: { available: rate.homeAvailable, feeDzd: rate.homeFeeDzd },
    desk: { available: rate.deskAvailable, feeDzd: rate.deskFeeDzd },
    minDays: rate.minDays,
    maxDays: rate.maxDays,
    note: rate.note,
    rateUpdatedAt: rate.updatedAt.toISOString(),
  };
}

async function loadAdminWilaya(id: number) {
  const { db, listWilayasForAdmin } = await loadDb();
  const row = (await listWilayasForAdmin(db)).find((r) => r.wilaya.id === id);
  return row ? toAdminWilaya(row.wilaya, row.rate) : null;
}

// Owner and staff can view.
router.get("/wilayas", requireAdmin, async (_req, res) => {
  const { db, listWilayasForAdmin } = await loadDb();
  const rows = await listWilayasForAdmin(db);
  res.json(rows.map((r) => toAdminWilaya(r.wilaya, r.rate)));
});

// Only the owner can change delivery availability and fees.
router.patch(
  "/wilayas/:id/delivery",
  requireAdmin,
  requireRole("owner"),
  async (req, res) => {
    const params = UpdateWilayaDeliveryParams.safeParse(req.params);
    const body = UpdateWilayaDeliveryBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    const changes = Object.fromEntries(
      Object.entries(body.data).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(changes).length === 0) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    const { db, updateDeliveryRate } = await loadDb();
    await updateDeliveryRate(db, {
      wilayaId: params.data.id,
      changes,
      adminUserId: currentAdmin(res).id,
      ip: req.ip,
    });
    res.json(await loadAdminWilaya(params.data.id));
  },
);

// Only the owner can record an official-source check, with its reference.
router.patch(
  "/wilayas/:id/verification",
  requireAdmin,
  requireRole("owner"),
  async (req, res) => {
    const params = UpdateWilayaVerificationParams.safeParse(req.params);
    const body = UpdateWilayaVerificationBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    const { db, setWilayaVerification } = await loadDb();
    await setWilayaVerification(db, {
      wilayaId: params.data.id,
      verification: body.data.verification,
      sourceReference: body.data.sourceReference,
      adminUserId: currentAdmin(res).id,
      ip: req.ip,
    });
    res.json(await loadAdminWilaya(params.data.id));
  },
);

export default router;
