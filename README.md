# UNIQUE — Fine Jewellery in Algeria

A considered e-commerce storefront for fine jewellery, with an admin panel for
catalogue, stock, wilayas and delivery management.

## Structure

- `artifacts/unique-boutique` — Vite + React storefront (SPA, Firestore catalogue and local cart)
- `artifacts/api-server` — Express 5 REST API (PostgreSQL + Drizzle ORM)
- `artifacts/mockup-sandbox` — internal UI mockup preview tool
- `lib/` — shared packages (db schema, OpenAPI spec, Zod schemas, typed React client)
- `scripts/` — maintenance scripts (e.g. admin creation)

## Requirements

- Node.js 24+
- pnpm 12+
- PostgreSQL (only for the API)

## Commands

| Command | Description |
| --- | --- |
| `pnpm install` | Install workspace dependencies |
| `pnpm run typecheck` | Full typecheck across all packages |
| `pnpm run build` | Typecheck + build all packages (needs `PORT` and `BASE_PATH` env) |
| `pnpm --filter @workspace/unique-boutique run dev` | Run the storefront dev server |
| `pnpm --filter @workspace/api-server run dev` | Run the API server (port 5000) |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API hooks and Zod schemas |
| `pnpm --filter @workspace/db run generate` | Create a SQL migration from schema changes |
| `pnpm --filter @workspace/scripts run create-admin` | Create an admin (no public sign-up) |

API environment variables are documented in `artifacts/api-server/.env.example`
(`DATABASE_URL`, `PORT`, `CORS_ORIGINS`, …).

## Firebase admin sign-in

The storefront's admin sign-in uses Firebase Authentication (Email/Password)
and verifies administrator access against a Firestore document. Copy
`artifacts/unique-boutique/.env.example` to `.env.local` in that directory and
fill in the Firebase web app configuration. These `VITE_` values are public
client configuration, not server credentials.

In Firebase Console, enable Email/Password sign-in, create a Firestore database,
and create the admin account under Authentication. Then add a document at
`admins/{firebase-auth-uid}` with the field `role: "admin"`. Deploy
[`firestore.rules`](./firestore.rules) to the project; admin documents cannot
be created or changed from the client.

The owner dashboard at `/admin` manages products and categories directly in
Firestore. On first use, choose **Publish starter catalogue** to copy the
existing sample products into Firestore; this action refuses to overwrite an
existing live catalogue. The storefront then reads products and categories
from Firestore in real time. Add product images using public image URLs.

Orders and delivery management are not available yet: checkout is not enabled.
The separate Express admin data API and its PostgreSQL/Drizzle database have
not been migrated to Firebase and should not be removed yet.

## Deployment

The storefront deploys to **Vercel** (configured by `vercel.json` at the repo
root): it builds `artifacts/unique-boutique` and serves it with an SPA fallback
rewrite, so deep links like `/product/:slug` work. The build supplies the
`PORT` and `BASE_PATH` values required by the Vite config. Configure the
`VITE_FIREBASE_*` values from `artifacts/unique-boutique/.env.example` in
Vercel's project environment settings as well.

The API server is a long-running Express process and is **not** part of the
Vercel deployment — host it separately (Render, Railway, a VPS, …) and point
the admin panel at it when needed.

## See also

- `replit.md` — architecture decisions, gotchas and operational notes
