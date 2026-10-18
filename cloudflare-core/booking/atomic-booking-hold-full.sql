-- Staging-only full hold SQL, NOT DEPLOYED OR INVOKED BY THE WORKER.
-- A single atomic INSERT/NOT EXISTS. ?1..?29 are produced by holdBindings().
-- Must be supplemented by trusted postcode/travel, D1 concurrency tests,
-- auth/idempotency/checkout recheck and Stripe test-mode integration.
-- Cases include global, service-specific, and 3x legacy all-service block
-- compatibility. The hold is NOT a paid booking.
INSERT INTO bookings (
  public_id,service_id,variant_id,booking_date,customer_name,customer_email,
  customer_phone,service_address,postcode,vehicle_details,notes,status,
  hold_expires_at,amount_total,booking_payment_amount,balance_amount,
  balance_notice_at,balance_due_at,balance_status,licence_required,
  licence_status,safe_work_area_confirmed,appointment_time,terms_version,
  terms_accepted_at,terms_customer_name,terms_documents,damage_security_amount
)
SELECT
  ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'hold',
  ?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,
  ?24,?25,?26,?27
WHERE NOT EXISTS (
  SELECT 1 FROM bookings WHERE booking_date=?4 AND (
    status IN ('confirmed','confirmed_pending_licence')
    OR (status='hold' AND hold_expires_at>?28)
    OR balance_status IN ('invoiced','payment_failed','manual_due')
  )
)
AND NOT EXISTS (
  SELECT 1 FROM availability_blocks AS block WHERE block.block_date=?4 AND (
    block.service_id IS NULL OR block.service_id IN ('','*',?2)
    OR EXISTS (
      SELECT 1 FROM availability_blocks AS legacy
      WHERE legacy.block_date=?4
      AND legacy.service_id IN ('vehicle_hire_day','track_day_support','vehicle_transport')
      GROUP BY legacy.block_date
      HAVING COUNT(DISTINCT legacy.service_id)=3
    )
  )
)
AND NOT EXISTS (
  SELECT 1 FROM business_availability_settings AS closure WHERE closure.id=1
  AND closure.start_date IS NOT NULL AND closure.end_date IS NOT NULL AND (
    ?29 BETWEEN closure.start_date AND closure.end_date
    OR ?4 BETWEEN closure.start_date AND closure.end_date
  )
)
RETURNING public_id,hold_expires_at,amount_total,booking_payment_amount,balance_amount,terms_version;
