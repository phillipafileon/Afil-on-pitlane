import express from 'express';
import cors from 'cors';
import pg from 'pg';
import Stripe from 'stripe';
import crypto from 'crypto';

const {Pool}=pg;
const app=express();
const port=Number(process.env.PORT||3000);
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:undefined});
const stripe=process.env.STRIPE_SECRET_KEY?new Stripe(process.env.STRIPE_SECRET_KEY):null;
const SITE_URL=process.env.SITE_URL||'https://afileonmotorsport.co.uk';
const ADMIN_TOKEN=process.env.ADMIN_TOKEN||'';
const CRON_SECRET=process.env.CRON_SECRET||'';
const HOLD_MINUTES=Number(process.env.BOOKING_HOLD_MINUTES||20);
const LICENCE_EMAIL=process.env.LICENCE_EMAIL||'contact@afileonmotorsport.co.uk';

const SERVICES=[
 {id:'pre_track_inspection',name:'Comprehensive Pre-Track-Day Inspection',colour:'#8b5cf6',duration:'full_day',variants:[{id:'standard',label:'Inspection',price:12000}],payment:'full',kentOnly:true,addressRequired:true,description:'Mobile pre-track inspection in Kent: underbody, wheel-off visual checks, brakes, tyres, steering/suspension observations and fluid-level checks. Customer supplies any fluids, parts or consumables required unless agreed otherwise.'},
 {id:'vehicle_hire_day',name:'BMW E46 Track-Day Hire',colour:'#22d3ee',duration:'full_day',variants:[{id:'full_day',label:'Full day',price:70000}],payment:'e46_rule',licenceRequired:true,description:'Full-day BMW E46 hire only. One full tank of fuel included. Circuit entry and additional fuel are excluded unless stated.'},
 {id:'track_day_support',name:'Track-Day Support',colour:'#f59e0b',duration:'full_day',variants:[{id:'half_day',label:'Half day',price:30000},{id:'full_day',label:'Full day',price:50000}],payment:'full',description:'Practical trackside support for your own car. Half-day bookings still reserve the calendar day because of travel and setup time. Travel/circuit-specific extras are shown or confirmed before final booking.'},
 {id:'race_day_support',name:'Race-Day Support',colour:'#ef4444',duration:'full_day',variants:[{id:'quote',label:'Quote required',price:null}],payment:'quote',description:'Race-day paddock support tailored to the event and vehicle.'},
 {id:'vehicle_transport',name:'Vehicle Transport',colour:'#3b82f6',duration:'full_day',variants:[{id:'quote',label:'Quote required',price:null}],payment:'quote',addressRequired:true,description:'Trailer transport for suitable vehicles. Price depends on collection, destination and vehicle details.'},
 {id:'mechanical_support',name:'Mechanical Support',colour:'#10b981',duration:'full_day',variants:[{id:'quote',label:'Quote required',price:null}],payment:'quote',description:'Preparation or trackside mechanical assistance tailored to the job.'},
 {id:'full_package',name:'Full Track-Day Package',colour:'#facc15',duration:'full_day',variants:[{id:'quote',label:'Quote required',price:null}],payment:'quote',description:'Combined vehicle, transport and support package. Quoted to suit the circuit and requirements.'}
];
const SERVICE_MAP=new Map(SERVICES.map(s=>[s.id,s]));
const token=(prefix='id')=>`${prefix}_${crypto.randomBytes(16).toString('hex')}`;
const isoDate=d=>new Date(d).toISOString().slice(0,10);
const dayMs=86400000;
const daysUntil=(date)=>Math.ceil((new Date(`${date}T00:00:00Z`)-new Date(new Date().toISOString().slice(0,10)+'T00:00:00Z'))/dayMs);
const isDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const publicService=s=>({...s});

