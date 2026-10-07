const fs = require('fs');
const path = 'server_v3.js';
let s = fs.readFileSync(path, 'utf8');

function insertBefore(anchor, block, label) {
  if (s.includes(block.trim().slice(0, 90))) return;
  const i = s.indexOf(anchor);
  if (i < 0) throw new Error(`Priority recovery patch: missing ${label}`);
  s = s.slice(0, i) + block + '\n' + s.slice(i);
}

const migration = `
    CREATE TABLE IF NOT EXISTS priority_recoveries(
      public_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'checkout_pending',
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      venue_id TEXT NOT NULL,
      venue_name TEXT,
      venue_postcode TEXT,
      collection_location TEXT NOT NULL,
      vehicle_details TEXT NOT NULL,
      condition_details TEXT NOT NULL,
      destination TEXT NOT NULL,
      amount_total INTEGER NOT NULL DEFAULT 70000,
      terms_version TEXT,
      terms_accepted_at TIMESTAMPTZ,
      stripe_checkout_session_id TEXT,
      stripe_payment_intent_id TEXT,
      customer_email_sent_at TIMESTAMPTZ,
      admin_email_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS priority_recoveries_created_idx ON priority_recoveries(created_at DESC);
    CREATE INDEX IF NOT EXISTS priority_recoveries_status_idx ON priority_recoveries(status);
    CREATE TABLE IF NOT EXISTS priority_recovery_settings(
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    INSERT INTO priority_recovery_settings(key,value)
      VALUES('availability','{"available":true}'::jsonb)
      ON CONFLICT(key) DO NOTHING;
`;
insertBefore('    CREATE TABLE IF NOT EXISTS seasonal_campaigns(', migration, 'migration anchor');

