const fs=require('fs');
const p='server_v3.js';
let s=fs.readFileSync(p,'utf8');

const oldCfg=`const SMTP_HOST=process.env.SMTP_HOST||'';
const SMTP_PORT=Number(process.env.SMTP_PORT||587);
const SMTP_SECURE=String(process.env.SMTP_SECURE||'false').toLowerCase()==='true';
const SMTP_USER=process.env.SMTP_USER||'';
const SMTP_PASS=process.env.SMTP_PASS||'';
const EMAIL_FROM=process.env.EMAIL_FROM||'Afiléon Motorsport <team@afileonmotorsport.co.uk>';
const EMAIL_REPLY_TO=process.env.EMAIL_REPLY_TO||'team@afileonmotorsport.co.uk';
const EMAIL_ENABLED=!!(SMTP_HOST&&SMTP_USER&&SMTP_PASS&&EMAIL_FROM);
const MAILER=EMAIL_ENABLED?nodemailer.createTransport({host:SMTP_HOST,port:SMTP_PORT,secure:SMTP_SECURE,auth:{user:SMTP_USER,pass:SMTP_PASS}}):null;`;

const newCfg=`const SMTP_HOST=process.env.SMTP_HOST||'';
const SMTP_PORT=Number(process.env.SMTP_PORT||587);
const SMTP_SECURE=String(process.env.SMTP_SECURE||'false').toLowerCase()==='true';
const SMTP_USER=process.env.SMTP_USER||'';
const SMTP_PASS=process.env.SMTP_PASS||'';
const SMTP2GO_API_KEY=process.env.SMTP2GO_API_KEY||'';
const EMAIL_FROM=process.env.EMAIL_FROM||'Afiléon Motorsport <team@afileonmotorsport.co.uk>';
const EMAIL_REPLY_TO=process.env.EMAIL_REPLY_TO||'team@afileonmotorsport.co.uk';
const SMTP_ENABLED=!!(SMTP_HOST&&SMTP_USER&&SMTP_PASS);
const EMAIL_ENABLED=!!((SMTP2GO_API_KEY||SMTP_ENABLED)&&EMAIL_FROM);
const MAILER=SMTP_ENABLED?nodemailer.createTransport({host:SMTP_HOST,port:SMTP_PORT,secure:SMTP_SECURE,auth:{user:SMTP_USER,pass:SMTP_PASS},connectionTimeout:8000,greetingTimeout:8000,socketTimeout:10000}):null;`;

if(!s.includes('const SMTP2GO_API_KEY=')){
  if(!s.includes(oldCfg)) throw new Error('SMTP2GO API patch: email config block not found');
  s=s.replace(oldCfg,newCfg);
}

const oldTx=`async function txMail(to,subject,body,text){if(!EMAIL_ENABLED||!MAILER)throw new Error('email_not_configured');return MAILER.sendMail({from:EMAIL_FROM,replyTo:EMAIL_REPLY_TO,to,subject,html:mailHtml(subject,body),text})}`;

const newTx=`async function txMail(to,subject,body,text){
  if(!EMAIL_ENABLED) throw new Error('email_not_configured');
  const html=mailHtml(subject,body);
  if(SMTP2GO_API_KEY){
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),8000);
    try{
      const r=await fetch('https://api.smtp2go.com/v3/email/send',{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json','X-Smtp2go-Api-Key':SMTP2GO_API_KEY},
        body:JSON.stringify({sender:EMAIL_FROM,to:[String(to)],subject,html_body:html,text_body:String(text||''),fastaccept:true}),
        signal:ctrl.signal
      });
      const data=await r.json().catch(()=>({}));
      const failed=Number(data?.data?.failed||0);
      if(!r.ok||failed>0){
        const detail=data?.data?.failures?.[0]||data?.error||('HTTP '+r.status);
        throw new Error('smtp2go_api_failed: '+String(detail).slice(0,240));
      }
      return data;
    }finally{clearTimeout(timer)}
  }
  if(!MAILER) throw new Error('email_not_configured');
  return MAILER.sendMail({from:EMAIL_FROM,replyTo:EMAIL_REPLY_TO,to,subject,html,text});
}`;

if(!s.includes("smtp2go_api_failed:")){
  if(!s.includes(oldTx)) throw new Error('SMTP2GO API patch: txMail function not found');
  s=s.replace(oldTx,newTx);
}

const oldStatus="app.get('/api/email/status',(_q,res)=>res.json({configured:EMAIL_ENABLED,verification_required:EMAIL_ENABLED,from:EMAIL_FROM}));";
const newStatus="app.get('/api/email/status',(_q,res)=>res.json({configured:EMAIL_ENABLED,verification_required:EMAIL_ENABLED,transport:SMTP2GO_API_KEY?'smtp2go_api':(SMTP_ENABLED?'smtp':'none'),from:EMAIL_FROM}));";
if(s.includes(oldStatus)) s=s.replace(oldStatus,newStatus);

fs.writeFileSync(p,s);
console.log('Applied SMTP2GO HTTPS API email transport patch');
