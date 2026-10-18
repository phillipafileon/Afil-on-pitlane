-- STAGING ONLY. NOT CONNECTED TO STRIPE, DO NOT APPLY TO LIVE D1.
-- Verified Stripe checkout.session.completed for service_booking ONLY.
-- This SQL MUST be batched atomically with complete-verified-booking-payment.sql.
-- ?1=booking, ?2=session, ?3=payment intent, ?4=customer, ?5=paid subtotal pence,
-- ?6=Stripe event-created ISO, ?7=event ID, ?8=claimed lease token,
-- ?9=processing ISO, ?10=accepted terms version, ?11=service, ?12=variant,
-- ?13=booking date, ?14=UK date of payment, ?15=event type, ?16=policy-approved (1).
-- Business case not migrated: refunds, discounts, vouchers, chargebacks,
-- late payments, manual reconciliation, email notifications, and admin review.
-- Zero updated rows => NEVER acknowledge payment as processed without
-- inspecting booking/inbox and reconciling with Stripe.
UPDATE bookings SET
  status=CASE WHEN licence_required=1
         THEN 'confirmed_pending_licence' ELSE 'confirmed' END,
  licence_status=CASE WHEN licence_required=1
                 THEN 'awaiting_email' ELSE licence_status END,
  stripe_payment_intent_id=?3,
  stripe_customer_id=?4,
  amount_paid=COALESCE(amount_paid,0)+?5,
  updated_at=?9
WHERE public_id=?1
  AND stripe_checkout_session_id=?2
  AND (stripe_payment_intent_id IS NULL OR stripe_payment_intent_id=?3)
  AND status='hold'
  AND hold_expires_at>=?6
  AND COALESCE(amount_paid,0)=0
  AND amount_total>=?5
  AND booking_payment_amount=?5
  AND COALESCE(discount_amount,0)=0
  AND COALESCE(gift_voucher_amount,0)=0
  AND terms_version=?10 AND terms_accepted_at IS NOT NULL
  AND service_id=?11 AND variant_id=?12 AND booking_date=?13
  AND ?15='checkout.session.completed' AND ?16=1
  AND EXISTS(
    SELECT 1 FROM stripe_webhook_inbox AS inbox
    WHERE inbox.event_id=?7 AND inbox.event_type=?15
      AND inbox.lease_token=?8 AND inbox.state='processing'
      AND inbox.lease_expires_at>=?9
  )
  AND NOT EXISTS(
    SELECT 1 FROM bookings AS other
    WHERE other.booking_date=?13 AND other.public_id<>?1 AND (
      other.status IN ('confirmed','confirmed_pending_licence')
      OR (other.status='hold' AND other.hold_expires_at>?9)
      OR other.balance_status IN ('invoiced','payment_failed','manual_due')
    )
  )
  AND NOT EXISTS(
    SELECT 1 FROM availability_blocks AS block WHERE block.block_date=?13 AND (
      block.service_id IS NULL OR block.service_id IN ('','*',?11)
      OR EXISTS(
        SELECT 1 FROM availability_blocks AS legacy
        WHERE legacy.block_date=?13
          AND legacy.service_id IN ('vehicle_hire_day','track_day_support','vehicle_transport')
        GROUP BY legacy.block_date HAVING COUNT(DISTINCT legacy.service_id)=3
      )
    )
  )
  AND NOT EXISTS(
    SELECT 1 FROM business_availability_settings AS closure
    WHERE closure.id=1 AND closure.start_date IS NOT NULL
      AND closure.end_date IS NOT NULL AND (
        ?14 BETWEEN closure.start_date AND closure.end_date
        OR ?13 BETWEEN closure.start_date AND closure.end_date
      )
  )
RETURNING public_id,status,amount_paid,stripe_payment_intent_id;
