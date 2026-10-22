import type { NextFunction, Request, Response } from "express";

export function securityHeaders(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  if (req.path.startsWith("/api/admin")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
}
