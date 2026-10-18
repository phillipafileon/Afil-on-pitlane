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

1. **Service catalogue / dynamic prices:** reconcile the *compiled* `GET /api/services` and `GET /api/config` payloads with `runtime_service_consolidation_patch.cjs`, `runtime_dynamic_pricing_patch.cjs`, `runtime_booking_pricing*.cjs`, and venue/travel patches. Do not expose legacy unpublished services.
2. **Booking window / UK local time:** next-day cutoffs and inspection slots from `runtime_booking_cutoffs_slots_patch.cjs` (E46 11:30 payment / 10:59 checkout start; track-day services 20:00 / 19:29; inspection slots 10:00–18:00 and same-day restrictions). Confirm final values after all patches and daylight-saving transitions.
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
- **Gate B:** compiled-runtime inventory and complete public services/config route parity; test expected JSON contracts and CORS.
- **Gate C:** D1 atomic hold mechanism plus full cutoff/closure/conflict tests with mocked Stripe (booking writes only on isolated staging and only after explicit test data plan).
- **Gate D:** admin login/auth, RBAC, audit; private workshop/manual booking capabilities; run security reviews before real users.
- **Gate E:** Stripe test-mode checkout/webhooks, security authorisation, refund and reconciliation. Idempotent D1 writes and webhook retries.
- **Gate F:** priority recovery, Printful, email, gift vouchers, discounts, cron jobs, Android app/Pitlane parity.
- **Gate G:** backup, staging parity tests, rollback plan, external service/route migration, controlled cutover. Keep Render/Neon running until all live actions verified.

**DO NOT** redirect `afileonmotorsport.co.uk` API clients, update Stripe live webhooks, connect customer Pitlane, or terminate Render/Neon during Gates A–F.
