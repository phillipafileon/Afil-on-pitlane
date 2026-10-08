const fs=require('fs');
const path='server_v3.js';
let s=fs.readFileSync(path,'utf8');

function insertBefore(anchor,block,label){
  if(s.includes(block.trim().slice(0,100))) return;
  const i=s.indexOf(anchor);
  if(i<0) throw new Error('Manual offline booking patch missing '+label);
  s=s.slice(0,i)+block+'\n'+s.slice(i);
}

if(!s.includes('// MANUAL_OFFLINE_BOOKING_V1')){
  const block=`
// MANUAL_OFFLINE_BOOKING_V1
function manualBookingConflictServices(serviceId){
  if(['vehicle_hire_day','full_package'].includes(serviceId)) return ['vehicle_hire_day','full_package'];
  if(['vehicle_transport','full_package'].includes(serviceId)) return ['vehicle_transport','full_package'];
  if(['track_day_support','race_day_support','full_package'].includes(serviceId)) return ['track_day_support','race_day_support','full_package'];
  return [serviceId];
}

app.post('/api/admin/bookings/manual',admin,async(req,res)=>{
  try{
    if(typeof loadPricingOverrides==='function') await loadPricingOverrides(true);
    const b=req.body||{};
    const bookingDate=clean(b.booking_date,10),serviceId=clean(b.service_id,80),customerName=clean(b.customer_name,120);
    if(!isDate(bookingDate)) return res.status(400).json({error:'invalid_date'});
    if(!customerName) return res.status(400).json({error:'customer_name_required'});
    const service=SERVICE_MAP.get(serviceId);
    if(!service) return res.status(404).json({error:'unknown_service'});
    const variantId=clean(b.variant_id,80)||service.variants?.[0]?.id||'';
    const variant=variantFor(service,variantId);
    if(!variant) return res.status(400).json({error:'unknown_variant'});

    const inferredTotal=variant.price==null?0:Number(variant.price);
    const total=b.total_pence==null||b.total_pence===''?inferredTotal:Number(b.total_pence);
    const paid=b.amount_paid_pence==null||b.amount_paid_pence===''?total:Number(b.amount_paid_pence);
    if(!Number.isInteger(total)||total<0||total>5000000) return res.status(400).json({error:'invalid_total'});
    if(!Number.isInteger(paid)||paid<0||paid>total) return res.status(400).json({error:'invalid_amount_paid'});

    const conflictServices=manualBookingConflictServices(serviceId);
    const conflict=await pool.query(\`SELECT public_id,service_id,status FROM bookings WHERE booking_date=$1 AND service_id=ANY($2::text[]) AND (status IN ('confirmed','confirmed_pending_licence') OR (status='hold' AND hold_expires_at>now()) OR balance_status IN ('invoiced','payment_failed','manual_due')) ORDER BY created_at DESC LIMIT 1\`,[bookingDate,conflictServices]);
    if(conflict.rowCount) return res.status(409).json({error:'booking_conflict',detail:'A live booking already exists for this date / shared resource.',existing_booking:conflict.rows[0]});

    const id=token('bk');
    const licenceRequired=!!service.licenceRequired;
    const status=licenceRequired?'confirmed_pending_licence':'confirmed';
    const balance=Math.max(0,total-paid);
    const balanceStatus=balance>0?'manual_due':(total>0?'paid':'manual_record');
    const allowedMethods=new Set(['cash','bank_transfer','card_terminal','other','manual']);
    const paymentMethod=allowedMethods.has(clean(b.payment_method,40).toLowerCase())?clean(b.payment_method,40).toLowerCase():'cash';
    const reference=clean(b.payment_reference,160)||null;
    const customerEmail=clean(b.customer_email,200)||null,customerPhone=clean(b.customer_phone,60)||null;
    const extraNotes=clean(b.notes,1500);
    const noteParts=['Offline/admin booking',paymentMethod?('Payment method: '+paymentMethod.replace(/_/g,' ')):'',reference?('Reference: '+reference):'',extraNotes].filter(Boolean);
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query(\`INSERT INTO bookings(public_id,service_id,variant_id,booking_date,customer_name,customer_email,customer_phone,notes,status,amount_total,amount_paid,booking_payment_amount,balance_amount,balance_status,licence_required,licence_status,safe_work_area_confirmed,terms_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$13,$14,$15,false,$16)\`,[
        id,serviceId,variantId,bookingDate,customerName,customerEmail,customerPhone,noteParts.join(' • ')||null,status,total,paid,balance,balanceStatus,licenceRequired,licenceRequired?'pending':null,typeof TERMS_VERSION==='string'?TERMS_VERSION:null
      ]);
      const paymentTitle=paid>0?((paymentMethod==='cash'?'Cash':paymentMethod.replace(/_/g,' '))+' payment received'):'Offline booking created';
      const paymentNotes=[paid>0?('Received £'+(paid/100).toFixed(2)):'No payment recorded',total>0?('Booking total £'+(total/100).toFixed(2)):'Booking total not entered',balance>0?('Outstanding £'+(balance/100).toFixed(2)):'No outstanding balance',reference?('Reference '+reference):'',extraNotes].filter(Boolean).join(' • ');
      await client.query(\`INSERT INTO booking_record_entries(booking_id,section,entry_type,title,status,notes,payload,created_by) VALUES($1,'payments','offline_payment',$2,$3,$4,$5::jsonb,$6)\`,[
        id,paymentTitle,balance>0?'part_paid':(paid>0?'paid':'recorded'),paymentNotes,JSON.stringify({payment_method:paymentMethod,payment_reference:reference,total_pence:total,amount_paid_pence:paid,balance_pence:balance,source:'admin_manual_booking'}),clean(req.adminUsername,200)||null
      ]);
      await client.query('COMMIT');
    }catch(e){
      await client.query('ROLLBACK').catch(()=>{});
      throw e;
    }finally{client.release()}

    await auditAdmin(req.adminUsername,'manual_offline_booking_created',{booking_id:id,booking_date:bookingDate,service_id:serviceId,variant_id:variantId,payment_method:paymentMethod,total_pence:total,amount_paid_pence:paid,balance_pence:balance});
    res.status(201).json({ok:true,booking_id:id,status,booking_date:bookingDate,service_id:serviceId,variant_id:variantId,amount_total:total,amount_paid:paid,balance_amount:balance,balance_status:balanceStatus,payment_method:paymentMethod,calendar_state:'booked'});
  }catch(e){
    console.error('manual offline booking failed',e);
    res.status(500).json({error:'manual_booking_failed'});
  }
});
`;
  insertBefore("app.post('/api/admin/block-date'",block,'admin block-date route');
}

fs.writeFileSync(path,s);
console.log('Applied manual offline/cash booking creation for customer-booked calendar dates.');
