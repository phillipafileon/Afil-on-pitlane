const fs=require('fs');
const path='server_v3.js';
let s=fs.readFileSync(path,'utf8');

function replaceOnce(from,to,label){
  if(s.includes(to)) return;
  if(!s.includes(from)) throw new Error('Availability enforcement patch missing '+label);
  s=s.replace(from,to);
}
function insertBefore(anchor,block,label){
  if(s.includes(block.trim().slice(0,100))) return;
  const i=s.indexOf(anchor);
  if(i<0) throw new Error('Availability enforcement patch missing '+label);
  s=s.slice(0,i)+block+'\n'+s.slice(i);
}

if(!s.includes('// AVAILABILITY_ENFORCEMENT_V1')){
  const holdOld="    const block = await client.query(\`SELECT 1 FROM availability_blocks WHERE block_date=$1 LIMIT 1\`, [b.booking_date]);";
  const holdNew="    const block = await client.query(\`SELECT 1 FROM availability_blocks WHERE block_date=$1 AND (service_id IS NULL OR service_id='' OR service_id='*' OR service_id=$2) LIMIT 1\`, [b.booking_date,service.id]);";
  replaceOnce(holdOld,holdNew,'service-specific booking hold block check');

  const checkoutAnchor="  const service = SERVICE_MAP.get(b.service_id), variant = variantFor(service, b.variant_id);\n  if (!service || !variant || !b.booking_payment_amount) return res.status(400).json({ error: 'quote_required' });";
  const checkoutReplacement="  const service = SERVICE_MAP.get(b.service_id), variant = variantFor(service, b.variant_id);\n  if (!service || !variant || !b.booking_payment_amount) return res.status(400).json({ error: 'quote_required' });\n  const checkoutClosure=await masterClosureState(isoDate(b.booking_date));\n  if(checkoutClosure.closed_now||checkoutClosure.requested_date_closed) return res.status(409).json({error:'business_temporarily_closed',detail:'Online booking is unavailable for this date.'});\n  const checkoutBlock=await pool.query(\`SELECT 1 FROM availability_blocks WHERE block_date=$1 AND (service_id IS NULL OR service_id='' OR service_id='*' OR service_id=$2) LIMIT 1\`,[isoDate(b.booking_date),b.service_id]);\n  if(checkoutBlock.rowCount) return res.status(409).json({error:'date_unavailable',detail:'This service is no longer available on the selected date. No payment has been taken.'});";
  replaceOnce(checkoutAnchor,checkoutReplacement,'checkout availability recheck');

  const quoteGuard = `
app.use('/api/quotes', async (req,res,next) => {
  try {
    const b=req.body||{};
    if(!isDate(b.requested_date)||!b.service_id) return next();
    const blocked=await pool.query(\`SELECT 1 FROM availability_blocks WHERE block_date=$1 AND (service_id IS NULL OR service_id='' OR service_id='*' OR service_id=$2) LIMIT 1\`,[b.requested_date,String(b.service_id)]);
    if(blocked.rowCount) return res.status(409).json({error:'date_unavailable',detail:'This service is unavailable on the requested date.'});
    next();
  } catch(e) {
    console.error('quote availability guard failed',e);
    res.status(503).json({error:'availability_unavailable'});
  }
});
`;
  insertBefore("app.post('/api/quotes'",quoteGuard,'quote route');

  const adminRangeRoute = `
app.post('/api/admin/availability-range', admin, async (req,res) => {
  const b=req.body||{};
  const start=clean(b.start_date,10), end=clean(b.end_date||b.start_date,10);
  if(!isDate(start)||!isDate(end)) return res.status(400).json({error:'valid_dates_required'});
  if(end<start) return res.status(400).json({error:'end_before_start'});
  const allServices=b.all_services===true;
  const rawIds=Array.isArray(b.service_ids)?b.service_ids:[];
  const serviceIds=[...new Set(rawIds.map(x=>clean(x,80)).filter(Boolean))];
  if(!allServices){
    if(!serviceIds.length) return res.status(400).json({error:'service_required'});
    const invalid=serviceIds.filter(id=>!SERVICE_MAP.has(id));
    if(invalid.length) return res.status(400).json({error:'unknown_service',service_ids:invalid});
  }
  const label=clean(b.label||'Unavailable',160)||'Unavailable';
  const colour=clean(b.colour||'#64748b',20)||'#64748b';
  const dates=[];
  const d=new Date(start+'T12:00:00Z'), last=new Date(end+'T12:00:00Z');
  while(d<=last&&dates.length<371){dates.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+1)}
  if(!dates.length||d<=last) return res.status(400).json({error:'availability_range_too_large'});
  const scopes=allServices?[null]:serviceIds;
  const client=await pool.connect();
  let inserted=0,updated=0;
  try{
    await client.query('BEGIN');
    for(const date of dates){
      for(const sid of scopes){
        const u=await client.query(\`UPDATE availability_blocks SET label=$3,colour=$4 WHERE block_date=$1 AND COALESCE(service_id,'')=COALESCE($2,'')\`,[date,sid,label,colour]);
        if(u.rowCount){updated+=u.rowCount;continue}
        await client.query(\`INSERT INTO availability_blocks(block_date,service_id,label,colour) VALUES($1,$2,$3,$4)\`,[date,sid,label,colour]);
        inserted++;
      }
    }
    await client.query('COMMIT');
    if(typeof auditAdmin==='function') await auditAdmin(req.adminUsername,'availability_range_saved',{start_date:start,end_date:end,all_services:allServices,service_ids:allServices?['*']:serviceIds,inserted,updated}).catch(()=>{});
    res.status(201).json({ok:true,start_date:start,end_date:end,all_services:allServices,service_ids:allServices?['*']:serviceIds,days:dates.length,inserted,updated});
  }catch(e){
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({error:'availability_range_failed'});
  }finally{client.release()}
});
`;
  insertBefore("app.post('/api/admin/block-date'",adminRangeRoute,'admin block date route');

  const marker="const E46_BOOKING_LIVE = String(process.env.E46_BOOKING_LIVE || 'false').toLowerCase() === 'true';";
  if(s.includes(marker)) s=s.replace(marker,marker+"\n// AVAILABILITY_ENFORCEMENT_V1");
}

fs.writeFileSync(path,s);
console.log('Applied transactional all-services availability and server-side availability enforcement.');
