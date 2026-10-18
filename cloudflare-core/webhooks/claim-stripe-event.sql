-- Claim a Stripe event ONLY AFTER verifying its raw-body signature.
-- ?1=id ?2=type ?3=SHA256-of-raw-body ?4=unique-lease-token
-- ?5=current-ISO-time ?6=lease-expiry-ISO-time (short, e.g. 60s).
-- A record is returned only to its single successful claimant.
-- A failed/expired event is retried; a processed one is never reclaimed.
-- Identical Stripe event IDs with different hashes do not reclaim.
INSERT INTO stripe_webhook_inbox (
  event_id,event_type,body_sha256,state,attempt_count,lease_token,
  lease_expires_at,received_at,last_seen_at
) VALUES(?1,?2,?3,'processing',1,?4,?6,?5,?5)
ON CONFLICT(event_id) DO UPDATE SET
  state='processing',
  lease_token=excluded.lease_token,
  lease_expires_at=excluded.lease_expires_at,
  last_seen_at=excluded.last_seen_at,
  attempt_count=stripe_webhook_inbox.attempt_count+1,
  last_error_code=NULL
WHERE stripe_webhook_inbox.state!='processed'
  AND stripe_webhook_inbox.body_sha256=excluded.body_sha256
  AND stripe_webhook_inbox.event_type=excluded.event_type
  AND stripe_webhook_inbox.lease_expires_at<=excluded.last_seen_at
RETURNING event_id,lease_token,attempt_count;
