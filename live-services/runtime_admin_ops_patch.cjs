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
    "app.get('/api/admin/auth/status',(_req,res)=>res.json({configured:!!(ADMIN_LOGIN_USER&&ADMIN_LOGIN_EMAIL&&EMAIL_ENABLED),two_factor:true,session_hours:ADMIN_SESSION_HOURS,trusted_device_days:ADMIN_TRUST_DAYS}));",
    "app.post('/api/admin/auth/login',async(req,res)=>{",
    "  const username=clean(req.body?.username,200).toLowerCase(),remember=!!req.body?.remember_device,ip=requestIp(req);",
    "  const recent=await pool.query(`SELECT count(*)::int n FROM admin_login_attempts WHERE success=false AND attempted_at>now()-interval '15 minutes' AND (ip=$1 OR lower(username)=lower($2))`,[ip,username]);",
    "  if(Number(recent.rows[0]?.n||0)>=5)return res.status(429).json({error:'too_many_attempts',detail:'Too many failed sign-in attempts. Try again in about 15 minutes.'});",
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
