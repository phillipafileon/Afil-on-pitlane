-- Afileon Core staging D1 Console - batch 08 of 12
-- Destination: Cloudflare D1 database afileon-core-staging ONLY.
-- No production changes. Schema only; no customer or secret data.
-- Creates: priority_recovery_settings, quote_requests, seasonal_campaigns

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
