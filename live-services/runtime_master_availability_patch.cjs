const fs = require('fs');
const path = 'server_v3.js';
let s = fs.readFileSync(path, 'utf8');

function insertBefore(anchor, block, label) {
  if (s.includes(block.trim().slice(0, 90))) return;
  const i = s.indexOf(anchor);
  if (i < 0) throw new Error(`Master availability patch: missing ${label}`);
  s = s.slice(0, i) + block + '\n' + s.slice(i);
}
function replaceOnce(from, to, label) {
  if (s.includes(to)) return;
  if (!s.includes(from)) throw new Error(`Master availability patch: missing ${label}`);
  s = s.replace(from, to);
}

const migration = `
    CREATE TABLE IF NOT EXISTS business_availability_settings(
      id SMALLINT PRIMARY KEY CHECK(id=1),
      start_date DATE,
      end_date DATE,
      public_message TEXT,
      internal_note TEXT,
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    INSERT INTO business_availability_settings(id,start_date,end_date,public_message,internal_note,updated_by)
      VALUES(1,NULL,NULL,NULL,NULL,NULL)
      ON CONFLICT(id) DO NOTHING;
`;
insertBefore('    CREATE TABLE IF NOT EXISTS seasonal_campaigns(', migration, 'migration anchor');

const helpers = `
// --- Master booking availability / temporary business closure ---
const DEFAULT_CLOSURE_MESSAGE = 'Afiléon Motorsport is temporarily unavailable for new bookings. Online booking will reopen automatically after this temporary closure.';
function closureIsoAddDay(ds) {
  if (!ds) return null;
  const d = new Date(ds + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0,10);
}
async function masterClosureState(requestedDate = null) {
  const { rows } = await pool.query(\`
    SELECT start_date::text AS start_date,end_date::text AS end_date,public_message,internal_note,updated_by,updated_at,
           ((now() AT TIME ZONE 'Europe/London')::date)::text AS today
    FROM business_availability_settings WHERE id=1 LIMIT 1
  \`);
  const r = rows[0] || {};
  const start = r.start_date || null, end = r.end_date || null, today = r.today || new Date().toISOString().slice(0,10);
  const configured = !!(start && end);
  const closedNow = configured && today >= start && today <= end;
  const requested = /^\\d{4}-\\d{2}-\\d{2}$/.test(String(requestedDate||'')) ? String(requestedDate) : null;
  const requestedDateClosed = !!(requested && configured && requested >= start && requested <= end);
  const status = !configured ? 'open' : closedNow ? 'closed' : today < start ? 'scheduled' : 'expired';
  return {
    configured,
    closed_now: closedNow,
    requested_date_closed: requestedDateClosed,
    status,
    start_date: start,
    end_date: end,
    reopens_on: configured ? closureIsoAddDay(end) : null,
    public_message: clean(r.public_message || (configured ? DEFAULT_CLOSURE_MESSAGE : ''), 500),
    internal_note: clean(r.internal_note || '', 500),
    updated_by: r.updated_by || null,
    updated_at: r.updated_at || null,
    today
  };
}
function closureDates(start, end, maxDays = 370) {
  if (!start || !end) return [];
  const out = [], d = new Date(start + 'T12:00:00Z'), last = new Date(end + 'T12:00:00Z');
  while (d <= last && out.length < maxDays) { out.push(d.toISOString().slice(0,10)); d.setUTCDate(d.getUTCDate()+1); }
  return out;
}
`;
insertBefore("app.get('/api/config'", helpers, 'public config anchor');

const availabilityOverlay = `
app.use('/api/availability', async (_req,res,next) => {
  try {
    const closure = await masterClosureState();
    if (!closure.configured) return next();
    const originalJson = res.json.bind(res);
    res.json = body => {
      if (body && Array.isArray(body.busy)) {
        const existing = new Set(body.busy.map(x => String(x.date || x.block_date || '').slice(0,10) + '|' + String(x.kind || '')));
        for (const date of closureDates(closure.start_date, closure.end_date)) {
          const key = date + '|master_closure';
          if (!existing.has(key)) body.busy.push({date,service_id:'',status:'blocked',kind:'master_closure',label:'Master business closure'});
        }
      }
      return originalJson(body);
    };
    next();
  } catch (e) { console.error('master availability overlay failed', e); next(); }
});
`;
insertBefore("app.get('/api/availability'", availabilityOverlay, 'availability route anchor');

