// @workspace/db throws on import when DATABASE_URL is missing, so routes load
// it lazily. The server still boots (and /api/healthz answers) without it.

type DbModule = typeof import("@workspace/db");

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured");
    this.name = "DatabaseNotConfiguredError";
  }
}

let loaded: Promise<DbModule> | undefined;

export function loadDb(): Promise<DbModule> {
  if (!process.env.DATABASE_URL) {
    return Promise.reject(new DatabaseNotConfiguredError());
  }
  loaded ??= import("@workspace/db");
  return loaded;
}
