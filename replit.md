# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run generate` — create a SQL migration in `lib/db/drizzle/` from schema changes (offline, review the SQL before applying)
- `pnpm --filter @workspace/db run check` — verify migration files are consistent (offline)
- `pnpm --filter @workspace/db run migrate` — apply pending migrations to `DATABASE_URL`
- `pnpm --filter @workspace/db run push` / `push-force` — legacy, do not use once real data exists (bypasses migrations; `push-force` can drop columns)
- `pnpm --filter @workspace/scripts run create-admin` — create an admin from the terminal (owner by default, `-- --staff` for staff); there is no public sign-up
- Required env: `DATABASE_URL` — Postgres connection string. API: `PORT`, `CORS_ORIGINS`, optional `TRUST_PROXY` (see `artifacts/api-server/.env.example`)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema: `lib/db/src/schema/` (one file per area). Migrations: `lib/db/drizzle/`.
- Stock and order status logic: `lib/db/src/stock.ts` (only way to change stock).
- API health: `GET /api/healthz` (server up), `GET /api/healthz/db` (database reachable).
- Wilayas and delivery rates: `lib/db/src/schema/wilayas.ts`, seeded by `lib/db/drizzle/0002_seed_wilayas.sql`; admin logic in `lib/db/src/delivery.ts`.
- Admin auth: `artifacts/api-server/src/lib/{session,csrf,rate-limit,audit}.ts`, `src/middlewares/require-admin.ts`, routes in `src/routes/admin/`.

## Architecture decisions

- Prices are integer DZD everywhere; order totals are computed server-side from the database.
- Every product has at least one variant; inventory, stock movements and order lines point at variants.
- Stock: reserved when an order is placed, released on cancel, deducted on delivery, restocked on return. Database CHECKs keep `0 <= reserved <= on_hand`.
- Schema changes go through generated, reviewed migrations, not `push`.
- Admin endpoints live under `/api/admin`: session cookie (HttpOnly, SameSite=Strict, only the token hash stored), CSRF header + origin check on writes, server-side role checks (only `owner` changes delivery or verification), every write audited.
- The 69 wilayas live only in the database. The 11 created in 2026 (codes 59-69) are `press_reported` until an owner records a Journal officiel reference. Orders snapshot wilaya + fee; a DB trigger (0003) makes the snapshot immutable.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
