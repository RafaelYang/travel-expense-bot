-- Safe only before the application starts reading or writing the Exact fields.
BEGIN;

ALTER TABLE "Deposit"
  DROP COLUMN IF EXISTS "conversionCurrency",
  DROP COLUMN IF EXISTS "exchangeRateExact",
  DROP COLUMN IF EXISTS "convertedAmountExact",
  DROP COLUMN IF EXISTS "amountExact";

ALTER TABLE "Expense"
  DROP COLUMN IF EXISTS "exchangeRateExact",
  DROP COLUMN IF EXISTS "convertedAmountExact",
  DROP COLUMN IF EXISTS "amountExact";

ALTER TABLE "Trip"
  DROP COLUMN IF EXISTS "budgetAmountExact";

COMMIT;
