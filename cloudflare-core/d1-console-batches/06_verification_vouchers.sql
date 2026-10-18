-- Afileon Core staging D1 Console - batch 06 of 12
-- Destination: Cloudflare D1 database afileon-core-staging ONLY.
-- No production changes. Schema only; no customer or secret data.
-- Creates: email_verifications, gift_vouchers

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