async function migrate(){
 await pool.query(`
 CREATE TABLE IF NOT EXISTS bookings(
  id BIGSERIAL PRIMARY KEY, public_id TEXT UNIQUE NOT NULL, service_id TEXT NOT NULL, variant_id TEXT,
  booking_date DATE NOT NULL, customer_name TEXT, customer_email TEXT, customer_phone TEXT,
  service_address TEXT, postcode TEXT, vehicle_details TEXT, notes TEXT,
  status TEXT NOT NULL DEFAULT 'hold', hold_expires_at TIMESTAMPTZ,
  stripe_checkout_session_id TEXT, stripe_payment_intent_id TEXT, stripe_customer_id TEXT,
  stripe_balance_invoice_id TEXT, amount_total INTEGER, amount_paid INTEGER DEFAULT 0,
  booking_payment_amount INTEGER, balance_amount INTEGER DEFAULT 0,
  balance_notice_at TIMESTAMPTZ, balance_due_at TIMESTAMPTZ, balance_status TEXT,
  licence_required BOOLEAN NOT NULL DEFAULT false, licence_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 );
 ALTER TABLE bookings ADD COLUMN IF NOT EXISTS variant_id TEXT;
 ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_address TEXT;
 ALTER TABLE bookings ADD COLUMN IF NOT EXISTS postcode TEXT;
 ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
 ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_balance_invoice_id TEXT;
 ALTER TABLE bookings ADD COLUMN IF NOT EXISTS amount_total INTEGER;
 ALTER TABLE bookings ADD COLUMN IF NOT EXISTS amount_paid INTEGER DEFAULT 0;
 ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_payment_amount INTEGER;
 ALTER TABLE bookings ADD COLUMN IF NOT EXISTS balance_amount INTEGER DEFAULT 0;
 ALTER TABLE bookings ADD COLUMN IF NOT EXISTS balance_notice_at TIMESTAMPTZ;
 ALTER TABLE bookings ADD COLUMN IF NOT EXISTS balance_due_at TIMESTAMPTZ;
 ALTER TABLE bookings ADD COLUMN IF NOT EXISTS balance_status TEXT;
 ALTER TABLE bookings ADD COLUMN IF NOT EXISTS licence_required BOOLEAN NOT NULL DEFAULT false;
 ALTER TABLE bookings ADD COLUMN IF NOT EXISTS licence_status TEXT;
 CREATE INDEX IF NOT EXISTS bookings_date_idx ON bookings(booking_date);
 CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status);
 CREATE TABLE IF NOT EXISTS availability_blocks(id BIGSERIAL PRIMARY KEY,block_date DATE NOT NULL,service_id TEXT,label TEXT NOT NULL,colour TEXT NOT NULL DEFAULT '#64748b',created_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS shop_products(id BIGSERIAL PRIMARY KEY,slug TEXT UNIQUE NOT NULL,name TEXT NOT NULL,description TEXT,price INTEGER,stripe_price_id TEXT,image_url TEXT,stock INTEGER,active BOOLEAN NOT NULL DEFAULT true,featured BOOLEAN NOT NULL DEFAULT false,collection TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
 ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS collection TEXT;
 CREATE TABLE IF NOT EXISTS orders(id BIGSERIAL PRIMARY KEY,public_id TEXT UNIQUE NOT NULL,customer_email TEXT,status TEXT NOT NULL DEFAULT 'pending',total INTEGER,stripe_checkout_session_id TEXT,stripe_payment_intent_id TEXT,items JSONB NOT NULL DEFAULT '[]'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS seasonal_campaigns(id BIGSERIAL PRIMARY KEY,slug TEXT UNIQUE NOT NULL,name TEXT NOT NULL,starts_at TIMESTAMPTZ NOT NULL,ends_at TIMESTAMPTZ NOT NULL,headline TEXT,message TEXT,accent TEXT,background_effect TEXT,banner_url TEXT,shop_collection TEXT,active BOOLEAN NOT NULL DEFAULT true,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
 `);
}

function admin(req,res,next){if(!ADMIN_TOKEN||req.get('x-admin-token')!==ADMIN_TOKEN)return res.status(401).json({error:'unauthorized'});next();}
function cronAuth(req,res,next){if(!CRON_SECRET||req.get('x-cron-secret')!==CRON_SECRET)return res.status(401).json({error:'unauthorized'});next();}
function variantFor(service,id){return service?.variants?.find(v=>v.id===(id||service.variants[0]?.id))||null;}

