-- Expense reconciliation expand migration. This file is intentionally NOT
-- under prisma/migrations because production has no Prisma migration history.
-- Back up the database and run the transactional verifier before deployment.

BEGIN;

ALTER TABLE "Expense"
  ADD COLUMN IF NOT EXISTS "settledAmount" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "reconciledAt" TIMESTAMP(3);

COMMIT;

-- Verification queries (should return zero rows/counts):
-- SELECT COUNT(*) FROM "Expense"
-- WHERE "settledAmount" IS NOT NULL
--   AND ("settledAmount" <= 0 OR "settledAmount"::text IN ('NaN', 'Infinity', '-Infinity'));
