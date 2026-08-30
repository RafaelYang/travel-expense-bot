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
  "prisma/manual-migrations/20260830_expense_adjustment_options.sql",
)
const migrationSql = fs.readFileSync(migrationPath, "utf8")
  .replace(/^BEGIN;\s*$/m, "")
  .replace(/^COMMIT;\s*$/m, "")

const client = new pg.Client({ connectionString })
const expectedColumns = [
  "serviceFeeEnabled",
  "shopbackRewardEnabled",
  "creditCardRewardEnabled",
]

async function inspectSchema() {
  const columns = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'Trip'
       AND column_name = ANY($1::text[])
     ORDER BY column_name`,
    [expectedColumns],
  )
  return columns.rows
}

function verifySchema(columns) {
  for (const columnName of expectedColumns) {
    const column = columns.find((candidate) => candidate.column_name === columnName)
    if (
      !column
      || column.data_type !== "boolean"
      || column.is_nullable !== "NO"
      || !String(column.column_default).includes("false")
    ) {
      throw new Error(`Expected Trip.${columnName} schema is missing`)
    }
  }
}

async function verifyData() {
  const aggregate = await client.query(
    `SELECT COUNT(*)::int AS invalid_rows
     FROM "Trip"
     WHERE "expenseAdjustmentsEnabled" <>
       ("serviceFeeEnabled" OR "shopbackRewardEnabled" OR "creditCardRewardEnabled")`,
  )
  if (aggregate.rows[0].invalid_rows !== 0) {
    throw new Error("Legacy aggregate adjustment flag is out of sync")
  }

  const backfill = await client.query(
    `SELECT COUNT(*)::int AS invalid_rows
     FROM "Expense" AS expense
     JOIN "Trip" AS trip ON trip.id = expense."tripId"
     WHERE trip."expenseAdjustmentsEnabled"
       AND ((expense."serviceFee" > 0 AND NOT trip."serviceFeeEnabled")
         OR (expense."shopbackReward" > 0 AND NOT trip."shopbackRewardEnabled")
         OR (expense."creditCardReward" > 0 AND NOT trip."creditCardRewardEnabled"))`,
  )
  if (backfill.rows[0].invalid_rows !== 0) {
    throw new Error("Existing adjustment data was not preserved by the backfill")
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
      console.log("expense_adjustment_options_migration=applied")
      console.log("expense_adjustment_options_verification=passed")
      return
    }

    await client.query("ROLLBACK")
    const rolledBack = await inspectSchema()
    if (JSON.stringify(rolledBack) !== JSON.stringify(before)) {
      throw new Error("Dry-run rollback did not restore the original schema")
    }
    console.log("expense_adjustment_options_migration=dry_run_passed")
    console.log("expense_adjustment_options_rollback=verified")
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
    console.error(`expense_adjustment_options_migration=failed code=${code}`)
    process.exitCode = 1
  })
  .finally(() => client.end().catch(() => {}))
