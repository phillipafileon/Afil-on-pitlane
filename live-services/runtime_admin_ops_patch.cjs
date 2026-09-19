const fs=require('fs');
const path='server_v3.js';
let s=fs.readFileSync(path,'utf8');

function replaceBlock(startMarker,endMarker,replacement,label){
  const a=s.indexOf(startMarker),b=s.indexOf(endMarker,a);
  if(a<0||b<0)throw new Error('admin ops patch missing '+label);
  s=s.slice(0,a)+replacement+s.slice(b);
}

if(!s.includes('CREATE TABLE IF NOT EXISTS admin_sessions(')){
  const m='    CREATE TABLE IF NOT EXISTS seasonal_campaigns(';
  if(!s.includes(m))throw new Error('admin ops migration marker missing');
  const sql=[
    "    CREATE TABLE IF NOT EXISTS admin_login_attempts(",
    "      id BIGSERIAL PRIMARY KEY, username TEXT, ip TEXT, success BOOLEAN NOT NULL DEFAULT false, attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()",
    "    );",
    "    CREATE INDEX IF NOT EXISTS admin_login_attempts_recent_idx ON admin_login_attempts(attempted_at DESC);",
    "    CREATE TABLE IF NOT EXISTS admin_login_challenges(",
    "      public_id TEXT PRIMARY KEY, username TEXT NOT NULL, code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, remember_device BOOLEAN NOT NULL DEFAULT false, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()",
    "    );",
    "    CREATE TABLE IF NOT EXISTS admin_sessions(",
    "      token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL, last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(), revoked_at TIMESTAMPTZ, ip TEXT, user_agent TEXT",
    "    );",
    "    CREATE INDEX IF NOT EXISTS admin_sessions_active_idx ON admin_sessions(expires_at,revoked_at);",
    "    CREATE TABLE IF NOT EXISTS admin_audit_log(",
    "      id BIGSERIAL PRIMARY KEY, username TEXT, action TEXT NOT NULL, detail JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()",
    "    );",
    "    CREATE TABLE IF NOT EXISTS vehicle_maintenance(",
    "      id BIGSERIAL PRIMARY KEY, vehicle_code TEXT NOT NULL DEFAULT 'e46', category TEXT NOT NULL, title TEXT NOT NULL, notes TEXT, mileage INTEGER, track_hours NUMERIC(10,1), cost INTEGER, performed_at DATE NOT NULL DEFAULT CURRENT_DATE, next_due_date DATE, next_due_mileage INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now()",
    "    );",
    "    CREATE TABLE IF NOT EXISTS vehicle_inspections(",
    "      id BIGSERIAL PRIMARY KEY, vehicle_code TEXT NOT NULL DEFAULT 'e46', booking_id TEXT, inspection_type TEXT NOT NULL, mileage INTEGER, tyres TEXT, brakes TEXT, fluids TEXT, body_condition TEXT, damage_notes TEXT, inspector TEXT, inspected_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now()",
    "    );",
    "    CREATE TABLE IF NOT EXISTS booking_record_entries(",
    "      id BIGSERIAL PRIMARY KEY,",
    "      booking_id TEXT NOT NULL,",
    "      section TEXT NOT NULL,",
    "      entry_type TEXT,",
    "      title TEXT,",
    "      status TEXT,",
    "      notes TEXT,",
    "      reference_url TEXT,",
    "      occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),",
    "      payload JSONB NOT NULL DEFAULT '{}'::jsonb,",
    "      created_by TEXT,",
    "      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),",
    "      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()",
    "    );",
    "    CREATE INDEX IF NOT EXISTS booking_record_entries_booking_idx ON booking_record_entries(booking_id,section,occurred_at,id);",
    "    CREATE TABLE IF NOT EXISTS booking_endofday_receipts(",
    "      booking_id TEXT PRIMARY KEY, receipt_version TEXT NOT NULL, snapshot JSONB NOT NULL DEFAULT '{}'::jsonb, generated_at TIMESTAMPTZ NOT NULL DEFAULT now(), generated_by TEXT, sent_at TIMESTAMPTZ, sent_to TEXT, sent_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()",
    "    );",
    "    CREATE INDEX IF NOT EXISTS booking_endofday_receipts_sent_idx ON booking_endofday_receipts(sent_at DESC);",
    "    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS abandoned_email_sent_at TIMESTAMPTZ;",
    "",
  ].join('\n');
  s=s.replace(m,sql+m);
}

if(!s.includes("const ADMIN_LOGIN_USER = process.env.ADMIN_LOGIN_USER")){
  const m="const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';";
  if(!s.includes(m))throw new Error('admin config marker missing');
  s=s.replace(m,m+"\nconst ADMIN_LOGIN_USER = process.env.ADMIN_LOGIN_USER || '';\nconst ADMIN_LOGIN_EMAIL = process.env.ADMIN_LOGIN_EMAIL || 'team@afileonmotorsport.co.uk';\nconst ADMIN_LEGACY_TOKEN_ENABLED = String(process.env.ADMIN_LEGACY_TOKEN_ENABLED || 'false').toLowerCase() === 'true';\nconst ADMIN_SESSION_HOURS = Number(process.env.ADMIN_SESSION_HOURS || 12);\nconst ADMIN_TRUST_DAYS = Number(process.env.ADMIN_TRUST_DAYS || 30);");
}

