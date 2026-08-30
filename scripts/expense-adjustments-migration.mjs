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
if (!connectionString) throw new Error("DIRECT_URL or DATABASE_URL is required")

const migrationPath = path.join(
  root,
  "prisma/manual-migrations/20260830_expense_adjustments.sql",
)
const migrationSql = fs.readFileSync(migrationPath, "utf8")
  .replace(/^BEGIN;\s*$/m, "")
  .replace(/^COMMIT;\s*$/m, "")

const client = new pg.Client({ connectionString })
const expectedColumns = [
  ["Trip", "expenseAdjustmentsEnabled", "boolean", "false"],
  ["Expense", "serviceFee", "double precision", "0"],
  ["Expense", "shopbackReward", "double precision", "0"],
  ["Expense", "creditCardReward", "double precision", "0"],
]
const expectedConstraints = [
  "Expense_serviceFee_nonnegative",
  "Expense_shopbackReward_nonnegative",
  "Expense_creditCardReward_nonnegative",
]

async function inspectSchema() {
  const columns = await client.query(
    `SELECT table_name, column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND (table_name, column_name) IN (
         ('Trip', 'expenseAdjustmentsEnabled'),
         ('Expense', 'serviceFee'),
         ('Expense', 'shopbackReward'),
         ('Expense', 'creditCardReward')
       )
     ORDER BY table_name, column_name`,
  )
  const constraints = await client.query(
    `SELECT conname
     FROM pg_constraint
     WHERE conname = ANY($1::text[])
     ORDER BY conname`,
    [expectedConstraints],
  )
  return { columns: columns.rows, constraints: constraints.rows }
}

function verifySchema(schema) {
  for (const [tableName, columnName, dataType, defaultFragment] of expectedColumns) {
    const column = schema.columns.find((candidate) => (
      candidate.table_name === tableName && candidate.column_name === columnName
    ))
    if (
      !column
      || column.data_type !== dataType
      || column.is_nullable !== "NO"
      || !String(column.column_default).includes(defaultFragment)
    ) {
      throw new Error(`Expected ${tableName}.${columnName} schema is missing`)
    }
  }
  if (schema.constraints.length !== expectedConstraints.length) {
    throw new Error("Expected expense adjustment constraints are missing")
  }
}

async function verifyData() {
  const result = await client.query(
    `SELECT COUNT(*)::int AS invalid_rows
     FROM "Expense"
     WHERE "serviceFee" < 0
        OR "shopbackReward" < 0
        OR "creditCardReward" < 0
        OR "serviceFee" IN ('Infinity'::float8, 'NaN'::float8)
        OR "shopbackReward" IN ('Infinity'::float8, 'NaN'::float8)
        OR "creditCardReward" IN ('Infinity'::float8, 'NaN'::float8)`,
  )
  if (result.rows[0].invalid_rows !== 0) {
    throw new Error("Expense adjustment data verification failed")
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
    verifySchema(await inspectSchema())
    await verifyData()

    if (apply) {
      await client.query("COMMIT")
      console.log("expense_adjustments_migration=applied")
      console.log("expense_adjustments_verification=passed")
      return
    }

    await client.query("ROLLBACK")
    const rolledBack = await inspectSchema()
    if (JSON.stringify(rolledBack) !== JSON.stringify(before)) {
      throw new Error("Dry-run rollback did not restore the original schema")
    }
    console.log("expense_adjustments_migration=dry_run_passed")
    console.log("expense_adjustments_rollback=verified")
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
    console.error(`expense_adjustments_migration=failed code=${code}`)
    process.exitCode = 1
  })
  .finally(() => client.end().catch(() => {}))