const KENT_DISTRICTS=new Set(['Ashford','Canterbury','Dartford','Dover','Folkestone and Hythe','Gravesham','Maidstone','Medway','Sevenoaks','Swale','Thanet','Tonbridge and Malling','Tunbridge Wells']);
async function validateKentPostcode(postcode){
 const pc=clean(postcode,12).replace(/\s+/g,'').toUpperCase();if(!pc)return {ok:false,reason:'postcode_required'};
 try{
  const c=new AbortController();const t=setTimeout(()=>c.abort(),3500);
  const r=await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`,{signal:c.signal});clearTimeout(t);
  if(!r.ok)return {ok:false,reason:'postcode_not_found'};const j=await r.json();const x=j.result||{};
  const county=String(x.admin_county||'');const district=String(x.admin_district||'');
  return {ok:county==='Kent'||KENT_DISTRICTS.has(district),reason:(county==='Kent'||KENT_DISTRICTS.has(district))?null:'outside_kent',district,county,postcode:x.postcode||postcode};
 }catch{return {ok:false,reason:'postcode_validation_unavailable'};}
}

function paymentPlan(service,variant,date){
 const total=variant.price;if(total==null)return {kind:'quote',total:null,now:null,balance:null};
 if(service.payment==='full')return {kind:'full',total,now:total,balance:0};
 if(service.payment==='e46_rule'){
  const d=daysUntil(date);
  if(d<=7)return {kind:'full',total,now:total,balance:0};
  return {kind:'deposit_then_balance',total,now:25000,balance:total-25000,balanceNoticeDays:10,balanceDueDays:7};
 }
 return {kind:'quote',total:null,now:null,balance:null};
}

app.post('/api/stripe/webhook',express.raw({type:'application/json'}),async(req,res)=>{
 if(!stripe||!process.env.STRIPE_WEBHOOK_SECRET)return res.status(503).send('Stripe webhook not configured');
 let event;try{event=stripe.webhooks.constructEvent(req.body,req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET);}catch(e){return res.status(400).send(`Webhook Error: ${e.message}`)}
 try{
  const o=event.data.object;
  if(event.type==='checkout.session.completed'&&o.metadata?.kind==='service_booking'){
   const {rows}=await pool.query('SELECT service_id FROM bookings WHERE public_id=$1',[o.metadata.booking_id]);
   const hire=rows[0]?.service_id==='vehicle_hire_day';
   await pool.query(`UPDATE bookings SET status=$1,stripe_payment_intent_id=$2,stripe_customer_id=$3,amount_paid=COALESCE(amount_paid,0)+COALESCE(booking_payment_amount,0),licence_status=CASE WHEN licence_required THEN 'awaiting_email' ELSE licence_status END,updated_at=now() WHERE public_id=$4`,[hire?'confirmed_pending_licence':'confirmed',o.payment_intent||null,o.customer||null,o.metadata.booking_id]);
  }
  if(event.type==='checkout.session.completed'&&o.metadata?.kind==='shop_order')await pool.query(`UPDATE orders SET status='paid',stripe_payment_intent_id=$1,updated_at=now() WHERE public_id=$2`,[o.payment_intent||null,o.metadata.order_id]);
  if(event.type==='checkout.session.expired'&&o.metadata?.kind==='service_booking')await pool.query(`UPDATE bookings SET status='expired',updated_at=now() WHERE public_id=$1 AND status='hold'`,[o.metadata.booking_id]);
  if(event.type==='invoice.paid'&&o.metadata?.kind==='service_balance')await pool.query(`UPDATE bookings SET balance_status='paid',amount_paid=amount_total,status=CASE WHEN licence_required AND licence_status<>'approved' THEN 'confirmed_pending_licence' ELSE 'confirmed' END,updated_at=now() WHERE public_id=$1`,[o.metadata.booking_id]);
  if(event.type==='invoice.payment_failed'&&o.metadata?.kind==='service_balance')await pool.query(`UPDATE bookings SET balance_status='payment_failed',updated_at=now() WHERE public_id=$1`,[o.metadata.booking_id]);
  res.json({received:true});
 }catch(e){console.error(e);res.status(500).json({error:'webhook_processing_failed'});}
});

app.use(cors({origin:true}));app.use(express.json({limit:'1mb'}));app.use((_q,r,n)=>{r.set('Cache-Control','no-store');n();});
app.get('/health',async(_q,r)=>{try{await pool.query('select 1');r.json({ok:true,stripe:!!stripe,version:'live-services-v2'});}catch{r.status(503).json({ok:false});}});
app.get('/api/config',async(_q,r)=>{const {rows}=await pool.query(`SELECT slug,name,headline,message,accent,background_effect,banner_url,shop_collection,starts_at,ends_at FROM seasonal_campaigns WHERE active=true AND now() BETWEEN starts_at AND ends_at ORDER BY starts_at DESC LIMIT 1`);r.json({services:SERVICES.map(publicService),season:rows[0]||null,rolling_months:6,currency:'GBP',licence_email:LICENCE_EMAIL});});
app.get('/api/services',(_q,r)=>r.json({services:SERVICES.map(publicService)}));
app.get('/api/availability',async(q,r)=>{const months=Math.max(1,Math.min(6,Number(q.query.months||6)));await pool.query(`UPDATE bookings SET status='expired',updated_at=now() WHERE status='hold' AND hold_expires_at<now()`);const {rows}=await pool.query(`SELECT booking_date::text date,service_id,status,'booking' kind FROM bookings WHERE booking_date>=CURRENT_DATE AND booking_date<(CURRENT_DATE+($1||' months')::interval) AND (status IN ('confirmed','confirmed_pending_licence') OR (status='hold' AND hold_expires_at>now()) OR balance_status IN ('invoiced','payment_failed')) UNION ALL SELECT block_date::text,COALESCE(service_id,''),'blocked','block' FROM availability_blocks WHERE block_date>=CURRENT_DATE AND block_date<(CURRENT_DATE+($1||' months')::interval) ORDER BY date`,[months]);r.json({months,busy:rows});});

app.post('/api/bookings/hold',async(req,res)=>{
 const b=req.body||{};const service=SERVICE_MAP.get(b.service_id);if(!service)return res.status(400).json({error:'unknown_service'});if(!isDate(b.booking_date))return res.status(400).json({error:'invalid_date'});
 const variant=variantFor(service,b.variant_id);if(!variant)return res.status(400).json({error:'unknown_variant'});
 const du=daysUntil(b.booking_date);if(du<0||du>=184)return res.status(400).json({error:'date_outside_booking_window'});
 if(service.addressRequired&&(!clean(b.service_address)||!clean(b.postcode)))return res.status(400).json({error:'service_address_required'});
 if(service.kentOnly){const k=await validateKentPostcode(b.postcode);if(!k.ok)return res.status(400).json({error:k.reason,detail:'This mobile inspection is currently available only at addresses in Kent.'});}
 const plan=paymentPlan(service,variant,b.booking_date);
 const client=await pool.connect();try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[b.booking_date]);await client.query(`UPDATE bookings SET status='expired',updated_at=now() WHERE booking_date=$1 AND status='hold' AND hold_expires_at<now()`,[b.booking_date]);
  const busy=await client.query(`SELECT 1 FROM bookings WHERE booking_date=$1 AND (status IN ('confirmed','confirmed_pending_licence') OR (status='hold' AND hold_expires_at>now()) OR balance_status IN ('invoiced','payment_failed')) LIMIT 1`,[b.booking_date]);const block=await client.query(`SELECT 1 FROM availability_blocks WHERE block_date=$1 LIMIT 1`,[b.booking_date]);if(busy.rowCount||block.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'date_unavailable'});}
  const id=token('bk'),expires=new Date(Date.now()+HOLD_MINUTES*60000);let notice=null,due=null;if(plan.kind==='deposit_then_balance'){const d=new Date(`${b.booking_date}T12:00:00Z`);notice=new Date(d.getTime()-plan.balanceNoticeDays*dayMs);due=new Date(d.getTime()-plan.balanceDueDays*dayMs);}
  await client.query(`INSERT INTO bookings(public_id,service_id,variant_id,booking_date,customer_name,customer_email,customer_phone,service_address,postcode,vehicle_details,notes,status,hold_expires_at,amount_total,booking_payment_amount,balance_amount,balance_notice_at,balance_due_at,balance_status,licence_required,licence_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'hold',$12,$13,$14,$15,$16,$17,$18,$19,$20)`,[id,service.id,variant.id,b.booking_date,clean(b.customer_name,120),clean(b.customer_email,200),clean(b.customer_phone,60),clean(b.service_address,500),clean(b.postcode,20),clean(b.vehicle_details,500),clean(b.notes,1000),expires,plan.total,plan.now,plan.balance,notice,due,plan.balance?'scheduled':null,!!service.licenceRequired,service.licenceRequired?'required':null]);
  await client.query('COMMIT');return res.status(201).json({booking_id:id,hold_expires_at:expires,service:publicService(service),variant,payment_plan:plan,checkout_available:plan.kind!=='quote',licence_email:service.licenceRequired?LICENCE_EMAIL:null});
 }catch(e){await client.query('ROLLBACK');console.error(e);res.status(500).json({error:'booking_hold_failed'});}finally{client.release();}
});

app.post('/api/bookings/:id/checkout',async(req,res)=>{
 if(!stripe)return res.status(503).json({error:'stripe_not_configured'});const {rows}=await pool.query(`SELECT * FROM bookings WHERE public_id=$1 LIMIT 1`,[req.params.id]);const b=rows[0];if(!b)return res.status(404).json({error:'booking_not_found'});if(b.status!=='hold'||new Date(b.hold_expires_at)<new Date())return res.status(409).json({error:'booking_hold_expired'});const service=SERVICE_MAP.get(b.service_id),variant=variantFor(service,b.variant_id);if(!service||!variant||!b.booking_payment_amount)return res.status(400).json({error:'quote_required'});
 const isDeposit=Number(b.balance_amount)>0;const label=isDeposit?`${service.name} — booking deposit`:service.name;const desc=isDeposit?`Reserves ${isoDate(b.booking_date)}. Remaining balance is due 7 days before the booking.`:`Payment for ${isoDate(b.booking_date)}.`;
 try{const session=await stripe.checkout.sessions.create({mode:'payment',customer_email:b.customer_email||undefined,customer_creation:'always',success_url:`${SITE_URL}/booking-success.html?booking=${encodeURIComponent(b.public_id)}&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${SITE_URL}/book.html?cancelled=1&booking=${encodeURIComponent(b.public_id)}`,automatic_tax:{enabled:true},billing_address_collection:'required',phone_number_collection:{enabled:true},expires_at:Math.floor(new Date(b.hold_expires_at).getTime()/1000),line_items:[{quantity:1,price_data:{currency:'gbp',unit_amount:Number(b.booking_payment_amount),tax_behavior:'exclusive',product_data:{name:label,description:desc}}}],metadata:{kind:'service_booking',booking_id:b.public_id,service_id:b.service_id,variant_id:b.variant_id,booking_date:isoDate(b.booking_date)},payment_intent_data:{metadata:{kind:'service_booking',booking_id:b.public_id,service_id:b.service_id}},consent_collection:{terms_of_service:'required'},custom_text:{submit:{message:service.licenceRequired?`After payment, email a clear photo of the driver's valid driving licence to ${LICENCE_EMAIL}. Booking remains subject to the hire terms and eligibility checks.`:'Your date is reserved when payment succeeds.'}}},{idempotencyKey:`checkout_${b.public_id}`});await pool.query(`UPDATE bookings SET stripe_checkout_session_id=$1,updated_at=now() WHERE public_id=$2`,[session.id,b.public_id]);res.json({checkout_url:session.url,session_id:session.id});}catch(e){console.error(e);res.status(500).json({error:'checkout_creation_failed'});}
});

