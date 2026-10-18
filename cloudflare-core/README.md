# Afiléon Motorsport — Cloudflare Core migration (STAGING ONLY)

Prepared on 18 October 2026 from the existing Render and Neon configuration.

**D1 STAGING SCHEMA CREATED AND VERIFIED; STAGING WORKER DEPLOYED AND HEALTH CHECK VERIFIED. NOT A COMPLETED MIGRATION. NOT READY FOR BOOKINGS OR PAYMENTS.**
The live Render, Neon, Cloudflare Pages website, payment webhooks and Android apps have not been redirected.

## Verified source
- Existing Render Docker API: `afileon-api-migration-staging`.
- Existing Neon project: `Afileon Motorsport Migration Staging` (PostgreSQL 18).
- Existing code: `live-services/server_v3.js` plus many Docker build-time patches in `live-services/`.
- Neon public schema: 25 tables, 314 columns, 13 ordinary indexes plus primary/unique keys.
- D1 structural schema: `migrations/0001_neon_schema_draft.sql`; includes mapped unique constraints, FK and CHECK constraints. Credential-free GitHub Actions SQLite test on 18 October 2026 created all 25 tables and counted 314 columns. **Cloudflare owner confirmed on 18 October 2026 through D1 Console:** 12 staging-only schema batches all reported success; an independent read-only query to `sqlite_master` returned **25 application tables and 13 explicit indexes** in `afileon-core-staging`. Data parity, functional constraints and production query review remain outstanding.
- Previous Railway PostgreSQL volume has **not** been proved exported. A nearly empty Neon database does not mean there are no historical Railway-only operational records.

