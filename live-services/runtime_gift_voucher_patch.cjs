const fs = require('fs');
const path = 'server_v3.js';
let s = fs.readFileSync(path, 'utf8');

function mustReplace(from, to, label) {
  if (s.includes(to)) return;
  if (!s.includes(from)) throw new Error(`Gift voucher patch: missing ${label}`);
  s = s.replace(from, to);
}

if (!s.includes('CREATE TABLE IF NOT EXISTS gift_vouchers(')) {
  const marker = '    CREATE TABLE IF NOT EXISTS seasonal_campaigns(';
  if (!s.includes(marker)) throw new Error('Gift voucher patch: migration marker missing');
  const sql = `    CREATE TABLE IF NOT EXISTS gift_vouchers(
      id BIGSERIAL PRIMARY KEY,
      public_id TEXT UNIQUE NOT NULL,
      code TEXT UNIQUE,
      amount_original INTEGER NOT NULL,
      balance_remaining INTEGER NOT NULL DEFAULT 0,
      purchaser_name TEXT,
      purchaser_email TEXT NOT NULL,
      recipient_name TEXT,
      recipient_email TEXT,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      stripe_checkout_session_id TEXT,
      stripe_payment_intent_id TEXT,
      purchased_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS gift_vouchers_code_idx ON gift_vouchers(code);
    CREATE INDEX IF NOT EXISTS gift_vouchers_status_idx ON gift_vouchers(status);
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gift_voucher_id BIGINT;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gift_voucher_amount INTEGER NOT NULL DEFAULT 0;

`;
  s = s.replace(marker, sql + marker);
}

if (!s.includes('const GIFT_VOUCHER_AMOUNTS =')) {
  const marker = "app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {";
  if (!s.includes(marker)) throw new Error('Gift voucher patch: webhook marker missing');
  const helpers = `const GIFT_VOUCHER_AMOUNTS = [2500,5000,10000,25000,50000];
const GIFT_VOUCHER_VALID_DAYS = 365;
const GIFT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function normaliseVoucherCode(value) { return clean(value,80).toUpperCase().replace(/\\s+/g,''); }
function newGiftVoucherCode() {
  const bytes = crypto.randomBytes(12);
  let raw = '';
  for (let i=0;i<12;i++) raw += GIFT_CODE_ALPHABET[bytes[i] % GIFT_CODE_ALPHABET.length];
  return 'AFM-' + raw.slice(0,4) + '-' + raw.slice(4,8) + '-' + raw.slice(8,12);
}
async function activateGiftVoucher(voucherId, paymentIntentId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(\`SELECT * FROM gift_vouchers WHERE public_id=$1 FOR UPDATE\`, [voucherId]);
    const voucher = rows[0];
    if (!voucher) { await client.query('ROLLBACK'); return null; }
    if (voucher.code && ['active','redeemed'].includes(voucher.status)) { await client.query('COMMIT'); return voucher; }
    let code = null;
    for (let attempt=0;attempt<8&&!code;attempt++) {
      const candidate = newGiftVoucherCode();
      try {
        const u = await client.query(\`UPDATE gift_vouchers SET code=$1,status='active',balance_remaining=amount_original,stripe_payment_intent_id=$2,purchased_at=COALESCE(purchased_at,now()),expires_at=COALESCE(expires_at,now()+($3||' days')::interval),updated_at=now() WHERE public_id=$4 AND code IS NULL RETURNING *\`, [candidate,paymentIntentId||null,GIFT_VOUCHER_VALID_DAYS,voucherId]);
        if (u.rows[0]) { code = candidate; Object.assign(voucher,u.rows[0]); }
      } catch (e) {
        if (e?.code !== '23505') throw e;
      }
    }
    if (!code && !voucher.code) throw new Error('gift_voucher_code_generation_failed');
    await client.query('COMMIT');
    return voucher;
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
async function restoreVoucherForBooking(bookingId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(\`SELECT gift_voucher_id,gift_voucher_amount,booking_payment_amount,balance_amount FROM bookings WHERE public_id=$1 FOR UPDATE\`, [bookingId]);
    const b = rows[0];
    const credit = Number(b?.gift_voucher_amount || 0);
    if (!b || !b.gift_voucher_id || credit <= 0) { await client.query('COMMIT'); return false; }
    await client.query(\`SELECT id FROM gift_vouchers WHERE id=$1 FOR UPDATE\`, [b.gift_voucher_id]);
    await client.query(\`UPDATE gift_vouchers SET balance_remaining=balance_remaining+$1,status=CASE WHEN expires_at IS NOT NULL AND expires_at<=now() THEN 'expired' ELSE 'active' END,updated_at=now() WHERE id=$2\`, [credit,b.gift_voucher_id]);
    const futureCredit = Math.max(0, credit - Number(b.booking_payment_amount || 0));
    await client.query(\`UPDATE bookings SET gift_voucher_id=NULL,gift_voucher_amount=0,balance_amount=COALESCE(balance_amount,0)+$1,updated_at=now() WHERE public_id=$2\`, [futureCredit,bookingId]);
    await client.query('COMMIT');
    return true;
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

`;
  s = s.replace(marker, helpers + marker);
}

