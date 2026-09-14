import express from 'express';
import cors from 'cors';
import pg from 'pg';
import Stripe from 'stripe';
import crypto from 'crypto';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized:false } : undefined });
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const SITE_URL = process.env.SITE_URL || 'https://afileonmotorsport.co.uk';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const HOLD_MINUTES = Number(process.env.BOOKING_HOLD_MINUTES || 20);

const services = [
  {id:'pre_track_inspection',name:'Pre-Track-Day Inspection',colour:'#8b5cf6',price:10000,deposit:5000,pricing:'fixed',description:'A focused readiness inspection before circuit use.',duration:'full_day'},
  {id:'vehicle_hire_day',name:'BMW E46 Track-Day Hire',colour:'#22d3ee',price:70000,deposit:25000,pricing:'fixed',description:'Full-day Afiléon Motorsport BMW E46 track-day hire.',duration:'full_day'},
  {id:'track_day_support',name:'Track-Day Support',colour:'#f59e0b',price:null,deposit:null,pricing:'quote',description:'Practical paddock support throughout a track day.',duration:'full_day'},
  {id:'race_day_support',name:'Race-Day Support',colour:'#ef4444',price:null,deposit:null,pricing:'quote',description:'Grassroots race-day support and paddock assistance.',duration:'full_day'},
  {id:'vehicle_transport',name:'Vehicle Transport',colour:'#3b82f6',price:null,deposit:null,pricing:'quote',description:'Trailer-based transport for suitable vehicles.',duration:'full_day'},
  {id:'mechanical_support',name:'Mechanical Support',colour:'#10b981',price:null,deposit:null,pricing:'quote',description:'Basic preparation and trackside mechanical assistance.',duration:'full_day'},
  {id:'full_package',name:'Full Track-Day Package',colour:'#facc15',price:null,deposit:null,pricing:'quote',description:'A combined package tailored around the vehicle, transport and support required.',duration:'full_day'}
];

const serviceMap = new Map(services.map(s=>[s.id,s]));
const money = p=>p==null?null:Number(p);
const token = ()=>crypto.randomBytes(18).toString('hex');

async function migrate(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings(
      id BIGSERIAL PRIMARY KEY,
      public_id TEXT UNIQUE NOT NULL,
      service_id TEXT NOT NULL,
      booking_date DATE NOT NULL,
      customer_name TEXT,
      customer_email TEXT,
      customer_phone TEXT,
      vehicle_details TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'hold',
      hold_expires_at TIMESTAMPTZ,
      stripe_checkout_session_id TEXT,
      stripe_payment_intent_id TEXT,
      amount_due INTEGER,
      deposit_amount INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
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

function publicServices(){return services.map(s=>({...s,price:money(s.price),deposit:money(s.deposit)}));}
function admin(req,res,next){if(!ADMIN_TOKEN || req.get('x-admin-token')!==ADMIN_TOKEN)return res.status(401).json({error:'unauthorized'});next();}
function isDateString(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''));}

app.post('/api/stripe/webhook', express.raw({type:'application/json'}), async (req,res)=>{
  if(!stripe || !process.env.STRIPE_WEBHOOK_SECRET)return res.status(503).send('Stripe webhook not configured');
  let event;
  try{event=stripe.webhooks.constructEvent(req.body,req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET);}catch(e){return res.status(400).send(`Webhook Error: ${e.message}`)}
  try{
    if(event.type==='checkout.session.completed'){
      const s=event.data.object;
      if(s.metadata?.kind==='service_booking'){
        await pool.query(`UPDATE bookings SET status='confirmed',stripe_payment_intent_id=$1,updated_at=now() WHERE public_id=$2`,[s.payment_intent||null,s.metadata.booking_id]);
      } else if(s.metadata?.kind==='shop_order'){
        await pool.query(`UPDATE orders SET status='paid',stripe_payment_intent_id=$1,updated_at=now() WHERE public_id=$2`,[s.payment_intent||null,s.metadata.order_id]);
      }
    }
    if(event.type==='checkout.session.expired'){
      const s=event.data.object;
      if(s.metadata?.kind==='service_booking') await pool.query(`UPDATE bookings SET status='expired',updated_at=now() WHERE public_id=$1 AND status='hold'`,[s.metadata.booking_id]);
      if(s.metadata?.kind==='shop_order') await pool.query(`UPDATE orders SET status='expired',updated_at=now() WHERE public_id=$1 AND status='pending'`,[s.metadata.order_id]);
    }
    res.json({received:true});
  }catch(e){console.error(e);res.status(500).json({error:'webhook_processing_failed'});}
});

