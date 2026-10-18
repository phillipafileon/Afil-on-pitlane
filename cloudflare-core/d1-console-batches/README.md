# Afiléon Core — Cloudflare D1 Console batches (STAGING ONLY)

These are the original 25-table / 13-index D1 schema statements split into **12 smaller batches**, preserving their order exactly. They are derived from `cloudflare-core/migrations/0001_neon_schema_draft.sql`, with no changes to SQL logic. They contain no customer records, credentials, or web-service cutover instructions.

**IMPORTANT: Run ONLY against the separate Cloudflare D1 database `afileon-core-staging`; never against live databases. This does not deploy the Worker, replace Render/Neon, import customer rows, or reconnect the website.**

## On a phone

1. Open Cloudflare Dashboard → D1 SQL databases → **afileon-core-staging** → **Console**.
2. Open batch 01 in GitHub, choose **Raw** or **Copy raw file**, and copy all SQL from the file.
3. Paste the SQL into the D1 Console and press **Execute**. Check that no error is shown.
4. Run this read-only check separately: `SELECT name FROM sqlite_master WHERE type='table' AND name='admin_audit_log';`. It should return **admin_audit_log** after batch 01.
5. Continue in numerical order only after each prior batch succeeds. Paste **one batch at a time**; do not include multiple batches in one paste.
6. At the end verify with: `SELECT count(*) AS tables_created FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';` (expected **25**). Check indexes with: `SELECT count(*) AS indexes_created FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';` (expected **13**, excluding SQLite's automatic constraint indexes).

**If one batch errors:** stop and report the exact error. Do not skip ahead. Since the SQL uses `IF NOT EXISTS`, replaying a successfully completed batch is intended to be idempotent; however a partially executed batch may still have created some objects before failing. Confirm actual objects before proceeding.

## File list

1. [01_admin_audit_log.sql](01_admin_audit_log.sql) — admin_audit_log (466 characters)
2. [02_admin_access.sql](02_admin_access.sql) — admin_login_attempts, admin_login_challenges, admin_sessions (1235 characters)
3. [03_availability_booking_records.sql](03_availability_booking_records.sql) — availability_blocks, booking_endofday_receipts, booking_record_entries (1515 characters)
4. [04_bookings.sql](04_bookings.sql) — bookings (2802 characters)
5. [05_business_discounts.sql](05_business_discounts.sql) — business_availability_settings, damage_security_events, discount_codes, discount_redemptions (2101 characters)
6. [06_verification_vouchers.sql](06_verification_vouchers.sql) — email_verifications, gift_vouchers (1354 characters)
7. [07_orders_recovery.sql](07_orders_recovery.sql) — orders, priority_recoveries (1979 characters)
8. [08_priority_quotes_campaigns.sql](08_priority_quotes_campaigns.sql) — priority_recovery_settings, quote_requests, seasonal_campaigns (1721 characters)
9. [09_pricing_and_shop.sql](09_pricing_and_shop.sql) — service_price_overrides, shop_catalog_snapshots, shop_products, travel_price_overrides (1608 characters)
10. [10_workshop.sql](10_workshop.sql) — vehicle_inspections, vehicle_maintenance (1191 characters)
11. [11_indexes_part_a.sql](11_indexes_part_a.sql) — admin_login_attempts_recent_idx, admin_sessions_active_idx, booking_endofday_receipts_sent_idx, booking_record_entries_booking_idx, bookings_date_idx, bookings_status_idx, damage_security_events_booking_idx (1131 characters)
12. [12_indexes_part_b.sql](12_indexes_part_b.sql) — discount_redemptions_code_status_idx, email_verifications_email_idx, gift_vouchers_code_idx, gift_vouchers_status_idx, priority_recoveries_created_idx, priority_recoveries_status_idx (987 characters)

Source SQL and local 25-table structural validation were previously checked on the staging migration branch. D1 console execution of all batches is not yet confirmed.
