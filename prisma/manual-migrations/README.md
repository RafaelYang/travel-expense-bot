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
