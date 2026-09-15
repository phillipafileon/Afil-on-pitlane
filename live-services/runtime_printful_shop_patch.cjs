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
  `const E46_BOOKING_LIVE = String(process.env.E46_BOOKING_LIVE || 'false').toLowerCase() === 'true';
const PRINTFUL_API_TOKEN = process.env.PRINTFUL_API_TOKEN || '';
const PRINTFUL_STORE_ID = String(process.env.PRINTFUL_STORE_ID || '18758860');
const PRINTFUL_WEBHOOK_KEY = process.env.PRINTFUL_WEBHOOK_KEY || '';
const PRINTFUL_FULFILMENT_LIVE = String(process.env.PRINTFUL_FULFILMENT_LIVE || 'false').toLowerCase() === 'true';
const SHOP_CHECKOUT_REQUESTED = String(process.env.SHOP_CHECKOUT_LIVE || 'false').toLowerCase() === 'true';
const STRIPE_LIVE_KEY = String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_');
const SHOP_CHECKOUT_LIVE = SHOP_CHECKOUT_REQUESTED && STRIPE_LIVE_KEY && !!PRINTFUL_API_TOKEN;
const SHOP_DELIVERY_GBP = 499;
const SHOP_CATALOG = [
  { slug:'embroidered-tshirt', name:'Afiléon Motorsport Embroidered T-Shirt', description:'Black embroidered Afiléon Motorsport T-shirt.', price:2499, image_url:null, variants:[
    { id:'S', label:'S', sync_variant_id:5501300742 }, { id:'M', label:'M', sync_variant_id:5501300743 }, { id:'L', label:'L', sync_variant_id:5501300744 }, { id:'XL', label:'XL', sync_variant_id:5501300745 }, { id:'2XL', label:'2XL', sync_variant_id:5501300746 }
  ]},
  { slug:'embroidered-polo', name:'Afiléon Motorsport Embroidered Polo', description:'Black embroidered Afiléon Motorsport paddock polo.', price:3999, image_url:'https://files.cdn.printful.com/files/eec/eec16affa44e104e8014f21e561cd342_preview.png', variants:[
    { id:'S', label:'S', sync_variant_id:5501300667 }, { id:'M', label:'M', sync_variant_id:5501300668 }, { id:'L', label:'L', sync_variant_id:5501300669 }, { id:'XL', label:'XL', sync_variant_id:5501300670 }, { id:'2XL', label:'2XL', sync_variant_id:5501300671 }, { id:'3XL', label:'3XL', sync_variant_id:5501300672 }, { id:'4XL', label:'4XL', sync_variant_id:5501300673 }, { id:'5XL', label:'5XL', sync_variant_id:5501300674 }
  ]},
  { slug:'embroidered-hoodie', name:'Afiléon Motorsport Embroidered Hoodie', description:'Black embroidered Afiléon Motorsport hoodie.', price:4999, image_url:null, variants:[
    { id:'S', label:'S', sync_variant_id:5501298763 }, { id:'M', label:'M', sync_variant_id:5501298764 }, { id:'L', label:'L', sync_variant_id:5501298765 }, { id:'XL', label:'XL', sync_variant_id:5501298766 }, { id:'2XL', label:'2XL', sync_variant_id:5501298767 }, { id:'3XL', label:'3XL', sync_variant_id:5501298768 }
  ]},
  { slug:'beanie', name:'Afiléon Motorsport Beanie', description:'Cuffed embroidered Afiléon Motorsport beanie.', price:2542, image_url:'https://files.cdn.printful.com/files/8a8/8a8441522bfb7a578b74344c42fe7cf4_preview.png', variants:[
    { id:'Black', label:'Black', sync_variant_id:5501303306 }, { id:'White', label:'White', sync_variant_id:5501303307 }
  ]},
  { slug:'snapback', name:'Afiléon Motorsport Snapback', description:'Dark Navy embroidered Afiléon Motorsport snapback.', price:2600, image_url:'https://files.cdn.printful.com/files/84e/84e471d758880909b6293c9b2dc87193_preview.png', variants:[
    { id:'Dark Navy', label:'Dark Navy', sync_variant_id:5501294662 }
  ]}
];
const SHOP_MAP = new Map(SHOP_CATALOG.map(p => [p.slug,p]));`,
  'Printful shop constants'
);

