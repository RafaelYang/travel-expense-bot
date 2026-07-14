-- Expand-only money migration. This file is intentionally NOT under
-- prisma/migrations because the production database has no Prisma migration
-- history yet. Review and run it manually in a transaction before changing
-- Prisma fields from Float to Decimal.

BEGIN;

ALTER TABLE "Trip"
  ADD COLUMN IF NOT EXISTS "budgetAmountExact" NUMERIC(19, 4);

ALTER TABLE "Expense"
  ADD COLUMN IF NOT EXISTS "amountExact" NUMERIC(19, 4),
  ADD COLUMN IF NOT EXISTS "convertedAmountExact" NUMERIC(19, 4),
  ADD COLUMN IF NOT EXISTS "exchangeRateExact" NUMERIC(30, 12);

ALTER TABLE "Deposit"
  ADD COLUMN IF NOT EXISTS "amountExact" NUMERIC(19, 4),
  ADD COLUMN IF NOT EXISTS "convertedAmountExact" NUMERIC(19, 4),
  ADD COLUMN IF NOT EXISTS "exchangeRateExact" NUMERIC(30, 12),
  ADD COLUMN IF NOT EXISTS "conversionCurrency" VARCHAR(3);

UPDATE "Trip"
SET "budgetAmountExact" = ROUND("budgetAmount"::numeric, 4)
WHERE "budgetAmount" IS NOT NULL
  AND "budgetAmountExact" IS NULL;

UPDATE "Expense"
SET
  "amountExact" = ROUND("amount"::numeric, 4),
  "convertedAmountExact" = CASE
    WHEN "convertedAmount" IS NULL THEN NULL
    ELSE ROUND("convertedAmount"::numeric, 4)
  END,
  "exchangeRateExact" = CASE
    WHEN "exchangeRate" IS NULL THEN NULL
    ELSE ROUND("exchangeRate"::numeric, 12)
  END
WHERE "amountExact" IS NULL
   OR ("convertedAmount" IS NOT NULL AND "convertedAmountExact" IS NULL)
   OR ("exchangeRate" IS NOT NULL AND "exchangeRateExact" IS NULL);

UPDATE "Deposit" AS deposit
SET
  "amountExact" = ROUND(deposit."amount"::numeric, 4),
  "convertedAmountExact" = CASE
    WHEN UPPER(deposit."currency") = UPPER(trip."baseCurrency")
      THEN ROUND(deposit."amount"::numeric, 4)
    ELSE NULL
  END,
  "exchangeRateExact" = CASE
    WHEN UPPER(deposit."currency") = UPPER(trip."baseCurrency") THEN 1
    ELSE NULL
  END,
  "conversionCurrency" = UPPER(trip."baseCurrency")
FROM "Trip" AS trip
WHERE deposit."tripId" = trip."id"
  AND deposit."amountExact" IS NULL;

COMMIT;

-- Verification queries (all counts should be zero before application cutover):
-- SELECT COUNT(*) FROM "Expense" WHERE "amountExact" IS NULL;
-- SELECT COUNT(*) FROM "Deposit" WHERE "amountExact" IS NULL;
-- SELECT COUNT(*) FROM "Trip" WHERE "budgetAmount" IS NOT NULL AND "budgetAmountExact" IS NULL;
