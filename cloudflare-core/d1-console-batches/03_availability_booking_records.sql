-- Afileon Core staging D1 Console - batch 03 of 12
-- Destination: Cloudflare D1 database afileon-core-staging ONLY.
-- No production changes. Schema only; no customer or secret data.
-- Creates: availability_blocks, booking_endofday_receipts, booking_record_entries

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
