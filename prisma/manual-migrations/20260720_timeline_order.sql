-- Timeline ordering and independent Deposit date expand migration. This file
-- intentionally stays outside prisma/migrations because production has no
-- Prisma migration history. Back up the database and run the transactional
-- verifier before deploying application code that reads these columns.

BEGIN;

ALTER TABLE "Trip"
  ADD COLUMN IF NOT EXISTS "timelineOrder" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "Deposit"
  ADD COLUMN IF NOT EXISTS "date" TIMESTAMP(3);

-- Deposit.createdAt historically stored the user-selected transaction date.
-- Preserve that value as the initial independent date for every existing row.
UPDATE "Deposit"
SET "date" = "createdAt"
WHERE "date" IS NULL;

-- The old application omits Deposit.date and writes a selected date into
-- createdAt. Keep inserts (and date edits during the short rollout window)
-- compatible until the new application writes Deposit.date directly.
CREATE OR REPLACE FUNCTION "sync_deposit_date_from_created_at"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."date" IS NULL THEN
      NEW."date" := NEW."createdAt";
    END IF;
  ELSIF NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    AND NEW."date" IS NOT DISTINCT FROM OLD."date" THEN
    NEW."date" := NEW."createdAt";
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "deposit_date_insert_compat" ON "Deposit";
CREATE TRIGGER "deposit_date_insert_compat"
BEFORE INSERT ON "Deposit"
FOR EACH ROW
EXECUTE FUNCTION "sync_deposit_date_from_created_at"();

DROP TRIGGER IF EXISTS "deposit_date_update_compat" ON "Deposit";
CREATE TRIGGER "deposit_date_update_compat"
BEFORE UPDATE OF "createdAt" ON "Deposit"
FOR EACH ROW
EXECUTE FUNCTION "sync_deposit_date_from_created_at"();

ALTER TABLE "Deposit"
  ALTER COLUMN "date" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "Deposit_tripId_date_idx"
  ON "Deposit"("tripId", "date");

COMMIT;

-- Verification queries (both counts should be zero):
-- SELECT COUNT(*) FROM "Trip"
-- WHERE "timelineOrder" IS NULL OR jsonb_typeof("timelineOrder") <> 'object';
-- SELECT COUNT(*) FROM "Deposit" WHERE "date" IS NULL;