if(!s.includes('function adminSessionHash(')){
  const m='function admin(req, res, next) {';
  const i=s.indexOf(m); if(i<0)throw new Error('admin helper marker missing');
  const h=[
    "function adminSessionHash(token){return crypto.createHash('sha256').update(String(token||'')).digest('hex');}",
    "function adminOtpHash(code){return crypto.createHmac('sha256',ADMIN_TOKEN||CRON_SECRET||'afileon-admin-otp').update(String(code||'')).digest('hex');}",
    "function safeAdminSecret(a,b){const aa=crypto.createHash('sha256').update(String(a||'')).digest(),bb=crypto.createHash('sha256').update(String(b||'')).digest();return crypto.timingSafeEqual(aa,bb);}",
    "function requestIp(req){return clean(String(req.headers['x-forwarded-for']||req.ip||'').split(',')[0],100);}",
    "async function auditAdmin(username,action,detail={}){try{await pool.query(`INSERT INTO admin_audit_log(username,action,detail) VALUES($1,$2,$3::jsonb)`,[username||null,clean(action,160),JSON.stringify(detail||{})])}catch(e){console.error('admin audit failed',e.message)}}",
    "function csvCell(v){const x=String(v??'');return /[\\\",\\n\\r]/.test(x)?'\\\"'+x.replace(/\\\"/g,'\\\"\\\"')+'\\\"':x;}",
    "",
  ].join('\n');
  s=s.slice(0,i)+h+s.slice(i);
}

const adminFn=[
  "async function admin(req, res, next) {",
  "  try{",
  "    const auth=String(req.get('authorization')||'');",
  "    const bearer=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';",
  "    let username='';",
  "    if(bearer){",
  "      const hash=adminSessionHash(bearer);",
  "      const {rows}=await pool.query(`SELECT username,expires_at FROM admin_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now() LIMIT 1`,[hash]);",
  "      const sess=rows[0];",
  "      if(!sess)return res.status(401).json({error:'unauthorized',detail:'Admin session expired. Sign in again.'});",
  "      username=sess.username; req.adminSessionHash=hash;",
  "      await pool.query(`UPDATE admin_sessions SET last_seen_at=now() WHERE token_hash=$1`,[hash]).catch(()=>{});",
  "    } else if(ADMIN_LEGACY_TOKEN_ENABLED && ADMIN_TOKEN && safeAdminSecret(req.get('x-admin-token')||'',ADMIN_TOKEN)){",
  "      username='legacy-admin';",
  "    } else return res.status(401).json({error:'unauthorized'});",
  "    req.adminUsername=username;",
  "    if(req.method!=='GET'&&req.method!=='HEAD'){const action=req.method+' '+req.path;res.on('finish',()=>{if(res.statusCode<400)auditAdmin(username,action,{status:res.statusCode}).catch(()=>{})});}",
  "    next();",
  "  }catch(e){console.error('admin auth',e);res.status(500).json({error:'admin_auth_failed'});}",
  "}",
  ""
].join('\n');
replaceBlock('function admin(req, res, next) {','function cronAuth',adminFn,'admin middleware');

if(!s.includes("app.get('/api/admin/auth/status'")){
  const m="app.get('/api/config'";
  const i=s.indexOf(m); if(i<0)throw new Error('admin auth route marker missing');
  const routes=[
    "app.get('/api/admin/auth/status',(_req,res)=>res.json({configured:!!(ADMIN_LOGIN_USER&&ADMIN_LOGIN_EMAIL&&EMAIL_ENABLED),email_verification:true,password_required:false,session_hours:ADMIN_SESSION_HOURS,trusted_device_days:ADMIN_TRUST_DAYS}));",
    "app.post('/api/admin/auth/login',async(req,res)=>{",
    "  const username=clean(req.body?.username,200).toLowerCase(),remember=!!req.body?.remember_device,ip=requestIp(req);",
    "  const recent=await pool.query(`SELECT count(*)::int n FROM admin_login_attempts WHERE attempted_at>now()-interval '15 minutes' AND (ip=$1 OR lower(username)=lower($2))`,[ip,username]);",
    "  if(Number(recent.rows[0]?.n||0)>=5)return res.status(429).json({error:'too_many_attempts',detail:'Too many sign-in code requests. Try again in about 15 minutes.'});",
    "  const ok=ADMIN_LOGIN_USER&&username===String(ADMIN_LOGIN_USER).toLowerCase();",
    "  await pool.query(`INSERT INTO admin_login_attempts(username,ip,success) VALUES($1,$2,$3)`,[username||null,ip,!!ok]);",
    "  if(!ok){await new Promise(r=>setTimeout(r,450));return res.status(401).json({error:'invalid_credentials',detail:'The admin login email is not recognised.'});}",
    "  if(!EMAIL_ENABLED)return res.status(503).json({error:'email_not_configured',detail:'Two-factor email is unavailable.'});",
    "  const code=String(crypto.randomInt(100000,1000000)),id=token('admch');",
    "  await pool.query(`INSERT INTO admin_login_challenges(public_id,username,code_hash,remember_device,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')`,[id,username,adminOtpHash(code),remember]);",
    "  try{await txMail(ADMIN_LOGIN_EMAIL,'Afiléon Motorsport admin verification code',`<p>A sign-in was requested for Operations Control.</p><div style=\"font-size:32px;letter-spacing:.18em;color:#ffd84d;text-align:center\">${code}</div><p>This code expires in 10 minutes. If this was not you, do not share the code.</p>`,`Afiléon Motorsport admin verification code: ${code}. It expires in 10 minutes.`);}catch(e){await pool.query(`DELETE FROM admin_login_challenges WHERE public_id=$1`,[id]);return res.status(503).json({error:'verification_email_failed',detail:'Could not send the verification email.'});}",
    "  await auditAdmin(username,'admin_login_password_ok',{ip});",
    "  res.json({challenge_id:id,verification_required:true,expires_in_seconds:600,destination:'team email'});",
    "});",
    "app.post('/api/admin/auth/verify',async(req,res)=>{",
    "  const id=clean(req.body?.challenge_id,120),code=clean(req.body?.code,12),ip=requestIp(req);",
    "  const client=await pool.connect();",
    "  try{await client.query('BEGIN');const q=await client.query(`SELECT * FROM admin_login_challenges WHERE public_id=$1 FOR UPDATE`,[id]);const ch=q.rows[0];",
    "    if(!ch||ch.used_at||new Date(ch.expires_at)<=new Date()||Number(ch.attempts||0)>=5){await client.query('ROLLBACK');return res.status(400).json({error:'verification_expired',detail:'The verification code has expired. Start sign-in again.'});}",
    "    const ok=safeAdminSecret(adminOtpHash(code),ch.code_hash);",
    "    if(!ok){await client.query(`UPDATE admin_login_challenges SET attempts=attempts+1 WHERE public_id=$1`,[id]);await client.query('COMMIT');return res.status(400).json({error:'verification_code_incorrect',detail:'That verification code is not correct.'});}",
    "    const raw='adms_'+crypto.randomBytes(32).toString('hex'),hash=adminSessionHash(raw),days=ch.remember_device?ADMIN_TRUST_DAYS:null,hours=ch.remember_device?null:ADMIN_SESSION_HOURS;",
    "    const exp=new Date(Date.now()+(days?days*86400000:hours*3600000));",
    "    await client.query(`UPDATE admin_login_challenges SET used_at=now() WHERE public_id=$1`,[id]);",
    "    await client.query(`INSERT INTO admin_sessions(token_hash,username,expires_at,ip,user_agent) VALUES($1,$2,$3,$4,$5)`,[hash,ch.username,exp,ip,clean(req.get('user-agent')||'',300)]);",
    "    await client.query('COMMIT');await auditAdmin(ch.username,'admin_login_verified',{ip,remember_device:!!ch.remember_device});",
    "    res.json({authenticated:true,session_token:raw,expires_at:exp.toISOString(),username:ch.username});",
    "  }catch(e){await client.query('ROLLBACK');console.error('admin verify',e);res.status(500).json({error:'verification_failed'});}finally{client.release();}",
    "});",
    "app.get('/api/admin/auth/session',admin,async(req,res)=>{let expires_at=null;if(req.adminSessionHash){const q=await pool.query(`SELECT expires_at FROM admin_sessions WHERE token_hash=$1`,[req.adminSessionHash]);expires_at=q.rows[0]?.expires_at||null;}res.json({authenticated:true,username:req.adminUsername,expires_at});});",
    "app.post('/api/admin/auth/logout',admin,async(req,res)=>{if(req.adminSessionHash)await pool.query(`UPDATE admin_sessions SET revoked_at=now() WHERE token_hash=$1`,[req.adminSessionHash]);res.json({ok:true});});",
    "app.post('/api/admin/auth/logout-all',admin,async(req,res)=>{await pool.query(`UPDATE admin_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE revoked_at IS NULL`);await auditAdmin(req.adminUsername,'admin_logout_all',{});res.json({ok:true});});",
    "",
  ].join('\n');
  s=s.slice(0,i)+routes+s.slice(i);
}

