const fs=require('fs');
const path='server_v3.js';
let s=fs.readFileSync(path,'utf8');

function insertBefore(anchor,block,label){
  if(s.includes(block.trim().slice(0,100))) return;
  const i=s.indexOf(anchor);
  if(i<0) throw new Error('Admin booking reset patch missing '+label);
  s=s.slice(0,i)+block+'\n'+s.slice(i);
}
function replaceOnce(from,to,label){
  if(s.includes(to)) return;
  if(!s.includes(from)) throw new Error('Admin booking reset patch missing '+label);
  s=s.replace(from,to);
}

if(!s.includes('// ADMIN_BOOKING_RESET_V1')){
  const helpers=`
// ADMIN_BOOKING_RESET_V1
function bookingHasMoneyOrStripeRef(b){
  return Number(b?.amount_paid||0)>0 ||
    !!b?.stripe_payment_intent_id ||
    !!b?.stripe_balance_invoice_id ||
    !!b?.stripe_damage_security_payment_intent_id;
}
async function purgeBookingRows(client,bookingId=null){
  const where=bookingId?' WHERE public_id=$1':'';
  const args=bookingId?[bookingId]:[];
  const refs=await client.query(\`SELECT public_id FROM bookings\${where}\`,args);
  const ids=refs.rows.map(x=>x.public_id);
  if(!ids.length)return {removed:0,booking_ids:[]};
  await client.query(\`DELETE FROM booking_record_entries WHERE booking_id = ANY($1::text[])\`,[ids]);
  await client.query(\`DELETE FROM booking_endofday_receipts WHERE booking_id = ANY($1::text[])\`,[ids]);
  await client.query(\`DELETE FROM vehicle_inspections WHERE booking_id = ANY($1::text[])\`,[ids]);
  await client.query(\`DELETE FROM damage_security_events WHERE booking_id = ANY($1::text[])\`,[ids]);
  const deleted=await client.query(\`DELETE FROM bookings WHERE public_id = ANY($1::text[]) RETURNING public_id\`,[ids]);
  return {removed:deleted.rowCount,booking_ids:deleted.rows.map(x=>x.public_id)};
}
async function maybeOneTimeBookingReset(){
  const resetKey=clean(process.env.BOOKING_RESET_ONCE_REV||'',160);
  if(!resetKey)return;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query(\`CREATE TABLE IF NOT EXISTS admin_one_time_resets(reset_key TEXT PRIMARY KEY,detail JSONB NOT NULL DEFAULT '{}'::jsonb,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())\`);
    await client.query(\`SELECT pg_advisory_xact_lock(hashtext('afileon_booking_reset_once'))\`);
    const done=await client.query(\`SELECT 1 FROM admin_one_time_resets WHERE reset_key=$1 LIMIT 1\`,[resetKey]);
    if(done.rowCount){await client.query('COMMIT');return}
    const before=await client.query(\`SELECT count(*)::int total,count(*) FILTER (WHERE COALESCE(amount_paid,0)>0)::int paid_rows FROM bookings\`);
    const result=await purgeBookingRows(client,null);
    await client.query(\`INSERT INTO admin_one_time_resets(reset_key,detail) VALUES($1,$2::jsonb)\`,[resetKey,JSON.stringify({removed:result.removed,paid_rows:Number(before.rows[0]?.paid_rows||0),reason:'user_requested_clean_booking_reset'})]);
    await client.query('COMMIT');
    console.log('One-time booking reset applied:',resetKey,'removed',result.removed,'booking rows');
  }catch(e){
    await client.query('ROLLBACK').catch(()=>{});
    console.error('One-time booking reset failed',e);
    throw e;
  }finally{client.release()}
}
`;
  insertBefore("app.post('/api/admin/block-date'",helpers,'admin block-date anchor');

  const routes=`
app.post('/api/admin/bookings/:id/delete',admin,async(req,res)=>{
  const id=clean(req.params.id,120);
  if(clean(req.body?.confirmation,120)!==id)return res.status(400).json({error:'confirmation_required',detail:'Confirm using the booking reference.'});
  const q=await pool.query(\`SELECT public_id,amount_paid,stripe_payment_intent_id,stripe_balance_invoice_id,stripe_damage_security_payment_intent_id FROM bookings WHERE public_id=$1 LIMIT 1\`,[id]);
  const booking=q.rows[0];
  if(!booking)return res.status(404).json({error:'booking_not_found'});
  if(bookingHasMoneyOrStripeRef(booking))return res.status(409).json({error:'paid_or_external_booking',detail:'This booking has a payment or Stripe reference and cannot be deleted from Operations Control. Cancel/refund/reconcile it instead.'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const result=await purgeBookingRows(client,id);
    await client.query('COMMIT');
    await auditAdmin(req.adminUsername,'booking_deleted',{booking_id:id,removed:result.removed});
    res.json({ok:true,...result});
  }catch(e){
    await client.query('ROLLBACK').catch(()=>{});
    console.error(e);res.status(500).json({error:'booking_delete_failed'});
  }finally{client.release()}
});
app.post('/api/admin/bookings/clear-all',admin,async(req,res)=>{
  if(clean(req.body?.confirmation,80)!=='CLEAR ALL BOOKINGS')return res.status(400).json({error:'confirmation_required',detail:'Type CLEAR ALL BOOKINGS to continue.'});
  const protectedQ=await pool.query(\`SELECT count(*)::int n FROM bookings WHERE COALESCE(amount_paid,0)>0 OR stripe_payment_intent_id IS NOT NULL OR stripe_balance_invoice_id IS NOT NULL OR stripe_damage_security_payment_intent_id IS NOT NULL\`);
  const protectedCount=Number(protectedQ.rows[0]?.n||0);
  if(protectedCount>0)return res.status(409).json({error:'paid_or_external_bookings_present',count:protectedCount,detail:'One or more bookings have payments or Stripe references. They were not deleted.'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const result=await purgeBookingRows(client,null);
    await client.query('COMMIT');
    await auditAdmin(req.adminUsername,'all_unpaid_bookings_cleared',{removed:result.removed});
    res.json({ok:true,...result});
  }catch(e){
    await client.query('ROLLBACK').catch(()=>{});
    console.error(e);res.status(500).json({error:'booking_clear_failed'});
  }finally{client.release()}
});
app.post('/api/admin/availability/clear-all',admin,async(req,res)=>{
  if(clean(req.body?.confirmation,80)!=='CLEAR ALL BLOCKS')return res.status(400).json({error:'confirmation_required',detail:'Type CLEAR ALL BLOCKS to continue.'});
  const q=await pool.query(\`DELETE FROM availability_blocks RETURNING id\`);
  await auditAdmin(req.adminUsername,'all_availability_blocks_cleared',{removed:q.rowCount});
  res.json({ok:true,removed:q.rowCount});
});
`;
  insertBefore("app.post('/api/admin/block-date'",routes,'admin block-date routes');

  const startup="migrate().then(async()=>{\n  await ensurePrintfulWebhook();\n  await ensureStripeWebhookEvents();\n  setInterval(expirePastCutoffSessions, 10000);\n  await expirePastCutoffSessions();\n  app.listen(port,'0.0.0.0',()=>console.log(\`Afiléon Live Services v3 listening on \${port}\`));\n}).catch(e=>{console.error(e);process.exit(1)});";
  const startupNew="migrate().then(async()=>{\n  await ensurePrintfulWebhook();\n  await ensureStripeWebhookEvents();\n  setInterval(expirePastCutoffSessions, 10000);\n  await expirePastCutoffSessions();\n  await maybeOneTimeBookingReset();\n  app.listen(port,'0.0.0.0',()=>console.log(\`Afiléon Live Services v3 listening on \${port}\`));\n}).catch(e=>{console.error(e);process.exit(1)});";
  replaceOnce(startup,startupNew,'startup');
}

fs.writeFileSync(path,s);
console.log('Applied admin booking reset, individual deletion and availability-clear controls.');
