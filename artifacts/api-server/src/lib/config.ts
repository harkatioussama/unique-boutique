const isProduction = process.env.NODE_ENV === "production";

function parseOrigins(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/+$/, ""))
      .filter(Boolean),
  );
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  isProduction,
  // Sites allowed to call the API from a browser with cookies.
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  // Number of proxy hops to trust for the client IP (unset: none).
  trustProxy: process.env.TRUST_PROXY,
  cookieSecure: isProduction || process.env.COOKIE_SECURE === "true",
  sessionIdleHours: positiveNumber(process.env.ADMIN_SESSION_IDLE_HOURS, 12),
  sessionMaxDays: 7,
} as const;
