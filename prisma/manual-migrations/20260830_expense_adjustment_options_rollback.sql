-- Roll back only the independent display settings. The legacy aggregate flag
-- remains available, so application rollback can happen before this script.

BEGIN;

ALTER TABLE "Trip"
  DROP COLUMN IF EXISTS "creditCardRewardEnabled",
  DROP COLUMN IF EXISTS "shopbackRewardEnabled",
  DROP COLUMN IF EXISTS "serviceFeeEnabled";

COMMIT;

