-- Afileon Core staging D1 Console - batch 02 of 12
-- Destination: Cloudflare D1 database afileon-core-staging ONLY.
-- No production changes. Schema only; no customer or secret data.
-- Creates: admin_login_attempts, admin_login_challenges, admin_sessions

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
