-- Afileon Core staging D1 Console - batch 09 of 12
-- Destination: Cloudflare D1 database afileon-core-staging ONLY.
-- No production changes. Schema only; no customer or secret data.
-- Creates: service_price_overrides, shop_catalog_snapshots, shop_products, travel_price_overrides

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
