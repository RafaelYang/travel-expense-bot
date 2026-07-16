import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import dotenv from "dotenv"
import pg from "pg"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
dotenv.config({ path: path.join(root, ".env"), quiet: true })

const apply = process.argv.includes("--apply")
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!connectionString) {
  throw new Error("DIRECT_URL or DATABASE_URL is required")
}

const migrationPath = path.join(
  root,
  "prisma/manual-migrations/20260716_cash_wallet.sql",
)
const migrationSql = fs.readFileSync(migrationPath, "utf8")
  .replace(/^BEGIN;\s*$/m, "")
  .replace(/^COMMIT;\s*$/m, "")

const client = new pg.Client({ connectionString })

async function inspectSchema() {
  const result = await client.query(
    `SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'Expense'
          AND column_name = 'paymentMethod'
      ) AS payment_method,
      EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = 'CashWallet'
      ) AS cash_wallet,
      EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = 'CashExchange'
      ) AS cash_exchange`,
  )
  return result.rows[0]
}

async function verifyData() {
  const result = await client.query(
    `SELECT
      (SELECT COUNT(*)::int FROM "Expense" WHERE "paymentMethod" NOT IN ('card', 'cash')) AS invalid_payments,
      (SELECT COUNT(*)::int FROM "CashWallet" WHERE "balance" < 0) AS negative_wallets,
      (SELECT COUNT(*)::int FROM "CashExchange" WHERE "foreignAmount" <= 0 OR "baseAmount" <= 0) AS invalid_exchanges`,
  )
  const checks = result.rows[0]
  if (checks.invalid_payments || checks.negative_wallets || checks.invalid_exchanges) {
    throw new Error("Cash-wallet verification query failed")
  }
}

async function main() {
  await client.connect()
  const before = await inspectSchema()

  await client.query("BEGIN")
  try {
    await client.query("SET LOCAL lock_timeout = '5s'")
    await client.query("SET LOCAL statement_timeout = '30s'")
    await client.query(migrationSql)

    const after = await inspectSchema()
    if (!after.payment_method || !after.cash_wallet || !after.cash_exchange) {
      throw new Error("Expected cash-wallet schema objects are missing")
    }
    await verifyData()

    if (apply) {
      await client.query("COMMIT")
      console.log("cash_wallet_migration=applied")
      console.log("cash_wallet_verification=passed")
      return
    }

    await client.query("ROLLBACK")
    const rolledBack = await inspectSchema()
    if (
      rolledBack.payment_method !== before.payment_method ||
      rolledBack.cash_wallet !== before.cash_wallet ||
      rolledBack.cash_exchange !== before.cash_exchange
    ) {
      throw new Error("Dry-run rollback did not restore the original schema")
    }
    console.log("cash_wallet_migration=dry_run_passed")
    console.log("cash_wallet_rollback=verified")
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  }
}

main()
  .catch((error) => {
    const code = error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "none"
    console.error(`cash_wallet_migration=failed code=${code}`)
    process.exitCode = 1
  })
  .finally(() => client.end().catch(() => {}))
