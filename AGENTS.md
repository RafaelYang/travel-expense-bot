<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- codex-project-learnings:start -->
## Project learnings

- The app is a Next.js 16 + Prisma/PostgreSQL shared travel-expense tracker with Google/LINE authentication, trip invitations, exchange-rate conversion, image attachments, and a LINE Messaging API bot.
- Verified checks from the project root: `npm test` passes 9 security/money/image/realtime-version regression tests, `npx tsc --noEmit` passes, `npm run lint` succeeds with no errors (10 image/font performance warnings), and `npm run build` succeeds on Next.js 16.2.6. There is no `prisma/migrations` history yet.
- Treat expense and deposit authorization as a child-resource invariant: every read/update/delete must bind the child ID to its `tripId`, then verify the acting user is an eligible trip member. LINE postbacks must additionally bind the sending `lineUserId` to that same trip before mutating data.
- Reuse `src/lib/trip-access.ts` for expense/deposit mutations. Writable roles are `owner` and `member`; `viewer` is read-only. LINE expense mutations additionally require the sender to own the expense.
- Expense image delivery is intentionally sessionless for LINE servers but requires the expiring HMAC query parameters produced by `src/lib/expense-image-signing.ts`. Web DTOs replace stored image values with 24-hour signed references, so Base64 data no longer enters initial RSC/trip API payloads; PATCH resolves valid references back to stored values. Production should set `IMAGE_URL_SIGNING_SECRET`; the current fallback order is `AUTH_SECRET`, then `LINE_CHANNEL_SECRET`. Keep the response private/no-store and never restore unsigned ID-only URLs.
- `LineBotState.activeTripId` currently stores either `tripId` or `tripId:currency`; consumers must split the value before using it as a Prisma trip ID. Prefer separate typed columns when the schema is next migrated.
- Monetary values currently use `Float`. `src/lib/money.ts` deliberately excludes missing foreign conversions and foreign-currency deposits from base-currency totals; never silently substitute a 1:1 rate. A future schema migration should use exact decimal/minor-unit values and persist deposit conversions consistently.
- Expense images and custom cover images are still stored as Base64 in database fields. Expense images are now omitted from initial client payloads, but future storage work should move the underlying blobs and custom covers to authenticated object storage/thumbnails. LINE image ingestion lives in `src/lib/line-expense-image-service.ts`, enforces a 5 MB/type limit, and uses the previous JSON value as an optimistic concurrency guard.
- Exact-money migration is intentionally staged, not applied: `prisma/manual-migrations/20260714_money_decimal_expand.sql` adds/backfills shadow Decimal columns and has a paired rollback script. Because the live schema has no Prisma migration history, never move these files under `prisma/migrations` or run them automatically; follow the adjacent README and validate on staging before dual-write code is introduced.
- This project uses the Next.js 16 `proxy.ts` convention for optimistic cookie redirects. Keep authoritative authentication and authorization in route handlers/data-access code rather than relying on the proxy.
- Keep the homepage data path server-first: `src/app/page.tsx` authenticates and calls `src/lib/trip-dashboard.ts`, while `src/app/home-client.tsx` only owns interactions. Expense/deposit POST results are merged directly into `TripDetailClient` totals and lists instead of triggering a full-trip GET; the Navbar deduplicates LINE status reads with a 60-second client cache.
- Cross-device trip updates use `GET /api/trips/[tripId]/version`: while the page is visible, the client checks the member-authorized transaction fingerprint every 5 seconds and fetches the full trip only when it changes, with an immediate check on focus/visibility return. Keep `src/lib/trip-version.ts` ordering-independent and include expense `updatedAt` plus deposit value fields because deposits have no `updatedAt` column.
<!-- codex-project-learnings:end -->