app.use(cors({origin:true,credentials:false}));
app.use(express.json({limit:'1mb'}));
app.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});

app.get('/health', async (_req,res)=>{try{await pool.query('select 1');res.json({ok:true,stripe:!!stripe,version:'live-services-v1'});}catch(e){res.status(503).json({ok:false,error:'database_unavailable'});}});
app.get('/api/config', async (_req,res)=>{
  const {rows}=await pool.query(`SELECT slug,name,headline,message,accent,background_effect,banner_url,shop_collection,starts_at,ends_at FROM seasonal_campaigns WHERE active=true AND now() BETWEEN starts_at AND ends_at ORDER BY starts_at DESC LIMIT 1`);
  res.json({services:publicServices(),season:rows[0]||null,rolling_months:6,currency:'GBP'});
});
app.get('/api/services',(_req,res)=>res.json({services:publicServices()}));

app.get('/api/availability', async (req,res)=>{
  const months=Math.max(1,Math.min(6,Number(req.query.months||6)));
  await pool.query(`UPDATE bookings SET status='expired',updated_at=now() WHERE status='hold' AND hold_expires_at < now()`);
  const {rows}=await pool.query(`
    SELECT booking_date::text AS date, service_id, status, 'booking' AS kind FROM bookings
    WHERE booking_date >= CURRENT_DATE AND booking_date < (CURRENT_DATE + ($1 || ' months')::interval)
      AND (status='confirmed' OR (status='hold' AND hold_expires_at > now()))
    UNION ALL
    SELECT block_date::text AS date, COALESCE(service_id,''), 'blocked' AS status, 'block' AS kind FROM availability_blocks
    WHERE block_date >= CURRENT_DATE AND block_date < (CURRENT_DATE + ($1 || ' months')::interval)
    ORDER BY date
  `,[months]);
  res.json({months,from:new Date().toISOString().slice(0,10),busy:rows});
});

app.post('/api/bookings/hold', async (req,res)=>{
  const {service_id,booking_date,customer_name,customer_email,customer_phone,vehicle_details,notes}=req.body||{};
  const service=serviceMap.get(service_id);
  if(!service)return res.status(400).json({error:'unknown_service'});
  if(!isDateString(booking_date))return res.status(400).json({error:'invalid_date'});
  const chosen=new Date(`${booking_date}T00:00:00Z`);const today=new Date();today.setUTCHours(0,0,0,0);const max=new Date(today);max.setUTCMonth(max.getUTCMonth()+6);
  if(chosen<today||chosen>=max)return res.status(400).json({error:'date_outside_booking_window'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[booking_date]);
    await client.query(`UPDATE bookings SET status='expired',updated_at=now() WHERE booking_date=$1 AND status='hold' AND hold_expires_at<now()`,[booking_date]);
    const busy=await client.query(`SELECT 1 FROM bookings WHERE booking_date=$1 AND (status='confirmed' OR (status='hold' AND hold_expires_at>now())) LIMIT 1`,[booking_date]);
    const blocked=await client.query(`SELECT 1 FROM availability_blocks WHERE block_date=$1 LIMIT 1`,[booking_date]);
    if(busy.rowCount||blocked.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'date_unavailable'});}
    const public_id=`bk_${token()}`;const hold_expires_at=new Date(Date.now()+HOLD_MINUTES*60000);
    await client.query(`INSERT INTO bookings(public_id,service_id,booking_date,customer_name,customer_email,customer_phone,vehicle_details,notes,status,hold_expires_at,amount_due,deposit_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'hold',$9,$10,$11)`,[public_id,service_id,booking_date,String(customer_name||'').slice(0,120),String(customer_email||'').slice(0,200),String(customer_phone||'').slice(0,60),String(vehicle_details||'').slice(0,500),String(notes||'').slice(0,1000),hold_expires_at,service.price,service.deposit]);
    await client.query('COMMIT');
    res.status(201).json({booking_id:public_id,hold_expires_at,service,checkout_available:service.pricing==='fixed'});
  }catch(e){await client.query('ROLLBACK');console.error(e);res.status(500).json({error:'booking_hold_failed'});}finally{client.release();}
});

