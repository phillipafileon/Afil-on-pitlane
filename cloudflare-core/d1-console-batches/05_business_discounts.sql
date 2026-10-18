-- Afileon Core staging D1 Console - batch 05 of 12
-- Destination: Cloudflare D1 database afileon-core-staging ONLY.
-- No production changes. Schema only; no customer or secret data.
-- Creates: business_availability_settings, damage_security_events, discount_codes, discount_redemptions

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
