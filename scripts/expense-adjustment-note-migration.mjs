import fs from "node:fs"
import path from "node:path"
import process from "node:process"

import dotenv from "dotenv"
import pg from "pg"

import { buildExpenseAdjustmentNoteMigration } from "./lib/expense-adjustment-note.mjs"

dotenv.config({ path: ".env", quiet: true })

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!connectionString) throw new Error("DIRECT_URL or DATABASE_URL is required")

const client = new pg.Client({ connectionString })
const apply = process.argv.includes("--apply")
const restoreArgument = process.argv.find((argument) => argument.startsWith("--restore="))
const restorePath = restoreArgument
  ? path.resolve(restoreArgument.slice("--restore=".length))
  : null
const verifyArgument = process.argv.find((argument) => argument.startsWith("--verify="))
const verifyPath = verifyArgument
  ? path.resolve(verifyArgument.slice("--verify=".length))
  : null
const expectedCountArgument = process.argv.find((argument) => argument.startsWith("--expect-count="))
const expectedCount = expectedCountArgument
  ? Number(expectedCountArgument.slice("--expect-count=".length))
  : null

if (apply && (!Number.isInteger(expectedCount) || expectedCount < 1)) {
  throw new Error("--apply requires --expect-count=<positive integer>")
}
if ([apply, Boolean(restorePath), Boolean(verifyPath)].filter(Boolean).length > 1) {
  throw new Error("Choose only one of --apply, --restore, or --verify")
}

const candidateQuery = `SELECT
  e.id,
  e."tripId",
  t.name AS trip,
  t."baseCurrency",
  t."expenseAdjustmentsEnabled",
  t."updatedAt" AS "tripUpdatedAt",
  e.item,
  e.amount,
  e.currency,
  e."convertedAmount",
  e."settledAmount",
  e."reconciledAt",
  e."paymentMethod",
  e.note,
  e."serviceFee",
  e."shopbackReward",
  e."creditCardReward",
  e."updatedAt"
FROM "Expense" e
JOIN "Trip" t ON t.id = e."tripId"
WHERE e.note IS NOT NULL
  AND e.note ~* $1
ORDER BY t.name, e.date, e."createdAt"`
const candidatePattern = "國外交易(?:服務費|手續費)"

function beforeSnapshot(row) {
  return {
    amount: row.amount,
    convertedAmount: row.convertedAmount,
    settledAmount: row.settledAmount,
    note: row.note,
    serviceFee: row.serviceFee,
    shopbackReward: row.shopbackReward,
    creditCardReward: row.creditCardReward,
  }
}

function compactPreview(row, migration) {
  return {
    trip: row.trip,
    item: row.item,
    oldNote: row.note,
    retainedNote: migration.after.note,
    serviceFee: migration.after.serviceFee,
    netAmountBefore: migration.beforeNetAmount,
    netAmountAfter: migration.afterNetAmount,
  }
}

function createBackup(rows, migrations) {
  const trips = new Map()
  rows.forEach((row) => {
    if (!trips.has(row.tripId)) {
      trips.set(row.tripId, {
        id: row.tripId,
        expenseAdjustmentsEnabled: row.expenseAdjustmentsEnabled,
      })
    }
  })
  const backup = {
    createdAt: new Date().toISOString(),
    trips: [...trips.values()],
    expenses: rows.map((row, index) => ({
      id: row.id,
      before: beforeSnapshot(row),
      after: migrations[index].after,
    })),
  }
  const directory = path.resolve(".migration-backups")
  fs.mkdirSync(directory, { recursive: true })
  const stamp = backup.createdAt.replaceAll(":", "-").replaceAll(".", "-")
  const backupPath = path.join(directory, `expense-adjustment-notes-${stamp}.json`)
  fs.writeFileSync(backupPath, `${JSON.stringify(backup, null, 2)}\n`, { flag: "wx", mode: 0o600 })
  return backupPath
}

function sameValue(left, right) {
  return left === right || (
    typeof left === "number"
    && typeof right === "number"
    && Math.abs(left - right) <= 0.000001
  )
}

