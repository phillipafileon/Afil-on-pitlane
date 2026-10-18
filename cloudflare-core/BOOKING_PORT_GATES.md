# Afiléon Core — booking and administration port gates

**Status: developer checklist only. No live cutover or booking writes authorised.**
Reference: `live-services/server_v3.js` is modified by the scripts in `live-services/Dockerfile` at build time. **The final compiled runtime is the source of truth**, not the unpatched base file. Audit any new rules before declaring parity.

## Already independently verified in staging (owner screenshots, 2026-10-18)
- Cloudflare staging Worker `/__migration/health` returned `ok: true`, `tables: 25`, `indexes: 13`, `production_ready: false`.
- `GET /api/shop/products` → `{"products":[]}`, `GET /api/season` → `{"season":null}`.
- `GET /api/availability` → `{"months":6,"busy":[]}`.
- `GET /api/business-availability` → `configured: false`, `closed_now: false`, `status: open`.
- The latter two endpoints have mock-data automated tests in `tests/read-only-calendar.test.mjs`.
- **Not proven**: handling real booking conflicts, daylight-saving cutoff edge cases, Stripe events, admin login, production integrations or customer app parity.

## Source rules that MUST be preserved before enabling bookings

1. **Service catalogue / dynamic prices:** the compiled final code has four services, recorded in `compiled-public-service-snapshot.json` and explained in `PUBLIC_SERVICE_CATALOGUE_PARITY.md`; `GET /api/services` with D1 pricing overrides is prepared and unit-tested but not manually deployed yet. `GET /api/config` remains unported pending correct terms, live launch flags and payment/security checks. Do not expose removed legacy services.
2. **Booking window / UK local time:** validated against the full compiled Docker patch chain (not intermediate scripts): E46 **11:30/11:30**, pre-track inspection **22:00/22:00**, and other track-day services **20:00/20:00** (payment / checkout start, Europe/London). Inspection slots are 10:00, 12:00, 14:00, 16:00 and 18:00. Pure date policy prototype and UK daylight-saving unit tests pass, but live payment-timing parity remains unverified.
3. **Closure / service blocks / no double-booking:** honor `business_availability_settings`, date-scoped `availability_blocks`, service group conflicts, manual bookings, active holds, paid balances and checkout-time recheck. Reads are advisory only. Implement an **atomic** reservation mechanism in D1; PostgreSQL advisory locks and `SELECT FOR UPDATE` do not exist in D1.
4. **Booking deposit policies:** final E46 payment-choice patch allows full payment or £250 deposit with 9-day notice / 3-day balance due under applicable booking rules; the patch also contains a near-date full-payment requirement. Verify behavior against the built runtime. Don't regress to the older 10/7 or 7/7 terms.
5. **Vehicle hire damage security:** £2,500 authorisation, optional capture, release/expiration, notifications and signed webhook handling; do not reduce security to normal checkout.
6. **Stripe payment integrity:** secret signature verification on the raw webhook body, replay/idempotency protection, paid/expired/cancelled state transitions, tax and receipts, refund and recovery checks, retry paths. Test with Stripe test mode; **never send real customers to an incomplete Worker**.
7. **Public vs private data:** customer-facing `GET /api/bookings/:id` must not leak PII via guessable identifiers; admin routes require robust passwords/session verification, audit logging and least privilege. Master SPARK and workshop data are owner-only; customers see Pitlane only.
8. **Manual administration:** source `runtime_manual_offline_booking_patch.cjs`, `runtime_admin_ops_patch.cjs` and related patches. Preserve date-stamped work records, inspection history, manual booked dates, calendars and private staff operations.
9. **Secondary external systems:** Printful product catalogue, shop checkout, SMTP2GO transactional mail, balance reminders, priority vehicle recovery and Stripe refunds all need individual parity checks.
10. **Data migration:** owner confirms no historical Railway customer bookings or important records; Neon staging has zero bookings/orders/products but contains several operational rows. Verify whether operational settings need to be seeded before changing traffic. Do not upload customer, token, session, payment or verification data to public GitHub.

## Safe development order

