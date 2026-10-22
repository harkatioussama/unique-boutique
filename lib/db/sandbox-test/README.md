# Smoke tests (throwaway databases only)

These insert sample data. Each refuses to run unless the database name
contains `test` or `sandbox`. Never point them at the real store database.
Use a **fresh, empty** database for each file.

```bash
# from the repo root
export DATABASE_URL=postgresql://USER@localhost:5432/unique_sandbox_test
pnpm --filter @workspace/db run migrate
TSX=$PWD/scripts/node_modules/.bin/tsx

cd lib/db
$TSX sandbox-test/stock.smoke.ts      # Phase 1: stock, constraints, status flow
$TSX sandbox-test/delivery.smoke.ts   # Phase 2: wilaya seed, delivery fees, order snapshot (fresh DB)
```

The admin auth test runs against a live API server, see
`artifacts/api-server/sandbox-test/auth.smoke.ts` for the command.
