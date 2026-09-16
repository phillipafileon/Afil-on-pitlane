const fs = require('fs');
const path = 'server_v3.js';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('async function expirePastCutoffSessions()')) {
  const startup = "migrate().then(async()=>{\n  await ensurePrintfulWebhook();\n  await ensureStripeWebhookEvents();\n  app.listen(port,'0.0.0.0',()=>console.log(`Afiléon Live Services v3 listening on ${port}`));\n}).catch(e=>{console.error(e);process.exit(1)});";
  if (!s.includes(startup)) throw new Error('Cutoff session expirer: startup marker missing');

  const replacement = `async function expirePastCutoffSessions() {
  if (!stripe) return;
  try {
    const { rows } = await pool.query(\`SELECT public_id,service_id,booking_date::text booking_date,stripe_checkout_session_id FROM bookings WHERE status='hold' AND stripe_checkout_session_id IS NOT NULL AND booking_date >= CURRENT_DATE AND booking_date <= CURRENT_DATE + 1\`);
    for (const b of rows) {
      const service = SERVICE_MAP.get(b.service_id);
      if (!service) continue;
      const st = bookingCutoffStatus(service, b.booking_date, 'payment');
      if (st.ok) continue;
      try { await stripe.checkout.sessions.expire(b.stripe_checkout_session_id); }
      catch (e) { if (!String(e?.message || '').toLowerCase().includes('expire')) console.error('Stripe cutoff expiry failed', e.message); }
      await pool.query(\`UPDATE bookings SET status='expired',updated_at=now() WHERE public_id=$1 AND status='hold'\`, [b.public_id]);
    }
  } catch (e) { console.error('Booking cutoff session sweep failed', e.message); }
}

migrate().then(async()=>{
  await ensurePrintfulWebhook();
  await ensureStripeWebhookEvents();
  setInterval(expirePastCutoffSessions, 10000);
  await expirePastCutoffSessions();
  app.listen(port,'0.0.0.0',()=>console.log(\`Afiléon Live Services v3 listening on \${port}\`));
}).catch(e=>{console.error(e);process.exit(1)});`;

  s = s.replace(startup, replacement);
}

fs.writeFileSync(path, s);
console.log('Added active Stripe Checkout expiry at booking cutoffs.');
