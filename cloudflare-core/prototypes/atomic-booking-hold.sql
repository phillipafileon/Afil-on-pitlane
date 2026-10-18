-- Afiléon Core: STAGING PROTOTYPE ONLY. This file is NEVER executed by a live Worker.
-- Use a SINGLE D1 SQL INSERT...SELECT...WHERE NOT EXISTS...RETURNING statement
-- to make the occupancy check and hold creation atomic on a single D1 database.
-- Parameter order (?1..11):
-- public_id, service_id, variant_id, booking_date, customer_name, customer_email,
-- customer_phone, hold_expires_at_UTC_ISO, now_UTC_ISO, today_UK_YYYY_MM_DD, terms_version
-- Caller MUST first enforce service approval, prices, legal terms acceptance,
-- current UK cutoffs, valid dates, contact identity, and postcode/venue rules.
-- This prototype deliberately omits payment total/security fields and cannot be used
-- for real bookings. SQLite feasibility is NOT proof of Cloudflare D1 concurrency parity.

INSERT INTO bookings (
  public_id, service_id, variant_id, booking_date,
  customer_name, customer_email, customer_phone,
  status, hold_expires_at, terms_version
)
SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'hold', ?8, ?11
WHERE NOT EXISTS (
  SELECT 1 FROM bookings
  WHERE booking_date = ?4
    AND (
      status IN ('confirmed', 'confirmed_pending_licence')
      OR (status = 'hold' AND hold_expires_at > ?9)
      OR balance_status IN ('invoiced', 'payment_failed', 'manual_due')
    )
)
AND NOT EXISTS (
  SELECT 1 FROM availability_blocks AS b
  WHERE b.block_date = ?4
    AND (
      b.service_id IS NULL OR b.service_id IN ('', '*', ?2)
      OR EXISTS (
        SELECT 1 FROM availability_blocks AS legacy
        WHERE legacy.block_date = ?4
          AND legacy.service_id IN (
            'vehicle_hire_day', 'track_day_support', 'vehicle_transport'
          )
        GROUP BY legacy.block_date
        HAVING COUNT(DISTINCT legacy.service_id) = 3
      )
    )
)
AND NOT EXISTS (
  SELECT 1 FROM business_availability_settings AS c
  WHERE c.id = 1
    AND c.start_date IS NOT NULL AND c.end_date IS NOT NULL
    AND (
      (?10 BETWEEN c.start_date AND c.end_date)
      OR (?4 BETWEEN c.start_date AND c.end_date)
    )
)
RETURNING public_id;
