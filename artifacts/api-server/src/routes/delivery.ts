import { Router, type IRouter } from "express";
import { loadDb } from "../lib/database";

const router: IRouter = Router();

// Public and read-only: wilayas open for delivery and their current fees.
router.get("/delivery/wilayas", async (_req, res) => {
  const { db, listDeliverableWilayas } = await loadDb();
  const rows = await listDeliverableWilayas(db);
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json(
    rows.map((w) => ({
      id: w.id,
      code: w.code,
      nameFr: w.nameFr,
      nameAr: w.nameAr,
      home: {
        available: w.homeAvailable,
        feeDzd: w.homeAvailable ? w.homeFeeDzd : null,
      },
      desk: {
        available: w.deskAvailable,
        feeDzd: w.deskAvailable ? w.deskFeeDzd : null,
      },
      minDays: w.minDays,
      maxDays: w.maxDays,
    })),
  );
});

export default router;
