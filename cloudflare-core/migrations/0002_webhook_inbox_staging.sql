-- STAGING ONLY, NOT APPLIED TO CURRENT CLOUDFLARE D1.
-- IMPORTANT: this adds a 26th app table. Existing staging health requires
-- exactly 25; update health check and apply migration together at next bundle.
-- Never store webhook secrets, full event payloads or personal data here.
CREATE TABLE IF NOT EXISTS stripe_webhook_inbox (
  event_id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  body_sha256 TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'processing'
    CHECK(state IN ('processing','processed','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK(attempt_count>=1),
  lease_token TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  processed_at TEXT,
  last_error_code TEXT
);
CREATE INDEX IF NOT EXISTS stripe_webhook_inbox_processing_idx
ON stripe_webhook_inbox(state,lease_expires_at);