const guard = `
app.use(['/api/quotes','/api/bookings/hold','/api/priority-recovery/checkout'], async (req,res,next) => {
  try {
    const requestedDate = req.body?.booking_date || req.body?.requested_date || null;
    const closure = await masterClosureState(requestedDate);
    if (closure.closed_now || closure.requested_date_closed) {
      const detail = closure.closed_now
        ? \`Afiléon Motorsport is temporarily unavailable for new bookings until \${closure.end_date}. Online booking reopens \${closure.reopens_on}.\`
        : \`Afiléon Motorsport is unavailable on the requested date. The temporary closure runs from \${closure.start_date} to \${closure.end_date}.\`;
      return res.status(409).json({error:'business_temporarily_closed',detail,business_availability:closure});
    }
    next();
  } catch (e) { console.error('master availability guard failed', e); res.status(503).json({error:'business_availability_unavailable'}); }
});
`;
insertBefore("app.post('/api/quotes'", guard, 'quote route anchor');

const publicRoute = `
app.get('/api/business-availability', async (_req,res) => {
  try { res.json(await masterClosureState()); }
  catch (e) { console.error(e); res.status(503).json({error:'business_availability_unavailable'}); }
});
`;
insertBefore("app.get('/api/season'", publicRoute, 'season route anchor');

replaceOnce(
"app.get('/api/priority-recovery/status', async (_req,res) => {\n  try {\n    const available = await priorityRecoveryAvailable();",
"app.get('/api/priority-recovery/status', async (_req,res) => {\n  try {\n    const manualAvailable = await priorityRecoveryAvailable();\n    const masterAvailability = await masterClosureState();\n    const available = manualAvailable && !masterAvailability.closed_now;",
'priority public status');

const adminRoutes = `
app.get('/api/admin/business-availability', admin, async (_req,res) => {
  try { res.json(await masterClosureState()); }
  catch (e) { console.error(e); res.status(500).json({error:'business_availability_admin_load_failed'}); }
});
app.post('/api/admin/business-availability', admin, async (req,res) => {
  try {
    const b = req.body || {};
    if (b.clear === true) {
      await pool.query(\`UPDATE business_availability_settings SET start_date=NULL,end_date=NULL,public_message=NULL,internal_note=NULL,updated_by=$1,updated_at=now() WHERE id=1\`,[clean(req.adminUsername,200)||null]);
      if (typeof auditAdmin === 'function') await auditAdmin(req.adminUsername,'master_booking_closure_cleared',{}).catch(()=>{});
      return res.json(await masterClosureState());
    }
    const start = clean(b.start_date,10), end = clean(b.end_date,10);
    if (!isDate(start) || !isDate(end)) return res.status(400).json({error:'valid_closure_dates_required'});
    if (end < start) return res.status(400).json({error:'closure_end_before_start'});
    const publicMessage = clean(b.public_message || DEFAULT_CLOSURE_MESSAGE,500);
    const internalNote = clean(b.internal_note,500);
    await pool.query(\`UPDATE business_availability_settings SET start_date=$1,end_date=$2,public_message=$3,internal_note=$4,updated_by=$5,updated_at=now() WHERE id=1\`,[start,end,publicMessage,internalNote,clean(req.adminUsername,200)||null]);
    if (typeof auditAdmin === 'function') await auditAdmin(req.adminUsername,'master_booking_closure_saved',{start_date:start,end_date:end}).catch(()=>{});
    res.json(await masterClosureState());
  } catch (e) { console.error(e); res.status(500).json({error:'business_availability_update_failed'}); }
});
`;
insertBefore("app.post('/api/admin/block-date'", adminRoutes, 'admin block-date anchor');

fs.writeFileSync(path, s);
console.log('Applied master booking availability with automatic date-range reopening.');
