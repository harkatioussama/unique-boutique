import type { NextFunction, Request, Response } from "express";
import type { AdminRole } from "@workspace/db";
import { readSessionToken, validateSession } from "../lib/session";

export type SessionAdmin = {
  id: number;
  email: string;
  displayName: string;
  role: AdminRole;
};

declare global {
  namespace Express {
    interface Locals {
      admin?: SessionAdmin;
      sessionId?: number;
    }
  }
}

/** Rejects the request with 401 unless it carries a valid admin session. */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = readSessionToken(req);
  const session = token ? await validateSession(token) : null;
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  res.locals.admin = session.admin;
  res.locals.sessionId = session.sessionId;
  next();
}

/** Server-side role check; use after requireAdmin. */
export function requireRole(...roles: AdminRole[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const admin = res.locals.admin;
    if (!admin || !roles.includes(admin.role)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}

export function currentAdmin(res: Response): SessionAdmin {
  const admin = res.locals.admin;
  if (!admin) throw new Error("requireAdmin must run before this handler");
  return admin;
}