app.get('/api/bookings/:id',async(req,res)=>{const {rows}=await pool.query(`SELECT public_id,service_id,variant_id,booking_date::text,status,amount_total,amount_paid,booking_payment_amount,balance_amount,balance_due_at,balance_status,licence_required,licence_status,created_at,updated_at FROM bookings WHERE public_id=$1 LIMIT 1`,[req.params.id]);if(!rows[0])return res.status(404).json({error:'not_found'});res.json({...rows[0],licence_email:rows[0].licence_required?LICENCE_EMAIL:null});});

app.post('/api/internal/run-due-balances',cronAuth,async(_req,res)=>{
 if(!stripe)return res.status(503).json({error:'stripe_not_configured'});const {rows}=await pool.query(`SELECT * FROM bookings WHERE balance_amount>0 AND balance_status='scheduled' AND balance_notice_at<=now() AND status IN ('confirmed','confirmed_pending_licence') ORDER BY booking_date LIMIT 50`);const out=[];
 for(const b of rows){try{let customer=b.stripe_customer_id;if(!customer){const c=await stripe.customers.create({email:b.customer_email||undefined,name:b.customer_name||undefined,phone:b.customer_phone||undefined,metadata:{booking_id:b.public_id}});customer=c.id;await pool.query('UPDATE bookings SET stripe_customer_id=$1 WHERE public_id=$2',[customer,b.public_id]);}
   const inv=await stripe.invoices.create({customer,collection_method:'send_invoice',due_date:Math.floor(new Date(b.balance_due_at).getTime()/1000),auto_advance:true,metadata:{kind:'service_balance',booking_id:b.public_id,service_id:b.service_id},description:`Afiléon Motorsport balance for ${isoDate(b.booking_date)}`},{idempotencyKey:`balance_invoice_${b.public_id}`});
   await stripe.invoiceItems.create({customer,invoice:inv.id,amount:Number(b.balance_amount),currency:'gbp',description:`Remaining balance — ${SERVICE_MAP.get(b.service_id)?.name||'Afiléon Motorsport service'}`},{idempotencyKey:`balance_item_${b.public_id}`});await stripe.invoices.finalizeInvoice(inv.id);await stripe.invoices.sendInvoice(inv.id);await pool.query(`UPDATE bookings SET stripe_balance_invoice_id=$1,balance_status='invoiced',updated_at=now() WHERE public_id=$2`,[inv.id,b.public_id]);out.push({booking_id:b.public_id,invoice_id:inv.id});}catch(e){console.error('balance invoice',b.public_id,e.message);out.push({booking_id:b.public_id,error:true});}}
 res.json({processed:out.length,results:out});
});

