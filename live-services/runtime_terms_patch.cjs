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
  "const E46_BOOKING_LIVE = String(process.env.E46_BOOKING_LIVE || 'false').toLowerCase() === 'true';\nconst TERMS_VERSION = '2026-09-19-v8';\nconst TERMS_DOCUMENT_VERSIONS = Object.freeze({booking:'2026-09-19-v8',vehicle_hire:'2026-09-19-v4',transport:'2026-09-19-v1',track_support:'2026-09-19-v1',pre_track_inspection:'2026-09-19-v1'});\nconst E46_DAMAGE_SECURITY_PENCE = Math.max(0, Number.parseInt(process.env.E46_DAMAGE_SECURITY_PENCE || '0',10) || 0);\nconst TERMS_URL = process.env.TERMS_URL || `${SITE_URL}/booking-terms`;",
  'terms constants'
);

replaceOnce(
  "r.json({ services: SERVICES.map(publicService), season: rows[0] || null, rolling_months: 6, currency: 'GBP', licence_email: LICENCE_EMAIL, terms_version: '2026-09-15', cancellation_note: 'Cancellation, rescheduling and refund rights are governed by the booking terms and applicable consumer law. Contact Afiléon Motorsport as soon as possible if plans change.' });",
  "r.json({ services: SERVICES.map(publicService), season: rows[0] || null, rolling_months: 6, currency: 'GBP', licence_email: LICENCE_EMAIL, terms_version: TERMS_VERSION, terms_document_versions: TERMS_DOCUMENT_VERSIONS, damage_security_amount_pence: E46_DAMAGE_SECURITY_PENCE || null, terms_url: TERMS_URL, cancellation_note: 'Cancellation, rescheduling and refund rights are governed by the booking terms and applicable consumer law. Contact Afiléon Motorsport as soon as possible if plans change.' });",
  'config terms URL'
);