if(!s.includes("app.get('/api/admin/dashboard'")){
  const m="app.post('/api/admin/block-date'";
  const i=s.indexOf(m); if(i<0)throw new Error('admin dashboard marker missing');
  const routes=[
    "app.get('/api/admin/dashboard',admin,async(_req,res)=>{",
    "  const [b,o,v,d]=await Promise.all([",
    "    pool.query(`SELECT count(*) FILTER (WHERE booking_date>=CURRENT_DATE AND status IN ('confirmed','confirmed_pending_licence'))::int upcoming,COALESCE(sum(amount_paid) FILTER (WHERE status IN ('confirmed','confirmed_pending_licence')),0)::bigint paid,COALESCE(sum(balance_amount) FILTER (WHERE balance_status IN ('scheduled','invoiced','payment_failed') AND status IN ('confirmed','confirmed_pending_licence')),0)::bigint outstanding,COALESCE(sum(amount_paid) FILTER (WHERE created_at>=date_trunc('month',now())),0)::bigint month_paid FROM bookings`),",
    "    pool.query(`SELECT COALESCE(sum(total) FILTER (WHERE status IN ('paid','processing','shipped')),0)::bigint revenue,COALESCE(sum(total) FILTER (WHERE status IN ('paid','processing','shipped') AND created_at>=date_trunc('month',now())),0)::bigint month_revenue,count(*) FILTER (WHERE status IN ('paid','processing','shipped'))::int paid_orders FROM orders`),",
    "    pool.query(`SELECT COALESCE(sum(balance_remaining) FILTER (WHERE status='active'),0)::bigint liability,count(*) FILTER (WHERE status='active')::int active FROM gift_vouchers`),",
    "    pool.query(`SELECT count(*) FILTER (WHERE active=true)::int active_codes,COALESCE(sum(uses_used),0)::int uses FROM discount_codes`)",
    "  ]);",
    "  res.json({bookings:b.rows[0],shop:o.rows[0],vouchers:v.rows[0],discounts:d.rows[0]});",
    "});",
    "app.get('/api/admin/audit',admin,async(_req,res)=>{const {rows}=await pool.query(`SELECT id,username,action,detail,created_at FROM admin_audit_log ORDER BY created_at DESC LIMIT 100`);res.json({events:rows});});",
    "app.get('/api/admin/vehicle/e46',admin,async(_req,res)=>{const [m,i]=await Promise.all([pool.query(`SELECT * FROM vehicle_maintenance WHERE vehicle_code='e46' ORDER BY performed_at DESC,id DESC LIMIT 100`),pool.query(`SELECT * FROM vehicle_inspections WHERE vehicle_code='e46' ORDER BY inspected_at DESC,id DESC LIMIT 100`)]);const today=new Date().toISOString().slice(0,10);const due=m.rows.filter(x=>(x.next_due_date&&String(x.next_due_date).slice(0,10)<=today));res.json({maintenance:m.rows,inspections:i.rows,due});});",
    "app.post('/api/admin/vehicle/e46/maintenance',admin,async(req,res)=>{const b=req.body||{},category=clean(b.category,60),title=clean(b.title,160);if(!category||!title)return res.status(400).json({error:'missing_fields'});const {rows}=await pool.query(`INSERT INTO vehicle_maintenance(vehicle_code,category,title,notes,mileage,track_hours,cost,performed_at,next_due_date,next_due_mileage) VALUES('e46',$1,$2,$3,$4,$5,$6,COALESCE($7::date,CURRENT_DATE),$8::date,$9) RETURNING *`,[category,title,clean(b.notes,2000)||null,Number.isInteger(Number(b.mileage))?Number(b.mileage):null,Number.isFinite(Number(b.track_hours))?Number(b.track_hours):null,Number.isInteger(Number(b.cost))?Number(b.cost):null,b.performed_at||null,b.next_due_date||null,Number.isInteger(Number(b.next_due_mileage))?Number(b.next_due_mileage):null]);res.status(201).json({ok:true,item:rows[0]});});",
    "app.post('/api/admin/vehicle/e46/inspection',admin,async(req,res)=>{const b=req.body||{},type=clean(b.inspection_type,40);if(!['pre_event','post_event','routine'].includes(type))return res.status(400).json({error:'invalid_inspection_type'});const {rows}=await pool.query(`INSERT INTO vehicle_inspections(vehicle_code,booking_id,inspection_type,mileage,tyres,brakes,fluids,body_condition,damage_notes,inspector,inspected_at) VALUES('e46',$1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::timestamptz,now())) RETURNING *`,[clean(b.booking_id,120)||null,type,Number.isInteger(Number(b.mileage))?Number(b.mileage):null,clean(b.tyres,1000)||null,clean(b.brakes,1000)||null,clean(b.fluids,1000)||null,clean(b.body_condition,1000)||null,clean(b.damage_notes,2000)||null,clean(b.inspector,120)||null,b.inspected_at||null]);res.status(201).json({ok:true,item:rows[0]});});",
    "app.get('/api/admin/booking-record/:id',admin,async(req,res)=>{",
    "  const id=clean(req.params.id,120);",
    "  const q=await pool.query(`SELECT public_id,service_id,variant_id,booking_date::text booking_date,customer_name,customer_email,customer_phone,service_address,postcode,vehicle_details,notes,status,amount_total,amount_paid,booking_payment_amount,balance_amount,balance_due_at,balance_status,licence_required,licence_status,safe_work_area_confirmed,terms_version,terms_accepted_at,terms_customer_name,terms_documents,damage_security_amount,stripe_payment_intent_id,stripe_checkout_session_id,stripe_balance_invoice_id,created_at,updated_at FROM bookings WHERE public_id=$1 LIMIT 1`,[id]);",
    "  const b=q.rows[0];if(!b)return res.status(404).json({error:'booking_not_found'});",
    "  const svc=SERVICE_MAP.get(b.service_id);",
    "  const sectionOrder=['customer','terms','vehicle','photos','inspections','driver_checks','sessions','incidents','payments','handover'];",
    "  const [e,i]=await Promise.all([pool.query(`SELECT id,booking_id,section,entry_type,title,status,notes,reference_url,occurred_at,payload,created_by,created_at,updated_at FROM booking_record_entries WHERE booking_id=$1 ORDER BY occurred_at ASC,id ASC`,[id]),pool.query(`SELECT * FROM vehicle_inspections WHERE booking_id=$1 ORDER BY inspected_at ASC,id ASC`,[id])]);",
    "  const sections=Object.fromEntries(sectionOrder.map(k=>[k,{entries:[]} ]));",
    "  for(const x of e.rows){if(sections[x.section])sections[x.section].entries.push(x)}",
    "  for(const x of i.rows){sections.inspections.entries.push({id:'vehicle_inspection_'+x.id,source:'vehicle_inspections',entry_type:x.inspection_type,title:'E46 '+String(x.inspection_type||'inspection').replace(/_/g,' '),status:null,notes:[x.tyres,x.brakes,x.fluids,x.body_condition,x.damage_notes].filter(Boolean).join(' • '),reference_url:null,occurred_at:x.inspected_at,payload:x,created_by:x.inspector||null,created_at:x.created_at})}",
    "  const terms=[{name:'Afiléon Motorsport Booking Terms',url:SITE_URL+'/booking-terms.html'}];",
    "  const addTerm=(name,path)=>terms.push({name,url:SITE_URL+'/'+path});",
    "  if(b.service_id==='pre_track_inspection')addTerm('Pre-Track-Day Inspection Terms','pre-track-inspection-terms.html');",
    "  if(b.service_id==='vehicle_hire_day')addTerm('BMW E46 Arrive & Drive / Vehicle Hire Terms','vehicle-hire-terms.html');",
    "  if(b.service_id==='track_day_support'||b.service_id==='race_day_support')addTerm('Track-Day & Race-Day Support Terms','track-support-terms.html');",
    "  if(b.service_id==='vehicle_transport')addTerm('Customer Vehicle Transport Terms','transport-terms.html');",
    "  if(b.service_id==='full_package'){addTerm('BMW E46 Arrive & Drive / Vehicle Hire Terms','vehicle-hire-terms.html');addTerm('Customer Vehicle Transport Terms','transport-terms.html');addTerm('Track-Day & Race-Day Support Terms','track-support-terms.html')}",
    "  sections.customer.base={name:b.customer_name,email:b.customer_email,phone:b.customer_phone,address:b.service_address,postcode:b.postcode};",
    "  sections.terms.base={accepted_at:b.terms_accepted_at,accepted_customer:b.terms_customer_name||b.customer_name,version:b.terms_version,applicable_terms:(Array.isArray(b.terms_documents)&&b.terms_documents.length)?b.terms_documents:terms};",
    "  sections.vehicle.base={vehicle_details:b.vehicle_details,booking_notes:b.notes,service:svc?.name||b.service_id,variant_id:b.variant_id,service_address:b.service_address,postcode:b.postcode};",
    "  sections.payments.base={amount_total:b.amount_total,amount_paid:b.amount_paid,booking_payment_amount:b.booking_payment_amount,balance_amount:b.balance_amount,balance_due_at:b.balance_due_at,balance_status:b.balance_status,damage_security_amount:b.damage_security_amount,payment_intent_id:b.stripe_payment_intent_id,checkout_session_id:b.stripe_checkout_session_id,balance_invoice_id:b.stripe_balance_invoice_id};",
    "  sections.handover.incident_summary=sections.incidents.entries.map(x=>({id:x.id,incident_type:x.entry_type||null,title:x.title||null,timestamp:x.occurred_at,status:x.status||null,notes:x.notes||null,evidence_link:x.reference_url||null,administrator:x.created_by||null})).sort((a,b)=>new Date(a.timestamp||0)-new Date(b.timestamp||0));",
    "  const receiptChecks=[...sections.inspections.entries,...sections.driver_checks.entries].map(x=>({type:x.entry_type||x.inspection_type||null,title:x.title||'Vehicle / driver check',status:x.status||null,timestamp:x.occurred_at||x.inspected_at||x.created_at||null,notes:x.notes||null,administrator:x.created_by||x.inspector||null})).sort((a,b)=>new Date(a.timestamp||0)-new Date(b.timestamp||0));",
    "  const finalHandover=sections.handover.entries.length?sections.handover.entries[sections.handover.entries.length-1]:null;",
    "  sections.handover.end_of_day_receipt={receipt_version:'2026-09-19-v2',customer:{name:b.customer_name,email:b.customer_email},vehicle:{details:b.vehicle_details,service:svc?.name||b.service_id,variant_id:b.variant_id},checks_completed:receiptChecks,incident_chronology:sections.handover.incident_summary,damage_status:finalHandover?.status||'Not recorded',payments:sections.payments.base,final_handover:finalHandover?{title:finalHandover.title||null,status:finalHandover.status||null,timestamp:finalHandover.occurred_at||null,notes:finalHandover.notes||null,administrator:finalHandover.created_by||null}:null};",
    "  res.json({booking:{reference:b.public_id,service_id:b.service_id,service_name:svc?.name||b.service_id,variant_id:b.variant_id,booking_date:b.booking_date,status:b.status,created_at:b.created_at,updated_at:b.updated_at,licence_required:b.licence_required,licence_status:b.licence_status},section_order:sectionOrder,sections});",
    "});",
    "app.post('/api/admin/booking-record/:id/entry',admin,async(req,res)=>{",
    "  const id=clean(req.params.id,120),b=req.body||{},section=clean(b.section,40);",
    "  const allowed=new Set(['customer','terms','vehicle','photos','inspections','driver_checks','sessions','incidents','payments','handover']);",
    "  if(!allowed.has(section))return res.status(400).json({error:'invalid_section'});",
    "  const exists=await pool.query(`SELECT 1 FROM bookings WHERE public_id=$1 LIMIT 1`,[id]);if(!exists.rowCount)return res.status(404).json({error:'booking_not_found'});",
    "  const payload=(b.payload&&typeof b.payload==='object'&&!Array.isArray(b.payload))?b.payload:{};",
    "  const raw=JSON.stringify(payload);if(raw.length>20000)return res.status(400).json({error:'payload_too_large'});",
    "  const occurred=b.occurred_at?new Date(b.occurred_at):new Date();if(Number.isNaN(occurred.getTime()))return res.status(400).json({error:'invalid_occurred_at'});",
    "  const {rows}=await pool.query(`INSERT INTO booking_record_entries(booking_id,section,entry_type,title,status,notes,reference_url,occurred_at,payload,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) RETURNING *`,[id,section,clean(b.entry_type,80)||null,clean(b.title,160)||null,clean(b.status,80)||null,clean(b.notes,4000)||null,clean(b.reference_url,1000)||null,occurred.toISOString(),raw,clean(req.adminUsername,200)||null]);",
    "  await auditAdmin(req.adminUsername,'booking_record_entry_added',{booking_id:id,section,entry_id:rows[0].id});",
    "  res.status(201).json({ok:true,item:rows[0]});",
    "});",
    "app.post('/api/admin/booking-record/:id/e46-incident',admin,async(req,res)=>{",
    "  const id=clean(req.params.id,120),b=req.body||{};",
    "  const bookingQ=await pool.query(`SELECT public_id,service_id,customer_name FROM bookings WHERE public_id=$1 LIMIT 1`,[id]);",
    "  const booking=bookingQ.rows[0];if(!booking)return res.status(404).json({error:'booking_not_found'});",
    "  if(!['vehicle_hire_day','full_package'].includes(booking.service_id))return res.status(409).json({error:'e46_incident_not_applicable',detail:'Pit-lane incident reports can only be attached to E46 Arrive & Drive / full-package bookings.'});",
    "  const incidentType=clean(b.incident_type,80)||'other',status=clean(b.status,80)||'HOLD';",
    "  const allowedStatus=new Set(['HOLD','STOP','CLEARED','CLEARED_WITH_RESTRICTION','CLOSED']);if(!allowedStatus.has(status))return res.status(400).json({error:'invalid_incident_status'});",
    "  const occurred=b.occurred_at?new Date(b.occurred_at):new Date();if(Number.isNaN(occurred.getTime()))return res.status(400).json({error:'invalid_occurred_at'});",
    "  const payload={session:clean(b.session,80)||null,lap:clean(b.lap,40)||null,driver:clean(b.driver,120)||null,symptoms:clean(b.symptoms,2000)||null,warning_lights:clean(b.warning_lights,1000)||null,noises:clean(b.noises,1000)||null,vibrations:clean(b.vibrations,1000)||null,contact:clean(b.contact,1500)||null,immediate_action:clean(b.immediate_action,2000)||null,vehicle_status:status,mechanic_signoff:clean(b.mechanic_signoff,120)||null,restriction:clean(b.restriction,1000)||null};",
    "  const raw=JSON.stringify(payload);",
    "  const lines=[payload.session&&('Session: '+payload.session),payload.lap&&('Lap: '+payload.lap),payload.driver&&('Driver: '+payload.driver),payload.symptoms&&('Symptoms: '+payload.symptoms),payload.warning_lights&&('Warning lights: '+payload.warning_lights),payload.noises&&('Noises: '+payload.noises),payload.vibrations&&('Vibrations: '+payload.vibrations),payload.contact&&('Contact / off-track: '+payload.contact),payload.immediate_action&&('Immediate action: '+payload.immediate_action),payload.restriction&&('Restriction / instruction: '+payload.restriction),payload.mechanic_signoff&&('Mechanic sign-off: '+payload.mechanic_signoff)].filter(Boolean);",
    "  const title=clean(b.title,160)||('E46 pit-lane incident — '+incidentType.replace(/_/g,' '));",
    "  const {rows}=await pool.query(`INSERT INTO booking_record_entries(booking_id,section,entry_type,title,status,notes,reference_url,occurred_at,payload,created_by) VALUES($1,'incidents',$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING *`,[id,incidentType,title,status,lines.join('\\n')||null,clean(b.evidence_url,1000)||null,occurred.toISOString(),raw,clean(req.adminUsername,200)||null]);",
    "  await auditAdmin(req.adminUsername,'e46_pitlane_incident_recorded',{booking_id:id,entry_id:rows[0].id,incident_type:incidentType,status});",
    "  res.status(201).json({ok:true,item:rows[0]});",
    "});",
    "app.post('/api/admin/booking-record/:id/end-of-day-receipt/send',admin,async(req,res)=>{",
    "  if(!EMAIL_ENABLED)return res.status(503).json({error:'email_not_configured'});",
    "  const id=clean(req.params.id,120);",
    "  const q=await pool.query(`SELECT * FROM bookings WHERE public_id=$1 LIMIT 1`,[id]);const b=q.rows[0];if(!b)return res.status(404).json({error:'booking_not_found'});if(!b.customer_email)return res.status(409).json({error:'customer_email_missing'});",
    "  const svc=SERVICE_MAP.get(b.service_id);",
    "  const [e,i]=await Promise.all([pool.query(`SELECT id,section,entry_type,title,status,notes,reference_url,occurred_at,payload,created_by,created_at FROM booking_record_entries WHERE booking_id=$1 ORDER BY occurred_at ASC,id ASC`,[id]),pool.query(`SELECT * FROM vehicle_inspections WHERE booking_id=$1 ORDER BY inspected_at ASC,id ASC`,[id])]);",
    "  const checks=[...i.rows.map(x=>({type:x.inspection_type,title:'E46 '+String(x.inspection_type||'inspection').replace(/_/g,' '),status:null,timestamp:x.inspected_at,notes:[x.tyres,x.brakes,x.fluids,x.body_condition,x.damage_notes].filter(Boolean).join(' • ')||null,administrator:x.inspector||null})),...e.rows.filter(x=>x.section==='inspections'||x.section==='driver_checks').map(x=>({type:x.entry_type||null,title:x.title||'Vehicle / driver check',status:x.status||null,timestamp:x.occurred_at,notes:x.notes||null,administrator:x.created_by||null}))].sort((a,b)=>new Date(a.timestamp||0)-new Date(b.timestamp||0));",
    "  const incidents=e.rows.filter(x=>x.section==='incidents').map(x=>({incident_type:x.entry_type||null,title:x.title||null,timestamp:x.occurred_at,status:x.status||null,notes:x.notes||null,evidence_link:x.reference_url||null,administrator:x.created_by||null})).sort((a,b)=>new Date(a.timestamp||0)-new Date(b.timestamp||0));",
    "  const handovers=e.rows.filter(x=>x.section==='handover');const finalHandover=handovers.length?handovers[handovers.length-1]:null;",
    "  const receipt={receipt_version:'2026-09-19-v2',generated_at:new Date().toISOString(),booking:{reference:b.public_id,date:isoDate(b.booking_date),service:svc?.name||b.service_id,status:b.status},customer:{name:b.customer_name,email:b.customer_email},vehicle:{details:b.vehicle_details||'Not recorded',service:svc?.name||b.service_id,variant_id:b.variant_id||null},checks_completed:checks,incident_chronology:incidents,damage_status:finalHandover?.status||'Not recorded',payments:{amount_total:b.amount_total,amount_paid:b.amount_paid,booking_payment_amount:b.booking_payment_amount,balance_amount:b.balance_amount,balance_due_at:b.balance_due_at,balance_status:b.balance_status},final_handover:finalHandover?{title:finalHandover.title||null,status:finalHandover.status||null,timestamp:finalHandover.occurred_at||null,notes:finalHandover.notes||null,administrator:finalHandover.created_by||null}:null};",
    "  const esc=eEsc,fmt=v=>v?new Date(v).toLocaleString('en-GB',{timeZone:'Europe/London',dateStyle:'medium',timeStyle:'short'}):'Not recorded',safeUrl=v=>{try{const u=new URL(String(v||''));return /^https?:$/.test(u.protocol)?u.href:''}catch{return ''}};",
    "  const checkHtml=checks.length?'<ul>'+checks.map(x=>'<li><b>'+esc(x.title||x.type||'Check')+'</b> — '+esc(x.status||'Recorded')+' — '+esc(fmt(x.timestamp))+(x.notes?'<br>'+esc(x.notes):'')+(x.administrator?'<br><small>Recorded by '+esc(x.administrator)+'</small>':'')+'</li>').join('')+'</ul>':'<p>No checks have been recorded.</p>';",
    "  const incidentHtml=incidents.length?'<ol>'+incidents.map(x=>{const u=safeUrl(x.evidence_link);return '<li><b>'+esc(x.title||String(x.incident_type||'Incident').replace(/_/g,' '))+'</b> — '+esc(x.status||'No status')+' — '+esc(fmt(x.timestamp))+(x.notes?'<br>'+esc(x.notes):'')+(u?'<br><a href=\"'+esc(u)+'\">Open evidence</a>':'')+(x.administrator?'<br><small>Recorded by '+esc(x.administrator)+'</small>':'')+'</li>'}).join('')+'</ol>':'<p>No incidents were recorded against this booking.</p>';",
    "  const hand=receipt.final_handover;",
    "  const body='<div style=\"border:1px solid #31425d;border-radius:14px;overflow:hidden;background:#07111d;margin-bottom:22px\"><div style=\"padding:20px 22px;background:#030912;border-bottom:3px solid #ffd84d\"><img src=\"'+esc(SITE_URL+'/assets/afileon-wordmark.png')+'\" alt=\"Afiléon Motorsport\" style=\"display:block;max-width:250px;width:70%;height:auto;margin-bottom:14px\"><div style=\"font-size:11px;letter-spacing:.18em;color:#ffd84d;font-weight:700\">END-OF-DAY CUSTOMER RECEIPT</div><div style=\"font-size:24px;color:#fff;font-weight:800;margin-top:5px\">Booking '+esc(b.public_id)+'</div></div><div style=\"padding:14px 22px;color:#cbd8e6;font-size:13px;line-height:1.6\"><b style=\"color:#fff\">Afiléon Motorsport</b><br><a href=\"'+esc(SITE_URL)+'\" style=\"color:#7dd3fc\">afileonmotorsport.co.uk</a> &nbsp;•&nbsp; <a href=\"mailto:'+esc(EMAIL_REPLY_TO)+'\" style=\"color:#7dd3fc\">'+esc(EMAIL_REPLY_TO)+'</a><br>WhatsApp: 07933 108942</div></div><p>Hello '+esc(b.customer_name||'')+',</p><p>Thank you for your booking. This receipt summarises the vehicle, operational checks, incidents, payments and final handover recorded for your day with Afiléon Motorsport.</p><div style=\"display:block;border:1px solid #31425d;border-radius:10px;padding:14px 16px;margin:16px 0;background:#08111f\"><b>Booking reference:</b> '+esc(b.public_id)+'<br><b>Date:</b> '+esc(isoDate(b.booking_date))+'<br><b>Service:</b> '+esc(svc?.name||b.service_id)+'</div><h2>Vehicle</h2><p>'+esc(receipt.vehicle.details)+'</p><h2>Checks completed</h2>'+checkHtml+'<h2>Incident chronology</h2>'+incidentHtml+'<h2>Damage status</h2><p><b>'+esc(receipt.damage_status)+'</b></p><h2>Payments</h2><p><b>Total:</b> '+gbp(b.amount_total)+'<br><b>Paid:</b> '+gbp(b.amount_paid)+'<br><b>Outstanding balance:</b> '+gbp(b.balance_amount)+'<br><b>Balance status:</b> '+esc(b.balance_status||((Number(b.balance_amount||0)<=0)?'paid':'Not recorded'))+'</p><h2>Final handover</h2>'+(hand?'<p><b>'+esc(hand.title||'Final handover')+'</b><br>Status: '+esc(hand.status||'Not recorded')+'<br>Time: '+esc(fmt(hand.timestamp))+(hand.notes?'<br>'+esc(hand.notes):'')+(hand.administrator?'<br>Recorded by '+esc(hand.administrator):'')+'</p>':'<p>Final handover details have not been recorded.</p>')+'<div style=\"margin-top:26px;padding-top:16px;border-top:1px solid #31425d;color:#9fb0c7;font-size:12px;line-height:1.6\">This receipt summarises the operational record held against booking <b style=\"color:#dce7f2\">'+esc(b.public_id)+'</b>. If anything appears incorrect, contact <a href=\"mailto:'+esc(EMAIL_REPLY_TO)+'\" style=\"color:#7dd3fc\">'+esc(EMAIL_REPLY_TO)+'</a> or WhatsApp 07933 108942.<br>Afiléon Motorsport • afileonmotorsport.co.uk</div>';",
    "  const text=['AFILÉON MOTORSPORT','End-of-Day Customer Receipt','Booking reference: '+b.public_id,'Date: '+isoDate(b.booking_date),'Customer: '+String(b.customer_name||''),'Service: '+String(svc?.name||b.service_id),'Vehicle: '+String(receipt.vehicle.details),'Checks completed: '+checks.length,'Incidents: '+incidents.length,'Damage status: '+receipt.damage_status,'Total: '+gbp(b.amount_total),'Paid: '+gbp(b.amount_paid),'Outstanding balance: '+gbp(b.balance_amount),'Final handover: '+(hand?[(hand.status||''),(hand.notes||'')].filter(Boolean).join(' — '):'Not recorded'),'','Contact: '+EMAIL_REPLY_TO,'WhatsApp: 07933 108942','Website: '+SITE_URL].join('\\n');",
    "  await txMail(b.customer_email,'End-of-day receipt — '+b.public_id,body,text);",
    "  await pool.query(`INSERT INTO booking_endofday_receipts(booking_id,receipt_version,snapshot,generated_at,generated_by,sent_at,sent_to,sent_by,updated_at) VALUES($1,$2,$3::jsonb,now(),$4,now(),$5,$4,now()) ON CONFLICT(booking_id) DO UPDATE SET receipt_version=excluded.receipt_version,snapshot=excluded.snapshot,generated_at=excluded.generated_at,generated_by=excluded.generated_by,sent_at=excluded.sent_at,sent_to=excluded.sent_to,sent_by=excluded.sent_by,updated_at=now()`,[id,receipt.receipt_version,JSON.stringify(receipt),clean(req.adminUsername,200)||null,b.customer_email]);",
    "  await auditAdmin(req.adminUsername,'end_of_day_receipt_sent',{booking_id:id,to:b.customer_email,checks:checks.length,incidents:incidents.length,damage_status:receipt.damage_status});",
    "  res.json({ok:true,sent_to:b.customer_email,receipt});",
    "});",
    "app.post('/api/admin/booking-record/:id/entry/delete',admin,async(req,res)=>{",
    "  const id=clean(req.params.id,120),entryId=Number(req.body?.entry_id);if(!Number.isInteger(entryId)||entryId<1)return res.status(400).json({error:'invalid_entry_id'});",
    "  const {rows}=await pool.query(`DELETE FROM booking_record_entries WHERE id=$1 AND booking_id=$2 RETURNING id,section,title`,[entryId,id]);if(!rows[0])return res.status(404).json({error:'entry_not_found'});",
    "  await auditAdmin(req.adminUsername,'booking_record_entry_deleted',{booking_id:id,entry_id:entryId,section:rows[0].section});",
    "  res.json({ok:true,removed:rows[0]});",
    "});",
    "app.get('/api/admin/export/:kind.csv',admin,async(req,res)=>{const kind=clean(req.params.kind,30);let rows=[],cols=[];if(kind==='bookings'){cols=['public_id','service_id','booking_date','customer_name','customer_email','status','amount_total','amount_paid','balance_amount','created_at'];rows=(await pool.query(`SELECT public_id,service_id,booking_date::text,customer_name,customer_email,status,amount_total,amount_paid,balance_amount,created_at FROM bookings ORDER BY created_at DESC`)).rows;}else if(kind==='orders'){cols=['public_id','customer_email','status','total','created_at'];rows=(await pool.query(`SELECT public_id,customer_email,status,total,created_at FROM orders ORDER BY created_at DESC`)).rows;}else if(kind==='vouchers'){cols=['public_id','code','status','amount_original','balance_remaining','purchaser_email','recipient_email','expires_at','created_at'];rows=(await pool.query(`SELECT public_id,code,status,amount_original,balance_remaining,purchaser_email,recipient_email,expires_at,created_at FROM gift_vouchers ORDER BY created_at DESC`)).rows;}else if(kind==='discounts'){cols=['code','discount_type','discount_value','max_uses','uses_used','starts_at','expires_at','active','created_at'];rows=(await pool.query(`SELECT code,discount_type,discount_value,max_uses,uses_used,starts_at,expires_at,active,created_at FROM discount_codes ORDER BY created_at DESC`)).rows;}else if(kind==='maintenance'){cols=['id','category','title','notes','mileage','track_hours','cost','performed_at','next_due_date','next_due_mileage'];rows=(await pool.query(`SELECT id,category,title,notes,mileage,track_hours,cost,performed_at,next_due_date,next_due_mileage FROM vehicle_maintenance WHERE vehicle_code='e46' ORDER BY performed_at DESC`)).rows;}else return res.status(404).json({error:'unknown_export'});const csv=[cols.join(','),...rows.map(r=>cols.map(c=>csvCell(r[c])).join(','))].join('\\n');res.setHeader('Content-Disposition',`attachment; filename=afileon-${kind}.csv`);res.type('text/csv').send(csv);});",
    "",
  ].join('\n');
  s=s.slice(0,i)+routes+s.slice(i);
}