app.get('/api/shop/products',async(_q,r)=>{const {rows}=await pool.query(`SELECT slug,name,description,price,image_url,stock,featured,collection FROM shop_products WHERE active=true ORDER BY featured DESC,name`);r.json({products:rows});});
app.post('/api/shop/checkout',async(req,res)=>{if(!stripe)return res.status(503).json({error:'stripe_not_configured'});const items=Array.isArray(req.body?.items)?req.body.items:[];if(!items.length)return res.status(400).json({error:'empty_basket'});const slugs=items.map(x=>clean(x.slug,100));const {rows}=await pool.query(`SELECT slug,name,price,stock FROM shop_products WHERE active=true AND slug=ANY($1::text[])`,[slugs]);const map=new Map(rows.map(x=>[x.slug,x]));let total=0;const lines=[];for(const x of items){const p=map.get(clean(x.slug,100)),q=Math.max(1,Math.min(20,Number(x.quantity||1)));if(!p||!Number.isInteger(p.price))return res.status(400).json({error:'invalid_product'});if(p.stock!=null&&p.stock<q)return res.status(409).json({error:'insufficient_stock',slug:p.slug});total+=p.price*q;lines.push({quantity:q,price_data:{currency:'gbp',unit_amount:p.price,tax_behavior:'exclusive',product_data:{name:p.name}}});}const id=token('ord');try{const s=await stripe.checkout.sessions.create({mode:'payment',success_url:`${SITE_URL}/shop-success.html?order=${id}&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${SITE_URL}/shop.html?cancelled=1`,automatic_tax:{enabled:true},billing_address_collection:'required',shipping_address_collection:{allowed_countries:['GB']},phone_number_collection:{enabled:true},line_items:lines,metadata:{kind:'shop_order',order_id:id},payment_intent_data:{metadata:{kind:'shop_order',order_id:id}}},{idempotencyKey:`shop_${id}`});await pool.query(`INSERT INTO orders(public_id,status,total,stripe_checkout_session_id,items) VALUES($1,'pending',$2,$3,$4::jsonb)`,[id,total,s.id,JSON.stringify(items)]);res.json({order_id:id,checkout_url:s.url});}catch(e){console.error(e);res.status(500).json({error:'checkout_creation_failed'});}});

