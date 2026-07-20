-- Destructive after the application starts writing independent Deposit dates
-- or custom timeline order. Only use before that data must be retained.

BEGIN;

DROP TRIGGER IF EXISTS "deposit_date_update_compat" ON "Deposit";
DROP TRIGGER IF EXISTS "deposit_date_insert_compat" ON "Deposit";
DROP FUNCTION IF EXISTS "sync_deposit_date_from_created_at"();

DROP INDEX IF EXISTS "Deposit_tripId_date_idx";

ALTER TABLE "Deposit"
  DROP COLUMN IF EXISTS "date";

ALTER TABLE "Trip"
  DROP COLUMN IF EXISTS "timelineOrder";

COMMIT;
