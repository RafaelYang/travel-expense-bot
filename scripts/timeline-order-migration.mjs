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
  "prisma/manual-migrations/20260720_timeline_order.sql",
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
          AND table_name = 'Trip'
          AND column_name = 'timelineOrder'
      ) AS timeline_order,
      (SELECT data_type FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'Trip'
         AND column_name = 'timelineOrder') AS timeline_order_type,
      (SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'Trip'
         AND column_name = 'timelineOrder') AS timeline_order_nullable,
      (SELECT column_default FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'Trip'
         AND column_name = 'timelineOrder') AS timeline_order_default,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'Deposit'
          AND column_name = 'date'
      ) AS deposit_date,
      (SELECT data_type FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'Deposit'
         AND column_name = 'date') AS deposit_date_type,
      (SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'Deposit'
         AND column_name = 'date') AS deposit_date_nullable,
      EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'Deposit'
          AND indexname = 'Deposit_tripId_date_idx'
      ) AS deposit_date_index,
      (SELECT pg_get_indexdef(index_data.indexrelid)
       FROM pg_index AS index_data
       JOIN pg_class AS index_relation ON index_relation.oid = index_data.indexrelid
       JOIN pg_class AS table_relation ON table_relation.oid = index_data.indrelid
       JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_relation.relnamespace
       WHERE table_namespace.nspname = current_schema()
         AND table_relation.relname = 'Deposit'
         AND index_relation.relname = 'Deposit_tripId_date_idx') AS deposit_date_index_definition,
      (SELECT index_data.indisvalid AND index_data.indisready
       FROM pg_index AS index_data
       JOIN pg_class AS index_relation ON index_relation.oid = index_data.indexrelid
       JOIN pg_class AS table_relation ON table_relation.oid = index_data.indrelid
       JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_relation.relnamespace
       WHERE table_namespace.nspname = current_schema()
         AND table_relation.relname = 'Deposit'
         AND index_relation.relname = 'Deposit_tripId_date_idx') AS deposit_date_index_valid,
      (SELECT index_data.indpred IS NOT NULL
       FROM pg_index AS index_data
       JOIN pg_class AS index_relation ON index_relation.oid = index_data.indexrelid
       JOIN pg_class AS table_relation ON table_relation.oid = index_data.indrelid
       JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_relation.relnamespace
       WHERE table_namespace.nspname = current_schema()
         AND table_relation.relname = 'Deposit'
         AND index_relation.relname = 'Deposit_tripId_date_idx') AS deposit_date_index_partial,
      EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = '"Deposit"'::regclass
          AND tgname = 'deposit_date_insert_compat'
          AND NOT tgisinternal
      ) AS insert_trigger,
      EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = '"Deposit"'::regclass
          AND tgname = 'deposit_date_update_compat'
          AND NOT tgisinternal
      ) AS update_trigger`,
  )
  return result.rows[0]
}

async function verifyData() {
  const result = await client.query(
    `SELECT
      (SELECT COUNT(*)::int FROM "Trip"
       WHERE "timelineOrder" IS NULL
          OR jsonb_typeof("timelineOrder") <> 'object') AS invalid_timeline_orders,
      (SELECT COUNT(*)::int FROM "Deposit"
       WHERE "date" IS NULL) AS missing_deposit_dates`,
  )
  const checks = result.rows[0]
  if (checks.invalid_timeline_orders || checks.missing_deposit_dates) {
    throw new Error("Timeline order migration verification query failed")
  }
}

async function verifyCompatibilityTriggers() {
  await client.query("SAVEPOINT compatibility_trigger_check")
  try {
    await client.query(
      `CREATE TEMP TABLE "deposit_trigger_check" (
        "date" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL
      ) ON COMMIT DROP`,
    )
    await client.query(
      `CREATE TRIGGER "deposit_trigger_check_insert"
       BEFORE INSERT ON "deposit_trigger_check"
       FOR EACH ROW EXECUTE FUNCTION "sync_deposit_date_from_created_at"()`,
    )
    await client.query(
      `CREATE TRIGGER "deposit_trigger_check_update"
       BEFORE UPDATE OF "createdAt" ON "deposit_trigger_check"
       FOR EACH ROW EXECUTE FUNCTION "sync_deposit_date_from_created_at"()`,
    )
    const legacyInsert = await client.query(
      `INSERT INTO "deposit_trigger_check" ("createdAt")
       VALUES ('2026-07-18 12:00:00')`,
    )
    const explicitDateInsert = await client.query(
      `INSERT INTO "deposit_trigger_check" ("date", "createdAt")
       VALUES ('2026-07-17 12:00:00', '2026-07-19 12:00:00')`,
    )
    const legacyUpdate = await client.query(
      `UPDATE "deposit_trigger_check"
       SET "createdAt" = '2026-07-20 12:00:00'
       WHERE "createdAt" = '2026-07-18 12:00:00'`,
    )
    if (
      legacyInsert.rowCount !== 1
      || explicitDateInsert.rowCount !== 1
      || legacyUpdate.rowCount !== 1
    ) {
      throw new Error("Deposit compatibility trigger suppressed a write")
    }
    const result = await client.query(
      `SELECT
         COUNT(*)::int AS total_rows,
         COUNT(*) FILTER (
           WHERE ("createdAt" = '2026-07-20 12:00:00'
                  AND "date" IS DISTINCT FROM "createdAt")
              OR ("createdAt" = '2026-07-19 12:00:00'
                  AND "date" IS DISTINCT FROM '2026-07-17 12:00:00')
         )::int AS invalid_rows
       FROM "deposit_trigger_check"
      `,
    )
    if (result.rows[0].total_rows !== 2 || result.rows[0].invalid_rows !== 0) {
      throw new Error("Deposit compatibility trigger behavior is invalid")
    }
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT compatibility_trigger_check")
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
    if (
      !after.timeline_order
      || after.timeline_order_type !== "jsonb"
      || after.timeline_order_nullable !== "NO"
      || !String(after.timeline_order_default).includes("'{}'::jsonb")
      || !after.deposit_date
      || after.deposit_date_type !== "timestamp without time zone"
      || after.deposit_date_nullable !== "NO"
      || !after.deposit_date_index
      || !after.deposit_date_index_valid
      || after.deposit_date_index_partial
      || !/\("tripId", "?date"?\)$/u.test(
        String(after.deposit_date_index_definition).trim(),
      )
      || !after.insert_trigger
      || !after.update_trigger
    ) {
      throw new Error("Expected timeline order schema objects are missing")
    }
    await verifyData()
    await verifyCompatibilityTriggers()

    if (apply) {
      await client.query("COMMIT")
      console.log("timeline_order_migration=applied")
      console.log("timeline_order_verification=passed")
      return
    }

    await client.query("ROLLBACK")
    const rolledBack = await inspectSchema()
    if (JSON.stringify(rolledBack) !== JSON.stringify(before)) {
      throw new Error("Dry-run rollback did not restore the original schema")
    }
    console.log("timeline_order_migration=dry_run_passed")
    console.log("timeline_order_rollback=verified")
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
    console.error(`timeline_order_migration=failed code=${code}`)
    process.exitCode = 1
  })
  .finally(() => client.end().catch(() => {}))
