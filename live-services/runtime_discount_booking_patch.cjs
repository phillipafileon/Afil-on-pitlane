const fs=require('fs');
const path='server_v3.js';
let s=fs.readFileSync(path,'utf8');

const start=s.indexOf("app.post('/api/bookings/:id/checkout', async (req, res) => {");
const end=s.indexOf("app.get('/api/bookings/:id'",start);
if(start<0||end<0)throw new Error('booking checkout route not found');

const route=`app.post('/api/bookings/:id/checkout', async (req, res) => {
  let { rows } = await pool.query(\`SELECT * FROM bookings WHERE public_id=$1 LIMIT 1\`, [req.params.id]);
  let b = rows[0];
  if (!b) return res.status(404).json({ error: 'booking_not_found' });
  if (b.status !== 'hold' || new Date(b.hold_expires_at) < new Date()) {
    await restoreVoucherForBooking(b.public_id).catch(()=>{});
    await releaseDiscountCode('booking',b.public_id).catch(()=>{});
    return res.status(409).json({ error: 'booking_hold_expired' });
  }
  const service = SERVICE_MAP.get(b.service_id), variant = variantFor(service, b.variant_id);
  if (!service || !variant || !b.booking_payment_amount) return res.status(400).json({ error: 'quote_required' });
  const checkoutCutoff = bookingCutoffStatus(service, isoDate(b.booking_date), 'checkout_start');
  if (!checkoutCutoff.ok) {
    await pool.query(\`UPDATE bookings SET status='expired',updated_at=now() WHERE public_id=$1 AND status='hold'\`, [b.public_id]);
    await restoreVoucherForBooking(b.public_id).catch(()=>{});
    await releaseDiscountCode('booking',b.public_id).catch(()=>{});
    return res.status(409).json({ error:checkoutCutoff.reason, detail:checkoutCutoff.detail });
  }

  const gift_voucher_code = normaliseVoucherCode(req.body?.gift_voucher_code || '');
  const discount_code = normaliseDiscountCode(req.body?.discount_code || '');
  if(gift_voucher_code && discount_code) return res.status(400).json({error:'voucher_and_promo_cannot_combine',detail:'Gift vouchers and promo codes cannot be combined on the same booking.'});

  let discount=null,discountTotal=0,promoCurrent=0,promoFuture=0;
  if(discount_code){
    discount=await reserveDiscountCode(discount_code,'booking',b.public_id,Number(b.amount_total||0));
    if(!discount)return res.status(400).json({error:'discount_code_invalid',detail:'Promo code not recognised, not active, expired or fully used.'});
    discountTotal=Number(discount.discount_amount||0);
    promoCurrent=Math.min(discountTotal,Number(b.booking_payment_amount||0));
    promoFuture=Math.max(0,discountTotal-promoCurrent);
  }

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

  const cardDue = discount_code ? Math.max(0,Number(b.booking_payment_amount||0)-promoCurrent) : Math.max(0, Number(b.booking_payment_amount || 0) - voucherApplied);
  const effectiveBalance = Math.max(0,Number(b.balance_amount||0)-promoFuture);
  const isDeposit = effectiveBalance > 0;
  const label = isDeposit ? \`${service.name} — reservation payment\` : service.name;
  const voucherText = voucherApplied > 0 ? \` Gift voucher credit applied: £${(voucherApplied/100).toFixed(2)}.\` : '';
  const discountText = discountTotal > 0 ? \` Promo code ${discount.code} applied: -£${(discountTotal/100).toFixed(2)}.\` : '';
  const desc = isDeposit ? \`Reserves ${isoDate(b.booking_date)}. Remaining balance is due 7 days before the booking.${voucherText}${discountText}\` : \`Payment for ${isoDate(b.booking_date)}.${voucherText}${discountText}\`;

  if (cardDue <= 0) {
    const hire = b.service_id === 'vehicle_hire_day';
    if(discount_code) await finaliseBookingDiscount(b.public_id);
    await pool.query(\`UPDATE bookings SET status=$1,amount_paid=GREATEST(COALESCE(amount_paid,0),$2),balance_status=CASE WHEN COALESCE(balance_amount,0)<=0 THEN 'paid' ELSE balance_status END,licence_status=CASE WHEN licence_required THEN 'awaiting_email' ELSE licence_status END,updated_at=now() WHERE public_id=$3\`, [hire?'confirmed_pending_licence':'confirmed',voucherApplied,b.public_id]);
    await bookingMail(b.public_id).catch(()=>{});
    return res.json({ confirmed:true, success_url:\`${SITE_URL}/booking-success.html?booking=${encodeURIComponent(b.public_id)}&voucher=${voucherApplied>0?'1':'0'}&promo=${discountTotal>0?'1':'0'}\`, gift_voucher_applied:voucherApplied, gift_voucher_remaining:voucherRemaining, discount_applied:discountTotal });
  }

  if (!stripe) {
    if (voucherNewlyApplied) await restoreVoucherForBooking(b.public_id).catch(()=>{});
    if(discount_code)await releaseDiscountCode('booking',b.public_id).catch(()=>{});
    return res.status(503).json({ error:'stripe_not_configured' });
  }
  try {
    const session = await stripe.checkout.sessions.create({
      mode:'payment',
      customer_email:b.customer_email||undefined,
      customer_creation:'always',
      success_url:\`${SITE_URL}/booking-success.html?booking=${encodeURIComponent(b.public_id)}&session_id={CHECKOUT_SESSION_ID}\`,
      cancel_url:\`${SITE_URL}/book.html?cancelled=1&booking=${encodeURIComponent(b.public_id)}\`,
      automatic_tax:{enabled:true},
      billing_address_collection:'required',
      phone_number_collection:{enabled:true},
      expires_at:Math.floor(Math.max(new Date(b.hold_expires_at).getTime(),Date.now()+31*60000)/1000),
      line_items:[{quantity:1,price_data:{currency:'gbp',unit_amount:cardDue,tax_behavior:'exclusive',product_data:{name:label,description:desc}}}],
      metadata:{kind:'service_booking',booking_id:b.public_id,service_id:b.service_id,variant_id:b.variant_id,booking_date:isoDate(b.booking_date),appointment_time:b.appointment_time||'',terms_version:TERMS_VERSION,gift_voucher_amount:String(voucherApplied||0),discount_amount:String(discountTotal||0),discount_code:discount?.code||''},
      payment_intent_data:{metadata:{kind:'service_booking',booking_id:b.public_id,discount_code:discount?.code||''}},
      consent_collection:{terms_of_service:'required'},
      custom_text:{submit:{message:service.licenceRequired?\`After payment, email a clear photo of the driver's valid driving licence to ${LICENCE_EMAIL}. Booking remains subject to the hire terms and eligibility checks.\`:'Your date is confirmed after payment succeeds.'}}
    }, { idempotencyKey:\`checkout_${b.public_id}\` });
    await pool.query(\`UPDATE bookings SET stripe_checkout_session_id=$1,updated_at=now() WHERE public_id=$2\`, [session.id,b.public_id]);
    if(discount_code)await attachDiscountSession('booking',b.public_id,session.id);
    res.json({ checkout_url:session.url, session_id:session.id, gift_voucher_applied:voucherApplied, gift_voucher_remaining:voucherRemaining, discount_applied:discountTotal, card_due:cardDue });
  } catch (e) {
    console.error(e);
    if (voucherNewlyApplied) await restoreVoucherForBooking(b.public_id).catch(()=>{});
    if(discount_code)await releaseDiscountCode('booking',b.public_id).catch(()=>{});
    res.status(500).json({ error:'checkout_creation_failed' });
  }
});

`;

s=s.slice(0,start)+route+s.slice(end);
fs.writeFileSync(path,s);
console.log('Applied booking discount checkout');
