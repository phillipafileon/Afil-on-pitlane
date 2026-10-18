-- Afileon Core staging D1 Console - batch 10 of 12
-- Destination: Cloudflare D1 database afileon-core-staging ONLY.
-- No production changes. Schema only; no customer or secret data.
-- Creates: vehicle_inspections, vehicle_maintenance

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
