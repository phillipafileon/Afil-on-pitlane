const fs = require('fs');
const path = 'server_v3.js';
let s = fs.readFileSync(path, 'utf8');

function replaceOnce(from, to, label) {
  if (s.includes(to)) return;
  if (!s.includes(from)) throw new Error(`Cutoff/slots patch: missing ${label}`);
  s = s.replace(from, to);
}

replaceOnce(
  "const publicService = s => ({ ...s });",
  `const publicService = s => ({ ...s });

const UK_TIME_ZONE = 'Europe/London';
const INSPECTION_SLOTS = ['10:00','12:00','14:00','16:00','18:00'];
const BOOKING_CUTOFFS = {
  vehicle_hire_day: { payment_cutoff:'23:30', checkout_start_cutoff:'22:59', label:'BMW E46 arrive-and-drive' },
  pre_track_inspection: { payment_cutoff:'24:00', checkout_start_cutoff:'23:29', label:'Pre-track inspection' },
  default: { payment_cutoff:'20:00', checkout_start_cutoff:'19:29', label:'Track-day service' }
};
function ukClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone:UK_TIME_ZONE, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).formatToParts(now);
  const p = Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  const hour = Number(p.hour), minute = Number(p.minute), second = Number(p.second);
  return { date: `${p.year}-${p.month}-${p.day}`, hour, minute, second, seconds:hour*3600+minute*60+second };
}
function dayDiffIso(fromDate, toDate) {
  return Math.round((Date.parse(toDate+'T12:00:00Z') - Date.parse(fromDate+'T12:00:00Z')) / dayMs);
}
function cutoffSeconds(hhmm) {
  if (hhmm === '24:00') return 86400;
  const [h,m] = String(hhmm||'00:00').split(':').map(Number);
  return h*3600+m*60;
}
function policyFor(service) {
  return BOOKING_CUTOFFS[service?.id] || BOOKING_CUTOFFS.default;
}
function bookingCutoffStatus(service, date, phase = 'payment', now = new Date()) {
  const clock = ukClock(now);
  const days = dayDiffIso(clock.date, String(date||'').slice(0,10));
  const policy = policyFor(service);
  if (days < 1) return { ok:false, reason:'same_day_unavailable', days, policy, detail:'Same-day bookings are not available. Please choose tomorrow or a later date.' };
  if (days > 1) return { ok:true, days, policy, remaining_seconds:null };
  const paymentLeft = cutoffSeconds(policy.payment_cutoff) - clock.seconds;
  if (paymentLeft <= 0) return { ok:false, reason:'next_day_cutoff_passed', days, policy, remaining_seconds:paymentLeft, detail:`The next-day cutoff for ${policy.label} has passed. Choose a later date.` };
  if (phase === 'checkout_start' && service?.payment !== 'quote') {
    const startLeft = cutoffSeconds(policy.checkout_start_cutoff) - clock.seconds;
    if (startLeft <= 0) return { ok:false, reason:'checkout_window_closed', days, policy, remaining_seconds:paymentLeft, detail:`For tomorrow's ${policy.label}, secure checkout must be started before ${policy.checkout_start_cutoff} and payment completed before ${policy.payment_cutoff === '24:00' ? 'midnight' : policy.payment_cutoff}. Choose a later date.` };
  }
  return { ok:true, days, policy, remaining_seconds:paymentLeft };
}
function cappedHoldExpiry(service, date) {
  let expiry = new Date(Date.now() + HOLD_MINUTES * 60000);
  const st = bookingCutoffStatus(service, date, 'payment');
  if (st.ok && st.days === 1 && Number.isFinite(st.remaining_seconds)) {
    const cutoffExpiry = new Date(Date.now() + st.remaining_seconds * 1000);
    if (cutoffExpiry < expiry) expiry = cutoffExpiry;
  }
  return expiry;
}`,
  'booking cutoff helpers'
);

replaceOnce(
  "    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;",
  "    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;\n    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS appointment_time TEXT;",
  'inspection appointment column'
);

if (!s.includes('booking_cutoffs: BOOKING_CUTOFFS')) {
  const marker = "r.json({ services: SERVICES.map(publicService),";
  if (!s.includes(marker)) throw new Error('Cutoff/slots patch: missing config response');
  s = s.replace(marker, "r.json({ services: SERVICES.map(publicService), booking_cutoffs: BOOKING_CUTOFFS, inspection_slots: INSPECTION_SLOTS,");
}

if (!s.includes("inspection_slots: INSPECTION_SLOTS, venues:")) {
  const marker = "app.get('/api/services', (_q, r) => r.json({ services: SERVICES.map(publicService),";
  if (!s.includes(marker)) throw new Error('Cutoff/slots patch: missing services response');
  s = s.replace(marker, "app.get('/api/services', (_q, r) => r.json({ services: SERVICES.map(publicService), booking_cutoffs: BOOKING_CUTOFFS, inspection_slots: INSPECTION_SLOTS,");
}

replaceOnce(
  "  if (b.requested_date && daysUntil(b.requested_date) < 1) return res.status(400).json({ error:'same_day_unavailable', detail:'Same-day bookings are not available. Please choose tomorrow or a later date.' });",
  "  if (b.requested_date && daysUntil(b.requested_date) < 1) return res.status(400).json({ error:'same_day_unavailable', detail:'Same-day bookings are not available. Please choose tomorrow or a later date.' });\n  if (b.requested_date) { const cutoff = bookingCutoffStatus(service, b.requested_date, 'payment'); if (!cutoff.ok) return res.status(409).json({ error:cutoff.reason, detail:cutoff.detail }); }",
  'quote next-day cutoff'
);

replaceOnce(
  "  if (du < 1 || du >= 184) return res.status(400).json({ error: du < 1 ? 'same_day_unavailable' : 'date_outside_booking_window', detail: du < 1 ? 'Same-day bookings are not available. Please choose tomorrow or a later date.' : undefined });",
  "  if (du < 1 || du >= 184) return res.status(400).json({ error: du < 1 ? 'same_day_unavailable' : 'date_outside_booking_window', detail: du < 1 ? 'Same-day bookings are not available. Please choose tomorrow or a later date.' : undefined });\n  const bookingCutoff = bookingCutoffStatus(service, b.booking_date, 'checkout_start');\n  if (!bookingCutoff.ok) return res.status(409).json({ error:bookingCutoff.reason, detail:bookingCutoff.detail });\n  if (service.id === 'pre_track_inspection' && !INSPECTION_SLOTS.includes(clean(b.appointment_time,10))) return res.status(400).json({ error:'inspection_time_required', detail:'Choose an inspection start time between 10:00 and 18:00.' });",
  'booking cutoff and inspection slot validation'
);

replaceOnce(
  "    const expires = new Date(Date.now() + HOLD_MINUTES * 60000);",
  "    const expires = cappedHoldExpiry(service, b.booking_date);",
  'hold expiry capped to payment cutoff'
);

replaceOnce(
  "    await client.query('COMMIT');\n    res.status(201).json({ booking_id:id,",
  "    if (service.id === 'pre_track_inspection') await client.query(`UPDATE bookings SET appointment_time=$1 WHERE public_id=$2`, [clean(b.appointment_time,10),id]);\n    await client.query('COMMIT');\n    res.status(201).json({ booking_id:id,",
  'store inspection appointment time'
);

replaceOnce(
  "  if (!service || !variant || !b.booking_payment_amount) return res.status(400).json({ error: 'quote_required' });",
  "  if (!service || !variant || !b.booking_payment_amount) return res.status(400).json({ error: 'quote_required' });\n  const checkoutCutoff = bookingCutoffStatus(service, isoDate(b.booking_date), 'checkout_start');\n  if (!checkoutCutoff.ok) { await pool.query(`UPDATE bookings SET status='expired',updated_at=now() WHERE public_id=$1 AND status='hold'`, [b.public_id]); return res.status(409).json({ error:checkoutCutoff.reason, detail:checkoutCutoff.detail }); }",
  'checkout cutoff recheck'
);

if (!s.includes("appointment_time:b.appointment_time||''")) {
  const marker = "metadata:{kind:'service_booking',booking_id:b.public_id,service_id:b.service_id,variant_id:b.variant_id,booking_date:isoDate(b.booking_date),terms_version:TERMS_VERSION}";
  if (!s.includes(marker)) throw new Error('Cutoff/slots patch: missing checkout metadata');
  s = s.replace(marker, "metadata:{kind:'service_booking',booking_id:b.public_id,service_id:b.service_id,variant_id:b.variant_id,booking_date:isoDate(b.booking_date),appointment_time:b.appointment_time||'',terms_version:TERMS_VERSION}");
}

replaceOnce(
  "      const { rows } = await pool.query('SELECT service_id FROM bookings WHERE public_id=$1', [o.metadata.booking_id]);\n      const hire = rows[0]?.service_id === 'vehicle_hire_day';\n      await pool.query(`UPDATE bookings SET status=$1,stripe_payment_intent_id=$2,stripe_customer_id=$3,amount_paid=COALESCE(amount_paid,0)+COALESCE(booking_payment_amount,0),licence_status=CASE WHEN licence_required THEN 'awaiting_email' ELSE licence_status END,updated_at=now() WHERE public_id=$4`, [hire ? 'confirmed_pending_licence' : 'confirmed', o.payment_intent || null, o.customer || null, o.metadata.booking_id]);",
  "      const { rows } = await pool.query('SELECT service_id,booking_date::text booking_date FROM bookings WHERE public_id=$1', [o.metadata.booking_id]);\n      const booking = rows[0] || null;\n      const paidService = SERVICE_MAP.get(booking?.service_id);\n      const eventTime = event.created ? new Date(event.created * 1000) : new Date();\n      const paidCutoff = booking && paidService ? bookingCutoffStatus(paidService, booking.booking_date, 'payment', eventTime) : { ok:true };\n      if (!paidCutoff.ok) {\n        let refunded = false;\n        if (o.payment_intent) {\n          try { await stripe.refunds.create({ payment_intent:o.payment_intent, metadata:{ kind:'automatic_booking_cutoff_refund', booking_id:o.metadata.booking_id } }, { idempotencyKey:`cutoff_refund_${o.metadata.booking_id}` }); refunded = true; }\n          catch (refundError) { console.error('Automatic cutoff refund failed', refundError.message); }\n        }\n        await pool.query(`UPDATE bookings SET status=$1,stripe_payment_intent_id=$2,stripe_customer_id=$3,updated_at=now() WHERE public_id=$4`, [refunded ? 'late_payment_refunded' : 'late_payment_review', o.payment_intent || null, o.customer || null, o.metadata.booking_id]);\n      } else {\n        const hire = booking?.service_id === 'vehicle_hire_day';\n        await pool.query(`UPDATE bookings SET status=$1,stripe_payment_intent_id=$2,stripe_customer_id=$3,amount_paid=COALESCE(amount_paid,0)+COALESCE(booking_payment_amount,0),licence_status=CASE WHEN licence_required THEN 'awaiting_email' ELSE licence_status END,updated_at=now() WHERE public_id=$4`, [hire ? 'confirmed_pending_licence' : 'confirmed', o.payment_intent || null, o.customer || null, o.metadata.booking_id]);\n      }",
  'late payment cutoff safety'
);

replaceOnce(
  "SELECT public_id,service_id,variant_id,booking_date::text booking_date,status,amount_total",
  "SELECT public_id,service_id,variant_id,booking_date::text booking_date,appointment_time,status,amount_total",
  'public booking appointment time'
);

replaceOnce(
  "SELECT public_id,service_id,variant_id,booking_date::text booking_date,customer_name,customer_email,status,balance_status",
  "SELECT public_id,service_id,variant_id,booking_date::text booking_date,appointment_time,customer_name,customer_email,status,balance_status",
  'admin booking appointment time'
);

fs.writeFileSync(path, s);
console.log('Applied UK next-day cutoffs, E46 deadline and inspection time slots.');
