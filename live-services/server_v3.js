import express from 'express';
import cors from 'cors';
import pg from 'pg';
import Stripe from 'stripe';
import crypto from 'crypto';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const SITE_URL = process.env.SITE_URL || 'https://afileonmotorsport.co.uk';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const CRON_SECRET = process.env.CRON_SECRET || '';
const HOLD_MINUTES = Number(process.env.BOOKING_HOLD_MINUTES || 20);
const LICENCE_EMAIL = process.env.LICENCE_EMAIL || 'contact@afileonmotorsport.co.uk';
const E46_BOOKING_LIVE = String(process.env.E46_BOOKING_LIVE || 'false').toLowerCase() === 'true';

const SERVICES = [
  {
    id: 'pre_track_inspection',
    name: 'Comprehensive Pre-Track-Day Inspection',
    colour: '#8b5cf6',
    duration: 'full_day',
    variants: [{ id: 'standard', label: 'Inspection', price: 12000 }],
    payment: 'full',
    kentOnly: true,
    addressRequired: true,
    hardstandingRequired: true,
    bookable: true,
    description: 'Mobile pre-track readiness inspection in Kent. Includes underbody access where safe, wheel-off visual checks, brakes, tyres, steering/suspension observations and fluid-level checks. Customer supplies any fluids, parts or consumables required unless agreed otherwise.'
  },
  {
    id: 'vehicle_hire_day',
    name: 'BMW E46 Track-Day Hire — Full Day',
    colour: '#22d3ee',
    duration: 'full_day',
    variants: [{ id: 'full_day', label: 'Full day', price: 70000 }],
    payment: 'e46_rule',
    licenceRequired: true,
    bookable: E46_BOOKING_LIVE,
    description: 'Full-day BMW E46 track-day hire. One full tank of fuel is included. Circuit entry, additional fuel and optional extras are excluded unless specifically stated. Booking is subject to licence review, event eligibility and hire terms.'
  },
  {
    id: 'track_day_support',
    name: 'Track-Day Support & Mechanical Assistance',
    colour: '#f59e0b',
    duration: 'full_day',
    variants: [
      { id: 'half_day', label: 'Half day', price: 30000 },
      { id: 'full_day', label: 'Full day', price: 50000 }
    ],
    payment: 'full',
    bookable: true,
    description: 'Dedicated trackside support for your own car, including routine checks, tyre-pressure adjustments, wheel changes, minor adjustments and basic fault finding. Parts, tyres, fluids, fuel, major repairs and fabrication are extra. Half-day bookings still reserve the calendar day because of travel and setup time.'
  },
  {
    id: 'race_day_support',
    name: 'Race-Day Support',
    colour: '#ef4444',
    duration: 'full_day',
    variants: [{ id: 'quote', label: 'Quote required', price: null }],
    payment: 'quote',
    bookable: true,
    description: 'Race-day paddock support tailored to the event, vehicle and travel requirements.'
  },
  {
    id: 'vehicle_transport',
    name: 'Vehicle Transport',
    colour: '#3b82f6',
    duration: 'full_day',
    variants: [{ id: 'quote', label: 'Quote required', price: null }],
    payment: 'quote',
    addressRequired: true,
    bookable: true,
    description: 'Trailer transport for suitable vehicles. Price is quoted from collection point, destination, vehicle details and timing.'
  },
  {
    id: 'full_package',
    name: 'Full Track-Day Package',
    colour: '#facc15',
    duration: 'full_day',
    variants: [{ id: 'quote', label: 'Quote required', price: null }],
    payment: 'quote',
    bookable: true,
    description: 'Combined vehicle, transport and support package. Quoted to suit the circuit, travel and customer requirements.'
  }
];

