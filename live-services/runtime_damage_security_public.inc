app.get('/api/bookings/:id/damage-security', async (req,res) => {
  const {rows}=await pool.query(`SELECT * FROM bookings WHERE public_id=$1 LIMIT 1`,[req.params.id]);
  let b=rows[0];if(!b||!['vehicle_hire_day','full_package'].includes(b.service_id))return res.status(404).json({error:'not_found'});
  if(!b.stripe_damage_security_payment_intent_id&&b.stripe_damage_security_checkout_session_id&&stripe){try{const cs=await stripe.checkout.sessions.retrieve(b.stripe_damage_security_checkout_session_id);const piId=typeof cs.payment_intent==='string'?cs.payment_intent:cs.payment_intent?.id;if(piId){await pool.query(`UPDATE bookings SET stripe_damage_security_payment_intent_id=$1,damage_security_updated_at=now(),updated_at=now() WHERE public_id=$2`,[piId,b.public_id]);b.stripe_damage_security_payment_intent_id=piId;}}catch{}}
  if(b.stripe_damage_security_payment_intent_id){try{b=(await syncDamageSecurityPaymentIntent(b.stripe_damage_security_payment_intent_id,'public_status'))||b;}catch{}}
  res.json(damageSecurityPublicView(b));
});
app.post('/api/bookings/:id/damage-security/checkout', async (req,res) => {
  const {rows}=await pool.query(`SELECT * FROM bookings WHERE public_id=$1 LIMIT 1`,[req.params.id]);
  const b=rows[0];if(!b||!['vehicle_hire_day','full_package'].includes(b.service_id))return res.status(404).json({error:'not_found'});
  try{res.json(await createDamageSecurityCheckout(b));}
  catch(e){console.error('damage security checkout failed',e);res.status(e.statusCode||500).json({error:e.message||'damage_security_checkout_failed',available_from:e.availableFrom||null});}
});
