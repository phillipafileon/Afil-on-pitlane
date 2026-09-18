const fs=require('fs');
const p='server_v3.js';
let s=fs.readFileSync(p,'utf8');
const a="}catch(e){await pool.query(`DELETE FROM email_verifications WHERE public_id=$1`,[id]);res.status(503).json({error:'verification_email_failed',detail:'We could not send the verification email.'})}});";
const b="}catch(e){console.error('verification email failed',String(e?.message||e).slice(0,500));await pool.query(`DELETE FROM email_verifications WHERE public_id=$1`,[id]);res.status(503).json({error:'verification_email_failed',detail:'We could not send the verification email.'})}});";
if(!s.includes(a)) throw new Error('diagnostic patch marker missing');
s=s.replace(a,b);
fs.writeFileSync(p,s);
console.log('Applied email verification diagnostic logging');
