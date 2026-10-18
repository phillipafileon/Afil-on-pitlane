-- Afileon Core staging D1 Console - batch 01 of 12
-- Destination: Cloudflare D1 database afileon-core-staging ONLY.
-- No production changes. Schema only; no customer or secret data.
-- Creates: admin_audit_log

CREATE TABLE IF NOT EXISTS "admin_audit_log" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "username" TEXT,
  "action" TEXT NOT NULL,
  "detail" TEXT NOT NULL DEFAULT '{}',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