const cronStart="app.post('/api/cron/balances', cronAuth, async (_req,res) => {";
const cronEnd="app.post('/api/admin/block-date'";
if(s.includes(cronStart)){
  const newCron=[
    "app.post('/api/cron/balances', cronAuth, async (_req,res) => {",
    "  if (!stripe) return res.status(503).json({ error:'stripe_not_configured' });",
    "  const { rows } = await pool.query(`SELECT * FROM bookings WHERE balance_amount>0 AND balance_status='scheduled' AND balance_notice_at<=now() AND status IN ('confirmed','confirmed_pending_licence') ORDER BY balance_notice_at ASC LIMIT 50`);",
    "  const results=[];",
    "  for (const b of rows) {",
    "    try {",
    "      let customer=b.stripe_customer_id;",
    "      if (!customer) { const c=await stripe.customers.create({email:b.customer_email||undefined,name:b.customer_name||undefined,phone:b.customer_phone||undefined,metadata:{booking_id:b.public_id}}); customer=c.id; }",
    "      await stripe.invoiceItems.create({customer,amount:Number(b.balance_amount),currency:'gbp',description:`Afiléon Motorsport booking balance — ${isoDate(b.booking_date)}`,metadata:{kind:'service_balance',booking_id:b.public_id}});",
    "      const invoice=await stripe.invoices.create({customer,collection_method:'send_invoice',days_until_due:3,auto_advance:true,automatic_tax:{enabled:true},metadata:{kind:'service_balance',booking_id:b.public_id}});",
    "      await pool.query(`UPDATE bookings SET stripe_customer_id=$1,stripe_balance_invoice_id=$2,balance_status='invoiced',updated_at=now() WHERE public_id=$3`,[customer,invoice.id,b.public_id]);",
    "      results.push({booking_id:b.public_id,invoice_id:invoice.id});",
    "    } catch(e) { console.error(e); results.push({booking_id:b.public_id,error:'invoice_failed'}); }",
    "  }",
    "  const recovery=[];",
    "  if(EMAIL_ENABLED){",
    "    const aq=await pool.query(`SELECT * FROM bookings WHERE customer_email IS NOT NULL AND abandoned_email_sent_at IS NULL AND hold_expires_at<now()-interval '2 hours' AND created_at>now()-interval '7 days' AND status IN ('hold','expired') ORDER BY created_at ASC LIMIT 50`);",
    "    for(const b of aq.rows){try{const svc=SERVICE_MAP.get(b.service_id);await txMail(b.customer_email,'Complete your Afiléon Motorsport booking',`<p>You started an Afiléon Motorsport booking but did not complete payment.</p><p><b>Service:</b> ${eEsc(svc?.name||b.service_id)}<br><b>Date requested:</b> ${eEsc(isoDate(b.booking_date))}</p><p>The original hold has expired, so availability may have changed. You can start again here:</p><p><a href=\"${SITE_URL}/book.html\" style=\"color:#7dd3fc\">Return to booking</a></p>`,`You started an Afiléon Motorsport booking but did not complete it. Return to ${SITE_URL}/book.html to check current availability.`);await pool.query(`UPDATE bookings SET status=CASE WHEN status='hold' THEN 'expired' ELSE status END,abandoned_email_sent_at=now(),updated_at=now() WHERE public_id=$1`,[b.public_id]);recovery.push({booking_id:b.public_id,sent:true});}catch(e){console.error('abandoned booking email failed',e.message);recovery.push({booking_id:b.public_id,sent:false});}}",
    "  }",
    "  res.json({processed:results.length,results,recovery_processed:recovery.length,recovery});",
    "});",
    "",
  ].join('\n');
  replaceBlock(cronStart,cronEnd,newCron,'balance/recovery cron');
}

fs.writeFileSync(path,s);
console.log('Applied secure admin sessions, dashboard, E46 ops, audit, exports and booking recovery');