app.post('/api/bookings/:id/checkout', async (req,res)=>{
  if(!stripe)return res.status(503).json({error:'stripe_not_configured'});
  const {rows}=await pool.query(`SELECT * FROM bookings WHERE public_id=$1 LIMIT 1`,[req.params.id]);
  const b=rows[0];if(!b)return res.status(404).json({error:'booking_not_found'});
  if(b.status!=='hold'||new Date(b.hold_expires_at)<new Date())return res.status(409).json({error:'booking_hold_expired'});
  const service=serviceMap.get(b.service_id);if(!service||service.pricing!=='fixed'||!service.deposit)return res.status(400).json({error:'quote_required'});
  try{
    const session=await stripe.checkout.sessions.create({
      mode:'payment',
      customer_email:b.customer_email||undefined,
      success_url:`${SITE_URL}/booking-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${SITE_URL}/book.html?cancelled=1&booking=${encodeURIComponent(b.public_id)}`,
      automatic_tax:{enabled:true},
      expires_at:Math.floor(new Date(b.hold_expires_at).getTime()/1000),
      line_items:[{quantity:1,price_data:{currency:'gbp',unit_amount:service.deposit,tax_behavior:'exclusive',product_data:{name:`${service.name} — booking deposit`,description:`Reserves ${b.booking_date.toISOString().slice(0,10)}. Remaining balance is due under the booking terms.`}}}],
      metadata:{kind:'service_booking',booking_id:b.public_id,service_id:b.service_id,booking_date:b.booking_date.toISOString().slice(0,10)},
      payment_intent_data:{metadata:{kind:'service_booking',booking_id:b.public_id,service_id:b.service_id}},
      consent_collection:{terms_of_service:'required'}
    },{idempotencyKey:`checkout_${b.public_id}`});
    await pool.query(`UPDATE bookings SET stripe_checkout_session_id=$1,updated_at=now() WHERE public_id=$2`,[session.id,b.public_id]);
    res.json({checkout_url:session.url,session_id:session.id});
  }catch(e){console.error(e);res.status(500).json({error:'checkout_creation_failed'});}
});

app.get('/api/bookings/:id', async (req,res)=>{
  const {rows}=await pool.query(`SELECT public_id,service_id,booking_date::text AS booking_date,status,amount_due,deposit_amount,created_at,updated_at FROM bookings WHERE public_id=$1 LIMIT 1`,[req.params.id]);
  if(!rows[0])return res.status(404).json({error:'not_found'});res.json(rows[0]);
});

