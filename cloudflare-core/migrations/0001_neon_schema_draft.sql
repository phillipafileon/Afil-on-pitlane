-- Afiléon Motorsport / Cloudflare D1 schema draft
-- Extracted from Neon public schema on 2026-10-18.
-- Structural port only. NO customer/credential/token data are included.
-- NOT DEPLOYED. Requires parity tests, D1 import checks, and API port before live cutover.
-- PostgreSQL timestamps become UTC ISO-8601 text; booleans become 0/1; jsonb becomes JSON text.
-- Financial arithmetic and timestamp comparisons must be audited during endpoint migration.

CREATE TABLE IF NOT EXISTS "admin_audit_log" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "username" TEXT,
  "action" TEXT NOT NULL,
  "detail" TEXT NOT NULL DEFAULT '{}',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "admin_login_attempts" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "username" TEXT,
  "ip" TEXT,
  "success" INTEGER NOT NULL DEFAULT 0,
  "attempted_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "admin_login_challenges" (
  "public_id" TEXT NOT NULL PRIMARY KEY,
  "username" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "remember_device" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TEXT NOT NULL,
  "used_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "admin_sessions" (
  "token_hash" TEXT NOT NULL PRIMARY KEY,
  "username" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "expires_at" TEXT NOT NULL,
  "last_seen_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "revoked_at" TEXT,
  "ip" TEXT,
  "user_agent" TEXT
);

CREATE TABLE IF NOT EXISTS "availability_blocks" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "block_date" TEXT NOT NULL,
  "service_id" TEXT,
  "label" TEXT NOT NULL,
  "colour" TEXT NOT NULL DEFAULT '#64748b',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "booking_endofday_receipts" (
  "booking_id" TEXT NOT NULL PRIMARY KEY,
  "receipt_version" TEXT NOT NULL,
  "snapshot" TEXT NOT NULL DEFAULT '{}',
  "generated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "generated_by" TEXT,
  "sent_at" TEXT,
  "sent_to" TEXT,
  "sent_by" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "booking_record_entries" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "booking_id" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "entry_type" TEXT,
  "title" TEXT,
  "status" TEXT,
  "notes" TEXT,
  "reference_url" TEXT,
  "occurred_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "payload" TEXT NOT NULL DEFAULT '{}',
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "bookings" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "public_id" TEXT NOT NULL,
  "service_id" TEXT NOT NULL,
  "variant_id" TEXT,
  "booking_date" TEXT NOT NULL,
  "customer_name" TEXT,
  "customer_email" TEXT,
  "customer_phone" TEXT,
  "service_address" TEXT,
  "postcode" TEXT,
  "vehicle_details" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'hold',
  "hold_expires_at" TEXT,
  "stripe_checkout_session_id" TEXT,
  "stripe_payment_intent_id" TEXT,
  "stripe_customer_id" TEXT,
  "stripe_balance_invoice_id" TEXT,
  "amount_total" INTEGER,
  "amount_paid" INTEGER DEFAULT 0,
  "booking_payment_amount" INTEGER,
  "balance_amount" INTEGER DEFAULT 0,
  "balance_notice_at" TEXT,
  "balance_due_at" TEXT,
  "balance_status" TEXT,
  "licence_required" INTEGER NOT NULL DEFAULT 0,
  "licence_status" TEXT,
  "safe_work_area_confirmed" INTEGER NOT NULL DEFAULT 0,
  "terms_version" TEXT,
  "terms_accepted_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "appointment_time" TEXT,
  "terms_customer_name" TEXT,
  "terms_documents" TEXT NOT NULL DEFAULT '[]',
  "damage_security_amount" INTEGER,
  "damage_security_status" TEXT NOT NULL DEFAULT 'not_authorised',
  "damage_security_required_amount" INTEGER,
  "damage_security_authorised_amount" INTEGER NOT NULL DEFAULT 0,
  "damage_security_capturable_amount" INTEGER NOT NULL DEFAULT 0,
  "stripe_damage_security_checkout_session_id" TEXT,
  "stripe_damage_security_payment_intent_id" TEXT,
  "damage_security_authorised_at" TEXT,
  "damage_security_capture_before" TEXT,
  "damage_security_captured_amount" INTEGER NOT NULL DEFAULT 0,
  "damage_security_captured_at" TEXT,
  "damage_security_capture_reason" TEXT,
  "damage_security_capture_notes" TEXT,
  "damage_security_release_requested_at" TEXT,
  "damage_security_released_at" TEXT,
  "damage_security_expired_at" TEXT,
  "damage_security_failure_reason" TEXT,
  "damage_security_attempt" INTEGER NOT NULL DEFAULT 0,
  "damage_security_customer_notified_at" TEXT,
  "damage_security_updated_at" TEXT,
  "gift_voucher_id" INTEGER,
  "gift_voucher_amount" INTEGER NOT NULL DEFAULT 0,
  "confirmation_email_sent_at" TEXT,
  "balance_confirmation_email_sent_at" TEXT,
  "admin_confirmation_email_sent_at" TEXT,
  "admin_balance_confirmation_email_sent_at" TEXT,
  "discount_code_id" INTEGER,
  "discount_amount" INTEGER NOT NULL DEFAULT 0,
  "original_amount_total" INTEGER,
  "abandoned_email_sent_at" TEXT,
  UNIQUE ("public_id")
);

