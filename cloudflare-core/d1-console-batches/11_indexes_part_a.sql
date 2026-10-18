-- Afileon Core staging D1 Console - batch 11 of 12
-- Destination: Cloudflare D1 database afileon-core-staging ONLY.
-- No production changes. Schema only; no customer or secret data.
-- Creates: admin_login_attempts_recent_idx, admin_sessions_active_idx, booking_endofday_receipts_sent_idx, booking_record_entries_booking_idx, bookings_date_idx, bookings_status_idx, damage_security_events_booking_idx

CREATE INDEX IF NOT EXISTS "admin_login_attempts_recent_idx" ON "admin_login_attempts" (attempted_at DESC);

CREATE INDEX IF NOT EXISTS "admin_sessions_active_idx" ON "admin_sessions" (expires_at, revoked_at);

CREATE INDEX IF NOT EXISTS "booking_endofday_receipts_sent_idx" ON "booking_endofday_receipts" (sent_at DESC);

CREATE INDEX IF NOT EXISTS "booking_record_entries_booking_idx" ON "booking_record_entries" (booking_id, section, occurred_at, id);

CREATE INDEX IF NOT EXISTS "bookings_date_idx" ON "bookings" (booking_date);

CREATE INDEX IF NOT EXISTS "bookings_status_idx" ON "bookings" (status);

CREATE INDEX IF NOT EXISTS "damage_security_events_booking_idx" ON "damage_security_events" (booking_id, created_at);
