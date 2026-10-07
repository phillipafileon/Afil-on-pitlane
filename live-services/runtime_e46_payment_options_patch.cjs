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
console.log('Applied E46 pay-in-full/deposit choice, T-9 balance notice and T-3 balance due.');