CREATE TABLE IF NOT EXISTS "business_availability_settings" (
  "id" INTEGER NOT NULL PRIMARY KEY,
  "start_date" TEXT,
  "end_date" TEXT,
  "public_message" TEXT,
  "internal_note" TEXT,
  "updated_by" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((id = 1))
);

CREATE TABLE IF NOT EXISTS "damage_security_events" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "booking_id" TEXT NOT NULL,
  "stripe_payment_intent_id" TEXT,
  "event_type" TEXT NOT NULL,
  "previous_status" TEXT,
  "new_status" TEXT,
  "amount" INTEGER,
  "detail" TEXT NOT NULL DEFAULT '{}',
  "actor" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "discount_codes" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "code" TEXT NOT NULL,
  "discount_type" TEXT NOT NULL,
  "discount_value" INTEGER NOT NULL,
  "max_uses" INTEGER,
  "uses_used" INTEGER NOT NULL DEFAULT 0,
  "starts_at" TEXT,
  "expires_at" TEXT,
  "active" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "scope" TEXT NOT NULL DEFAULT '{"products": ["*"], "services": ["*"]}',
  UNIQUE ("code")
);

CREATE TABLE IF NOT EXISTS "discount_redemptions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "discount_code_id" INTEGER NOT NULL,
  "context_type" TEXT NOT NULL,
  "context_id" TEXT NOT NULL,
  "discount_amount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'reserved',
  "stripe_session_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "used_at" TEXT,
  "released_at" TEXT,
  UNIQUE ("context_type", "context_id"),
  FOREIGN KEY (discount_code_id) REFERENCES "discount_codes"(id)
);

CREATE TABLE IF NOT EXISTS "email_verifications" (
  "public_id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TEXT NOT NULL,
  "verified_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "gift_vouchers" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "public_id" TEXT NOT NULL,
  "code" TEXT,
  "amount_original" INTEGER NOT NULL,
  "balance_remaining" INTEGER NOT NULL DEFAULT 0,
  "purchaser_name" TEXT,
  "purchaser_email" TEXT NOT NULL,
  "recipient_name" TEXT,
  "recipient_email" TEXT,
  "message" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "stripe_checkout_session_id" TEXT,
  "stripe_payment_intent_id" TEXT,
  "purchased_at" TEXT,
  "expires_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "purchaser_email_sent_at" TEXT,
  "recipient_email_sent_at" TEXT,
  UNIQUE ("code"),
  UNIQUE ("public_id")
);

CREATE TABLE IF NOT EXISTS "orders" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "public_id" TEXT NOT NULL,
  "customer_email" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "total" INTEGER,
  "stripe_checkout_session_id" TEXT,
  "stripe_payment_intent_id" TEXT,
  "items" TEXT NOT NULL DEFAULT '[]',
  "stock_reserved" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "provider" TEXT,
  "printful_order_id" TEXT,
  "fulfilment_status" TEXT,
  "tracking_number" TEXT,
  "tracking_url" TEXT,
  "fulfilment_error" TEXT,
  "amount_refunded" INTEGER NOT NULL DEFAULT 0,
  "refunded_at" TEXT,
  "confirmation_email_sent_at" TEXT,
  "discount_code_id" INTEGER,
  "discount_amount" INTEGER NOT NULL DEFAULT 0,
  "original_total" INTEGER,
  UNIQUE ("public_id")
);