async function restoreBackup() {
  if (!fs.existsSync(restorePath)) throw new Error("Restore backup does not exist")
  const backup = JSON.parse(fs.readFileSync(restorePath, "utf8"))
  if (!Array.isArray(backup.expenses) || !Array.isArray(backup.trips)) {
    throw new Error("Restore backup is malformed")
  }

  await client.query("BEGIN")
  try {
    await client.query("SET LOCAL lock_timeout = '5s'")
    await client.query("SET LOCAL statement_timeout = '15s'")
    const expenseIds = backup.expenses.map((expense) => expense.id)
    const tripIds = backup.trips.map((trip) => trip.id)
    const current = await client.query(
      `SELECT id, amount, "convertedAmount", "settledAmount", note,
              "serviceFee", "shopbackReward", "creditCardReward"
       FROM "Expense"
       WHERE id = ANY($1::text[])
       FOR UPDATE`,
      [expenseIds],
    )
    if (current.rowCount !== backup.expenses.length) {
      throw new Error("Restore could not find every backed-up expense")
    }
    const currentById = new Map(current.rows.map((row) => [row.id, row]))
    for (const expense of backup.expenses) {
      const row = currentById.get(expense.id)
      for (const field of ["amount", "convertedAmount", "settledAmount", "note", "serviceFee"]) {
        if (!sameValue(row[field], expense.after[field])) {
          throw new Error(`Expense ${expense.id} changed after migration; restore stopped`)
        }
      }
      if (row.shopbackReward !== 0 || row.creditCardReward !== 0) {
        throw new Error(`Expense ${expense.id} gained reward data; restore stopped`)
      }
    }

    const otherAdjustments = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM "Expense"
       WHERE "tripId" = ANY($1::text[])
         AND NOT (id = ANY($2::text[]))
         AND ("serviceFee" > 0 OR "shopbackReward" > 0 OR "creditCardReward" > 0)`,
      [tripIds, expenseIds],
    )
    if (
      otherAdjustments.rows[0].count > 0
      && backup.trips.some((trip) => trip.expenseAdjustmentsEnabled === false)
    ) {
      throw new Error("A trip gained new adjustment data; restore stopped")
    }

    for (const expense of backup.expenses) {
      const before = expense.before
      await client.query(
        `UPDATE "Expense"
         SET amount = $2,
             "convertedAmount" = $3,
             "settledAmount" = $4,
             note = $5,
             "serviceFee" = $6,
             "shopbackReward" = $7,
             "creditCardReward" = $8,
             "updatedAt" = NOW()
         WHERE id = $1`,
        [
          expense.id,
          before.amount,
          before.convertedAmount,
          before.settledAmount,
          before.note,
          before.serviceFee,
          before.shopbackReward,
          before.creditCardReward,
        ],
      )
    }
    for (const trip of backup.trips) {
      await client.query(
        `UPDATE "Trip"
         SET "expenseAdjustmentsEnabled" = $2,
             "updatedAt" = NOW()
         WHERE id = $1`,
        [trip.id, trip.expenseAdjustmentsEnabled],
      )
    }
    await client.query("COMMIT")
    console.log(JSON.stringify({
      mode: "restored",
      count: backup.expenses.length,
      affectedTripCount: backup.trips.length,
      verification: "passed",
    }, null, 2))
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  }
}

async function verifyBackup() {
  if (!fs.existsSync(verifyPath)) throw new Error("Verification backup does not exist")
  const backup = JSON.parse(fs.readFileSync(verifyPath, "utf8"))
  if (!Array.isArray(backup.expenses) || !Array.isArray(backup.trips)) {
    throw new Error("Verification backup is malformed")
  }

  await client.query("BEGIN READ ONLY")
  try {
    await client.query("SET LOCAL statement_timeout = '15s'")
    const expenseIds = backup.expenses.map((expense) => expense.id)
    const current = await client.query(
      `SELECT id, amount, "convertedAmount", "settledAmount", note,
              "serviceFee", "shopbackReward", "creditCardReward"
       FROM "Expense"
       WHERE id = ANY($1::text[])`,
      [expenseIds],
    )
    if (current.rowCount !== backup.expenses.length) {
      throw new Error("Verification could not find every backed-up expense")
    }
    const currentById = new Map(current.rows.map((row) => [row.id, row]))
    for (const expense of backup.expenses) {
      const row = currentById.get(expense.id)
      for (const field of ["amount", "convertedAmount", "settledAmount", "note", "serviceFee"]) {
        if (!sameValue(row[field], expense.after[field])) {
          throw new Error(`Expense ${expense.id} does not match the migrated value`)
        }
      }
      if (row.shopbackReward !== 0 || row.creditCardReward !== 0) {
        throw new Error(`Expense ${expense.id} has unexpected reward data`)
      }
    }
    const tripIds = backup.trips.map((trip) => trip.id)
    const trips = await client.query(
      `SELECT COUNT(*)::int AS enabled
       FROM "Trip"
       WHERE id = ANY($1::text[])
         AND "expenseAdjustmentsEnabled" = true`,
      [tripIds],
    )
    if (trips.rows[0].enabled !== backup.trips.length) {
      throw new Error("Verification found a trip with adjustments disabled")
    }
    await client.query("ROLLBACK")
    console.log(JSON.stringify({
      mode: "verified",
      count: backup.expenses.length,
      affectedTripCount: backup.trips.length,
      totalServiceFee: backup.expenses.reduce(
        (total, expense) => total + expense.after.serviceFee,
        0,
      ),
      matchingRows: current.rowCount,
      verification: "passed",
    }, null, 2))
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  }
}

async function main() {
  await client.connect()
  if (restorePath) {
    await restoreBackup()
    return
  }
  if (verifyPath) {
    await verifyBackup()
    return
  }
  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY")
  try {
    await client.query("SET LOCAL lock_timeout = '5s'")
    await client.query("SET LOCAL statement_timeout = '15s'")
    const result = await client.query(
      `${candidateQuery}${apply ? " FOR UPDATE OF e, t" : ""}`,
      [candidatePattern],
    )
    const rows = result.rows
    const migrations = rows.map(buildExpenseAdjustmentNoteMigration)
    const totalServiceFee = migrations.reduce(
      (total, migration) => total + migration.after.serviceFee,
      0,
    )
    const affectedTrips = new Set(rows.map((row) => row.tripId))

    if (!apply) {
      console.log(JSON.stringify({
        mode: "dry-run",
        count: rows.length,
        affectedTripCount: affectedTrips.size,
        totalServiceFee,
        netAmountChange: migrations.reduce(
          (total, migration) => total + migration.afterNetAmount - migration.beforeNetAmount,
          0,
        ),
        preview: rows.map((row, index) => compactPreview(row, migrations[index])),
      }, null, 2))
      await client.query("ROLLBACK")
      return
    }

    if (rows.length !== expectedCount) {
      throw new Error(`Expected ${expectedCount} candidates but found ${rows.length}`)
    }
    const backupPath = createBackup(rows, migrations)

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      const after = migrations[index].after
      const update = await client.query(
        `UPDATE "Expense"
         SET amount = $2,
             "convertedAmount" = $3,
             "settledAmount" = $4,
             note = $5,
             "serviceFee" = $6,
             "updatedAt" = NOW()
         WHERE id = $1`,
        [
          row.id,
          after.amount,
          after.convertedAmount,
          after.settledAmount,
          after.note,
          after.serviceFee,
        ],
      )
      if (update.rowCount !== 1) throw new Error(`Expense ${row.id} was not updated`)
    }

    await client.query(
      `UPDATE "Trip"
       SET "expenseAdjustmentsEnabled" = true,
           "updatedAt" = NOW()
       WHERE id = ANY($1::text[])`,
      [[...affectedTrips]],
    )

    const verify = await client.query(
      `SELECT COUNT(*)::int AS remaining
       FROM "Expense"
       WHERE id = ANY($1::text[])
         AND (
           note ~* $2
           OR "serviceFee" <= 0
           OR "shopbackReward" <> 0
           OR "creditCardReward" <> 0
         )`,
      [rows.map((row) => row.id), candidatePattern],
    )
    if (verify.rows[0].remaining !== 0) {
      throw new Error("Post-migration expense verification failed")
    }

    const tripVerify = await client.query(
      `SELECT COUNT(*)::int AS disabled
       FROM "Trip"
       WHERE id = ANY($1::text[])
         AND "expenseAdjustmentsEnabled" = false`,
      [[...affectedTrips]],
    )
    if (tripVerify.rows[0].disabled !== 0) {
      throw new Error("Post-migration trip verification failed")
    }

    await client.query("COMMIT")
    console.log(JSON.stringify({
      mode: "applied",
      count: rows.length,
      affectedTripCount: affectedTrips.size,
      totalServiceFee,
      netAmountChange: 0,
      backupPath,
      verification: "passed",
    }, null, 2))
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
    console.error(`expense_adjustment_note_migration=failed code=${code}`)
    process.exitCode = 1
  })
  .finally(() => client.end().catch(() => {}))
