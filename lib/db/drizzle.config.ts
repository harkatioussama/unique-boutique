import { defineConfig } from "drizzle-kit";
import path from "path";

// `generate` and `check` work offline from the schema files. Commands that
// connect (`migrate`, `push`) need DATABASE_URL and fail without it.
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  // Relative to lib/db; run drizzle-kit through the package scripts.
  out: "./drizzle",
  dialect: "postgresql",
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
});
