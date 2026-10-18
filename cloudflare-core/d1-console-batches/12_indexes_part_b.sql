-- Afileon Core staging D1 Console - batch 12 of 12
-- Destination: Cloudflare D1 database afileon-core-staging ONLY.
-- No production changes. Schema only; no customer or secret data.
-- Creates: discount_redemptions_code_status_idx, email_verifications_email_idx, gift_vouchers_code_idx, gift_vouchers_status_idx, priority_recoveries_created_idx, priority_recoveries_status_idx

CREATE INDEX IF NOT EXISTS "discount_redemptions_code_status_idx" ON "discount_redemptions" (discount_code_id, status);

CREATE INDEX IF NOT EXISTS "email_verifications_email_idx" ON "email_verifications" (email, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS "gift_vouchers_code_idx" ON "gift_vouchers" (code);

CREATE INDEX IF NOT EXISTS "gift_vouchers_status_idx" ON "gift_vouchers" (status);

CREATE INDEX IF NOT EXISTS "priority_recoveries_created_idx" ON "priority_recoveries" (created_at DESC);

CREATE INDEX IF NOT EXISTS "priority_recoveries_status_idx" ON "priority_recoveries" (status);
