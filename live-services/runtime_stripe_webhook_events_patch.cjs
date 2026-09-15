const fs = require('fs');
const path = 'server_v3.js';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('async function ensureStripeWebhookEvents()')) {
  const marker = "migrate().then(async()=>{await ensurePrintfulWebhook();app.listen(port,'0.0.0.0',()=>console.log(`Afiléon Live Services v3 listening on ${port}`))}).catch(e=>{console.error(e);process.exit(1)});";
  if (!s.includes(marker)) throw new Error('Stripe webhook startup marker missing');

  const replacement = `async function ensureStripeWebhookEvents() {
  if (!stripe || !String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_')) return;
  const url = 'https://afileon-live-api-production.up.railway.app/api/stripe/webhook';
  const wanted = [
    'checkout.session.completed',
    'checkout.session.expired',
    'invoice.paid',
    'invoice.payment_failed',
    'charge.refunded'
  ];
  try {
    const listed = await stripe.webhookEndpoints.list({ limit: 100 });
    const endpoint = listed.data.find(x => x.url === url && x.status !== 'disabled');
    if (!endpoint) {
      console.error('Stripe webhook event sync: existing endpoint not found');
      return;
    }
    const current = Array.isArray(endpoint.enabled_events) ? endpoint.enabled_events : [];
    const same = current.length === wanted.length && wanted.every(e => current.includes(e));
    if (!same) await stripe.webhookEndpoints.update(endpoint.id, { enabled_events: wanted });
    console.log(\`Stripe webhook events configured (\${wanted.length})\`);
  } catch (e) {
    console.error('Stripe webhook event sync failed', e.message);
  }
}

migrate().then(async()=>{
  await ensurePrintfulWebhook();
  await ensureStripeWebhookEvents();
  app.listen(port,'0.0.0.0',()=>console.log(\`Afiléon Live Services v3 listening on \${port}\`));
}).catch(e=>{console.error(e);process.exit(1)});`;

  s = s.replace(marker, replacement);
}

fs.writeFileSync(path, s);
console.log('Stripe webhook event-sync patch applied');
