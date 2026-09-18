const fs=require('fs');
const path='server_v3.js';
let s=fs.readFileSync(path,'utf8');
function rep(a,b,label){if(s.includes(b))return;if(!s.includes(a))throw new Error('discount webhook patch missing '+label);s=s.replace(a,b);}

rep(
"      await pool.query(\`UPDATE bookings SET status=$1,stripe_payment_intent_id=$2,stripe_customer_id=$3,amount_paid=COALESCE(amount_paid,0)+COALESCE(booking_payment_amount,0),licence_status=CASE WHEN licence_required THEN 'awaiting_email' ELSE licence_status END,updated_at=now() WHERE public_id=$4\`, [hire ? 'confirmed_pending_licence' : 'confirmed', o.payment_intent || null, o.customer || null, o.metadata.booking_id]);",
"      await pool.query(\`UPDATE bookings SET status=$1,stripe_payment_intent_id=$2,stripe_customer_id=$3,amount_paid=COALESCE(amount_paid,0)+COALESCE($4,0)+COALESCE($5,0),licence_status=CASE WHEN licence_required THEN 'awaiting_email' ELSE licence_status END,updated_at=now() WHERE public_id=$6\`, [hire ? 'confirmed_pending_licence' : 'confirmed', o.payment_intent || null, o.customer || null, Number(o.amount_total||0), Number(o.metadata?.gift_voucher_amount||0), o.metadata.booking_id]);",
'booking paid amount');

if(!s.includes("releaseDiscountCode('booking',o.metadata.booking_id)")){
 const m='    const o = event.data.object;';
 if(!s.includes(m))throw new Error('webhook object marker missing');
 s=s.replace(m,m+"\n    if (event.type === 'checkout.session.expired' && o.metadata?.kind === 'service_booking') await releaseDiscountCode('booking',o.metadata.booking_id).catch(()=>{});\n    if (event.type === 'checkout.session.expired' && o.metadata?.kind === 'shop_order') await releaseDiscountCode('shop',o.metadata.order_id).catch(()=>{});");
}

rep(
"    if (event.type === 'checkout.session.completed' && o.metadata?.kind === 'service_booking') await bookingMail(o.metadata.booking_id).catch(()=>{});",
"    if (event.type === 'checkout.session.completed' && o.metadata?.kind === 'service_booking') { await finaliseBookingDiscount(o.metadata.booking_id).catch(()=>{}); await bookingMail(o.metadata.booking_id).catch(()=>{}); }",
'booking finalize');

rep(
"    if (event.type === 'checkout.session.completed' && o.metadata?.kind === 'shop_order') await orderMail(o.metadata.order_id).catch(()=>{});",
"    if (event.type === 'checkout.session.completed' && o.metadata?.kind === 'shop_order') { await finaliseShopDiscount(o.metadata.order_id).catch(()=>{}); await orderMail(o.metadata.order_id).catch(()=>{}); }",
'shop finalize');

fs.writeFileSync(path,s);
console.log('Applied discount webhook finalization');