if (!s.includes("o.metadata?.kind === 'gift_voucher'")) {
  const marker = '    const o = event.data.object;';
  if (!s.includes(marker)) throw new Error('Gift voucher patch: webhook object marker missing');
  const add = `    const o = event.data.object;
    if (event.type === 'checkout.session.completed' && o.metadata?.kind === 'gift_voucher') {
      await activateGiftVoucher(o.metadata.voucher_id, o.payment_intent || null);
    }
    if (event.type === 'checkout.session.expired' && o.metadata?.kind === 'gift_voucher') {
      await pool.query(\`UPDATE gift_vouchers SET status='checkout_expired',updated_at=now() WHERE public_id=$1 AND status='pending'\`, [o.metadata.voucher_id]);
    }
    if (event.type === 'charge.refunded') {
      const giftPaymentIntentId = typeof o.payment_intent === 'string' ? o.payment_intent : o.payment_intent?.id;
      const giftAmountRefunded = Number(o.amount_refunded || 0), giftChargeAmount = Number(o.amount || 0);
      const giftFullyRefunded = o.refunded === true || (giftChargeAmount > 0 && giftAmountRefunded >= giftChargeAmount);
      if (giftPaymentIntentId && giftFullyRefunded) {
        await pool.query(\`UPDATE gift_vouchers SET status='cancelled',balance_remaining=0,updated_at=now() WHERE stripe_payment_intent_id=$1\`, [giftPaymentIntentId]);
        const { rows: voucherBookings } = await pool.query(\`SELECT public_id FROM bookings WHERE stripe_payment_intent_id=$1 AND gift_voucher_amount>0 LIMIT 1\`, [giftPaymentIntentId]);
        if (voucherBookings[0]) await restoreVoucherForBooking(voucherBookings[0].public_id);
      }
    }`;
  s = s.replace(marker, add);
}

const expiredBlock = `    if (event.type === 'checkout.session.expired' && o.metadata?.kind === 'service_booking') {
      await pool.query(\`UPDATE bookings SET status='expired',updated_at=now() WHERE public_id=$1 AND status='hold'\`, [o.metadata.booking_id]);
    }`;
const expiredReplacement = `    if (event.type === 'checkout.session.expired' && o.metadata?.kind === 'service_booking') {
      await pool.query(\`UPDATE bookings SET status='expired',updated_at=now() WHERE public_id=$1 AND status='hold'\`, [o.metadata.booking_id]);
      await restoreVoucherForBooking(o.metadata.booking_id);
    }`;
if (!s.includes(expiredReplacement)) mustReplace(expiredBlock, expiredReplacement, 'service booking expiry restoration');

