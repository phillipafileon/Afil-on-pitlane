-- Afileon Core staging D1 Console - batch 07 of 12
-- Destination: Cloudflare D1 database afileon-core-staging ONLY.
-- No production changes. Schema only; no customer or secret data.
-- Creates: orders, priority_recoveries

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