replaceOnce(
  "if (!clean(b.customer_name,120) || !clean(b.customer_email,200) || !clean(b.customer_phone,60)) return res.status(400).json({ error: 'contact_details_required' });",
  "if (!clean(b.customer_name,120) || !clean(b.customer_email,200) || !clean(b.customer_phone,60)) return res.status(400).json({ error: 'contact_details_required' });\n  if (b.terms_accepted !== true) return res.status(400).json({ error: 'booking_terms_required', detail: 'Please read and accept the Afiléon Motorsport Booking Terms and the applicable service-specific terms before continuing.' });",
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

/* Server-authoritative terms acceptance and damage-security transparency */
if (!s.includes("terms_customer_name TEXT")) {
  const m = "    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;";
  if (!s.includes(m)) throw new Error('terms acceptance migration marker missing');
  s = s.replace(m, m + "\n    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS terms_customer_name TEXT;\n    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS terms_documents JSONB NOT NULL DEFAULT '[]'::jsonb;\n    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_amount INTEGER;");
}

if (!s.includes("ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS terms_version TEXT;")) {
  const m = "    CREATE TABLE IF NOT EXISTS shop_products(";
  if (!s.includes(m)) throw new Error('quote terms migration marker missing');
  s = s.replace(m, "    ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS terms_version TEXT;\n    ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;\n    ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS terms_customer_name TEXT;\n    ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS terms_documents JSONB NOT NULL DEFAULT '[]'::jsonb;\n\n" + m);
}

if (!s.includes("function bookingTermsDocuments(serviceId)")) {
  const m = "app.post('/api/quotes'";
  const i = s.indexOf(m);
  if (i < 0) throw new Error('terms documents helper marker missing');
  const h = "function bookingTermsDocuments(serviceId){\n  const docs=[{key:'booking',name:'Afiléon Motorsport Booking Terms',version:TERMS_DOCUMENT_VERSIONS.booking,url:SITE_URL+'/booking-terms'}];\n  const add=(key,name,path)=>docs.push({key,name,version:TERMS_DOCUMENT_VERSIONS[key],url:SITE_URL+'/'+path});\n  if(serviceId==='vehicle_hire_day')add('vehicle_hire','BMW E46 Vehicle Hire Terms','vehicle-hire-terms');\n  if(serviceId==='vehicle_transport')add('transport','Customer Vehicle Transport Terms','transport-terms');\n  if(serviceId==='track_day_support'||serviceId==='race_day_support')add('track_support','Track-Day & Race-Day Support Terms','track-support-terms');\n  if(serviceId==='pre_track_inspection')add('pre_track_inspection','Pre-Track-Day Inspection Terms','pre-track-inspection-terms');\n  if(serviceId==='full_package'){add('vehicle_hire','BMW E46 Vehicle Hire Terms','vehicle-hire-terms');add('transport','Customer Vehicle Transport Terms','transport-terms');add('track_support','Track-Day & Race-Day Support Terms','track-support-terms');}\n  return docs;\n}\n\n";
  s = s.slice(0,i) + h + s.slice(i);
}

{
  const a = s.indexOf("app.post('/api/quotes'");
  const b = s.indexOf("app.post('/api/bookings/hold'", a);
  if (a < 0 || b < 0) throw new Error('quote route block missing');
  let block = s.slice(a,b);
  const contact = "  if (!clean(b.customer_name,120) || !clean(b.customer_email,200)) return res.status(400).json({ error:'name_and_email_required' });";
  if (block.includes(contact) && !block.includes("quote_terms_required")) {
    block = block.replace(contact, contact + "\n  if (b.terms_accepted !== true) return res.status(400).json({error:'quote_terms_required',detail:'Please read and accept the Booking Terms and applicable service terms before sending the request.'});\n  if (clean(b.terms_version,40)!==TERMS_VERSION) return res.status(409).json({error:'terms_version_outdated',detail:'The terms changed while this page was open. Refresh the page and review the current terms before continuing.',terms_version:TERMS_VERSION});");
  }
  const response = "  res.status(201).json({ quote_id: id, status: 'received' });";
  if (block.includes(response) && !block.includes("UPDATE quote_requests SET terms_version")) {
    block = block.replace(response, "  const termsDocs=bookingTermsDocuments(service.id);\n  const acceptance=await pool.query('UPDATE quote_requests SET terms_version=$1,terms_accepted_at=now(),terms_customer_name=$2,terms_documents=$3::jsonb,updated_at=now() WHERE public_id=$4 RETURNING terms_version,terms_accepted_at,terms_customer_name,terms_documents',[TERMS_VERSION,clean(b.customer_name,120),JSON.stringify(termsDocs),id]);\n  res.status(201).json({quote_id:id,status:'received',terms_acceptance:acceptance.rows[0]||null});");
  }
  s = s.slice(0,a) + block + s.slice(b);
}

{
  const a = s.indexOf("app.post('/api/bookings/hold'");
  const b = s.indexOf("app.post('/api/bookings/:id/checkout'", a);
  if (a < 0 || b < 0) throw new Error('booking hold block missing');
  let block = s.slice(a,b);
  const accepted = "  if (b.terms_accepted !== true) return res.status(400).json({ error: 'booking_terms_required', detail: 'Please read and accept the Afiléon Motorsport Booking Terms and the applicable service-specific terms before continuing.' });";
  if (block.includes(accepted) && !block.includes("damage_security_not_published")) {
    block = block.replace(accepted, accepted + "\n  if (clean(b.terms_version,40)!==TERMS_VERSION) return res.status(409).json({error:'terms_version_outdated',detail:'The terms changed while this page was open. Refresh the page and review the current terms before continuing.',terms_version:TERMS_VERSION});\n  if (service.id==='vehicle_hire_day' && E46_DAMAGE_SECURITY_PENCE<=0) return res.status(503).json({error:'damage_security_not_published',detail:'BMW E46 online checkout is temporarily unavailable because the refundable damage-security amount has not yet been published. No booking payment can be taken until that figure is shown before checkout.'});");
  }
  const commit = "    await client.query('COMMIT');";
  if (block.includes(commit) && !block.includes("termsUpdate=await client.query")) {
    block = block.replace(commit, "    const termsDocs=bookingTermsDocuments(service.id);\n    const termsUpdate=await client.query('UPDATE bookings SET terms_version=$1,terms_accepted_at=now(),terms_customer_name=$2,terms_documents=$3::jsonb,damage_security_amount=$4,updated_at=now() WHERE public_id=$5 RETURNING terms_version,terms_accepted_at,terms_customer_name,terms_documents,damage_security_amount',[TERMS_VERSION,clean(b.customer_name,120),JSON.stringify(termsDocs),service.id==='vehicle_hire_day'?E46_DAMAGE_SECURITY_PENCE:null,id]);\n    const termsAcceptance=termsUpdate.rows[0]||null;\n" + commit);
  }
  if (block.includes("checkout_available:true, licence_email:") && !block.includes("terms_acceptance:termsAcceptance")) {
    block = block.replace("checkout_available:true, licence_email:", "checkout_available:true, terms_acceptance:termsAcceptance, damage_security_amount_pence:service.id==='vehicle_hire_day'?E46_DAMAGE_SECURITY_PENCE:null, licence_email:");
  }
  s = s.slice(0,a) + block + s.slice(b);
}

{
  const a = s.indexOf("app.post('/api/bookings/:id/checkout'");
  const b = s.indexOf("app.get('/api/bookings/:id'", a);
  if (a < 0 || b < 0) throw new Error('checkout block missing');
  let block = s.slice(a,b);
  const marker = "  if (b.status !== 'hold' || new Date(b.hold_expires_at) < new Date()) return res.status(409).json({ error: 'booking_hold_expired' });";
  if (block.includes(marker) && !block.includes("booking_terms_outdated")) {
    block = block.replace(marker, marker + "\n  if (b.terms_version!==TERMS_VERSION) return res.status(409).json({error:'booking_terms_outdated',detail:'The accepted terms are no longer current. Start the booking again and accept the current terms.'});\n  if (b.service_id==='vehicle_hire_day' && Number(b.damage_security_amount||0)<=0) return res.status(409).json({error:'damage_security_not_recorded',detail:'The E46 damage-security amount is not recorded on this booking. Checkout cannot continue.'});");
  }
  s = s.slice(0,a) + block + s.slice(b);
}

fs.writeFileSync(path, s);
console.log('Applied Afiléon booking terms/Stripe checkout runtime patch');