if (!s.includes("app.get('/api/gift-vouchers/options'")) {
  const marker = "app.get('/api/availability', async (req, res) => {";
  if (!s.includes(marker)) throw new Error('Gift voucher patch: availability endpoint marker missing');
  const routes = `app.get('/api/gift-vouchers/options', (_req,res) => res.json({ amounts:GIFT_VOUCHER_AMOUNTS, currency:'GBP', valid_days:GIFT_VOUCHER_VALID_DAYS }));
app.post('/api/gift-vouchers/checkout', async (req,res) => {
  if (!stripe) return res.status(503).json({ error:'stripe_not_configured' });
  const b = req.body || {}, amount = Number(b.amount);
  if (!GIFT_VOUCHER_AMOUNTS.includes(amount)) return res.status(400).json({ error:'invalid_voucher_amount' });
  const purchaserName = clean(b.purchaser_name,120), purchaserEmail = clean(b.purchaser_email,200);
  if (!purchaserName || !purchaserEmail || !purchaserEmail.includes('@')) return res.status(400).json({ error:'purchaser_name_and_email_required' });
  const id = token('gv');
  await pool.query(\`INSERT INTO gift_vouchers(public_id,amount_original,balance_remaining,purchaser_name,purchaser_email,recipient_name,recipient_email,message,status) VALUES($1,$2,$2,$3,$4,$5,$6,$7,'pending')\`, [id,amount,purchaserName,purchaserEmail,clean(b.recipient_name,120)||null,clean(b.recipient_email,200)||null,clean(b.message,300)||null]);
  try {
    const session = await stripe.checkout.sessions.create({
      mode:'payment',
      customer_email:purchaserEmail,
      customer_creation:'always',
      success_url:\`\${SITE_URL}/gift-voucher-success.html?voucher=\${encodeURIComponent(id)}&session_id={CHECKOUT_SESSION_ID}\`,
      cancel_url:\`\${SITE_URL}/gift-vouchers.html?cancelled=1\`,
      billing_address_collection:'required',
      automatic_tax:{enabled:false},
      line_items:[{quantity:1,price_data:{currency:'gbp',unit_amount:amount,product_data:{name:\`Afiléon Motorsport Gift Voucher — £\${Math.round(amount/100)}\`,description:'Digital gift voucher. Unique redemption code issued after successful payment.'}}}],
      metadata:{kind:'gift_voucher',voucher_id:id},
      payment_intent_data:{metadata:{kind:'gift_voucher',voucher_id:id}}
    }, { idempotencyKey:\`gift_voucher_\${id}\` });
    await pool.query(\`UPDATE gift_vouchers SET stripe_checkout_session_id=$1,updated_at=now() WHERE public_id=$2\`, [session.id,id]);
    res.json({ voucher_id:id, checkout_url:session.url });
  } catch (e) {
    console.error('Gift voucher checkout creation failed', e);
    await pool.query(\`UPDATE gift_vouchers SET status='checkout_failed',updated_at=now() WHERE public_id=$1\`, [id]);
    res.status(500).json({ error:'voucher_checkout_creation_failed' });
  }
});
app.post('/api/gift-vouchers/check', async (req,res) => {
  const code = normaliseVoucherCode(req.body?.code || '');
  if (!code) return res.status(400).json({ valid:false, error:'voucher_code_required' });
  const { rows } = await pool.query(\`SELECT balance_remaining,expires_at,status FROM gift_vouchers WHERE UPPER(code)=UPPER($1) LIMIT 1\`, [code]);
  const v = rows[0];
  if (!v || !['active','redeemed'].includes(v.status) || Number(v.balance_remaining||0)<=0 || (v.expires_at && new Date(v.expires_at)<=new Date())) return res.status(404).json({ valid:false, detail:'Voucher code not recognised, expired or has no remaining balance.' });
  res.json({ valid:true, balance_remaining:Number(v.balance_remaining), expires_at:v.expires_at });
});
app.get('/api/gift-vouchers/:id', async (req,res) => {
  const { rows } = await pool.query(\`SELECT public_id,code,amount_original,balance_remaining,recipient_name,message,status,expires_at,stripe_checkout_session_id FROM gift_vouchers WHERE public_id=$1 LIMIT 1\`, [req.params.id]);
  const v = rows[0];
  if (!v || !req.query.session_id || req.query.session_id !== v.stripe_checkout_session_id) return res.status(404).json({ error:'not_found' });
  res.json({ public_id:v.public_id,code:v.code,amount_original:Number(v.amount_original),balance_remaining:Number(v.balance_remaining),recipient_name:v.recipient_name,message:v.message,status:v.status,expires_at:v.expires_at });
});

`;
  s = s.replace(marker, routes + marker);
}

