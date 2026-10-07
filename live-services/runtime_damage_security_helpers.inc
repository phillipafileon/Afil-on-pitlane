function damageSecurityHireEnd(bookingDate){
  const d=String(bookingDate||'').slice(0,10);
  const x=new Date(d+'T23:00:00Z');
  return Number.isNaN(x.getTime())?null:x;
}
function damageSecurityOpenAt(bookingDate){
  const d=String(bookingDate||'').slice(0,10);
  const x=new Date(d+'T08:00:00Z');
  return Number.isNaN(x.getTime())?null:new Date(x.getTime()-E46_DAMAGE_SECURITY_OPEN_HOURS*3600000);
}
function damageSecurityPublicView(b){
  const required=Number(b.damage_security_required_amount||b.damage_security_amount||E46_DAMAGE_SECURITY_PENCE||0);
  const capturable=Number(b.damage_security_capturable_amount||0);
  const captureBefore=b.damage_security_capture_before?new Date(b.damage_security_capture_before):null;
  const hireEnd=damageSecurityHireEnd(b.booking_date);
  const authorised=String(b.damage_security_status)==='authorised'&&required>0&&capturable>=required;
  const releaseReady=!!(authorised&&captureBefore&&!Number.isNaN(captureBefore.getTime())&&captureBefore>new Date()&&(!hireEnd||captureBefore>hireEnd));
  const expiresSoon=!!(captureBefore&&!Number.isNaN(captureBefore.getTime())&&captureBefore.getTime()-Date.now()<12*3600000&&captureBefore>Date.now());
  const openAt=damageSecurityOpenAt(b.booking_date),now=new Date();
  return {
    booking_id:b.public_id,
    booking_date:String(b.booking_date||'').slice(0,10),
    status:b.damage_security_status||'not_authorised',
    required_amount_pence:required,
    authorised_amount_pence:Number(b.damage_security_authorised_amount||0),
    capturable_amount_pence:capturable,
    captured_amount_pence:Number(b.damage_security_captured_amount||0),
    authorised_at:b.damage_security_authorised_at||null,
    capture_before:b.damage_security_capture_before||null,
    released_at:b.damage_security_released_at||null,
    expired_at:b.damage_security_expired_at||null,
    failure_reason:b.damage_security_failure_reason||null,
    checkout_session_id:b.stripe_damage_security_checkout_session_id||null,
    payment_intent_id:b.stripe_damage_security_payment_intent_id||null,
    available_from:openAt?openAt.toISOString():null,
    window_open:!!(openAt&&now>=openAt&&(!hireEnd||now<=hireEnd)),
    release_ready:releaseReady,
    expires_soon:expiresSoon,
    reauthorisation_required:authorised&&!releaseReady
  };
}
async function recordDamageSecurityEvent(bookingId,eventType,previousStatus,newStatus,amount,detail,actor,piId){
  try{
    await pool.query(`INSERT INTO damage_security_events(booking_id,stripe_payment_intent_id,event_type,previous_status,new_status,amount,detail,actor) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,[bookingId,piId||null,eventType,previousStatus||null,newStatus||null,Number.isFinite(Number(amount))?Number(amount):null,JSON.stringify(detail||{}),actor||null]);
  }catch(e){console.error('damage security audit failed',e.message);}
}
async function claimDamageSecurityWebhookEvent(event){
  const q=await pool.query(`INSERT INTO stripe_webhook_events(event_id,event_type) VALUES($1,$2) ON CONFLICT(event_id) DO NOTHING RETURNING event_id`,[event.id,event.type]);
  return !!q.rowCount;
}
async function syncDamageSecurityPaymentIntent(piOrId,source='stripe'){
  if(!stripe)return null;
  const id=typeof piOrId==='string'?piOrId:piOrId?.id;
  if(!id)return null;
  const pi=await stripe.paymentIntents.retrieve(id,{expand:['latest_charge']});
  if(pi.metadata?.kind!=='e46_damage_security'||!pi.metadata?.booking_id)return null;
  const bookingId=pi.metadata.booking_id;
  const qr=await pool.query(`SELECT * FROM bookings WHERE public_id=$1 LIMIT 1`,[bookingId]);
  const b=qr.rows[0];if(!b)return null;
  const prev=b.damage_security_status||'not_authorised';
  const required=Number(b.damage_security_required_amount||b.damage_security_amount||E46_DAMAGE_SECURITY_PENCE||0);
  const capturable=Number(pi.amount_capturable||0);
  const received=Number(pi.amount_received||0);
  const charge=(pi.latest_charge&&typeof pi.latest_charge==='object')?pi.latest_charge:null;
  const cb=Number(charge?.payment_method_details?.card?.capture_before||0);
  const captureBefore=cb>0?new Date(cb*1000):null;
  let next=prev,authorisedAmount=Number(b.damage_security_authorised_amount||0),failure=null,expiredAt=b.damage_security_expired_at||null,releasedAt=b.damage_security_released_at||null,capturedAt=b.damage_security_captured_at||null,capturedAmount=Number(b.damage_security_captured_amount||0);
  if(pi.status==='requires_capture'){
    if(capturable===required&&required>0){next='authorised';authorisedAmount=capturable;failure=null;expiredAt=null;releasedAt=null;}
    else{next='failed';failure='authorised_amount_mismatch';}
  }else if(pi.status==='succeeded'){
    capturedAmount=received;capturedAt=new Date();next=received>=required&&required>0?'fully_captured':'partially_captured';failure=null;
  }else if(pi.status==='canceled'){
    if(prev==='release_pending'||b.damage_security_release_requested_at){next='released';releasedAt=new Date();}
    else{next='expired';expiredAt=new Date();}
  }else if(['requires_payment_method','requires_action'].includes(pi.status)){
    if(prev!=='awaiting_customer'&&prev!=='creating_checkout')next='failed';
    if(pi.last_payment_error?.message)failure=clean(pi.last_payment_error.message,500);
  }
  const u=await pool.query(`UPDATE bookings SET damage_security_status=$1,damage_security_required_amount=$2,damage_security_authorised_amount=$3,damage_security_capturable_amount=$4,damage_security_capture_before=COALESCE($5,damage_security_capture_before),damage_security_captured_amount=$6,damage_security_captured_at=COALESCE($7,damage_security_captured_at),damage_security_released_at=COALESCE($8,damage_security_released_at),damage_security_expired_at=$9,damage_security_failure_reason=$10,stripe_damage_security_payment_intent_id=$11,damage_security_authorised_at=CASE WHEN $1='authorised' THEN COALESCE(damage_security_authorised_at,now()) ELSE damage_security_authorised_at END,damage_security_updated_at=now(),updated_at=now() WHERE public_id=$12 RETURNING *`,[next,required,authorisedAmount,capturable,captureBefore,capturedAmount,capturedAt,releasedAt,expiredAt,failure,pi.id,bookingId]);
  const out=u.rows[0];
  if(next!==prev||source==='admin_capture'||source==='admin_release')await recordDamageSecurityEvent(bookingId,'payment_intent_sync',prev,next,next.includes('captured')?capturedAmount:capturable,{source,stripe_status:pi.status,capture_before:captureBefore?.toISOString?.()||null,cancellation_reason:pi.cancellation_reason||null},source,pi.id);
  return out;
}
async function refreshDamageSecurityExpiries(){
  const {rows}=await pool.query(`SELECT * FROM bookings WHERE service_id IN ('vehicle_hire_day','full_package') AND damage_security_status IN ('authorised','release_pending','capture_pending') AND stripe_damage_security_payment_intent_id IS NOT NULL ORDER BY booking_date ASC LIMIT 100`);
  const result=[];
  for(const b of rows){
    try{
      const cb=b.damage_security_capture_before?new Date(b.damage_security_capture_before):null;
      if(cb&&cb<=new Date()&&b.damage_security_status==='authorised'){
        await pool.query(`UPDATE bookings SET damage_security_status='expired',damage_security_capturable_amount=0,damage_security_expired_at=COALESCE(damage_security_expired_at,now()),damage_security_failure_reason='authorisation_window_expired',damage_security_updated_at=now(),updated_at=now() WHERE public_id=$1`,[b.public_id]);
        try{await stripe.paymentIntents.cancel(b.stripe_damage_security_payment_intent_id);}catch{}
        await recordDamageSecurityEvent(b.public_id,'authorisation_expired','authorised','expired',0,{capture_before:b.damage_security_capture_before},'expiry_sweep',b.stripe_damage_security_payment_intent_id);
        result.push({booking_id:b.public_id,status:'expired'});continue;
      }
      const synced=await syncDamageSecurityPaymentIntent(b.stripe_damage_security_payment_intent_id,'expiry_sweep');
      if(synced)result.push({booking_id:b.public_id,status:synced.damage_security_status});
    }catch(e){result.push({booking_id:b.public_id,error:clean(e.message,200)});}
  }
  return {checked:rows.length,results:result};
}
async function createDamageSecurityCheckout(b){
  if(!stripe)throw Object.assign(new Error('stripe_not_configured'),{statusCode:503});
  const required=Number(b.damage_security_amount||E46_DAMAGE_SECURITY_PENCE||0);
  if(required!==250000||Number(E46_DAMAGE_SECURITY_PENCE)!==250000)throw Object.assign(new Error('damage_security_amount_not_2500'),{statusCode:503});
  const openAt=damageSecurityOpenAt(b.booking_date),hireEnd=damageSecurityHireEnd(b.booking_date),now=new Date();
  if(!openAt||now<openAt)throw Object.assign(new Error('damage_security_too_early'),{statusCode:409,availableFrom:openAt?.toISOString?.()||null});
  if(hireEnd&&now>hireEnd)throw Object.assign(new Error('damage_security_window_closed'),{statusCode:409});
  if(!['confirmed','confirmed_pending_licence'].includes(String(b.status||'')))throw Object.assign(new Error('booking_not_confirmed'),{statusCode:409});
  if(Number(b.amount_total||0)>0&&Number(b.amount_paid||0)<Number(b.amount_total||0))throw Object.assign(new Error('booking_balance_not_paid'),{statusCode:409});

  if(b.stripe_damage_security_payment_intent_id&&b.damage_security_status==='authorised'){
    const synced=await syncDamageSecurityPaymentIntent(b.stripe_damage_security_payment_intent_id,'checkout_recheck');
    if(synced&&damageSecurityPublicView(synced).release_ready)return {already_authorised:true,status:damageSecurityPublicView(synced)};
  }
  if(b.damage_security_status==='creating_checkout')throw Object.assign(new Error('damage_security_checkout_being_created'),{statusCode:409});
  if(b.damage_security_status==='awaiting_customer'&&b.stripe_damage_security_checkout_session_id){
    try{const existing=await stripe.checkout.sessions.retrieve(b.stripe_damage_security_checkout_session_id);if(existing.status==='open'&&existing.url)return {checkout_url:existing.url,session_id:existing.id,reused:true};}catch{}
  }

  const mark=await pool.query(`UPDATE bookings SET damage_security_status='creating_checkout',damage_security_required_amount=$1,damage_security_attempt=COALESCE(damage_security_attempt,0)+1,damage_security_failure_reason=NULL,damage_security_updated_at=now(),updated_at=now() WHERE public_id=$2 AND damage_security_status<>'creating_checkout' RETURNING *`,[required,b.public_id]);
  if(!mark.rows[0])throw Object.assign(new Error('damage_security_checkout_being_created'),{statusCode:409});
  const current=mark.rows[0],attempt=Number(current.damage_security_attempt||1);
  const params={
    mode:'payment',
    payment_method_types:['card'],
    success_url:`${SITE_URL}/damage-security.html?booking=${encodeURIComponent(b.public_id)}&authorised=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:`${SITE_URL}/damage-security.html?booking=${encodeURIComponent(b.public_id)}&cancelled=1`,
    billing_address_collection:'required',
    line_items:[{quantity:1,price_data:{currency:'gbp',unit_amount:required,product_data:{name:'£2,500 refundable damage-security authorisation',description:'Card authorisation hold for Afiléon Motorsport BMW E46 hire. This is not an immediate £2,500 hire charge; funds are captured only where properly due under the agreed hire terms.'}}}],
    metadata:{kind:'e46_damage_security',booking_id:b.public_id,booking_date:String(b.booking_date||'').slice(0,10)},
    payment_intent_data:{capture_method:'manual',metadata:{kind:'e46_damage_security',booking_id:b.public_id,booking_date:String(b.booking_date||'').slice(0,10)}},
    custom_text:{submit:{message:'This authorises a temporary £2,500 card hold. Afiléon Motorsport can only capture an amount properly due under the agreed Vehicle Hire Terms; otherwise the authorisation is released.'}}
  };
  if(b.stripe_customer_id)params.customer=b.stripe_customer_id;else{params.customer_email=b.customer_email||undefined;params.customer_creation='always';}
  try{
    const session=await stripe.checkout.sessions.create(params,{idempotencyKey:`e46_damage_security_${b.public_id}_${attempt}`});
    await pool.query(`UPDATE bookings SET damage_security_status='awaiting_customer',stripe_damage_security_checkout_session_id=$1,stripe_damage_security_payment_intent_id=COALESCE($2,stripe_damage_security_payment_intent_id),damage_security_updated_at=now(),updated_at=now() WHERE public_id=$3`,[session.id,typeof session.payment_intent==='string'?session.payment_intent:null,b.public_id]);
    await recordDamageSecurityEvent(b.public_id,'checkout_created',current.damage_security_status,'awaiting_customer',required,{session_id:session.id,attempt},'customer',null);
    return {checkout_url:session.url,session_id:session.id};
  }catch(e){
    await pool.query(`UPDATE bookings SET damage_security_status='failed',damage_security_failure_reason=$1,damage_security_updated_at=now(),updated_at=now() WHERE public_id=$2`,[clean(e.message,500),b.public_id]);
    throw e;
  }
}

