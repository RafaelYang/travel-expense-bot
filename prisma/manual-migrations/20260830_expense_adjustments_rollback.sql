-- Destructive after users start saving fee/reward values. Only use before that
-- data must be retained.

BEGIN;

ALTER TABLE "Expense"
  DROP CONSTRAINT IF EXISTS "Expense_creditCardReward_nonnegative",
  DROP CONSTRAINT IF EXISTS "Expense_shopbackReward_nonnegative",
  DROP CONSTRAINT IF EXISTS "Expense_serviceFee_nonnegative",
  DROP COLUMN IF EXISTS "creditCardReward",
  DROP COLUMN IF EXISTS "shopbackReward",
  DROP COLUMN IF EXISTS "serviceFee";

ALTER TABLE "Trip"
  DROP COLUMN IF EXISTS "expenseAdjustmentsEnabled";

COMMIT;