const helpers = `
// --- Kent Track Priority Recovery ---
const PRIORITY_RECOVERY_PRICE_PENCE = 70000;
const PRIORITY_RECOVERY_INCLUDED_MILES = 100;
const PRIORITY_RECOVERY_TERMS_VERSION = '2026-10-07-v1.2';
const PRIORITY_RECOVERY_VENUES = {
  brands_hatch: { id:'brands_hatch', name:'Brands Hatch', postcode:'TN15 6FS' },
  lydden_hill: { id:'lydden_hill', name:'Lydden Hill', postcode:'CT4 6ET' }
};

async function priorityRecoveryAvailable() {
  const { rows } = await pool.query("SELECT value FROM priority_recovery_settings WHERE key='availability' LIMIT 1");
  return rows[0]?.value?.available !== false;
}
function priorityEsc(v='') { return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function priorityGbp(p) { return new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(p||0)/100); }
async function priorityRecoveryMail(id) {
  if (typeof EMAIL_ENABLED === 'undefined' || !EMAIL_ENABLED || typeof txMail !== 'function') return false;
  const q = await pool.query('SELECT * FROM priority_recoveries WHERE public_id=$1 LIMIT 1',[id]);
  const r = q.rows[0];
  if (!r || r.status !== 'paid_priority') return false;
  const details = '<p><b>Reference:</b> '+priorityEsc(r.public_id)+'<br><b>Venue:</b> '+priorityEsc(r.venue_name||r.venue_id)+'<br><b>Collection:</b> '+priorityEsc(r.collection_location)+'<br><b>Vehicle:</b> '+priorityEsc(r.vehicle_details)+'<br><b>Condition:</b> '+priorityEsc(r.condition_details)+'<br><b>Destination:</b> '+priorityEsc(r.destination)+'<br><b>Customer phone:</b> '+priorityEsc(r.customer_phone)+'<br><b>Price paid:</b> '+priorityGbp(r.amount_total)+'</p><p><b>Included limit:</b> up to '+PRIORITY_RECOVERY_INCLUDED_MILES+' suitable-route miles from the agreed Kent motorsport collection venue.</p>';
  let sent = false;
  if (r.customer_email && !r.customer_email_sent_at) {
    const lock = await pool.query('UPDATE priority_recoveries SET customer_email_sent_at=now(),updated_at=now() WHERE public_id=$1 AND customer_email_sent_at IS NULL RETURNING 1',[id]);
    if (lock.rowCount) {
      try {
        await txMail(r.customer_email,'Priority Recovery request received — '+r.public_id,'<p>Your £700 Kent Track Priority Recovery payment has been received and your request has been marked for priority handling.</p>'+details+'<p>Please keep your phone available. Priority Recovery remains subject to operational availability, safe/legal access, vehicle suitability, equipment capability and the standard Afiléon Motorsport Vehicle Recovery Terms.</p>','Priority Recovery payment received. Reference: '+r.public_id+'\nVenue: '+String(r.venue_name||r.venue_id)+'\nCollection: '+String(r.collection_location)+'\nVehicle: '+String(r.vehicle_details)+'\nCondition: '+String(r.condition_details)+'\nDestination: '+String(r.destination)+'\nPrice paid: £700.00\nIncluded limit: up to 100 suitable-route miles. Please keep your phone available. Standard Vehicle Recovery Terms apply.');
        sent = true;
      } catch (e) {
        await pool.query('UPDATE priority_recoveries SET customer_email_sent_at=NULL WHERE public_id=$1',[id]);
        console.error('priority customer email failed',e.message);
      }
    }
  }
  const adminTo = (typeof EMAIL_REPLY_TO !== 'undefined' && EMAIL_REPLY_TO) ? EMAIL_REPLY_TO : 'team@afileonmotorsport.co.uk';
  if (adminTo && !r.admin_email_sent_at) {
    const lock = await pool.query('UPDATE priority_recoveries SET admin_email_sent_at=now(),updated_at=now() WHERE public_id=$1 AND admin_email_sent_at IS NULL RETURNING 1',[id]);
    if (lock.rowCount) {
      try {
        await txMail(adminTo,'URGENT — £700 PRIORITY RECOVERY PAID — '+String(r.venue_name||r.venue_id),'<p><b>A paid Priority Recovery request needs attention.</b></p>'+details+'<p><b>Customer:</b> '+priorityEsc(r.customer_name)+'<br><b>Email:</b> '+priorityEsc(r.customer_email)+'</p>','URGENT PRIORITY RECOVERY PAID\nReference: '+r.public_id+'\nCustomer: '+String(r.customer_name)+'\nPhone: '+String(r.customer_phone)+'\nVenue: '+String(r.venue_name||r.venue_id)+'\nCollection: '+String(r.collection_location)+'\nVehicle: '+String(r.vehicle_details)+'\nCondition: '+String(r.condition_details)+'\nDestination: '+String(r.destination)+'\nPaid: £700.00');
        sent = true;
      } catch (e) {
        await pool.query('UPDATE priority_recoveries SET admin_email_sent_at=NULL WHERE public_id=$1',[id]);
        console.error('priority admin email failed',e.message);
      }
    }
  }
  return sent;
}
`;
insertBefore("app.post('/api/stripe/webhook'", helpers, 'webhook anchor for helpers');

const webhook = `
    if (event.type === 'checkout.session.completed' && o.metadata?.kind === 'priority_recovery') {
      await pool.query(\`UPDATE priority_recoveries SET status='paid_priority',stripe_payment_intent_id=$1,updated_at=now() WHERE public_id=$2\`,[o.payment_intent||null,o.metadata.recovery_id]);
      await priorityRecoveryMail(o.metadata.recovery_id).catch(e=>console.error('priority recovery email failed',e.message));
    }
    if (event.type === 'checkout.session.expired' && o.metadata?.kind === 'priority_recovery') {
      await pool.query(\`UPDATE priority_recoveries SET status='checkout_expired',updated_at=now() WHERE public_id=$1 AND status='checkout_pending'\`,[o.metadata.recovery_id]);
    }
`;
insertBefore("    if (event.type === 'checkout.session.completed' && o.metadata?.kind === 'shop_order') {", webhook, 'shop webhook anchor');

