import type { NextFunction, Request, Response } from "express";
import { config } from "./config";

// Admin requests that change state must (1) carry this custom header, which a
// cross-site form cannot send and which forces a CORS preflight for scripts,
// and (2) come from this site or an allowed origin. The SameSite=Strict
// session cookie is a third layer.
export const CSRF_HEADER = "x-requested-with";
export const CSRF_HEADER_VALUE = "unique-admin";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function requireSameOrigin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  if (req.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
    res.status(403).json({ error: "csrf_check_failed" });
    return;
  }

  const origin = req.get("origin");
  if (origin) {
    const ownOrigin = `${req.protocol}://${req.get("host")}`;
    if (origin !== ownOrigin && !config.corsOrigins.has(origin)) {
      res.status(403).json({ error: "csrf_check_failed" });
      return;
    }
  } else {
    const site = req.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") {
      res.status(403).json({ error: "csrf_check_failed" });
      return;
    }
  }

  next();
}
