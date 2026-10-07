app.get('/api/admin/bookings/:id/damage-security',admin,async(req,res)=>{
  const {rows}=await pool.query(`SELECT * FROM bookings WHERE public_id=$1 LIMIT 1`,[req.params.id]);let b=rows[0];if(!b||!['vehicle_hire_day','full_package'].includes(b.service_id))return res.status(404).json({error:'not_found'});
  if(!b.stripe_damage_security_payment_intent_id&&b.stripe_damage_security_checkout_session_id&&stripe){try{const cs=await stripe.checkout.sessions.retrieve(b.stripe_damage_security_checkout_session_id);const piId=typeof cs.payment_intent==='string'?cs.payment_intent:cs.payment_intent?.id;if(piId){await pool.query(`UPDATE bookings SET stripe_damage_security_payment_intent_id=$1,damage_security_updated_at=now(),updated_at=now() WHERE public_id=$2`,[piId,b.public_id]);b.stripe_damage_security_payment_intent_id=piId;}}catch(e){console.error('security session sync failed',e.message);}}
  if(b.stripe_damage_security_payment_intent_id){try{b=(await syncDamageSecurityPaymentIntent(b.stripe_damage_security_payment_intent_id,'admin_status'))||b;}catch(e){console.error('security admin sync failed',e.message);}}
  res.json({...damageSecurityPublicView(b),customer_authorisation_url:`${SITE_URL}/damage-security.html?booking=${encodeURIComponent(b.public_id)}`,customer_email:b.customer_email||null,checkout_session_id:b.stripe_damage_security_checkout_session_id||null,payment_intent_id:b.stripe_damage_security_payment_intent_id||null});
});
app.post('/api/admin/bookings/:id/damage-security/request',admin,async(req,res)=>{
  if(!EMAIL_ENABLED)return res.status(503).json({error:'email_not_configured'});
  const {rows}=await pool.query(`SELECT * FROM bookings WHERE public_id=$1 LIMIT 1`,[req.params.id]);const b=rows[0];if(!b||!['vehicle_hire_day','full_package'].includes(b.service_id))return res.status(404).json({error:'not_found'});
  if(!b.customer_email)return res.status(409).json({error:'customer_email_missing'});
  const openAt=damageSecurityOpenAt(b.booking_date);if(openAt&&new Date()<openAt)return res.status(409).json({error:'damage_security_too_early',available_from:openAt.toISOString()});
  const url=`${SITE_URL}/damage-security.html?booking=${encodeURIComponent(b.public_id)}`;
  const body=`<p>Hello ${eEsc(b.customer_name||'')},</p><p>Your BMW E46 track-day hire is approaching. Before the vehicle can be released, please complete the separate <b>£2,500 refundable damage-security card authorisation</b>.</p><p>This is a temporary card authorisation hold, not an automatic £2,500 charge. An amount is captured only where properly due under the Vehicle Hire Terms; otherwise the authorisation is released.</p><p><a href="${url}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;font-weight:700">Complete £2,500 authorisation</a></p><p>Booking reference: <b>${eEsc(b.public_id)}</b><br>Track-day date: <b>${eEsc(String(b.booking_date||'').slice(0,10))}</b></p>`;
  const textBody=`Afiléon Motorsport\n\nYour BMW E46 hire is approaching. Complete the separate £2,500 refundable damage-security card authorisation before vehicle release. This is an authorisation hold, not an automatic £2,500 charge.\n\n${url}\n\nBooking: ${b.public_id}`;
  await txMail(b.customer_email,'Complete your £2,500 damage-security authorisation — '+b.public_id,body,textBody);
  await pool.query(`UPDATE bookings SET damage_security_customer_notified_at=now(),damage_security_updated_at=now(),updated_at=now() WHERE public_id=$1`,[b.public_id]);
  await recordDamageSecurityEvent(b.public_id,'customer_request_sent',b.damage_security_status,b.damage_security_status,250000,{to:b.customer_email},req.adminUsername,null);
  await auditAdmin(req.adminUsername,'damage_security_request_sent',{booking_id:b.public_id,to:b.customer_email});
  res.json({ok:true,sent_to:b.customer_email,url});
});
app.post('/api/admin/bookings/:id/damage-security/release',admin,async(req,res)=>{
  if(!stripe)return res.status(503).json({error:'stripe_not_configured'});
  let {rows}=await pool.query(`SELECT * FROM bookings WHERE public_id=$1 LIMIT 1`,[req.params.id]);let b=rows[0];if(!b||!b.stripe_damage_security_payment_intent_id)return res.status(404).json({error:'damage_security_not_found'});
  try{b=(await syncDamageSecurityPaymentIntent(b.stripe_damage_security_payment_intent_id,'admin_release_precheck'))||b;}catch(e){return res.status(409).json({error:'damage_security_refresh_failed',detail:e.message});}
  if(b.damage_security_status!=='authorised')return res.status(409).json({error:'damage_security_not_releasable',status:b.damage_security_status});
  const q=await pool.query(`UPDATE bookings SET damage_security_status='release_pending',damage_security_release_requested_at=now(),damage_security_updated_at=now(),updated_at=now() WHERE public_id=$1 AND damage_security_status='authorised' RETURNING *`,[b.public_id]);
  if(!q.rowCount)return res.status(409).json({error:'damage_security_state_changed'});
  try{
    await stripe.paymentIntents.cancel(b.stripe_damage_security_payment_intent_id);
    const out=(await syncDamageSecurityPaymentIntent(b.stripe_damage_security_payment_intent_id,'admin_release'))||q.rows[0];
    await auditAdmin(req.adminUsername,'damage_security_released',{booking_id:b.public_id,payment_intent_id:b.stripe_damage_security_payment_intent_id});
    res.json({ok:true,...damageSecurityPublicView(out)});
  }catch(e){await pool.query(`UPDATE bookings SET damage_security_status='authorised',damage_security_failure_reason=$1,damage_security_updated_at=now(),updated_at=now() WHERE public_id=$2 AND damage_security_status='release_pending'`,[clean(e.message,500),b.public_id]);res.status(409).json({error:'damage_security_release_failed',detail:e.message});}
});
app.post('/api/admin/bookings/:id/damage-security/capture',admin,async(req,res)=>{
  if(!stripe)return res.status(503).json({error:'stripe_not_configured'});
  const amount=Number(req.body?.amount_pence),reason=clean(req.body?.reason,120),notes=clean(req.body?.notes,3000);
  if(!Number.isInteger(amount)||amount<=0||amount>250000)return res.status(400).json({error:'invalid_capture_amount'});
  if(!reason)return res.status(400).json({error:'capture_reason_required'});
  let {rows}=await pool.query(`SELECT * FROM bookings WHERE public_id=$1 LIMIT 1`,[req.params.id]);let b=rows[0];if(!b||!b.stripe_damage_security_payment_intent_id)return res.status(404).json({error:'damage_security_not_found'});
  try{b=(await syncDamageSecurityPaymentIntent(b.stripe_damage_security_payment_intent_id,'admin_capture_precheck'))||b;}catch(e){return res.status(409).json({error:'damage_security_refresh_failed',detail:e.message});}
  if(b.damage_security_status!=='authorised')return res.status(409).json({error:'damage_security_not_capturable',status:b.damage_security_status});
  if(amount>Number(b.damage_security_capturable_amount||0))return res.status(409).json({error:'capture_amount_exceeds_authorisation',capturable_amount_pence:Number(b.damage_security_capturable_amount||0)});
  const q=await pool.query(`UPDATE bookings SET damage_security_status='capture_pending',damage_security_capture_reason=$1,damage_security_capture_notes=$2,damage_security_failure_reason=NULL,damage_security_updated_at=now(),updated_at=now() WHERE public_id=$3 AND damage_security_status='authorised' RETURNING *`,[reason,notes||null,b.public_id]);
  if(!q.rowCount)return res.status(409).json({error:'damage_security_state_changed'});
  try{
    await stripe.paymentIntents.capture(b.stripe_damage_security_payment_intent_id,{amount_to_capture:amount});
    const out=(await syncDamageSecurityPaymentIntent(b.stripe_damage_security_payment_intent_id,'admin_capture'))||q.rows[0];
    await recordDamageSecurityEvent(b.public_id,'damage_capture',b.damage_security_status,out.damage_security_status,amount,{reason,notes},req.adminUsername,b.stripe_damage_security_payment_intent_id);
    await auditAdmin(req.adminUsername,'damage_security_captured',{booking_id:b.public_id,amount_pence:amount,reason,payment_intent_id:b.stripe_damage_security_payment_intent_id});
    res.json({ok:true,...damageSecurityPublicView(out)});
  }catch(e){await pool.query(`UPDATE bookings SET damage_security_status='authorised',damage_security_failure_reason=$1,damage_security_updated_at=now(),updated_at=now() WHERE public_id=$2 AND damage_security_status='capture_pending'`,[clean(e.message,500),b.public_id]);res.status(409).json({error:'damage_security_capture_failed',detail:e.message});}
});
