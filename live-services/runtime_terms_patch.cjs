const fs = require('fs');
const path = 'server_v3.js';
let s = fs.readFileSync(path, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (s.includes(newText)) return;
  if (!s.includes(oldText)) throw new Error(`Patch marker missing: ${label}`);
  s = s.replace(oldText, newText);
}

replaceOnce(
  "const E46_BOOKING_LIVE = String(process.env.E46_BOOKING_LIVE || 'false').toLowerCase() === 'true';",
  "const E46_BOOKING_LIVE = String(process.env.E46_BOOKING_LIVE || 'false').toLowerCase() === 'true';\nconst TERMS_VERSION = '2026-09-15-v2';\nconst TERMS_URL = process.env.TERMS_URL || `${SITE_URL}/booking-terms.html`;",
  'terms constants'
);

replaceOnce(
  "r.json({ services: SERVICES.map(publicService), season: rows[0] || null, rolling_months: 6, currency: 'GBP', licence_email: LICENCE_EMAIL, terms_version: '2026-09-15', cancellation_note: 'Cancellation, rescheduling and refund rights are governed by the booking terms and applicable consumer law. Contact Afiléon Motorsport as soon as possible if plans change.' });",
  "r.json({ services: SERVICES.map(publicService), season: rows[0] || null, rolling_months: 6, currency: 'GBP', licence_email: LICENCE_EMAIL, terms_version: TERMS_VERSION, terms_url: TERMS_URL, cancellation_note: 'Cancellation, rescheduling and refund rights are governed by the booking terms and applicable consumer law. Contact Afiléon Motorsport as soon as possible if plans change.' });",
  'config terms URL'
);

replaceOnce(
  "if (!clean(b.customer_name,120) || !clean(b.customer_email,200) || !clean(b.customer_phone,60)) return res.status(400).json({ error: 'contact_details_required' });",
  "if (!clean(b.customer_name,120) || !clean(b.customer_email,200) || !clean(b.customer_phone,60)) return res.status(400).json({ error: 'contact_details_required' });\n  if (b.terms_accepted !== true) return res.status(400).json({ error: 'booking_terms_required', detail: 'Please read and accept the Afiléon Motorsport Booking Terms before continuing.' });",
  'explicit terms acceptance'
);

replaceOnce(
  "!!b.safe_work_area_confirmed,'2026-09-15']);",
  "!!b.safe_work_area_confirmed,TERMS_VERSION]);",
  'terms version storage'
);

s = s.replace(" consent_collection:{terms_of_service:'required'},", "");
if (s.includes("consent_collection:{terms_of_service:'required'}")) throw new Error('Stripe terms consent removal failed');

replaceOnce(
  "metadata:{kind:'service_booking',booking_id:b.public_id,service_id:b.service_id,variant_id:b.variant_id,booking_date:isoDate(b.booking_date)}",
  "metadata:{kind:'service_booking',booking_id:b.public_id,service_id:b.service_id,variant_id:b.variant_id,booking_date:isoDate(b.booking_date),terms_version:TERMS_VERSION}",
  'Stripe terms metadata'
);

fs.writeFileSync(path, s);
console.log('Applied Afiléon booking terms/Stripe checkout runtime patch');
