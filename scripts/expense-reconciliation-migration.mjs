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
  "prisma/manual-migrations/20260716_expense_reconciliation.sql",
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
          AND column_name = 'settledAmount'
      ) AS settled_amount,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'Expense'
          AND column_name = 'reconciledAt'
      ) AS reconciled_at`,
  )
  return result.rows[0]
}

async function verifyData() {
  const result = await client.query(
    `SELECT COUNT(*)::int AS invalid_settlements
     FROM "Expense"
     WHERE "settledAmount" IS NOT NULL
       AND (
         "settledAmount" <= 0
         OR "settledAmount"::text IN ('NaN', 'Infinity', '-Infinity')
       )`,
  )
  if (result.rows[0].invalid_settlements !== 0) {
    throw new Error("Expense reconciliation verification query failed")
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
    if (!after.settled_amount || !after.reconciled_at) {
      throw new Error("Expected expense reconciliation columns are missing")
    }
    await verifyData()

    if (apply) {
      await client.query("COMMIT")
      console.log("expense_reconciliation_migration=applied")
      console.log("expense_reconciliation_verification=passed")
      return
    }

    await client.query("ROLLBACK")
    const rolledBack = await inspectSchema()
    if (
      rolledBack.settled_amount !== before.settled_amount ||
      rolledBack.reconciled_at !== before.reconciled_at
    ) {
      throw new Error("Dry-run rollback did not restore the original schema")
    }
    console.log("expense_reconciliation_migration=dry_run_passed")
    console.log("expense_reconciliation_rollback=verified")
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
    console.error(`expense_reconciliation_migration=failed code=${code}`)
    process.exitCode = 1
  })
  .finally(() => client.end().catch(() => {}))