const SERVICE_MAP = new Map(SERVICES.map(s => [s.id, s]));
const token = (prefix = 'id') => `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
const isoDate = d => new Date(d).toISOString().slice(0, 10);
const dayMs = 86400000;
const clean = (v, n = 500) => String(v ?? '').trim().slice(0, n);
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const todayUtc = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
const daysUntil = date => Math.ceil((new Date(`${date}T00:00:00Z`) - todayUtc()) / dayMs);
const variantFor = (service, id) => service?.variants?.find(v => v.id === (id || service.variants?.[0]?.id)) || null;
const publicService = s => ({ ...s });

const KENT_DISTRICTS = new Set([
  'Ashford','Canterbury','Dartford','Dover','Folkestone and Hythe','Gravesham',
  'Maidstone','Medway','Sevenoaks','Swale','Thanet','Tonbridge and Malling','Tunbridge Wells'
]);

async function validateKentPostcode(postcode) {
  const pc = clean(postcode, 12).replace(/\s+/g, '').toUpperCase();
  if (!pc) return { ok: false, reason: 'postcode_required' };
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 3500);
    const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, { signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return { ok: false, reason: 'postcode_not_found' };
    const j = await r.json();
    const x = j.result || {};
    const county = String(x.admin_county || '');
    const district = String(x.admin_district || '');
    const ok = county === 'Kent' || KENT_DISTRICTS.has(district);
    return { ok, reason: ok ? null : 'outside_kent', district, county, postcode: x.postcode || postcode };
  } catch {
    return { ok: false, reason: 'postcode_validation_unavailable' };
  }
}

function paymentPlan(service, variant, date) {
  const total = variant?.price;
  if (total == null || service.payment === 'quote') return { kind: 'quote', total: null, now: null, balance: null };
  if (service.payment === 'full') return { kind: 'full', total, now: total, balance: 0 };
  if (service.payment === 'e46_rule') {
    const d = daysUntil(date);
    if (d <= 7) return { kind: 'full', total, now: total, balance: 0 };
    return { kind: 'deposit_then_balance', total, now: 25000, balance: total - 25000, balanceNoticeDays: 10, balanceDueDays: 7 };
  }
  return { kind: 'quote', total: null, now: null, balance: null };
}

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings(
      id BIGSERIAL PRIMARY KEY,
      public_id TEXT UNIQUE NOT NULL,
      service_id TEXT NOT NULL,
      variant_id TEXT,
      booking_date DATE NOT NULL,
      customer_name TEXT,
      customer_email TEXT,
      customer_phone TEXT,
      service_address TEXT,
      postcode TEXT,
      vehicle_details TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'hold',
      hold_expires_at TIMESTAMPTZ,
      stripe_checkout_session_id TEXT,
      stripe_payment_intent_id TEXT,
      stripe_customer_id TEXT,
      stripe_balance_invoice_id TEXT,
      amount_total INTEGER,
      amount_paid INTEGER DEFAULT 0,
      booking_payment_amount INTEGER,
      balance_amount INTEGER DEFAULT 0,
      balance_notice_at TIMESTAMPTZ,
      balance_due_at TIMESTAMPTZ,
      balance_status TEXT,
      licence_required BOOLEAN NOT NULL DEFAULT false,
      licence_status TEXT,
      safe_work_area_confirmed BOOLEAN NOT NULL DEFAULT false,
      terms_version TEXT,
      terms_accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS safe_work_area_confirmed BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS terms_version TEXT;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS bookings_date_idx ON bookings(booking_date);
    CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status);

    CREATE TABLE IF NOT EXISTS availability_blocks(
      id BIGSERIAL PRIMARY KEY,
      block_date DATE NOT NULL,
      service_id TEXT,
      label TEXT NOT NULL,
      colour TEXT NOT NULL DEFAULT '#64748b',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS quote_requests(
      id BIGSERIAL PRIMARY KEY,
      public_id TEXT UNIQUE NOT NULL,
      service_id TEXT NOT NULL,
      variant_id TEXT,
      requested_date DATE,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      service_address TEXT,
      postcode TEXT,
      vehicle_details TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS shop_products(
      id BIGSERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER,
      stripe_price_id TEXT,
      image_url TEXT,
      stock INTEGER,
      active BOOLEAN NOT NULL DEFAULT true,
      featured BOOLEAN NOT NULL DEFAULT false,
      collection TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS orders(
      id BIGSERIAL PRIMARY KEY,
      public_id TEXT UNIQUE NOT NULL,
      customer_email TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      total INTEGER,
      stripe_checkout_session_id TEXT,
      stripe_payment_intent_id TEXT,
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      stock_reserved BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN NOT NULL DEFAULT false;

    CREATE TABLE IF NOT EXISTS seasonal_campaigns(
      id BIGSERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      headline TEXT,
      message TEXT,
      accent TEXT,
      background_effect TEXT,
      banner_url TEXT,
      shop_collection TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

function admin(req, res, next) {
  if (!ADMIN_TOKEN || req.get('x-admin-token') !== ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  next();
}
function cronAuth(req, res, next) {
  if (!CRON_SECRET || req.get('x-cron-secret') !== CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });
  next();
}

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).send('Stripe webhook not configured');
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); }
  catch (e) { return res.status(400).send(`Webhook Error: ${e.message}`); }
  try {
    const o = event.data.object;
    if (event.type === 'checkout.session.completed' && o.metadata?.kind === 'service_booking') {
      const { rows } = await pool.query('SELECT service_id FROM bookings WHERE public_id=$1', [o.metadata.booking_id]);
      const hire = rows[0]?.service_id === 'vehicle_hire_day';
      await pool.query(`UPDATE bookings SET status=$1,stripe_payment_intent_id=$2,stripe_customer_id=$3,amount_paid=COALESCE(amount_paid,0)+COALESCE(booking_payment_amount,0),licence_status=CASE WHEN licence_required THEN 'awaiting_email' ELSE licence_status END,updated_at=now() WHERE public_id=$4`, [hire ? 'confirmed_pending_licence' : 'confirmed', o.payment_intent || null, o.customer || null, o.metadata.booking_id]);
    }
    if (event.type === 'checkout.session.completed' && o.metadata?.kind === 'shop_order') {
      await pool.query(`UPDATE orders SET status='paid',stock_reserved=false,stripe_payment_intent_id=$1,customer_email=COALESCE(customer_email,$2),updated_at=now() WHERE public_id=$3`, [o.payment_intent || null, o.customer_details?.email || null, o.metadata.order_id]);
    }
    if (event.type === 'checkout.session.expired' && o.metadata?.kind === 'service_booking') {
      await pool.query(`UPDATE bookings SET status='expired',updated_at=now() WHERE public_id=$1 AND status='hold'`, [o.metadata.booking_id]);
    }
    if (event.type === 'checkout.session.expired' && o.metadata?.kind === 'shop_order') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT items,stock_reserved FROM orders WHERE public_id=$1 FOR UPDATE`, [o.metadata.order_id]);
        const order = rows[0];
        if (order?.stock_reserved) {
          for (const item of order.items || []) {
            const q = Math.max(1, Math.min(20, Number(item.quantity || 1)));
            await client.query(`UPDATE shop_products SET stock=CASE WHEN stock IS NULL THEN NULL ELSE stock+$1 END,updated_at=now() WHERE slug=$2`, [q, clean(item.slug, 100)]);
          }
          await client.query(`UPDATE orders SET status='expired',stock_reserved=false,updated_at=now() WHERE public_id=$1`, [o.metadata.order_id]);
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
    }
    if (event.type === 'invoice.paid' && o.metadata?.kind === 'service_balance') {
      await pool.query(`UPDATE bookings SET balance_status='paid',amount_paid=amount_total,status=CASE WHEN licence_required AND licence_status<>'approved' THEN 'confirmed_pending_licence' ELSE 'confirmed' END,updated_at=now() WHERE public_id=$1`, [o.metadata.booking_id]);
    }
    if (event.type === 'invoice.payment_failed' && o.metadata?.kind === 'service_balance') {
      await pool.query(`UPDATE bookings SET balance_status='payment_failed',updated_at=now() WHERE public_id=$1`, [o.metadata.booking_id]);
    }
    res.json({ received: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'webhook_processing_failed' }); }
});

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));
app.use((_q, r, n) => { r.set('Cache-Control', 'no-store'); n(); });