CREATE TABLE IF NOT EXISTS "priority_recoveries" (
  "public_id" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'checkout_pending',
  "customer_name" TEXT NOT NULL,
  "customer_email" TEXT NOT NULL,
  "customer_phone" TEXT NOT NULL,
  "venue_id" TEXT NOT NULL,
  "venue_name" TEXT,
  "venue_postcode" TEXT,
  "collection_location" TEXT NOT NULL,
  "vehicle_details" TEXT NOT NULL,
  "condition_details" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "amount_total" INTEGER NOT NULL DEFAULT 70000,
  "terms_version" TEXT,
  "terms_accepted_at" TEXT,
  "stripe_checkout_session_id" TEXT,
  "stripe_payment_intent_id" TEXT,
  "customer_email_sent_at" TEXT,
  "admin_email_sent_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "priority_recovery_settings" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "quote_requests" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "public_id" TEXT NOT NULL,
  "service_id" TEXT NOT NULL,
  "variant_id" TEXT,
  "requested_date" TEXT,
  "customer_name" TEXT NOT NULL,
  "customer_email" TEXT NOT NULL,
  "customer_phone" TEXT,
  "service_address" TEXT,
  "postcode" TEXT,
  "vehicle_details" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'new',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "terms_version" TEXT,
  "terms_accepted_at" TEXT,
  "terms_customer_name" TEXT,
  "terms_documents" TEXT NOT NULL DEFAULT '[]',
  UNIQUE ("public_id")
);

CREATE TABLE IF NOT EXISTS "seasonal_campaigns" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "starts_at" TEXT NOT NULL,
  "ends_at" TEXT NOT NULL,
  "headline" TEXT,
  "message" TEXT,
  "accent" TEXT,
  "background_effect" TEXT,
  "banner_url" TEXT,
  "shop_collection" TEXT,
  "active" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("slug")
);

CREATE TABLE IF NOT EXISTS "service_price_overrides" (
  "service_id" TEXT NOT NULL,
  "variant_id" TEXT NOT NULL,
  "price_pence" INTEGER NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("service_id", "variant_id"),
  CHECK ((price_pence >= 0))
);

CREATE TABLE IF NOT EXISTS "shop_catalog_snapshots" (
  "cache_key" TEXT NOT NULL PRIMARY KEY,
  "payload" TEXT NOT NULL DEFAULT '{}',
  "refreshed_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "shop_products" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price" INTEGER,
  "stripe_price_id" TEXT,
  "image_url" TEXT,
  "stock" INTEGER,
  "active" INTEGER NOT NULL DEFAULT 1,
  "featured" INTEGER NOT NULL DEFAULT 0,
  "collection" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("slug")
);

CREATE TABLE IF NOT EXISTS "travel_price_overrides" (
  "service_id" TEXT NOT NULL PRIMARY KEY,
  "rate_pence_per_mile" INTEGER NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((rate_pence_per_mile >= 0))
);

CREATE TABLE IF NOT EXISTS "vehicle_inspections" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "vehicle_code" TEXT NOT NULL DEFAULT 'e46',
  "booking_id" TEXT,
  "inspection_type" TEXT NOT NULL,
  "mileage" INTEGER,
  "tyres" TEXT,
  "brakes" TEXT,
  "fluids" TEXT,
  "body_condition" TEXT,
  "damage_notes" TEXT,
  "inspector" TEXT,
  "inspected_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "vehicle_maintenance" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "vehicle_code" TEXT NOT NULL DEFAULT 'e46',
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "mileage" INTEGER,
  "track_hours" NUMERIC,
  "cost" INTEGER,
  "performed_at" TEXT NOT NULL DEFAULT (date('now')),
  "next_due_date" TEXT,
  "next_due_mileage" INTEGER,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS "admin_login_attempts_recent_idx" ON "admin_login_attempts" (attempted_at DESC);
CREATE INDEX IF NOT EXISTS "admin_sessions_active_idx" ON "admin_sessions" (expires_at, revoked_at);
CREATE INDEX IF NOT EXISTS "booking_endofday_receipts_sent_idx" ON "booking_endofday_receipts" (sent_at DESC);
CREATE INDEX IF NOT EXISTS "booking_record_entries_booking_idx" ON "booking_record_entries" (booking_id, section, occurred_at, id);
CREATE INDEX IF NOT EXISTS "bookings_date_idx" ON "bookings" (booking_date);
CREATE INDEX IF NOT EXISTS "bookings_status_idx" ON "bookings" (status);
CREATE INDEX IF NOT EXISTS "damage_security_events_booking_idx" ON "damage_security_events" (booking_id, created_at);
CREATE INDEX IF NOT EXISTS "discount_redemptions_code_status_idx" ON "discount_redemptions" (discount_code_id, status);
CREATE INDEX IF NOT EXISTS "email_verifications_email_idx" ON "email_verifications" (email, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS "gift_vouchers_code_idx" ON "gift_vouchers" (code);
CREATE INDEX IF NOT EXISTS "gift_vouchers_status_idx" ON "gift_vouchers" (status);
CREATE INDEX IF NOT EXISTS "priority_recoveries_created_idx" ON "priority_recoveries" (created_at DESC);
CREATE INDEX IF NOT EXISTS "priority_recoveries_status_idx" ON "priority_recoveries" (status);
