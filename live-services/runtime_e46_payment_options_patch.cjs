const fs=require('fs');
const path='server_v3.js';
let s=fs.readFileSync(path,'utf8');

function rep(oldText,newText,label){
  if(s.includes(newText)) return;
  if(!s.includes(oldText)) throw new Error('E46 payment options patch missing '+label);
  s=s.replace(oldText,newText);
}

if(!s.includes('// E46_PAYMENT_OPTIONS_V12')){
  s=s.replace(/const TERMS_VERSION = '[^']+';/,"const TERMS_VERSION = '2026-10-07-v10';");
  s=s.replace(/const TERMS_DOCUMENT_VERSIONS = Object\.freeze\(\{booking:'[^']+'/, "const TERMS_DOCUMENT_VERSIONS = Object.freeze({booking:'2026-10-07-v10'");
  s=s.replace(/General Booking Terms v9/g,'General Booking Terms v10');

  const oldPlan=`function paymentPlan(service, variant, date, travelSurcharge = 0) {
  const total = variant?.price == null ? null : Number(variant.price) + Math.max(0, Number(travelSurcharge || 0));
  if (total == null || service.payment === 'quote') return { kind: 'quote', total: null, now: null, balance: null };
  if (service.payment === 'full') return { kind: 'full', total, now: total, balance: 0 };
  if (service.payment === 'e46_rule') {
    const d = daysUntil(date);
    if (d <= 7) return { kind: 'full', total, now: total, balance: 0 };
    return { kind: 'deposit_then_balance', total, now: 25000, balance: total - 25000, balanceNoticeDays: 10, balanceDueDays: 7 };
  }
  return { kind: 'quote', total: null, now: null, balance: null };
}`;
  const newPlan=`function paymentPlan(service, variant, date, travelSurcharge = 0, paymentChoice = 'deposit') {
  const total = variant?.price == null ? null : Number(variant.price) + Math.max(0, Number(travelSurcharge || 0));
  if (total == null || service.payment === 'quote') return { kind: 'quote', total: null, now: null, balance: null };
  if (service.payment === 'full') return { kind: 'full', total, now: total, balance: 0, paymentChoice:'full' };
  if (service.payment === 'e46_rule') {
    const d = daysUntil(date);
    const choice = String(paymentChoice || 'deposit').toLowerCase() === 'full' ? 'full' : 'deposit';
    if (d <= 3 || choice === 'full') return { kind: 'full', total, now: total, balance: 0, paymentChoice:'full', balanceNoticeDays:0, balanceDueDays:0 };
    return { kind: 'deposit_then_balance', total, now: 25000, balance: Math.max(0,total - 25000), paymentChoice:'deposit', depositAmount:25000, balanceNoticeDays:9, balanceDueDays:3 };
  }
  return { kind: 'quote', total: null, now: null, balance: null };
}`;
  rep(oldPlan,newPlan,'payment plan');

  rep(
    "  const plan = paymentPlan(service, variant, b.booking_date, travel.surcharge);",
    "  const requestedPaymentChoice=service.id==='vehicle_hire_day'?clean(b.payment_choice||'deposit',20).toLowerCase():'full';\n  if(service.id==='vehicle_hire_day'&&!['deposit','full'].includes(requestedPaymentChoice)) return res.status(400).json({error:'invalid_payment_choice'});\n  const plan = paymentPlan(service, variant, b.booking_date, travel.surcharge, requestedPaymentChoice);",
    'booking hold payment choice'
  );

  if(s.includes("damage_security_amount_pence: E46_DAMAGE_SECURITY_PENCE || null, terms_url:")){
    s=s.replace(
      "damage_security_amount_pence: E46_DAMAGE_SECURITY_PENCE || null, terms_url:",
      "damage_security_amount_pence: E46_DAMAGE_SECURITY_PENCE || null, e46_payment_terms:{deposit_pence:25000,balance_notice_days:9,balance_due_days:3,pay_in_full_available:true}, terms_url:"
    );
  }

  s=s.replace(/Remaining balance is due 7 days before the booking\./g,'Remaining balance is due 3 days before the booking.');

  rep(
    "      const invoice=await stripe.invoices.create({customer,collection_method:'send_invoice',days_until_due:3,auto_advance:true,automatic_tax:{enabled:true},metadata:{kind:'service_balance',booking_id:b.public_id}});",
    "      const balanceInvoiceDaysUntilDue=Math.max(1,Math.ceil((new Date(b.balance_due_at).getTime()-Date.now())/dayMs));\n      const invoice=await stripe.invoices.create({customer,collection_method:'send_invoice',days_until_due:balanceInvoiceDaysUntilDue,auto_advance:true,automatic_tax:{enabled:true},metadata:{kind:'service_balance',booking_id:b.public_id}});",
    'balance invoice due timing'
  );

  const balanceCronResponse="  const damageSecuritySweep=await refreshDamageSecurityExpiries();\\n  res.json({processed:results.length,results,recovery_processed:recovery.length,recovery,damage_security:damageSecuritySweep});";
  if(s.includes(balanceCronResponse) && !s.includes('overdue_balance_cancellations')){
    const overdueBlock=`  const damageSecuritySweep=await refreshDamageSecurityExpiries();
  // overdue_balance_cancellations
  const overdueCandidates=await pool.query(\`SELECT public_id,customer_name,customer_email,booking_date::text booking_date,amount_paid,amount_total,balance_amount,balance_due_at,stripe_balance_invoice_id FROM bookings WHERE service_id='vehicle_hire_day' AND balance_amount>0 AND balance_status IN ('invoiced','payment_failed') AND balance_due_at IS NOT NULL AND balance_due_at + interval '12 hours' <= now() AND COALESCE(amount_paid,0)<COALESCE(amount_total,0) AND status IN ('confirmed','confirmed_pending_licence') ORDER BY balance_due_at ASC LIMIT 50\`);
  const overdueBalance=[];
  for(const ob of overdueCandidates.rows){
    try{
      if(!ob.stripe_balance_invoice_id){overdueBalance.push({booking_id:ob.public_id,status:'manual_review_no_invoice'});continue}
      const inv=await stripe.invoices.retrieve(ob.stripe_balance_invoice_id);
      if(inv.status==='paid'){
        await pool.query(\`UPDATE bookings SET balance_status='paid',amount_paid=amount_total,status=CASE WHEN licence_required AND licence_status<>'approved' THEN 'confirmed_pending_licence' ELSE 'confirmed' END,updated_at=now() WHERE public_id=$1\`,[ob.public_id]);
        overdueBalance.push({booking_id:ob.public_id,status:'paid_reconciled'});
        continue;
      }
      if(inv.status==='open'||inv.status==='draft') await stripe.invoices.voidInvoice(inv.id);
      const cancelled=await pool.query(\`UPDATE bookings SET status='cancelled_nonpayment',balance_status='overdue_cancelled',updated_at=now() WHERE public_id=$1 AND COALESCE(amount_paid,0)<COALESCE(amount_total,0) AND balance_status IN ('invoiced','payment_failed') AND status IN ('confirmed','confirmed_pending_licence') RETURNING public_id\`,[ob.public_id]);
      if(cancelled.rowCount){
        if(typeof txMail==='function'&&ob.customer_email){
          const due=new Date(ob.balance_due_at).toLocaleDateString('en-GB',{timeZone:'Europe/London',day:'numeric',month:'long',year:'numeric'});
          await txMail(ob.customer_email,'BMW E46 booking cancelled — balance not received',\`<p>Hello \${eEsc(ob.customer_name||'')},</p><p>The remaining balance for booking <b>\${eEsc(ob.public_id)}</b> was due on <b>\${eEsc(due)}</b> and has not been received.</p><p>The BMW E46 reservation and date have therefore been released. The booking deposit is not automatically refunded; any amount retained is handled under the Booking Terms, our actual reasonable loss and applicable consumer law.</p><p>If you believe payment was made or there is an error, contact us as soon as possible.</p>\`,\`Booking \${ob.public_id} has been cancelled because the remaining balance was not received by \${due}. The E46 reservation/date has been released. Deposit treatment is subject to the Booking Terms, actual reasonable loss and applicable consumer law.\`).catch(()=>{});
        }
        overdueBalance.push({booking_id:ob.public_id,status:'cancelled_nonpayment'});
      }
    }catch(e){console.error('overdue balance handling failed',ob.public_id,e.message);overdueBalance.push({booking_id:ob.public_id,status:'error'})}
  }
  res.json({processed:results.length,results,recovery_processed:recovery.length,recovery,damage_security:damageSecuritySweep,overdue_balance_cancellations:overdueBalance});`;
    s=s.replace(balanceCronResponse,overdueBlock);
  }

  const oldAmount="  const amountHtml='<b>Total:</b> '+gbp(b.amount_total)+(Number(b.balance_amount||0)>0&&!balance?'<br><b>Remaining balance:</b> '+gbp(b.balance_amount):'');";
  const newAmount="  const dueText=b.balance_due_at?new Date(b.balance_due_at).toLocaleDateString('en-GB',{timeZone:'Europe/London',day:'numeric',month:'long',year:'numeric'}):'';\n  const amountHtml='<b>Total:</b> '+gbp(b.amount_total)+(Number(b.balance_amount||0)>0&&!balance?'<br><b>Paid now:</b> '+gbp(b.booking_payment_amount)+'<br><b>Remaining balance:</b> '+gbp(b.balance_amount)+(dueText?'<br><b>Balance due:</b> '+eEsc(dueText)+' (3 days before the booking)':'')+'<br><b>Reminder:</b> We will send the secure balance payment request around 9 days before the booking.':'');";
  if(s.includes(oldAmount)) s=s.replace(oldAmount,newAmount);

  s=s.replace(
    "console.log('Applied persistent admin-managed service pricing and separate travel pricing.');",
    "console.log('Applied persistent admin-managed service pricing and separate travel pricing.');"
  );

  const marker="const E46_BOOKING_LIVE = String(process.env.E46_BOOKING_LIVE || 'false').toLowerCase() === 'true';";
  if(s.includes(marker) && !s.includes('// E46_PAYMENT_OPTIONS_V12')){
    s=s.replace(marker,marker+"\n// E46_PAYMENT_OPTIONS_V12");
  }
}

fs.writeFileSync(path,s);
console.log('Applied E46 pay-in-full/deposit choice, T-9 notice, T-3 due date and overdue cancellation handling.');