const publicRoutes = `
app.get('/api/priority-recovery/status', async (_req,res) => {
  try {
    const available = await priorityRecoveryAvailable();
    res.json({
      available,
      price_pence: PRIORITY_RECOVERY_PRICE_PENCE,
      price_display: '£700',
      included_suitable_route_miles: PRIORITY_RECOVERY_INCLUDED_MILES,
      venues: [
        PRIORITY_RECOVERY_VENUES.brands_hatch,
        PRIORITY_RECOVERY_VENUES.lydden_hill,
        { id:'other_kent', name:'Other eligible Kent motorsport venue', postcode:null }
      ],
      terms_version: PRIORITY_RECOVERY_TERMS_VERSION,
      terms_url: SITE_URL+'/vehicle-recovery-terms.html'
    });
  } catch (e) {
    console.error(e);
    res.status(503).json({error:'priority_recovery_status_unavailable'});
  }
});

app.post('/api/priority-recovery/checkout', async (req,res) => {
  if (!stripe) return res.status(503).json({error:'stripe_not_configured'});
  try {
    if (!(await priorityRecoveryAvailable())) return res.status(409).json({error:'priority_recovery_unavailable',detail:'Priority Recovery is currently unavailable. Please use Standard Recovery by Call or WhatsApp.'});
    const b=req.body||{};
    const customerName=clean(b.customer_name,120), customerEmail=clean(b.customer_email,200).toLowerCase(), customerPhone=clean(b.customer_phone,60);
    const venueId=clean(b.venue_id,60), collection=clean(b.collection_location,500), vehicle=clean(b.vehicle_details,500), condition=clean(b.condition_details,1000), destination=clean(b.destination,700);
    if(!customerName || !customerEmail || !customerEmail.includes('@') || !customerPhone) return res.status(400).json({error:'contact_details_required',detail:'Name, mobile number and a valid email address are required.'});
    if(!collection || !vehicle || !condition || !destination) return res.status(400).json({error:'recovery_details_required',detail:'Collection point, vehicle, condition and destination are required.'});
    if(b.within_100_miles_confirmed!==true) return res.status(400).json({error:'mileage_limit_confirmation_required',detail:'Please confirm the destination is believed to be within the included 100 suitable-route miles.'});
    if(b.terms_accepted!==true) return res.status(400).json({error:'terms_acceptance_required',detail:'Please accept the Vehicle Recovery Terms before payment.'});
    let venueName='', venuePostcode='';
    if(PRIORITY_RECOVERY_VENUES[venueId]) {
      venueName=PRIORITY_RECOVERY_VENUES[venueId].name;
      venuePostcode=PRIORITY_RECOVERY_VENUES[venueId].postcode;
    } else if(venueId==='other_kent') {
      venueName=clean(b.venue_name,160);
      venuePostcode=clean(b.venue_postcode,20);
      if(!venueName || !venuePostcode) return res.status(400).json({error:'kent_venue_required',detail:'Enter the Kent motorsport venue name and postcode.'});
      const k=await validateKentPostcode(venuePostcode);
      if(!k.ok) return res.status(400).json({error:k.reason||'outside_kent',detail:'Priority Recovery is currently limited to eligible motorsport venues in Kent.'});
      venuePostcode=k.postcode||venuePostcode;
    } else return res.status(400).json({error:'eligible_venue_required',detail:'Choose Brands Hatch, Lydden Hill or another eligible Kent motorsport venue.'});

    const id=token('pr');
    await pool.query(\`INSERT INTO priority_recoveries(public_id,status,customer_name,customer_email,customer_phone,venue_id,venue_name,venue_postcode,collection_location,vehicle_details,condition_details,destination,amount_total,terms_version,terms_accepted_at) VALUES($1,'checkout_pending',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())\`,[id,customerName,customerEmail,customerPhone,venueId,venueName,venuePostcode,collection,vehicle,condition,destination,PRIORITY_RECOVERY_PRICE_PENCE,PRIORITY_RECOVERY_TERMS_VERSION]);
    try {
      const expiresAt=Math.floor(Date.now()/1000)+1800;
      const session=await stripe.checkout.sessions.create({
        mode:'payment',
        customer_email:customerEmail,
        customer_creation:'always',
        success_url: SITE_URL+'/priority-recovery-success.html?recovery='+encodeURIComponent(id)+'&session_id={CHECKOUT_SESSION_ID}',
        cancel_url: SITE_URL+'/vehicle-recovery.html?priority_cancelled=1',
        automatic_tax:{enabled:true},
        billing_address_collection:'required',
        phone_number_collection:{enabled:true},
        expires_at:expiresAt,
        line_items:[{quantity:1,price_data:{currency:'gbp',unit_amount:PRIORITY_RECOVERY_PRICE_PENCE,tax_behavior:'inclusive',product_data:{name:'Kent Track Priority Recovery',description:'Priority recovery from an eligible Kent motorsport venue with delivery up to 100 suitable-route miles. Subject to availability, vehicle suitability and standard Vehicle Recovery Terms.'}}}],
        metadata:{kind:'priority_recovery',recovery_id:id,venue_id:venueId,terms_version:PRIORITY_RECOVERY_TERMS_VERSION},
        payment_intent_data:{metadata:{kind:'priority_recovery',recovery_id:id}},
        consent_collection:{terms_of_service:'required'},
        custom_text:{submit:{message:'£700 fixed Priority Recovery. Includes up to 100 suitable-route miles from the eligible Kent collection venue. Standard Vehicle Recovery Terms apply.'}}
      },{idempotencyKey:'priority_recovery_'+id});
      await pool.query('UPDATE priority_recoveries SET stripe_checkout_session_id=$1,updated_at=now() WHERE public_id=$2',[session.id,id]);
      res.status(201).json({recovery_id:id,checkout_url:session.url,price_pence:PRIORITY_RECOVERY_PRICE_PENCE,included_suitable_route_miles:PRIORITY_RECOVERY_INCLUDED_MILES});
    } catch (e) {
      await pool.query("UPDATE priority_recoveries SET status='checkout_failed',updated_at=now() WHERE public_id=$1",[id]);
      throw e;
    }
  } catch (e) {
    console.error(e);
    if (res.headersSent) return;
    res.status(500).json({error:'priority_recovery_checkout_failed',detail:'Secure Priority Recovery checkout could not be started. Please call or WhatsApp Afiléon Motorsport.'});
  }
});
`;
insertBefore("app.get('/api/season'", publicRoutes, 'season route anchor');

