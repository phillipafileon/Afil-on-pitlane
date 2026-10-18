-- STAGING ONLY. The second statement in SAME D1 batch() transaction as
-- apply-verified-booking-payment.sql. DO NOT accept webhook HTTP 2xx unless
-- this statement returns exactly one row AND booking state is reconciled.
-- Placeholders ?1..?16 are identical to the preceding booking update.
-- A replay whose booking was already confirmed via the SAME authenticated
-- checkout session+payment intent may be safely marked processed without
-- adding to amount_paid. Mismatched events remain unacknowledged.
UPDATE stripe_webhook_inbox SET
  state='processed',processed_at=?9,last_seen_at=?9,last_error_code=NULL
WHERE event_id=?7 AND event_type=?15
  AND lease_token=?8 AND state='processing'
  AND lease_expires_at>=?9 AND ?16=1
  AND EXISTS(
    SELECT 1 FROM bookings AS b WHERE b.public_id=?1
      AND b.stripe_checkout_session_id=?2
      AND b.stripe_payment_intent_id=?3
      AND b.amount_paid>=?5 AND b.booking_payment_amount=?5
      AND COALESCE(b.discount_amount,0)=0
      AND COALESCE(b.gift_voucher_amount,0)=0
      AND b.terms_version=?10 AND b.service_id=?11
      AND b.variant_id=?12 AND b.booking_date=?13
      AND b.status IN ('confirmed','confirmed_pending_licence')
  )
RETURNING event_id,state,processed_at;