app.get('/api/shop/products', async (_req,res)=>{
  const {rows}=await pool.query(`SELECT slug,name,description,price,image_url,stock,featured FROM shop_products WHERE active=true ORDER BY featured DESC,name ASC`);
  res.json({products:rows});
});
app.post('/api/shop/checkout', async (req,res)=>{
  if(!stripe)return res.status(503).json({error:'stripe_not_configured'});
  const items=Array.isArray(req.body?.items)?req.body.items:[];if(!items.length)return res.status(400).json({error:'empty_basket'});
  const slugs=items.map(i=>String(i.slug||''));
  const {rows}=await pool.query(`SELECT slug,name,price,stock FROM shop_products WHERE active=true AND slug=ANY($1::text[])`,[slugs]);
  const bySlug=new Map(rows.map(r=>[r.slug,r]));const line_items=[];let total=0;
  for(const item of items){const p=bySlug.get(String(item.slug||''));const qty=Math.max(1,Math.min(20,Number(item.quantity||1)));if(!p||!Number.isInteger(p.price))return res.status(400).json({error:'invalid_product'});if(p.stock!=null&&p.stock<qty)return res.status(409).json({error:'insufficient_stock',slug:p.slug});total+=p.price*qty;line_items.push({quantity:qty,price_data:{currency:'gbp',unit_amount:p.price,tax_behavior:'exclusive',product_data:{name:p.name}}});}
  const order_id=`ord_${token()}`;
  try{
    const session=await stripe.checkout.sessions.create({mode:'payment',success_url:`${SITE_URL}/shop-success.html?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${SITE_URL}/shop.html?cancelled=1`,automatic_tax:{enabled:true},shipping_address_collection:{allowed_countries:['GB']},line_items,metadata:{kind:'shop_order',order_id},payment_intent_data:{metadata:{kind:'shop_order',order_id}}},{idempotencyKey:`shop_${order_id}`});
    await pool.query(`INSERT INTO orders(public_id,status,total,stripe_checkout_session_id,items) VALUES($1,'pending',$2,$3,$4::jsonb)`,[order_id,total,session.id,JSON.stringify(items)]);
    res.json({order_id,checkout_url:session.url});
  }catch(e){console.error(e);res.status(500).json({error:'checkout_creation_failed'});}
});

app.get('/api/season', async (_req,res)=>{
  const {rows}=await pool.query(`SELECT slug,name,headline,message,accent,background_effect,banner_url,shop_collection,starts_at,ends_at FROM seasonal_campaigns WHERE active=true AND now() BETWEEN starts_at AND ends_at ORDER BY starts_at DESC LIMIT 1`);
  res.json({season:rows[0]||null});
});

app.post('/api/admin/block-date',admin,async(req,res)=>{const {date,service_id,label,colour}=req.body||{};if(!isDateString(date))return res.status(400).json({error:'invalid_date'});await pool.query(`INSERT INTO availability_blocks(block_date,service_id,label,colour) VALUES($1,$2,$3,$4)`,[date,service_id||null,String(label||'Unavailable').slice(0,160),String(colour||'#64748b').slice(0,20)]);res.status(201).json({ok:true});});
app.post('/api/admin/season',admin,async(req,res)=>{const {slug,name,starts_at,ends_at,headline,message,accent,background_effect,banner_url,shop_collection,active=true}=req.body||{};if(!slug||!name||!starts_at||!ends_at)return res.status(400).json({error:'missing_fields'});await pool.query(`INSERT INTO seasonal_campaigns(slug,name,starts_at,ends_at,headline,message,accent,background_effect,banner_url,shop_collection,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,starts_at=excluded.starts_at,ends_at=excluded.ends_at,headline=excluded.headline,message=excluded.message,accent=excluded.accent,background_effect=excluded.background_effect,banner_url=excluded.banner_url,shop_collection=excluded.shop_collection,active=excluded.active,updated_at=now()`,[slug,name,starts_at,ends_at,headline||null,message||null,accent||null,background_effect||null,banner_url||null,shop_collection||null,!!active]);res.json({ok:true});});
app.post('/api/admin/shop-product',admin,async(req,res)=>{const {slug,name,description,price,image_url,stock,active=true,featured=false}=req.body||{};if(!slug||!name)return res.status(400).json({error:'missing_fields'});await pool.query(`INSERT INTO shop_products(slug,name,description,price,image_url,stock,active,featured) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description,price=excluded.price,image_url=excluded.image_url,stock=excluded.stock,active=excluded.active,featured=excluded.featured,updated_at=now()`,[slug,name,description||null,Number.isInteger(price)?price:null,image_url||null,Number.isInteger(stock)?stock:null,!!active,!!featured]);res.json({ok:true});});

app.get('/',(_req,res)=>res.type('text').send('Afiléon Live Services API'));

migrate().then(()=>app.listen(port,'0.0.0.0',()=>console.log(`Afiléon Live Services listening on ${port}`))).catch(e=>{console.error('Migration failed',e);process.exit(1)});