- **Gate A (current):** read-only health, season, products, availability, closure. Passed basic live staging smoke tests.
- **Gate B (in progress):** compiled-runtime inventory and the staging `GET /api/services` port are prepared and tested; live stage smoke-test and `GET /api/config` parity remain outstanding.
- **Gate C (prototype only):** `booking-policy-prototype.mjs` is isolated and its UK cutoff/DST/closure/block tests pass. `prototypes/atomic-booking-hold.sql` demonstrates SQLite single-statement reservation conditions and one winner under 10 simultaneous local connections; it is NOT deployed nor D1-validated. Still need complete field validation, real D1 concurrency verification, Stripe mocking, checkout recheck and legally valid terms before enabling writes.
- **Gate D:** admin login/auth, RBAC, audit; private workshop/manual booking capabilities; run security reviews before real users.
- **Gate E:** Stripe test-mode checkout/webhooks, security authorisation, refund and reconciliation. Idempotent D1 writes and webhook retries.
- **Gate F:** priority recovery, Printful, email, gift vouchers, discounts, cron jobs, Android app/Pitlane parity.
- **Gate G:** backup, staging parity tests, rollback plan, external service/route migration, controlled cutover. Keep Render/Neon running until all live actions verified.

**DO NOT** redirect `afileonmotorsport.co.uk` API clients, update Stripe live webhooks, connect customer Pitlane, or terminate Render/Neon during Gates A–F.

### Stripe raw-body signature verification — prepared, not activated

The pure Worker-compatible helper `stripe-signature.mjs` verifies the **raw bytes** of an incoming Stripe webhook using HMAC-SHA256, the `Stripe-Signature` header, and a strict five-minute tolerance. It rejects missing/wrong signing secrets, modified payloads and stale/future timestamps and supports valid `v1` signatures during secret rotation. It is **not imported by `dashboard-staging-worker.js`** and handles **no payment events**.

Before enabling live or staging Stripe traffic, we still require Stripe test-mode secrets injected using Cloudflare encrypted secrets, a D1 event-deduplication table and atomic transition logic, verified cancellation/expiry/refunds, and proper customer-access restrictions. A valid signature alone does **not** prevent replay of the same authentic event within the tolerance window; idempotency is mandatory. Test against Stripe's actual test webhook events and retried deliveries before connecting Stripe. Never paste webhook secrets into GitHub or chat.

## Development update (18 October 2026, no user action required)