const adminRoutes = `
app.get('/api/admin/priority-recovery', admin, async (_req,res) => {
  try {
    const available=await priorityRecoveryAvailable();
    const {rows}=await pool.query(\`SELECT public_id,status,customer_name,customer_email,customer_phone,venue_id,venue_name,venue_postcode,collection_location,vehicle_details,condition_details,destination,amount_total,terms_version,terms_accepted_at,created_at,updated_at FROM priority_recoveries ORDER BY created_at DESC LIMIT 100\`);
    res.json({available,price_pence:PRIORITY_RECOVERY_PRICE_PENCE,included_suitable_route_miles:PRIORITY_RECOVERY_INCLUDED_MILES,requests:rows});
  } catch(e) { console.error(e); res.status(500).json({error:'priority_recovery_admin_load_failed'}); }
});
app.post('/api/admin/priority-recovery/availability', admin, async (req,res) => {
  try {
    if(typeof req.body?.available!=='boolean') return res.status(400).json({error:'boolean_available_required'});
    const available=!!req.body.available;
    await pool.query(\`INSERT INTO priority_recovery_settings(key,value,updated_at) VALUES('availability',$1::jsonb,now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()\`,[JSON.stringify({available})]);
    res.json({ok:true,available});
  } catch(e) { console.error(e); res.status(500).json({error:'priority_recovery_availability_update_failed'}); }
});
`;
insertBefore("app.post('/api/admin/block-date'", adminRoutes, 'admin route anchor');

fs.writeFileSync(path, s);
console.log('Applied Kent Track Priority Recovery £700 fixed checkout and admin availability control.');
