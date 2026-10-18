# Afiléon Core — next porting stages (STAGING ONLY)

Updated 18 October 2026 after owner-verified D1 and Worker tests.

## Verified milestones
- D1 staging database `afileon-core-staging`: **25 application tables and 13 explicit indexes** verified via independent D1 Console SELECT.
- Deployed staging Worker `afileon-core-staging`: GET `/__migration/health` reported `ok: true`, correct D1 counts and `production_ready: false`.
- Staging GET `/api/shop/products` returned `{"products":[]}`; D1 query works but this is NOT proof Printful product parity.
- Staging GET `/api/season` returned `{"season":null}`; D1 query works but this is NOT proof of parity with runtime-patched season logic.
- All unsupported endpoints deliberately return HTTP 503. Existing live Cloudflare Pages frontend, Android apps, Render API, Neon and Stripe endpoints remain unchanged.

## Reality check: source data
A non-mutating `pg_stat_user_tables` query on Neon migration staging on 18 October 2026 returned approximate row counts: bookings ~0, orders ~0, quote_requests ~0, shop_products ~0, business_availability_settings ~1, priority_recovery_settings ~1, shop_catalog_snapshots ~1, email_verifications ~1. These are approximate statistics and **not** proof about live source or historical Railway data. Do not import credentials, stale login challenges or verification tokens. Confirm the authoritative live data source and take an independently tested backup before transferring settings or switching traffic.

## Critical implementation constraint
The production Render Dockerfile runs `server_v3.js` through **numerous sequential runtime_*.cjs transformation scripts**, while `boot_v311.js` adds routes at startup. The initial D1 GET handlers follow only base SQL and may omit important runtime overrides. Reconstruct the **final compiled Render behaviour** (or compile a test build in controlled CI) before claiming compatibility. Do not expose a simplified approximation as a public booking or admin route.

## Safe work order

1. **Inventory & compile current runtime routes**: identify GET/POST paths, required headers, body schemas, auth and response contracts after all Docker patches and boot scripts. Record at least routes for `/api/config`, `/api/services`, `/api/availability`, `/api/business-availability`, travel pricing, quote and recovery calculations. Gather representative read-only responses from the current staging API without sensitive customer details.
2. **Port public read-only availability/services** to D1 on the isolated Worker, including close-bookings flags, manual date blocks, service-specific cutoffs, E46 rental conflicts, pricing/travel overrides and timeslot rules. Unit test dates/timezones and parity against Render; no checkout routes yet.
3. **Port owner-only admin authentication** with hashed credentials, challenge TTL, proper session/token handling, brute-force protection, logout/revocation, audit logs and strict role checks. Add safe admin read endpoints and vehicle/workshop records only *after* the auth tests pass. Never expose Master SPARK or owner-only app records to Pitlane customers.
4. **Port quote & booking writes** with input validation, idempotency, concurrency protection, cancellation/expiration, licence checks, deposits and discount/gift voucher accounting. D1/SQLite transaction semantics differ from PostgreSQL `FOR UPDATE` locking; do not translate SQL mechanically.
5. **Stripe test-only integration**: server-side Checkout creation, webhook raw-body signature verification, idempotent/replay-safe handling, E46 security pre-authorisation/manual capture with strict limits, refunds, vouchers, balances and reminders. Use fresh secrets via Cloudflare encrypted secrets; never put keys in source or screenshots. No live money flow while unverified.
6. **Printful and email workflows**: catalogue cache, images, shipping/refunds, SMTP2GO transactional messages, retries and background jobs. Then Pitlane/customer app and owner-only inspection/booking manager integration.
7. **Data preservation and parity**: confirm old Railway vs Neon source, transfer approved operational rows privately without admin sessions or verification tokens, reconcile counts, payments and asset references; back up again and run end-to-end tests before any changes to production routing.
8. **Controlled cutover only after explicit owner approval** with confirmed rollback, restored backup, route coverage, error monitoring and no customer-affecting downtime. Keep Render/Neon services available until stable.

## Source evidence inspected
- `live-services/Dockerfile` build-time patch order.
- `live-services/server_v3.js` routes and service definitions.
- `live-services/boot_v311.js`.
- Runtime patch source route markers for admin ops, password login, availability enforcement and master availability, booking/pricing/cutoffs, offline bookings, priority recovery, damage security, dynamic pricing, and Printful catalogue.
- Neon staging `pg_stat_user_tables` approximate row counts.

This is a staged migration implementation checklist, not an assertion of production readiness.