- `booking/hold-contract.mjs` and `booking/atomic-booking-hold-full.sql` now produce production-shaped staging holds and a single conditional D1 SQL insert. £250 deposits, T−9 notice, T−3 due, E46 damage security, UK cutoffs, checkout lead times and private-contact validation have unit tests. The Worker DOES NOT import these files or enable writes. Terms-document record and real Kent postcode/travel verification still require integration and end-to-end parity validation.
- `webhooks/event-inbox.mjs`, claim/complete SQL, and `migrations/0002_webhook_inbox_staging.sql` provide an **undeployed** signed-event replay/idempotency foundation, with leased claims, retry and stale-completion checks. Signature verifier is prepared separately. **D1 batch payment mutation plus event completion is not yet wired** and real Stripe test-mode events must be tested before usage. Official Cloudflare D1 docs confirm `batch()` is transactional and numbered `?NNN` parameters are supported.
- [Latest successful Actions tests](https://github.com/phillipafileon/Afil-on-pitlane/actions/runs/39145982822): 39 Node tests and 14 SQLite tests, all green. Local concurrency checks do NOT prove actual remote D1 behavior.
- **Critical deployment sequencing:** migration 0002 adds 1 table and 1 explicit index; running the existing schema-count health check would otherwise report unhealthy. Do not apply migration 0002 to the current staging DB until the Worker health contract and staging rollout bundle are updated to 26/14, and a rollback plan is in place. Do not run this migration on production.
- **Remaining blockers:** real D1 concurrency validation, expiry/reconciliation, idempotent Stripe booking + webhook state mutations, secure admin auth, full service/config parity and customer-facing contract tests; no cutover allowed yet.

## Wrangler local integration result (19 October 2026)

- [GitHub Actions local Worker/D1 smoke](https://github.com/phillipafileon/Afil-on-pitlane/actions/runs/39175823580) **passed** without Cloudflare API credentials or remote deployment.
- GitHub runner installed an actual, published `@cloudflare/workers-types@5.20261018.1` matching Wrangler 4.151.1. Earlier package had an unavailable `^4.20261001.0` and could not install; the manifest is now corrected.
- Wrangler imported `migrations/0001_neon_schema_draft.sql` into a **local-only** D1 store: 25 application tables, 13 explicit indexes. The staged Worker correctly returned health, shop, season, availability, business availability, and the four compiled services. Booking/admin write routes stayed HTTP 503.
- Wrangler then locally applied `migrations/0002_webhook_inbox_staging.sql` (only 2 statements) and the same Worker passed with **26 tables/14 explicit indexes**. The remote staging database was **not** migrated by this test.
- [Payment SQL/event tests](https://github.com/phillipafileon/Afil-on-pitlane/actions/runs/39175572480) passed 44 Node.js tests + 19 SQLite tests, including replay suppression, exact Stripe Checkout session matching, double-payment guard, booking expiry, closures, and rollback. These are isolated SQL tests and do NOT constitute a complete signed Stripe webhook handler.
- `webhooks/apply-verified-booking-payment.sql` and `complete-verified-booking-payment.sql` must be executed as a **single D1 batch** only following signature verification and an event-inbox claim, and only after required policy checks. If the booking update/ack returns zero rows, do NOT acknowledge payment without manual reconciliation/refund handling. These scripts are not deployed.
- **No user task currently:** Leave remote staging at the last verified schema and deployed Worker. Do NOT ask owner to apply 0002 or publish booking/Stripe processing until the integrated Worker, protected configuration, reconciliation and realistic end-to-end Stripe test cases are complete. Live Render/Neon/Pages/app routing remains unchanged.

### Wrangler local concurrent booking stress (19 October 2026)

- [CI run 39176051066](https://github.com/phillipafileon/Afil-on-pitlane/actions/runs/39176051066) **passed** a local isolated Cloudflare Wrangler Worker connected to D1, using the **exact** `booking/atomic-booking-hold-full.sql` text loaded into the CI-only harness by `tools/generate-local-hold-sql.mjs`.
- **Ten concurrent requests for the same service date:** exactly 1 successful hold, 9 rejected, with exactly one booking row present.
- A global block prevented a hold; a vehicle-hire-only block did not prevent an unrelated support-service hold; a second support booking on the occupied date was rejected.
- The same run reverified GET APIs at the baseline **25/13** and expanded local schema **26/14**; the Node and SQLite test workflows and the schema check also passed on the branch.
- The harness `tests/harness-booking-worker.mjs` has no real payment/customer integration, uses reserved `.invalid` test email addresses, and is gated by a local CI-only configuration variable. It is **NOT** a customer endpoint and MUST NEVER be deployed.
- This improves confidence in Cloudflare's **local** D1 execution. It does **not** prove remote D1 timing/concurrency, real customer validation, Stripe capture, discount/voucher flows, cancellation/refund reconciliation, owner-only admin access or production readiness.
- No change has been made to the live Cloudflare Pages site, Render/Neon or the manually deployed staging Worker. Manual owner action is **not required yet**.

### Integrated signed webhook and owner-access tests (19 October 2026)

- [Wrangler real local D1 integration run](https://github.com/phillipafileon/Afil-on-pitlane/actions/runs/39176850157) **passed** the original Worker public-read endpoints at 25/13 and 26/14 schemas, 10 simultaneous atomic booking-hold requests, and the CI-only `tests/harness-stripe-worker.mjs` signed-payment processing flow.
- The payment harness calls the actual `stripe-signature.mjs`, `event-inbox.mjs`, `booking-payment-completed.mjs`, and D1 SQL files `claim-stripe-event.sql`, `apply-verified-booking-payment.sql` and `complete-verified-booking-payment.sql` after embedding the SQL into the isolated local Worker.
- Verified: unsigned/forged or tampered payloads rejected **before any inbox row is created**; valid test-signed completed session writes paid booking state; same event retry and separate same-session event do not double-count; mismatched amount remains unacknowledged for reconciliation; ten concurrent identical notifications cannot duplicate a booking payment.
- Same run then loaded `tests/harness-admin-worker.mjs`: a SHA-256-hashed owner session allowed its test-only private endpoint, while missing shared-token fallback, unrelated staff identity, expired session, hostile web origin, and a revoked session were all rejected. This validates the staging `admin/owner-session.mjs` guard against Wrangler's local D1 engine.
- [Separate Node and SQLite checks](https://github.com/phillipafileon/Afil-on-pitlane/actions/runs/39176850166) also **passed** (49 Node tests and 19 local SQLite tests).
- Critical limits: these harnesses are **CI-only and must NEVER be deployed**. The real staging Worker still rejects writes/admin/payment traffic. No actual Stripe test-mode or live-mode checkout exists in the migrated Worker. Admin login/password verification, session issuance, roles, audit and signed workshop records remain unported. The test signing key is a public fixture and must NEVER be used for real payment endpoints.
- Future staging release still needs live Cloudflare D1 concurrency probes without customer data, verified payment reconciliation/refund flow, real Stripe test-mode webhook retry signatures, data backup, secure configuration and cutover approval.
