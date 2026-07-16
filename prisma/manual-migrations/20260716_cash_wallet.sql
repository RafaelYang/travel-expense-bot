-- Cash-wallet migration. This file is intentionally NOT under
-- prisma/migrations because the production database has no Prisma migration
-- history. Back up the database, review, and run manually before deploying the
-- cash-wallet application code.

BEGIN;

ALTER TABLE "Expense"
  ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT NOT NULL DEFAULT 'card';

CREATE TABLE IF NOT EXISTS "CashWallet" (
  "id" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashWallet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashWallet_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CashWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CashWallet_tripId_userId_currency_key"
  ON "CashWallet"("tripId", "userId", "currency");
CREATE INDEX IF NOT EXISTS "CashWallet_tripId_idx" ON "CashWallet"("tripId");
CREATE INDEX IF NOT EXISTS "CashWallet_userId_idx" ON "CashWallet"("userId");

CREATE TABLE IF NOT EXISTS "CashExchange" (
  "id" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "foreignCurrency" TEXT NOT NULL,
  "foreignAmount" DOUBLE PRECISION NOT NULL,
  "baseAmount" DOUBLE PRECISION NOT NULL,
  "exchangeRate" DOUBLE PRECISION NOT NULL,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashExchange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashExchange_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CashExchange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CashExchange_type_check" CHECK ("type" IN ('buy', 'sell')),
  CONSTRAINT "CashExchange_amounts_check" CHECK ("foreignAmount" > 0 AND "baseAmount" > 0),
  CONSTRAINT "CashExchange_currency_check" CHECK (char_length("foreignCurrency") = 3)
);

CREATE INDEX IF NOT EXISTS "CashExchange_tripId_date_idx" ON "CashExchange"("tripId", "date");
CREATE INDEX IF NOT EXISTS "CashExchange_userId_idx" ON "CashExchange"("userId");

COMMIT;

-- Verification queries (all should return zero rows/counts):
-- SELECT COUNT(*) FROM "Expense" WHERE "paymentMethod" NOT IN ('card', 'cash');
-- SELECT * FROM "CashWallet" WHERE "balance" < 0;
-- SELECT * FROM "CashExchange" WHERE "foreignAmount" <= 0 OR "baseAmount" <= 0;
