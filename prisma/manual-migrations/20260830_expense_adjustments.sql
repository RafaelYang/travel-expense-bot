-- Expense fee/reward expand migration. This file intentionally stays outside
-- prisma/migrations because production has no Prisma migration history. Run
-- the transactional verifier before deploying code that reads these columns.

BEGIN;

ALTER TABLE "Trip"
  ADD COLUMN IF NOT EXISTS "expenseAdjustmentsEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Expense"
  ADD COLUMN IF NOT EXISTS "serviceFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "shopbackReward" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "creditCardReward" DOUBLE PRECISION NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_serviceFee_nonnegative') THEN
    ALTER TABLE "Expense" ADD CONSTRAINT "Expense_serviceFee_nonnegative"
      CHECK ("serviceFee" >= 0 AND "serviceFee" <> 'Infinity'::DOUBLE PRECISION AND "serviceFee" <> 'NaN'::DOUBLE PRECISION);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_shopbackReward_nonnegative') THEN
    ALTER TABLE "Expense" ADD CONSTRAINT "Expense_shopbackReward_nonnegative"
      CHECK ("shopbackReward" >= 0 AND "shopbackReward" <> 'Infinity'::DOUBLE PRECISION AND "shopbackReward" <> 'NaN'::DOUBLE PRECISION);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_creditCardReward_nonnegative') THEN
    ALTER TABLE "Expense" ADD CONSTRAINT "Expense_creditCardReward_nonnegative"
      CHECK ("creditCardReward" >= 0 AND "creditCardReward" <> 'Infinity'::DOUBLE PRECISION AND "creditCardReward" <> 'NaN'::DOUBLE PRECISION);
  END IF;
END $$;

COMMIT;

-- Verification query (all counts should be zero):
-- SELECT
--   COUNT(*) FILTER (WHERE "serviceFee" < 0 OR "serviceFee" IN ('Infinity'::float8, 'NaN'::float8)) AS invalid_service_fees,
--   COUNT(*) FILTER (WHERE "shopbackReward" < 0 OR "shopbackReward" IN ('Infinity'::float8, 'NaN'::float8)) AS invalid_shopback_rewards,
--   COUNT(*) FILTER (WHERE "creditCardReward" < 0 OR "creditCardReward" IN ('Infinity'::float8, 'NaN'::float8)) AS invalid_card_rewards
-- FROM "Expense";
