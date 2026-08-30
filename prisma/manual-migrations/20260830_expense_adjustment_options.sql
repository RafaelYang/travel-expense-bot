-- Split the legacy combined expense-adjustment toggle into three independent
-- trip settings. This stays outside prisma/migrations because production has
-- no Prisma migration history.

BEGIN;

ALTER TABLE "Trip"
  ADD COLUMN IF NOT EXISTS "serviceFeeEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "shopbackRewardEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "creditCardRewardEnabled" BOOLEAN NOT NULL DEFAULT false;

WITH adjustment_data AS (
  SELECT
    "tripId",
    BOOL_OR("serviceFee" > 0) AS has_service_fee,
    BOOL_OR("shopbackReward" > 0) AS has_shopback_reward,
    BOOL_OR("creditCardReward" > 0) AS has_credit_card_reward
  FROM "Expense"
  GROUP BY "tripId"
), inferred AS (
  SELECT
    trip.id,
    trip."expenseAdjustmentsEnabled",
    COALESCE(data.has_service_fee, false) AS has_service_fee,
    COALESCE(data.has_shopback_reward, false) AS has_shopback_reward,
    COALESCE(data.has_credit_card_reward, false) AS has_credit_card_reward
  FROM "Trip" AS trip
  LEFT JOIN adjustment_data AS data ON data."tripId" = trip.id
)
UPDATE "Trip" AS trip
SET
  "serviceFeeEnabled" = inferred."expenseAdjustmentsEnabled" AND (
    inferred.has_service_fee OR NOT (
      inferred.has_service_fee
      OR inferred.has_shopback_reward
      OR inferred.has_credit_card_reward
    )
  ),
  "shopbackRewardEnabled" = inferred."expenseAdjustmentsEnabled" AND (
    inferred.has_shopback_reward OR NOT (
      inferred.has_service_fee
      OR inferred.has_shopback_reward
      OR inferred.has_credit_card_reward
    )
  ),
  "creditCardRewardEnabled" = inferred."expenseAdjustmentsEnabled" AND (
    inferred.has_credit_card_reward OR NOT (
      inferred.has_service_fee
      OR inferred.has_shopback_reward
      OR inferred.has_credit_card_reward
    )
  )
FROM inferred
WHERE trip.id = inferred.id;

COMMIT;

