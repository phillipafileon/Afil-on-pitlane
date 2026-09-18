import fs from 'fs/promises';

// SMTP2GO_DIAGNOSTIC_WRAPPER: log provider rejection details without secrets.
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const res = await nativeFetch(...args);
  try {
    const url = String(args?.[0]?.url || args?.[0] || '');
    if (url.includes('api.smtp2go.com/v3/email/send')) {
      const clone = res.clone();
      const data = await clone.json().catch(() => ({}));
      const failed = Number(data?.data?.failed || 0);
      if (!res.ok || failed > 0) {
        console.error('SMTP2GO_DIAGNOSTIC', JSON.stringify({status:res.status, failed, failures:data?.data?.failures || null, error:data?.data?.error || data?.error || null, error_code:data?.data?.error_code || null}));
      }
    }
  } catch {}
  return res;
};

const sourceUrl = new URL('./server_v3.js', import.meta.url);
const runtimeUrl = new URL('./.runtime-server-v311.js', import.meta.url);
let code = await fs.readFile(sourceUrl, 'utf8');

const blockAnchor = "app.post('/api/admin/block-date', admin, async (req,res) => { const {date,service_id,label,colour}=req.body||{}; if(!isDate(date)) return res.status(400).json({error:'invalid_date'}); await pool.query(`INSERT INTO availability_blocks(block_date,service_id,label,colour) VALUES($1,$2,$3,$4)`,[date,service_id||null,clean(label||'Unavailable',160),clean(colour||'#64748b',20)]); res.status(201).json({ok:true}); });\n";
const unblockRoute = "app.post('/api/admin/unblock-date', admin, async (req,res) => { const id=Number(req.body?.block_id); if(!Number.isInteger(id)||id<1) return res.status(400).json({error:'invalid_block_id'}); const result=await pool.query(`DELETE FROM availability_blocks WHERE id=$1 RETURNING id,block_date::text block_date,service_id,label`,[id]); if(!result.rowCount) return res.status(404).json({error:'block_not_found'}); res.json({ok:true,removed:result.rows[0]}); });\n";
if (!code.includes("/api/admin/unblock-date")) {
  if (!code.includes(blockAnchor)) throw new Error('v6.11.0 boot patch failed: block-date route anchor not found');
  code = code.replace(blockAnchor, blockAnchor + unblockRoute);
}

const summaryReplacement = "app.get('/api/admin/summary', admin, async (_req,res) => { const [bookings,quotes,orders,seasons,blocks] = await Promise.all([ pool.query(`SELECT public_id,service_id,variant_id,booking_date::text booking_date,customer_name,customer_email,status,balance_status,licence_status,amount_total,amount_paid,created_at FROM bookings ORDER BY booking_date ASC LIMIT 250`), pool.query(`SELECT public_id,service_id,requested_date::text requested_date,customer_name,customer_email,status,created_at FROM quote_requests ORDER BY created_at DESC LIMIT 100`), pool.query(`SELECT public_id,customer_email,status,total,created_at FROM orders ORDER BY created_at DESC LIMIT 100`), pool.query(`SELECT slug,name,starts_at,ends_at,active FROM seasonal_campaigns ORDER BY starts_at DESC LIMIT 50`), pool.query(`SELECT id,block_date::text block_date,COALESCE(service_id,'') service_id,label,colour,created_at FROM availability_blocks WHERE block_date>=CURRENT_DATE ORDER BY block_date ASC,id ASC LIMIT 250`) ]); res.json({bookings:bookings.rows,quotes:quotes.rows,orders:orders.rows,seasons:seasons.rows,blocks:blocks.rows}); });";
const summaryStartMarker = "app.get('/api/admin/summary'";
const summaryEndMarker = "\n\napp.get('/',";
const summaryStart = code.indexOf(summaryStartMarker);
const summaryEnd = code.indexOf(summaryEndMarker, summaryStart);
if (summaryStart < 0 || summaryEnd < 0) throw new Error('v6.11.0 boot patch failed: admin summary route range not found');
code = code.slice(0, summaryStart) + summaryReplacement + code.slice(summaryEnd);

// E2E_VOUCHER_DIAGNOSTIC (temporary)
const e2eVoucherDiagnostic = "app.get('/_diag/e2e-voucher-7d6f', (_req,res)=>res.type('html').send(\"<!doctype html><html><head><meta charset=\\\"utf-8\\\"><title>E2E Voucher Diagnostic</title></head><body><h1>E2E Voucher Diagnostic</h1><label>Verification ID <input id=\\\"vid\\\"></label><br><label>Code <input id=\\\"code\\\" inputmode=\\\"numeric\\\"></label><br><label>Email <input id=\\\"email\\\" value=\\\"phillipafileon@gmail.com\\\"></label><br><button id=\\\"confirm\\\">Confirm code</button><button id=\\\"checkout\\\">Test checkout unlock</button><pre id=\\\"out\\\"></pre><script>\\nconst out=document.getElementById('out');\\ndocument.getElementById('confirm').onclick=async()=>{const r=await fetch('/api/email-verification/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({verification_id:document.getElementById('vid').value.trim(),code:document.getElementById('code').value.trim()})});out.textContent='CONFIRM '+r.status+'\\\\n'+await r.text();};\\ndocument.getElementById('checkout').onclick=async()=>{const r=await fetch('/api/gift-vouchers/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:2500,purchaser_name:'E2E Test',purchaser_email:document.getElementById('email').value.trim(),email_verification_id:document.getElementById('vid').value.trim()})});out.textContent='CHECKOUT '+r.status+'\\\\n'+await r.text();};\\n</script></body></html>\"));\\n";
if (!code.includes("/_diag/e2e-voucher-7d6f")) code += "\n" + e2eVoucherDiagnostic;

await fs.writeFile(runtimeUrl, code, 'utf8');
await import(`${runtimeUrl.href}?v=6110`);