if (!s.includes('gift_voucher_code = normaliseVoucherCode')) {
  const start = s.indexOf("app.post('/api/bookings/:id/checkout', async (req, res) => {");
  const end = s.indexOf("\n\napp.get('/api/bookings/:id'", start);
  if (start < 0 || end < 0) throw new Error('Gift voucher patch: booking checkout route bounds missing');
  const route = `app.post('/api/bookings/:id/checkout', async (req, res) => {
  let { rows } = await pool.query(\`SELECT * FROM bookings WHERE public_id=$1 LIMIT 1\`, [req.params.id]);
  let b = rows[0];
  if (!b) return res.status(404).json({ error: 'booking_not_found' });
  if (b.status !== 'hold' || new Date(b.hold_expires_at) < new Date()) { await restoreVoucherForBooking(b.public_id).catch(()=>{}); return res.status(409).json({ error: 'booking_hold_expired' }); }
  const service = SERVICE_MAP.get(b.service_id), variant = variantFor(service, b.variant_id);
  if (!service || !variant || !b.booking_payment_amount) return res.status(400).json({ error: 'quote_required' });
  const checkoutCutoff = bookingCutoffStatus(service, isoDate(b.booking_date), 'checkout_start');
  if (!checkoutCutoff.ok) { await pool.query(\`UPDATE bookings SET status='expired',updated_at=now() WHERE public_id=$1 AND status='hold'\`, [b.public_id]); await restoreVoucherForBooking(b.public_id).catch(()=>{}); return res.status(409).json({ error:checkoutCutoff.reason, detail:checkoutCutoff.detail }); }

  const gift_voucher_code = normaliseVoucherCode(req.body?.gift_voucher_code || '');
  let voucherApplied = Number(b.gift_voucher_amount || 0), voucherRemaining = null, voucherNewlyApplied = false;
  if (gift_voucher_code) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const br = await client.query(\`SELECT * FROM bookings WHERE public_id=$1 FOR UPDATE\`, [b.public_id]);
      b = br.rows[0];
      if (!b || b.status !== 'hold') { await client.query('ROLLBACK'); return res.status(409).json({ error:'booking_hold_expired' }); }
      if (Number(b.gift_voucher_amount || 0) > 0 && b.gift_voucher_id) {
        const vr = await client.query(\`SELECT id,code,balance_remaining,status,expires_at FROM gift_vouchers WHERE id=$1 FOR UPDATE\`, [b.gift_voucher_id]);
        const existing = vr.rows[0];
        if (!existing || normaliseVoucherCode(existing.code) !== gift_voucher_code) { await client.query('ROLLBACK'); return res.status(409).json({ error:'different_voucher_already_applied', detail:'A different gift voucher is already attached to this checkout.' }); }
        voucherApplied = Number(b.gift_voucher_amount || 0); voucherRemaining = Number(existing.balance_remaining || 0);
      } else {
        const vr = await client.query(\`SELECT * FROM gift_vouchers WHERE UPPER(code)=UPPER($1) FOR UPDATE\`, [gift_voucher_code]);
        const v = vr.rows[0];
        if (!v || v.status!=='active' || Number(v.balance_remaining||0)<=0 || (v.expires_at && new Date(v.expires_at)<=new Date())) { await client.query('ROLLBACK'); return res.status(400).json({ error:'gift_voucher_invalid', detail:'Voucher code not recognised, expired or has no remaining balance.' }); }
        voucherApplied = Math.min(Number(v.balance_remaining), Number(b.amount_total || b.booking_payment_amount || 0));
        if (voucherApplied <= 0) { await client.query('ROLLBACK'); return res.status(400).json({ error:'gift_voucher_invalid' }); }
        const after = Number(v.balance_remaining) - voucherApplied;
        const futureCredit = Math.max(0, voucherApplied - Number(b.booking_payment_amount || 0));
        await client.query(\`UPDATE gift_vouchers SET balance_remaining=$1,status=$2,updated_at=now() WHERE id=$3\`, [after,after>0?'active':'redeemed',v.id]);
        await client.query(\`UPDATE bookings SET gift_voucher_id=$1,gift_voucher_amount=$2,balance_amount=GREATEST(0,COALESCE(balance_amount,0)-$3),updated_at=now() WHERE public_id=$4\`, [v.id,voucherApplied,futureCredit,b.public_id]);
        b.gift_voucher_id=v.id;b.gift_voucher_amount=voucherApplied;b.balance_amount=Math.max(0,Number(b.balance_amount||0)-futureCredit);voucherRemaining=after;voucherNewlyApplied=true;
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); console.error('Gift voucher redemption failed',e); return res.status(500).json({ error:'gift_voucher_redemption_failed' }); }
    finally { client.release(); }
  }

  const cardDue = Math.max(0, Number(b.booking_payment_amount || 0) - voucherApplied);
  const isDeposit = Number(b.balance_amount) > 0;
  const label = isDeposit ? \`\${service.name} — reservation payment\` : service.name;
  const voucherText = voucherApplied > 0 ? \` Gift voucher credit applied: £\${(voucherApplied/100).toFixed(2)}.\` : '';
  const desc = isDeposit ? \`Reserves \${isoDate(b.booking_date)}. Remaining balance is due 7 days before the booking.\${voucherText}\` : \`Payment for \${isoDate(b.booking_date)}.\${voucherText}\`;

  if (cardDue <= 0) {
    const hire = b.service_id === 'vehicle_hire_day';
    await pool.query(\`UPDATE bookings SET status=$1,amount_paid=GREATEST(COALESCE(amount_paid,0),$2),balance_status=CASE WHEN COALESCE(balance_amount,0)<=0 THEN 'paid' ELSE balance_status END,licence_status=CASE WHEN licence_required THEN 'awaiting_email' ELSE licence_status END,updated_at=now() WHERE public_id=$3\`, [hire?'confirmed_pending_licence':'confirmed',voucherApplied,b.public_id]);
    return res.json({ confirmed:true, success_url:\`\${SITE_URL}/booking-success.html?booking=\${encodeURIComponent(b.public_id)}&voucher=1\`, gift_voucher_applied:voucherApplied, gift_voucher_remaining:voucherRemaining });
  }
  if (!stripe) { if (voucherNewlyApplied) await restoreVoucherForBooking(b.public_id).catch(()=>{}); return res.status(503).json({ error:'stripe_not_configured' }); }
  try {
    const session = await stripe.checkout.sessions.create({ mode:'payment', customer_email:b.customer_email||undefined, customer_creation:'always', success_url:\`\${SITE_URL}/booking-success.html?booking=\${encodeURIComponent(b.public_id)}&session_id={CHECKOUT_SESSION_ID}\`, cancel_url:\`\${SITE_URL}/book.html?cancelled=1&booking=\${encodeURIComponent(b.public_id)}\`, automatic_tax:{enabled:true}, billing_address_collection:'required', phone_number_collection:{enabled:true}, expires_at:Math.floor(Math.max(new Date(b.hold_expires_at).getTime(),Date.now()+31*60000)/1000), line_items:[{quantity:1,price_data:{currency:'gbp',unit_amount:cardDue,tax_behavior:'exclusive',product_data:{name:label,description:desc}}}], metadata:{kind:'service_booking',booking_id:b.public_id,service_id:b.service_id,variant_id:b.variant_id,booking_date:isoDate(b.booking_date),appointment_time:b.appointment_time||'',terms_version:TERMS_VERSION,gift_voucher_amount:String(voucherApplied||0)}, payment_intent_data:{metadata:{kind:'service_booking',booking_id:b.public_id,service_id:b.service_id}}, consent_collection:{terms_of_service:'required'}, custom_text:{submit:{message:service.licenceRequired?\`After payment, email a clear photo of the driver's valid driving licence to \${LICENCE_EMAIL}. Booking remains subject to the hire terms and eligibility checks.\`:'Your date is confirmed after payment succeeds.'}} }, { idempotencyKey:\`checkout_\${b.public_id}\` });
    await pool.query(\`UPDATE bookings SET stripe_checkout_session_id=$1,updated_at=now() WHERE public_id=$2\`, [session.id,b.public_id]);
    res.json({ checkout_url:session.url, session_id:session.id, gift_voucher_applied:voucherApplied, gift_voucher_remaining:voucherRemaining, card_due:cardDue });
  } catch (e) { console.error(e); if (voucherNewlyApplied) await restoreVoucherForBooking(b.public_id).catch(()=>{}); res.status(500).json({ error:'checkout_creation_failed' }); }
});`;
  s = s.slice(0,start) + route + s.slice(end);
}

if (!s.includes('gift_voucher_amount,status,amount_total')) {
  s = s.replace('SELECT public_id,service_id,variant_id,booking_date::text booking_date,appointment_time,status,amount_total', 'SELECT public_id,service_id,variant_id,booking_date::text booking_date,appointment_time,gift_voucher_amount,status,amount_total');
}

if (!s.includes("app.get('/api/admin/gift-vouchers'")) {
  const marker = "app.get('/api/admin/summary', admin, async";
  const idx = s.indexOf(marker);
  if (idx < 0) throw new Error('Gift voucher patch: admin summary marker missing');
  const route = `app.get('/api/admin/gift-vouchers', admin, async (_req,res) => {
  const { rows } = await pool.query(\`SELECT public_id,code,amount_original,balance_remaining,purchaser_name,purchaser_email,recipient_name,recipient_email,message,status,purchased_at,expires_at,created_at FROM gift_vouchers ORDER BY created_at DESC LIMIT 250\`);
  res.json({ vouchers:rows });
});
`;
  s = s.slice(0,idx) + route + s.slice(idx);
}

fs.writeFileSync(path, s);
console.log('Applied Afiléon gift voucher purchase, redemption and admin ledger patch.');