app.get('/health', async (_q, r) => {
  try { await pool.query('select 1'); r.json({ ok: true, stripe: !!stripe, version: 'live-services-v3' }); }
  catch { r.status(503).json({ ok: false }); }
});

app.get('/api/config', async (_q, r) => {
  const { rows } = await pool.query(`SELECT slug,name,headline,message,accent,background_effect,banner_url,shop_collection,starts_at,ends_at FROM seasonal_campaigns WHERE active=true AND now() BETWEEN starts_at AND ends_at ORDER BY starts_at DESC LIMIT 1`);
  r.json({ services: SERVICES.map(publicService), season: rows[0] || null, rolling_months: 6, currency: 'GBP', licence_email: LICENCE_EMAIL, terms_version: '2026-09-26-v9', cancellation_note: 'Cancellation, rescheduling and refund rights are governed by the General Booking Terms v9 and applicable consumer law. Customer-caused cancellation or failed eligibility may result in retention of the booking deposit, limited to reasonable direct net loss and unrecoverable committed costs. Contact Afiléon Motorsport as soon as possible if plans change.' });
});
app.get('/api/services', (_q, r) => r.json({ services: SERVICES.map(publicService) }));

app.get('/api/availability', async (req, res) => {
  const months = Math.max(1, Math.min(6, Number(req.query.months || 6)));
  await pool.query(`UPDATE bookings SET status='expired',updated_at=now() WHERE status='hold' AND hold_expires_at<now()`);
  const { rows } = await pool.query(`SELECT booking_date::text date,service_id,status,'booking' kind FROM bookings WHERE booking_date>=CURRENT_DATE AND booking_date<(CURRENT_DATE+($1||' months')::interval) AND (status IN ('confirmed','confirmed_pending_licence') OR (status='hold' AND hold_expires_at>now()) OR balance_status IN ('invoiced','payment_failed')) UNION ALL SELECT block_date::text,COALESCE(service_id,''),'blocked','block' FROM availability_blocks WHERE block_date>=CURRENT_DATE AND block_date<(CURRENT_DATE+($1||' months')::interval) ORDER BY date`, [months]);
  res.json({ months, busy: rows });
});

