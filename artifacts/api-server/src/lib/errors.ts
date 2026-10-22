import type { NextFunction, Request, Response } from "express";
import { DatabaseNotConfiguredError } from "./database";

// Maps known errors to safe JSON answers; anything else is a 500 with no
// details sent to the client (details stay in the server log).
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof DatabaseNotConfiguredError) {
    res.status(503).json({ error: "database_not_configured" });
    return;
  }
  const name = err instanceof Error ? err.name : "";
  const code = (err as { code?: unknown }).code;
  if (name === "DeliveryError") {
    res
      .status(code === "wilaya_not_found" ? 404 : 400)
      .json({ error: String(code) });
    return;
  }
  if (name === "StockError") {
    res.status(409).json({ error: String(code) });
    return;
  }
  const status = (err as { status?: unknown }).status;
  if (status === 400 || status === 413) {
    // Malformed or oversized JSON body.
    res.status(status).json({ error: "invalid_request" });
    return;
  }
  req.log.error({ err }, "Unhandled error");
  res.status(500).json({ error: "internal_error" });
}