app.get('/api/season',async(_q,r)=>{const {rows}=await pool.query(`SELECT slug,name,headline,message,accent,background_effect,banner_url,shop_collection,starts_at,ends_at FROM seasonal_campaigns WHERE active=true AND now() BETWEEN starts_at AND ends_at ORDER BY starts_at DESC LIMIT 1`);r.json({season:rows[0]||null});});
app.post('/api/admin/block-date',admin,async(req,res)=>{const {date,service_id,label,colour}=req.body||{};if(!isDate(date))return res.status(400).json({error:'invalid_date'});await pool.query(`INSERT INTO availability_blocks(block_date,service_id,label,colour) VALUES($1,$2,$3,$4)`,[date,service_id||null,clean(label||'Unavailable',160),clean(colour||'#64748b',20)]);res.status(201).json({ok:true});});
app.post('/api/admin/approve-licence',admin,async(req,res)=>{await pool.query(`UPDATE bookings SET licence_status='approved',status=CASE WHEN balance_amount>0 AND balance_status<>'paid' THEN status ELSE 'confirmed' END,updated_at=now() WHERE public_id=$1`,[req.body?.booking_id]);res.json({ok:true});});
app.post('/api/admin/season',admin,async(req,res)=>{const b=req.body||{};if(!b.slug||!b.name||!b.starts_at||!b.ends_at)return res.status(400).json({error:'missing_fields'});await pool.query(`INSERT INTO seasonal_campaigns(slug,name,starts_at,ends_at,headline,message,accent,background_effect,banner_url,shop_collection,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,starts_at=excluded.starts_at,ends_at=excluded.ends_at,headline=excluded.headline,message=excluded.message,accent=excluded.accent,background_effect=excluded.background_effect,banner_url=excluded.banner_url,shop_collection=excluded.shop_collection,active=excluded.active,updated_at=now()`,[b.slug,b.name,b.starts_at,b.ends_at,b.headline||null,b.message||null,b.accent||null,b.background_effect||null,b.banner_url||null,b.shop_collection||null,b.active!==false]);res.json({ok:true});});
app.post('/api/admin/shop-product',admin,async(req,res)=>{const b=req.body||{};if(!b.slug||!b.name)return res.status(400).json({error:'missing_fields'});await pool.query(`INSERT INTO shop_products(slug,name,description,price,image_url,stock,active,featured,collection) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description,price=excluded.price,image_url=excluded.image_url,stock=excluded.stock,active=excluded.active,featured=excluded.featured,collection=excluded.collection,updated_at=now()`,[b.slug,b.name,b.description||null,Number.isInteger(b.price)?b.price:null,b.image_url||null,Number.isInteger(b.stock)?b.stock:null,b.active!==false,!!b.featured,b.collection||null]);res.json({ok:true});});
app.get('/',(_q,r)=>r.type('text').send('Afiléon Live Services API v2'));

migrate().then(()=>app.listen(port,'0.0.0.0',()=>console.log(`Afiléon Live Services v2 listening on ${port}`))).catch(e=>{console.error(e);process.exit(1)});