app.post('/api/quotes', async (req, res) => {
  const b = req.body || {};
  const service = SERVICE_MAP.get(b.service_id);
  if (!service || service.payment !== 'quote') return res.status(400).json({ error: 'quote_not_required' });
  if (!clean(b.customer_name,120) || !clean(b.customer_email,200)) return res.status(400).json({ error: 'name_and_email_required' });
  if (b.requested_date && !isDate(b.requested_date)) return res.status(400).json({ error: 'invalid_date' });
  const id = token('qt');
  await pool.query(`INSERT INTO quote_requests(public_id,service_id,variant_id,requested_date,customer_name,customer_email,customer_phone,service_address,postcode,vehicle_details,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id,service.id,clean(b.variant_id,60)||null,b.requested_date||null,clean(b.customer_name,120),clean(b.customer_email,200),clean(b.customer_phone,60),clean(b.service_address,500),clean(b.postcode,20),clean(b.vehicle_details,500),clean(b.notes,1500)]);
  res.status(201).json({ quote_id: id, status: 'received' });
});

app.post('/api/bookings/hold', async (req, res) => {
  const b = req.body || {};
  const service = SERVICE_MAP.get(b.service_id);
  if (!service) return res.status(400).json({ error: 'unknown_service' });
  if (service.bookable === false) return res.status(409).json({ error: 'service_not_live', detail: 'This service is not taking online bookings yet. Please contact Afiléon Motorsport.' });
  if (!isDate(b.booking_date)) return res.status(400).json({ error: 'invalid_date' });
  const variant = variantFor(service, b.variant_id);
  if (!variant) return res.status(400).json({ error: 'unknown_variant' });
  const du = daysUntil(b.booking_date);
  if (du < 0 || du >= 184) return res.status(400).json({ error: 'date_outside_booking_window' });
  if (!clean(b.customer_name,120) || !clean(b.customer_email,200) || !clean(b.customer_phone,60)) return res.status(400).json({ error: 'contact_details_required' });
  if (service.addressRequired && (!clean(b.service_address) || !clean(b.postcode))) return res.status(400).json({ error: 'service_address_required' });
  if (service.hardstandingRequired && b.safe_work_area_confirmed !== true) return res.status(400).json({ error: 'safe_work_area_confirmation_required', detail: 'Please confirm the vehicle will be on safe, level, off-road hardstanding with enough room to jack the vehicle and remove wheels.' });
  if (service.kentOnly) {
    const k = await validateKentPostcode(b.postcode);
    if (!k.ok) return res.status(400).json({ error: k.reason, detail: 'This mobile inspection is currently available only at addresses in Kent.' });
  }
  const plan = paymentPlan(service, variant, b.booking_date);
  if (plan.kind === 'quote') return res.status(400).json({ error: 'quote_required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [b.booking_date]);
    await client.query(`UPDATE bookings SET status='expired',updated_at=now() WHERE booking_date=$1 AND status='hold' AND hold_expires_at<now()`, [b.booking_date]);
    const busy = await client.query(`SELECT 1 FROM bookings WHERE booking_date=$1 AND (status IN ('confirmed','confirmed_pending_licence') OR (status='hold' AND hold_expires_at>now()) OR balance_status IN ('invoiced','payment_failed')) LIMIT 1`, [b.booking_date]);
    const block = await client.query(`SELECT 1 FROM availability_blocks WHERE block_date=$1 LIMIT 1`, [b.booking_date]);
    if (busy.rowCount || block.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'date_unavailable' }); }
    const id = token('bk');
    const expires = new Date(Date.now() + HOLD_MINUTES * 60000);
    let notice = null, due = null;
    if (plan.kind === 'deposit_then_balance') { const d = new Date(`${b.booking_date}T12:00:00Z`); notice = new Date(d.getTime() - plan.balanceNoticeDays * dayMs); due = new Date(d.getTime() - plan.balanceDueDays * dayMs); }
    await client.query(`INSERT INTO bookings(public_id,service_id,variant_id,booking_date,customer_name,customer_email,customer_phone,service_address,postcode,vehicle_details,notes,status,hold_expires_at,amount_total,booking_payment_amount,balance_amount,balance_notice_at,balance_due_at,balance_status,licence_required,licence_status,safe_work_area_confirmed,terms_version,terms_accepted_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'hold',$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,now())`, [id,service.id,variant.id,b.booking_date,clean(b.customer_name,120),clean(b.customer_email,200),clean(b.customer_phone,60),clean(b.service_address,500),clean(b.postcode,20),clean(b.vehicle_details,500),clean(b.notes,1000),expires,plan.total,plan.now,plan.balance,notice,due,plan.balance?'scheduled':null,!!service.licenceRequired,service.licenceRequired?'required':null,!!b.safe_work_area_confirmed,'2026-09-26-v9']);
    await client.query('COMMIT');
    res.status(201).json({ booking_id:id, hold_expires_at:expires, service:publicService(service), variant, payment_plan:plan, checkout_available:true, licence_email:service.licenceRequired?LICENCE_EMAIL:null });
  } catch (e) { await client.query('ROLLBACK'); console.error(e); res.status(500).json({ error: 'booking_hold_failed' }); }
  finally { client.release(); }
});

app.post('/api/bookings/:id/checkout', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'stripe_not_configured' });
  const { rows } = await pool.query(`SELECT * FROM bookings WHERE public_id=$1 LIMIT 1`, [req.params.id]);
  const b = rows[0];
  if (!b) return res.status(404).json({ error: 'booking_not_found' });
  if (b.status !== 'hold' || new Date(b.hold_expires_at) < new Date()) return res.status(409).json({ error: 'booking_hold_expired' });
  const service = SERVICE_MAP.get(b.service_id), variant = variantFor(service, b.variant_id);
  if (!service || !variant || !b.booking_payment_amount) return res.status(400).json({ error: 'quote_required' });
  const isDeposit = Number(b.balance_amount) > 0;
  const label = isDeposit ? `${service.name} — reservation payment` : service.name;
  const desc = isDeposit ? `Reserves ${isoDate(b.booking_date)}. Remaining balance is due 7 days before the booking.` : `Payment for ${isoDate(b.booking_date)}.`;
  try {
    const session = await stripe.checkout.sessions.create({ mode:'payment', customer_email:b.customer_email||undefined, customer_creation:'always', success_url:`${SITE_URL}/booking-success.html?booking=${encodeURIComponent(b.public_id)}&session_id={CHECKOUT_SESSION_ID}`, cancel_url:`${SITE_URL}/book.html?cancelled=1&booking=${encodeURIComponent(b.public_id)}`, automatic_tax:{enabled:true}, billing_address_collection:'required', phone_number_collection:{enabled:true}, expires_at:Math.floor(new Date(b.hold_expires_at).getTime()/1000), line_items:[{quantity:1,price_data:{currency:'gbp',unit_amount:Number(b.booking_payment_amount),tax_behavior:'exclusive',product_data:{name:label,description:desc}}}], metadata:{kind:'service_booking',booking_id:b.public_id,service_id:b.service_id,variant_id:b.variant_id,booking_date:isoDate(b.booking_date)}, payment_intent_data:{metadata:{kind:'service_booking',booking_id:b.public_id,service_id:b.service_id}}, consent_collection:{terms_of_service:'required'}, custom_text:{submit:{message:service.licenceRequired?`After payment, email a clear photo of the driver's valid driving licence to ${LICENCE_EMAIL}. Booking remains subject to the hire terms and eligibility checks.`:'Your date is confirmed after payment succeeds.'}} }, { idempotencyKey:`checkout_${b.public_id}` });
    await pool.query(`UPDATE bookings SET stripe_checkout_session_id=$1,updated_at=now() WHERE public_id=$2`, [session.id,b.public_id]);
    res.json({ checkout_url:session.url, session_id:session.id });
  } catch (e) { console.error(e); res.status(500).json({ error:'checkout_creation_failed' }); }
});

