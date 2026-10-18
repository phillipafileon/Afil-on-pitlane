-- MUST be executed in the SAME D1 batch transaction as the business
-- state transition, never as a standalone confirmation. Callers must confirm
-- that the business write succeeded; if no status change, retry/reconcile.
-- ?1=id ?2=lease token ?3=current ISO time
UPDATE stripe_webhook_inbox SET
  state='processed', processed_at=?3, last_seen_at=?3, last_error_code=NULL
WHERE event_id=?1 AND lease_token=?2 AND state='processing'
  AND lease_expires_at>=?3
RETURNING event_id;
