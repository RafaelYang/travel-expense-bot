-- Only use this rollback before cash-wallet application data must be retained.

BEGIN;

DROP TABLE IF EXISTS "CashExchange";
DROP TABLE IF EXISTS "CashWallet";
ALTER TABLE "Expense" DROP COLUMN IF EXISTS "paymentMethod";

COMMIT;