app.get('/api/bookings/:id', async (req,res) => {
  const { rows } = await pool.query(`SELECT public_id,service_id,variant_id,booking_date::text booking_date,status,amount_total,amount_paid,booking_payment_amount,balance_amount,balance_due_at,balance_status,licence_status,created_at,updated_at FROM bookings WHERE public_id=$1 LIMIT 1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error:'not_found' });
  res.json(rows[0]);
});

app.get('/api/shop/products', async (_q,res) => { const { rows } = await pool.query(`SELECT slug,name,description,price,image_url,stock,featured,collection FROM shop_products WHERE active=true ORDER BY featured DESC,name`); res.json({ products:rows }); });

app.post('/api/shop/checkout', async (req,res) => {
  if (!stripe) return res.status(503).json({ error:'stripe_not_configured' });
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error:'empty_basket' });
  const client = await pool.connect();
  let id, total = 0, lines = [];
  try {
    await client.query('BEGIN');
    const slugs = [...new Set(items.map(x => clean(x.slug,100)).filter(Boolean))];
    const { rows } = await client.query(`SELECT slug,name,price,stock FROM shop_products WHERE active=true AND slug=ANY($1::text[]) FOR UPDATE`, [slugs]);
    const map = new Map(rows.map(x => [x.slug,x]));
    for (const x of items) {
      const p = map.get(clean(x.slug,100));
      const q = Math.max(1,Math.min(20,Number(x.quantity||1)));
      if (!p || !Number.isInteger(p.price)) { await client.query('ROLLBACK'); return res.status(400).json({ error:'invalid_product' }); }
      if (p.stock != null && p.stock < q) { await client.query('ROLLBACK'); return res.status(409).json({ error:'insufficient_stock', slug:p.slug }); }
      total += p.price*q;
      lines.push({ quantity:q, price_data:{ currency:'gbp', unit_amount:p.price, tax_behavior:'exclusive', product_data:{ name:p.name } } });
      if (p.stock != null) await client.query(`UPDATE shop_products SET stock=stock-$1,updated_at=now() WHERE slug=$2`, [q,p.slug]);
    }
    id = token('ord');
    await client.query(`INSERT INTO orders(public_id,status,total,items,stock_reserved) VALUES($1,'pending',$2,$3::jsonb,true)`, [id,total,JSON.stringify(items)]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); console.error(e); return res.status(500).json({ error:'stock_reservation_failed' }); }
  finally { client.release(); }
  try {
    const s = await stripe.checkout.sessions.create({ mode:'payment', success_url:`${SITE_URL}/shop-success.html?order=${id}&session_id={CHECKOUT_SESSION_ID}`, cancel_url:`${SITE_URL}/shop.html?cancelled=1`, automatic_tax:{enabled:true}, billing_address_collection:'required', shipping_address_collection:{allowed_countries:['GB']}, phone_number_collection:{enabled:true}, line_items:lines, metadata:{kind:'shop_order',order_id:id}, payment_intent_data:{metadata:{kind:'shop_order',order_id:id}} }, { idempotencyKey:`shop_${id}` });
    await pool.query(`UPDATE orders SET stripe_checkout_session_id=$1,updated_at=now() WHERE public_id=$2`, [s.id,id]);
    res.json({ order_id:id, checkout_url:s.url });
  } catch (e) {
    console.error(e);
    const client2 = await pool.connect();
    try {
      await client2.query('BEGIN');
      const { rows } = await client2.query(`SELECT items,stock_reserved FROM orders WHERE public_id=$1 FOR UPDATE`, [id]);
      if (rows[0]?.stock_reserved) {
        for (const item of rows[0].items || []) { const q=Math.max(1,Math.min(20,Number(item.quantity||1))); await client2.query(`UPDATE shop_products SET stock=CASE WHEN stock IS NULL THEN NULL ELSE stock+$1 END,updated_at=now() WHERE slug=$2`, [q,clean(item.slug,100)]); }
        await client2.query(`UPDATE orders SET status='failed',stock_reserved=false,updated_at=now() WHERE public_id=$1`, [id]);
      }
      await client2.query('COMMIT');
    } catch (e2) { await client2.query('ROLLBACK'); console.error(e2); }
    finally { client2.release(); }
    res.status(500).json({ error:'checkout_creation_failed' });
  }
});

app.get('/api/season', async (_q,res) => { const { rows } = await pool.query(`SELECT slug,name,headline,message,accent,background_effect,banner_url,shop_collection,starts_at,ends_at FROM seasonal_campaigns WHERE active=true AND now() BETWEEN starts_at AND ends_at ORDER BY starts_at DESC LIMIT 1`); res.json({ season:rows[0]||null }); });

app.post('/api/cron/balances', cronAuth, async (_req,res) => {
  if (!stripe) return res.status(503).json({ error:'stripe_not_configured' });
  const { rows } = await pool.query(`SELECT * FROM bookings WHERE balance_amount>0 AND balance_status='scheduled' AND balance_notice_at<=now() AND status IN ('confirmed','confirmed_pending_licence') ORDER BY balance_notice_at ASC LIMIT 50`);
  const results=[];
  for (const b of rows) {
    try {
      let customer=b.stripe_customer_id;
      if (!customer) { const c=await stripe.customers.create({email:b.customer_email||undefined,name:b.customer_name||undefined,phone:b.customer_phone||undefined,metadata:{booking_id:b.public_id}}); customer=c.id; }
      await stripe.invoiceItems.create({customer,amount:Number(b.balance_amount),currency:'gbp',description:`Afiléon Motorsport booking balance — ${isoDate(b.booking_date)}`,metadata:{kind:'service_balance',booking_id:b.public_id}});
      const invoice=await stripe.invoices.create({customer,collection_method:'send_invoice',days_until_due:3,auto_advance:true,automatic_tax:{enabled:true},metadata:{kind:'service_balance',booking_id:b.public_id}});
      await pool.query(`UPDATE bookings SET stripe_customer_id=$1,stripe_balance_invoice_id=$2,balance_status='invoiced',updated_at=now() WHERE public_id=$3`,[customer,invoice.id,b.public_id]);
      results.push({booking_id:b.public_id,invoice_id:invoice.id});
    } catch(e) { console.error(e); results.push({booking_id:b.public_id,error:'invoice_failed'}); }
  }
  res.json({processed:results.length,results});
});

app.post('/api/admin/block-date', admin, async (req,res) => { const {date,service_id,label,colour}=req.body||{}; if(!isDate(date)) return res.status(400).json({error:'invalid_date'}); await pool.query(`INSERT INTO availability_blocks(block_date,service_id,label,colour) VALUES($1,$2,$3,$4)`,[date,service_id||null,clean(label||'Unavailable',160),clean(colour||'#64748b',20)]); res.status(201).json({ok:true}); });
app.post('/api/admin/approve-licence', admin, async (req,res) => { await pool.query(`UPDATE bookings SET licence_status='approved',status=CASE WHEN balance_amount>0 AND balance_status<>'paid' THEN status ELSE 'confirmed' END,updated_at=now() WHERE public_id=$1`,[req.body?.booking_id]); res.json({ok:true}); });
app.post('/api/admin/season', admin, async (req,res) => { const b=req.body||{}; if(!b.slug||!b.name||!b.starts_at||!b.ends_at) return res.status(400).json({error:'missing_fields'}); await pool.query(`INSERT INTO seasonal_campaigns(slug,name,starts_at,ends_at,headline,message,accent,background_effect,banner_url,shop_collection,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,starts_at=excluded.starts_at,ends_at=excluded.ends_at,headline=excluded.headline,message=excluded.message,accent=excluded.accent,background_effect=excluded.background_effect,banner_url=excluded.banner_url,shop_collection=excluded.shop_collection,active=excluded.active,updated_at=now()`, [b.slug,b.name,b.starts_at,b.ends_at,b.headline||null,b.message||null,b.accent||null,b.background_effect||null,b.banner_url||null,b.shop_collection||null,b.active!==false]); res.json({ok:true}); });
app.post('/api/admin/shop-product', admin, async (req,res) => { const b=req.body||{}; if(!b.slug||!b.name) return res.status(400).json({error:'missing_fields'}); await pool.query(`INSERT INTO shop_products(slug,name,description,price,image_url,stock,active,featured,collection) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description,price=excluded.price,image_url=excluded.image_url,stock=excluded.stock,active=excluded.active,featured=excluded.featured,collection=excluded.collection,updated_at=now()`, [b.slug,b.name,b.description||null,Number.isInteger(b.price)?b.price:null,b.image_url||null,Number.isInteger(b.stock)?b.stock:null,b.active!==false,!!b.featured,b.collection||null]); res.json({ok:true}); });
app.get('/api/admin/summary', admin, async (_req,res) => { const [bookings,quotes,orders,seasons] = await Promise.all([ pool.query(`SELECT public_id,service_id,variant_id,booking_date::text booking_date,customer_name,customer_email,status,balance_status,licence_status,amount_total,amount_paid,created_at FROM bookings ORDER BY booking_date ASC LIMIT 250`), pool.query(`SELECT public_id,service_id,requested_date::text requested_date,customer_name,customer_email,status,created_at FROM quote_requests ORDER BY created_at DESC LIMIT 100`), pool.query(`SELECT public_id,customer_email,status,total,created_at FROM orders ORDER BY created_at DESC LIMIT 100`), pool.query(`SELECT slug,name,starts_at,ends_at,active FROM seasonal_campaigns ORDER BY starts_at DESC LIMIT 50`) ]); res.json({bookings:bookings.rows,quotes:quotes.rows,orders:orders.rows,seasons:seasons.rows}); });

app.get('/', (_q,res) => res.type('text').send('Afiléon Live Services API v3'));

migrate().then(()=>app.listen(port,'0.0.0.0',()=>console.log(`Afiléon Live Services v3 listening on ${port}`))).catch(e=>{console.error(e);process.exit(1)});
