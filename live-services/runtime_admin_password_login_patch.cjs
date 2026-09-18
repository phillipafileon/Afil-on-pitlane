const fs=require('fs');
const path='server_v3.js';
let s=fs.readFileSync(path,'utf8');

if(!s.includes("const ADMIN_LOGIN_PASSWORD_HASH = process.env.ADMIN_LOGIN_PASSWORD_HASH || '';")){
  const m="const ADMIN_LOGIN_USER = process.env.ADMIN_LOGIN_USER || '';";
  if(!s.includes(m)) throw new Error('password-login config marker missing');
  s=s.replace(m,m+"\nconst ADMIN_LOGIN_PASSWORD_HASH = process.env.ADMIN_LOGIN_PASSWORD_HASH || '';");
}

if(!s.includes('function verifyAdminPassword(')){
  const m='function adminSessionHash(token){';
  const i=s.indexOf(m);
  if(i<0) throw new Error('password-login helper marker missing');
  const h=`function verifyAdminPassword(password){
  try{
    const raw=String(ADMIN_LOGIN_PASSWORD_HASH||'');
    const [saltHex,expectedHex]=raw.split(':');
    if(!saltHex||!expectedHex)return false;
    const actual=crypto.scryptSync(String(password||''),Buffer.from(saltHex,'hex'),64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
    const expected=Buffer.from(expectedHex,'hex');
    return expected.length===actual.length&&crypto.timingSafeEqual(actual,expected);
  }catch{return false;}
}
`;
  s=s.slice(0,i)+h+s.slice(i);
}

const start=s.indexOf("app.get('/api/admin/auth/status'");
const end=s.indexOf("app.get('/api/admin/auth/session'",start);
if(start<0||end<0) throw new Error('password-login route markers missing');

const routes=`app.get('/api/admin/auth/status',(_req,res)=>res.json({configured:!!(ADMIN_LOGIN_USER&&ADMIN_LOGIN_PASSWORD_HASH),two_factor:false,authentication:'email_password',session_hours:ADMIN_SESSION_HOURS,trusted_device_days:ADMIN_TRUST_DAYS,attempt_cooldown_seconds:600}));

app.post('/api/admin/auth/login',async(req,res)=>{
  const username=clean(req.body?.username,200).toLowerCase();
  const password=String(req.body?.password||'');
  const remember=!!req.body?.remember_device;
  const ip=requestIp(req);
  const recent=await pool.query(`SELECT attempted_at FROM admin_login_attempts WHERE lower(username)=lower($1) AND ip=$2 AND attempted_at>now()-interval '10 minutes' ORDER BY attempted_at DESC LIMIT 1`,[username,ip]);
  if(recent.rows[0]){
    const next=new Date(new Date(recent.rows[0].attempted_at).getTime()+10*60*1000);
    const retry=Math.max(1,Math.ceil((next-Date.now())/1000));
    res.set('Retry-After',String(retry));
    return res.status(429).json({error:'login_cooldown',detail:`Only one login attempt is allowed every 10 minutes on this device. Try again in about ${Math.ceil(retry/60)} minute(s).`,retry_after_seconds:retry});
  }

  const ok=ADMIN_LOGIN_USER&&username===String(ADMIN_LOGIN_USER).toLowerCase()&&verifyAdminPassword(password);
  await pool.query(`INSERT INTO admin_login_attempts(username,ip,success) VALUES($1,$2,$3)`,[username||null,ip,!!ok]);

  if(!ok){
    await new Promise(r=>setTimeout(r,500));
    await auditAdmin(username||null,'admin_login_failed',{ip});
    return res.status(401).json({error:'invalid_credentials',detail:'The email or password is not correct. This device can try again in 10 minutes.'});
  }

  const raw='adms_'+crypto.randomBytes(32).toString('hex');
  const hash=adminSessionHash(raw);
  const exp=new Date(Date.now()+(remember?ADMIN_TRUST_DAYS*86400000:ADMIN_SESSION_HOURS*3600000));
  await pool.query(`INSERT INTO admin_sessions(token_hash,username,expires_at,ip,user_agent) VALUES($1,$2,$3,$4,$5)`,[hash,username,exp,ip,clean(req.get('user-agent')||'',300)]);
  await auditAdmin(username,'admin_login_password_ok',{ip,remember_device:remember});
  res.json({authenticated:true,session_token:raw,expires_at:exp.toISOString(),username});
});

app.post('/api/admin/auth/verify',(_req,res)=>res.status(410).json({error:'verification_removed',detail:'Email verification codes are no longer used for admin login.'}));

`;

s=s.slice(0,start)+routes+s.slice(end);
fs.writeFileSync(path,s);
console.log('Applied password-only admin login with 10-minute attempt cooldown');