replaceOnce(
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN NOT NULL DEFAULT false;",
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS printful_order_id TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilment_status TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_url TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilment_error TEXT;`,
  'order fulfilment columns'
);

replaceOnce(
  "app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {",
  `async function printfulRequest(method, endpoint, body) {
  if (!PRINTFUL_API_TOKEN) throw new Error('printful_not_configured');
  const headers = { Authorization:\`Bearer \${PRINTFUL_API_TOKEN}\`, 'Content-Type':'application/json', 'X-PF-Store-Id':PRINTFUL_STORE_ID };
  const r = await fetch(\`https://api.printful.com\${endpoint}\`, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) throw new Error(\`Printful \${r.status}: \${j?.error?.message || j?.error || j?.result || 'request_failed'}\`);
  return j;
}

function normaliseShopItems(input) {
  const items = Array.isArray(input) ? input : [];
  if (!items.length) throw new Error('empty_basket');
  return items.map(raw => {
    const slug = clean(raw.slug,100);
    const variantId = clean(raw.variant_id || raw.variant || '',40);
    const quantity = Math.max(1,Math.min(10,Number(raw.quantity||1)));
    const product = SHOP_MAP.get(slug);
    const variant = product?.variants?.find(v => v.id === variantId);
    if (!product || !variant || !Number.isInteger(product.price)) throw new Error('invalid_product_variant');
    return { slug, name:product.name, variant_id:variant.id, variant_label:variant.label, sync_variant_id:variant.sync_variant_id, quantity, unit_price:product.price };
  });
}

async function submitPrintfulOrder(orderId, stripeSession) {
  const { rows } = await pool.query(\`SELECT public_id,items,printful_order_id FROM orders WHERE public_id=$1 LIMIT 1\`, [orderId]);
  const order = rows[0];
  if (!order) throw new Error('order_not_found');
  if (order.printful_order_id) return { id:order.printful_order_id, already:true };
  const ship = stripeSession?.collected_information?.shipping_details || stripeSession?.shipping_details || null;
  const addr = ship?.address || null;
  if (!ship?.name || !addr?.line1 || !addr?.city || !addr?.postal_code || !addr?.country) throw new Error('shipping_address_missing');
  const recipient = {
    name: ship.name,
    address1: addr.line1,
    address2: addr.line2 || undefined,
    city: addr.city,
    state_code: addr.state || undefined,
    country_code: addr.country,
    zip: addr.postal_code,
    phone: stripeSession?.customer_details?.phone || undefined,
    email: stripeSession?.customer_details?.email || undefined
  };
  const payload = {
    external_id: orderId,
    shipping:'STANDARD',
    recipient,
    items:(order.items||[]).map(x => ({ sync_variant_id:Number(x.sync_variant_id), quantity:Number(x.quantity||1), external_id:\`\${orderId}_\${x.slug}_\${x.variant_id}\` }))
  };
  const confirm = PRINTFUL_FULFILMENT_LIVE && stripeSession?.livemode === true;
  const j = await printfulRequest('POST', \`/orders?confirm=\${confirm?'true':'false'}&update_existing=true\`, payload);
  const pf = j.result || {};
  await pool.query(\`UPDATE orders SET provider='printful',printful_order_id=$1,fulfilment_status=$2,fulfilment_error=NULL,updated_at=now() WHERE public_id=$3\`, [String(pf.id||''), clean(pf.status || (confirm?'pending':'draft'),80), orderId]);
  return pf;
}

app.post('/api/printful/webhook', express.json({ limit:'1mb' }), async (req,res) => {
  if (!PRINTFUL_WEBHOOK_KEY || req.query.key !== PRINTFUL_WEBHOOK_KEY) return res.status(401).json({ error:'unauthorized' });
  const b = req.body || {};
  if (String(b.store || b.store_id || '') !== PRINTFUL_STORE_ID) return res.status(400).json({ error:'wrong_store' });
  const pfOrder = b.data?.order || b.data?.shipment?.order || null;
  const externalId = clean(pfOrder?.external_id || b.data?.order?.external_id || '',100);
  if (!externalId) return res.json({ received:true, ignored:true });
  try {
    if (b.type === 'package_shipped' || b.type === 'shipment_sent') {
      const sh = b.data?.shipment || {};
      await pool.query(\`UPDATE orders SET status='shipped',fulfilment_status='shipped',tracking_number=$1,tracking_url=$2,updated_at=now() WHERE public_id=$3\`, [clean(sh.tracking_number,200)||null,clean(sh.tracking_url,1000)||null,externalId]);
    } else if (b.type === 'package_returned' || b.type === 'shipment_returned') {
      await pool.query(\`UPDATE orders SET status='returned',fulfilment_status='returned',fulfilment_error=$1,updated_at=now() WHERE public_id=$2\`, [clean(b.data?.reason||'Returned by carrier',1000),externalId]);
    } else if (b.type === 'order_failed') {
      await pool.query(\`UPDATE orders SET status='fulfilment_failed',fulfilment_status='failed',fulfilment_error=$1,updated_at=now() WHERE public_id=$2\`, [clean(b.data?.reason||'Printful fulfilment failed',1000),externalId]);
    } else if (b.type === 'order_canceled' || b.type === 'order_cancelled') {
      await pool.query(\`UPDATE orders SET status='cancelled',fulfilment_status='cancelled',updated_at=now() WHERE public_id=$1\`, [externalId]);
    }
    return res.json({ received:true });
  } catch (e) {
    console.error('Printful webhook',e);
    return res.status(500).json({ error:'webhook_processing_failed' });
  }
});

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {`,
  'Printful helper and webhook'
);

replaceOnce(
`    if (event.type === 'checkout.session.completed' && o.metadata?.kind === 'shop_order') {
      await pool.query(\`UPDATE orders SET status='paid',stock_reserved=false,stripe_payment_intent_id=$1,customer_email=COALESCE(customer_email,$2),updated_at=now() WHERE public_id=$3\`, [o.payment_intent || null, o.customer_details?.email || null, o.metadata.order_id]);
    }`,
`    if (event.type === 'checkout.session.completed' && o.metadata?.kind === 'shop_order') {
      await pool.query(\`UPDATE orders SET status='paid',stock_reserved=false,stripe_payment_intent_id=$1,customer_email=COALESCE(customer_email,$2),updated_at=now() WHERE public_id=$3\`, [o.payment_intent || null, o.customer_details?.email || null, o.metadata.order_id]);
      try {
        const fullSession = await stripe.checkout.sessions.retrieve(o.id);
        await submitPrintfulOrder(o.metadata.order_id, fullSession);
      } catch (pfError) {
        console.error('Printful order creation failed', pfError);
        await pool.query(\`UPDATE orders SET status='fulfilment_attention',fulfilment_status='error',fulfilment_error=$1,updated_at=now() WHERE public_id=$2\`, [clean(pfError.message,1000),o.metadata.order_id]);
      }
    }`,
  'Stripe to Printful handoff'
);

replaceOnce(
  "app.get('/api/shop/products', async (_q,res) => { const { rows } = await pool.query(`SELECT slug,name,description,price,image_url,stock,featured,collection FROM shop_products WHERE active=true ORDER BY featured DESC,name`); res.json({ products:rows }); });",
  `app.get('/api/shop/products', (_q,res) => res.json({
  products: SHOP_CATALOG.map(p => ({ slug:p.slug,name:p.name,description:p.description,price:p.price,image_url:p.image_url,stock:null,featured:true,collection:'teamwear',variants:p.variants.map(v=>({id:v.id,label:v.label})) })),
  delivery_price: SHOP_DELIVERY_GBP,
  currency:'GBP',
  checkout_live: SHOP_CHECKOUT_LIVE,
  checkout_requested: SHOP_CHECKOUT_REQUESTED,
  stripe_live: STRIPE_LIVE_KEY,
  printful_connected: !!PRINTFUL_API_TOKEN,
  fulfilment_live: PRINTFUL_FULFILMENT_LIVE
}));

app.post('/api/shop/checkout', async (req,res,next) => {
  if (!Array.isArray(req.body?.items)) return next();
  if (!stripe) return res.status(503).json({ error:'stripe_not_configured' });
  if (!SHOP_CHECKOUT_LIVE) return res.status(503).json({ error:'shop_not_live', detail: STRIPE_LIVE_KEY ? 'Merchandise checkout is not enabled yet.' : 'Merchandise checkout is ready but live Stripe payments have not been enabled yet.' });
  let items;
  try { items = normaliseShopItems(req.body.items); }
  catch (e) { return res.status(400).json({ error:e.message==='empty_basket'?'empty_basket':'invalid_product_variant' }); }
  const total = items.reduce((n,x)=>n+x.unit_price*x.quantity,0);
  const id = token('ord');
  try {
    await pool.query(\`INSERT INTO orders(public_id,status,total,items,stock_reserved,provider,fulfilment_status) VALUES($1,'pending',$2,$3::jsonb,false,'printful','awaiting_payment')\`, [id,total,JSON.stringify(items)]);
    const lines = items.map(x => ({ quantity:x.quantity,price_data:{currency:'gbp',unit_amount:x.unit_price,tax_behavior:'exclusive',product_data:{name:\`\${x.name} — \${x.variant_label}\`}} }));
    const session = await stripe.checkout.sessions.create({
      mode:'payment',
      success_url:\`\${SITE_URL}/shop-success.html?order=\${id}&session_id={CHECKOUT_SESSION_ID}\`,
      cancel_url:\`\${SITE_URL}/shop.html?cancelled=1\`,
      automatic_tax:{enabled:true},
      billing_address_collection:'required',
      shipping_address_collection:{allowed_countries:['GB']},
      shipping_options:[{shipping_rate_data:{type:'fixed_amount',fixed_amount:{amount:SHOP_DELIVERY_GBP,currency:'gbp'},display_name:'UK delivery'}}],
      phone_number_collection:{enabled:true},
      line_items:lines,
      metadata:{kind:'shop_order',order_id:id},
      payment_intent_data:{metadata:{kind:'shop_order',order_id:id}}
    }, { idempotencyKey:\`shop_\${id}\` });
    await pool.query(\`UPDATE orders SET stripe_checkout_session_id=$1,updated_at=now() WHERE public_id=$2\`,[session.id,id]);
    return res.json({ order_id:id,checkout_url:session.url,delivery_price:SHOP_DELIVERY_GBP });
  } catch (e) {
    console.error('Shop checkout',e);
    await pool.query(\`UPDATE orders SET status='failed',fulfilment_error=$1,updated_at=now() WHERE public_id=$2\`,[clean(e.message,1000),id]).catch(()=>{});
    return res.status(500).json({ error:'checkout_creation_failed' });
  }
});

app.get('/api/shop/orders/:id', async (req,res) => {
  const { rows } = await pool.query(\`SELECT public_id,status,total,customer_email,provider,printful_order_id,fulfilment_status,tracking_number,tracking_url,fulfilment_error,created_at,updated_at FROM orders WHERE public_id=$1 LIMIT 1\`,[req.params.id]);
  if (!rows[0]) return res.status(404).json({ error:'not_found' });
  res.json(rows[0]);
});`,
  'Printful shop routes'
);

replaceOnce(
  "r.json({ services: SERVICES.map(publicService), season: rows[0] || null, rolling_months: 6, currency: 'GBP', licence_email: LICENCE_EMAIL, terms_version: TERMS_VERSION, terms_url: TERMS_URL, cancellation_note: 'Cancellation, rescheduling and refund rights are governed by the booking terms and applicable consumer law. Contact Afiléon Motorsport as soon as possible if plans change.' });",
  "r.json({ services: SERVICES.map(publicService), season: rows[0] || null, rolling_months: 6, currency: 'GBP', licence_email: LICENCE_EMAIL, terms_version: TERMS_VERSION, terms_url: TERMS_URL, shop_checkout_live: SHOP_CHECKOUT_LIVE, printful_connected: !!PRINTFUL_API_TOKEN, printful_fulfilment_live: PRINTFUL_FULFILMENT_LIVE, cancellation_note: 'Cancellation, rescheduling and refund rights are governed by the booking terms and applicable consumer law. Contact Afiléon Motorsport as soon as possible if plans change.' });",
  'config shop state'
);

fs.writeFileSync(path, s);
console.log('Applied Afiléon Printful shop runtime patch');
