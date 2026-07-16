-- Only use this rollback before reconciliation data must be retained.

BEGIN;

ALTER TABLE "Expense"
  DROP COLUMN IF EXISTS "reconciledAt",
  DROP COLUMN IF EXISTS "settledAmount";

COMMIT;