## Implemented in this branch
- A Workers/D1 scaffold with a fail-closed migration health endpoint `GET /__migration/health`.
- Initial **staging-only** read-only base routes: `GET /api/season` and `GET /api/shop/products`. Runtime patches may change those routes, so full behavioural parity has NOT been confirmed.
- All unported paths deliberately return HTTP 503 rather than silently calling Render or accepting Stripe/payment/admin writes.
- Source schema conversion into initial D1 SQL: `0001_neon_schema_draft.sql`. Staging D1 schema has been installed and independently counted (25 tables / 13 indexes); only structure was installed, not rows.
- Manual 12-part D1 Console SQL import under `d1-console-batches/`, verified against owner screenshots. No production D1 or website touched.
- **Staging Worker manually deployed and verified by owner 18 October 2026:** `dashboard-staging-worker.js` deployed in isolated `afileon-core-staging` Worker; live `/__migration/health` screenshot returned `{"ok":true,"service":"Afileon Core staging","database":"D1","tables":25,"indexes":13,"production_ready":false}`. This verifies D1 binding and schema visibility from the Worker only; it is NOT full API or client parity.
- **Shop read route manually verified by owner 18 October 2026:** staging `/api/shop/products` responded with `{"products":[]}`. This confirms the Worker can query the empty D1 `shop_products` table; it does not prove that the live storefront catalogue or Printful sync has migrated.
- **Season read route manually verified by owner 18 October 2026:** staging `/api/season` returned `{"season":null}`. It confirms read access to `seasonal_campaigns` while D1 remains empty.
- **Read-only calendar/closure port deployed and live-tested by owner on 18 October 2026:** staging `/api/availability` returned `{"months":6,"busy":[]}`; `/api/business-availability` returned `{"configured":false,"closed_now":false,"status":"open","start_date":null,"end_date":null,"reopens_on":null,"public_message":"","today":"2026-10-18"}`. These confirm D1-backed read-only routes respond with the expected empty-staging state. GitHub Actions run [39137133156](https://github.com/phillipafileon/Afil-on-pitlane/actions/runs/39137133156) passed the separate mock-data compatibility tests. Booking writes/checkout/admin/Stripe remain unported and intentionally disabled.
- **Data decision (owner, 18 October 2026):** the former Railway system contained no customer bookings or important records to preserve. Neon staging remains nearly empty; its business closure row exists but start/end are NULL. This does not constitute a complete live-system data audit.
- **Compiled service contract (prepared, not deployed):** CI successfully applied every `live-services/Dockerfile` patch and extracted the final four-service catalogue and final Europe/London booking cutoffs in [run 39139635018](https://github.com/phillipafileon/Afil-on-pitlane/actions/runs/39139635018). Source `compiled-public-service-snapshot.json`. `dashboard-staging-worker.js` now has a staging-only read-only `GET /api/services` endpoint and D1 service/travel pricing override support; its live deployment is still the earlier version until the owner manually pastes the new script.
- **Automated tests (prepared code only):** [run 39140227349](https://github.com/phillipafileon/Afil-on-pitlane/actions/runs/39140227349) passed **15 Node.js tests and 6 SQLite tests**. The booking rules and atomic-hold SQL are isolated prototypes, **not deployed, not approved for payments, and not tested under real D1 concurrency**. See `booking-policy-prototype.mjs`, `prototypes/atomic-booking-hold.sql` and `BOOKING_PORT_GATES.md`.
- **Season read route manually verified by owner 18 October 2026:** staging `/api/season` responded with `{"season":null}`. This confirms successful query execution but is not proof of parity with runtime-patched season/catalogue behaviour.
- **Next implementation checklist:** `NEXT_PORTING_STEPS.md` documents source/route audit, operational data preservation, and the order for booking, admin, Stripe and application migration.
- Optional offline source-data export under `.private/`, which is Git-ignored and intentionally excludes live admin sessions, login challenges, login attempts and email verification records.

## Not yet ported
- The full production parity of service catalogue and pricing (a staging read-only version is prepared but not yet deployed), travel-estimate calculations, booking holds and appointment conflicts, quote requests, booking write and checkout flow.
- Admin authentication, audit and admin scheduling, workshop records and signed inspection data; owner-only app sync.
- Priority recovery and vehicle hire security pre-authorisations, captures/refunds and liability rules.
- Stripe event signature verification, webhook event idempotency, retry logic, refunds, and Printful fulfilment and catalogue cache.
- Email verification, transactional email, scheduled balance reminders and pending deposit/checkout expiry flows.
- Full route inventory and **production frontend/mobile client behaviour** tests.
- Full Worker API implementation and functional testing, secrets, domain binding and live DNS/webhook cutover. The initial staging-only Worker code is deployed, but has only its health check and initial read-only endpoints. Cloudflare D1 database creation/binding and its schema installation are complete.

## Why this is a port rather than copying the server

The Render image runs a conventional Express/Node server under Docker. It builds a modified `server_v3.js` by running many patch scripts and then writes a runtime module at boot. It uses `pg` and PostgreSQL features such as `$1` parameters, `::jsonb`, `FOR UPDATE`, `RETURNING` and PostgreSQL date math. D1 is SQLite, so queries, transactional lock behaviour, booleans, date comparisons and JSON fields require deliberate conversion.

Cloudflare supports Express on Workers with compatibility features, but that does **not** make existing `pg` queries or Docker-based patch/bootstrap procedures operate unchanged.

## Staged deployment steps (once Cloudflare is authorised)
1. **Completed manually (owner):** create the standalone staging Worker and D1 database `afileon-core-staging`; bind D1 as `DB`. GitHub `wrangler.jsonc` now contains the observed non-secret D1 database ID and staging Worker name; check against Cloudflare dashboard before deploying. The production Afiléon website remains separate.
2. **COMPLETED for schema creation:** GitHub SQL validation succeeded, and the owner manually imported 12 smaller SQL batches through Cloudflare D1 Console after Wrangler authentication failed. Final Console SELECT independently returned 25 application tables and 13 explicit indexes. File copies: `d1-console-batches/`; still test runtime constraints and default timestamps.
3. Export the current Neon data *privately*. Never commit SQL containing customer information, credentials, cookies, hashes, email verification codes, or payment details. `tools/export-neon-to-d1.mjs` can prepare a private export from a trusted machine with `DATABASE_URL` set, and must be audited and run only after taking proper backups and establishing an empty destination.
4. Port and test API routes **against final compiled Render behaviour**, not merely the base `server_v3.js`, using Stripe test mode and no live Printful fulfilment.
5. Verify row counts, customer and operational settings, cookie/CORS policies, booking concurrency, Stripe webhook deduplication, and end-to-end Pitlane and owner-only Inspection App flows.
6. Only after a backup, a controlled write freeze and parity checks, deploy the finished Worker and switch Cloudflare Pages frontend URL, app API origins and relevant webhook URLs. Maintain rollback access and do not cancel Render/Neon immediately.

## App permissions
Customers get **Pitlane only**, with its limited assistant. The inspection/workshop app is for the owner alone. Never expose Master SPARK identity, tokens or private records to customer app clients.

## Cost and limits
Cloudflare Workers and D1 have free tiers, but these are quota-limited (including Workers CPU time, requests, and D1 rows). Confirm full booking/webhook functionality fits the current account plan; free does not mean unlimited capacity. Stripe, Printful and external transactional email remain external service integrations.

## Security
No Cloudflare, Render, Neon, Stripe, Printful or SMTP credentials are stored in this migration branch. No live webhook endpoints or domain routes have been changed. Never add a secret owner 'backdoor'; use explicit authenticated and audited roles for privileged operations.
