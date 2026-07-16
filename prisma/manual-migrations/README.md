# Money migration staging

The live schema currently uses floating-point money fields and has no
`prisma/migrations` history. For that reason, these scripts are deliberately
manual and are not executed by `prisma migrate deploy`.

Recommended rollout:

1. Take a database backup and run `20260714_money_decimal_expand.sql` in a
   staging database.
2. Run the verification queries at the bottom of the script. Do not continue
   if any required exact value is missing.
3. Add the new columns to `schema.prisma`, regenerate Prisma Client, and deploy
   a dual-write release that keeps the current Float fields as the read source.
4. Compare Float and Decimal values in production telemetry, then switch reads
   to Decimal and serialize them explicitly as strings or numbers in DTOs.
5. Only after the observation window should a later contract migration remove
   the legacy Float columns.

`20260714_money_decimal_rollback.sql` is safe only before step 3 starts writing
the new columns. Never run either script automatically against production.

## Cash-wallet feature

`20260716_cash_wallet.sql` adds per-user foreign-cash wallets, immutable
buy/sell exchange records, and the `Expense.paymentMethod` field. Run it
manually on a backed-up staging database before deploying code that reads these
fields, then run the verification queries at the bottom of the file. The paired
rollback drops all cash-wallet and exchange data, so it is only safe before the
feature contains data that must be retained.

Use `node scripts/cash-wallet-migration.mjs` for a transactional dry run. After
the dry run reports a verified rollback, use
`node scripts/cash-wallet-migration.mjs --apply` to apply and verify the
expand-only schema change. The runner reads `DIRECT_URL` first and falls back to
`DATABASE_URL`; it never prints either value.

## Expense reconciliation

`20260716_expense_reconciliation.sql` is an expand-only change that adds the
nullable `Expense.settledAmount` and `Expense.reconciledAt` columns. The original
`convertedAmount` and `exchangeRate` remain the booking-time estimate; a final
foreign-card charge is used in totals only while the expense is reconciled.

Before deploying application code that reads these columns, back up the target
database and run `node scripts/expense-reconciliation-migration.mjs`. After the
transactional dry run reports a verified rollback, run
`node scripts/expense-reconciliation-migration.mjs --apply` and confirm the
post-migration verification passes. The runner reads `DIRECT_URL` first and
falls back to `DATABASE_URL` without printing either value.

The paired rollback drops both the final-charge amount and reconciliation
timestamps. It is destructive after users have started reconciling expenses and
must not be used once that data needs to be retained.
