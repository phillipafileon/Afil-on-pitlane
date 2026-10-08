const fs=require('fs');
const path='server_v3.js';
let s=fs.readFileSync(path,'utf8');

function replaceOnce(from,to,label){
  if(s.includes(to)) return;
  if(!s.includes(from)) throw new Error('Smoke-test cleanup patch missing '+label);
  s=s.replace(from,to);
}
function insertBefore(anchor,block,label){
  if(s.includes(block.trim().slice(0,100))) return;
  const i=s.indexOf(anchor);
  if(i<0) throw new Error('Smoke-test cleanup patch missing '+label);
  s=s.slice(0,i)+block+'\n'+s.slice(i);
}

if(!s.includes('// ADMIN_SMOKE_TEST_CLEANUP_V1')){
  replaceOnce(
    "    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS safe_work_area_confirmed BOOLEAN NOT NULL DEFAULT false;",
    "    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS safe_work_area_confirmed BOOLEAN NOT NULL DEFAULT false;\n    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS admin_hidden BOOLEAN NOT NULL DEFAULT false;",
    'bookings migration'
  );

  replaceOnce(
    "FROM bookings ORDER BY booking_date ASC LIMIT 250",
    "FROM bookings WHERE COALESCE(admin_hidden,false)=false ORDER BY booking_date ASC LIMIT 250",
    'admin summary booking filter'
  );

  replaceOnce(
    "FROM bookings ORDER BY created_at DESC",
    "FROM bookings WHERE COALESCE(admin_hidden,false)=false ORDER BY created_at DESC",
    'booking export filter'
  );

  const dashFrom = "COALESCE(sum(amount_paid) FILTER (WHERE created_at>=date_trunc('month',now())),0)::bigint month_paid FROM bookings";
  const dashTo = "COALESCE(sum(amount_paid) FILTER (WHERE created_at>=date_trunc('month',now())),0)::bigint month_paid FROM bookings WHERE COALESCE(admin_hidden,false)=false";
  if(s.includes(dashFrom)) s=s.replace(dashFrom,dashTo);

  const helpers = `
// --- Admin smoke-test / test-booking cleanup ---
function looksLikeAdminTestBooking(b){
  const name=String(b?.customer_name||'').toLowerCase();
  const email=String(b?.customer_email||'').toLowerCase();
  const notes=String(b?.notes||'').toLowerCase();
  const vehicle=String(b?.vehicle_details||'').toLowerCase();
  const hay=[name,email,notes,vehicle].join(' ');
  return /(smoke[ _-]*test|test[ _-]*(booking|customer)|dummy[ _-]*(booking|customer)|demo[ _-]*(booking|customer)|qa[ _-]*test|sandbox[ _-]*test)/i.test(hay)
    || /@(example\\.com|example\\.test|test\\.invalid)$/i.test(email);
}
async function archiveAdminTestBooking(id,actor){
  const q=await pool.query(\`SELECT * FROM bookings WHERE public_id=$1 LIMIT 1\`,[id]);
  const b=q.rows[0];
  if(!b) return {ok:false,status:404,error:'booking_not_found'};
  if(b.admin_hidden) return {ok:true,already_archived:true,booking_id:id};
  const amountPaid=Number(b.amount_paid||0);
  const nonActive=['hold','expired','cancelled','late_payment_refunded','test_archived'].includes(String(b.status||''));
  const obvious=looksLikeAdminTestBooking(b);
  if(amountPaid>0 || String(b.balance_status||'')==='paid') return {ok:false,status:409,error:'paid_booking_cannot_be_archived'};
  if(!obvious && !nonActive) return {ok:false,status:409,error:'not_identified_as_test_booking',detail:'Only obvious test/smoke records or inactive unpaid bookings can be removed from the admin view.'};
  if(stripe && b.stripe_checkout_session_id){
    try{
      const cs=await stripe.checkout.sessions.retrieve(b.stripe_checkout_session_id);
      if(cs.payment_status==='paid') return {ok:false,status:409,error:'paid_booking_cannot_be_archived'};
      if(cs.status==='open') await stripe.checkout.sessions.expire(cs.id);
    }catch(e){console.error('test booking checkout cleanup failed',id,e.message)}
  }
  if(stripe && b.stripe_balance_invoice_id){
    try{
      const inv=await stripe.invoices.retrieve(b.stripe_balance_invoice_id);
      if(inv.status==='paid') return {ok:false,status:409,error:'paid_booking_cannot_be_archived'};
      if(inv.status==='open'||inv.status==='draft') await stripe.invoices.voidInvoice(inv.id);
    }catch(e){console.error('test booking balance cleanup failed',id,e.message)}
  }
  await pool.query(\`UPDATE bookings SET admin_hidden=true,status='test_archived',balance_status=NULL,updated_at=now() WHERE public_id=$1\`,[id]);
  if(typeof auditAdmin==='function') await auditAdmin(actor,'test_booking_archived',{booking_id:id,obvious_test:obvious}).catch(()=>{});
  return {ok:true,booking_id:id,archived:true};
}
`;
  insertBefore("app.get('/api/admin/summary'",helpers,'admin summary route');

  const routes = `
app.post('/api/admin/bookings/archive-smoke-tests',admin,async(req,res)=>{
  try{
    const q=await pool.query(\`SELECT * FROM bookings WHERE COALESCE(admin_hidden,false)=false AND COALESCE(amount_paid,0)=0 ORDER BY created_at ASC LIMIT 250\`);
    const candidates=q.rows.filter(looksLikeAdminTestBooking);
    const archived=[],skipped=[];
    for(const b of candidates){
      const out=await archiveAdminTestBooking(b.public_id,req.adminUsername);
      if(out.ok&&out.archived) archived.push(b.public_id); else if(!out.ok) skipped.push({booking_id:b.public_id,error:out.error});
    }
    res.json({ok:true,matched:candidates.length,archived_count:archived.length,archived,skipped});
  }catch(e){console.error(e);res.status(500).json({error:'test_booking_cleanup_failed'})}
});
app.post('/api/admin/bookings/:id/archive-test',admin,async(req,res)=>{
  try{
    const out=await archiveAdminTestBooking(clean(req.params.id,160),req.adminUsername);
    if(!out.ok) return res.status(out.status||409).json({error:out.error,detail:out.detail});
    res.json(out);
  }catch(e){console.error(e);res.status(500).json({error:'test_booking_archive_failed'})}
});
`;
  insertBefore("app.post('/api/admin/approve-licence'",routes,'admin approve licence route');

  const marker="const E46_BOOKING_LIVE = String(process.env.E46_BOOKING_LIVE || 'false').toLowerCase() === 'true';";
  if(s.includes(marker)) s=s.replace(marker,marker+"\n// ADMIN_SMOKE_TEST_CLEANUP_V1");
}

fs.writeFileSync(path,s);
console.log('Applied admin smoke-test cleanup and safe test-booking archive controls.');
