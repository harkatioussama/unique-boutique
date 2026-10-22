import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Read-only database check. @workspace/db throws on import when DATABASE_URL
// is missing, so it is loaded lazily to keep the server bootable without it.
router.get("/healthz/db", async (req, res) => {
  if (!process.env.DATABASE_URL) {
    res.status(503).json({ status: "not_configured" });
    return;
  }
  try {
    const { pool } = await import("@workspace/db");
    await pool.query("select 1");
    res.json({ status: "ok" });
  } catch (err) {
    // Connection errors can include host names; keep them in the server log.
    req.log.error({ err }, "Database health check failed");
    res.status(503).json({ status: "unavailable" });
  }
});

export default router;
