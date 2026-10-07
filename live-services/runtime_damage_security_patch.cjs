const fs=require('fs');
const path='server_v3.js';
let s=fs.readFileSync(path,'utf8');
const HELPERS=fs.readFileSync('runtime_damage_security_helpers.inc','utf8');
const PUBLIC_ROUTES=fs.readFileSync('runtime_damage_security_public.inc','utf8');
const ADMIN_ROUTES=fs.readFileSync('runtime_damage_security_admin.inc','utf8');

function before(marker,addition,label){
  const first=addition.trim().slice(0,120);
  if(first&&s.includes(first))return;
  const i=s.indexOf(marker);
  if(i<0)throw new Error('Damage security patch marker missing: '+label);
  s=s.slice(0,i)+addition+'\n'+s.slice(i);
}

if(!s.includes('const E46_DAMAGE_SECURITY_OPEN_HOURS =')){
  const marker="const E46_DAMAGE_SECURITY_PENCE = Math.max(0, Number.parseInt(process.env.E46_DAMAGE_SECURITY_PENCE || '0',10) || 0);";
  if(!s.includes(marker))throw new Error('Damage security patch marker missing: security amount config');
  s=s.replace(marker,marker+"\nconst E46_DAMAGE_SECURITY_OPEN_HOURS = Math.max(12, Math.min(120, Number.parseInt(process.env.E46_DAMAGE_SECURITY_OPEN_HOURS || '48',10) || 48));");
}

if(!s.includes('damage_security_status TEXT')){
  const marker='    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_amount INTEGER;';
  if(!s.includes(marker))throw new Error('Damage security patch marker missing: booking security migration');
  const migration=[
    "    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_status TEXT NOT NULL DEFAULT 'not_authorised';",
    '    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_required_amount INTEGER;',
    '    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_authorised_amount INTEGER NOT NULL DEFAULT 0;',
    '    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_capturable_amount INTEGER NOT NULL DEFAULT 0;',
    '    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_damage_security_checkout_session_id TEXT;',
    '    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_damage_security_payment_intent_id TEXT;',
    '    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_authorised_at TIMESTAMPTZ;',
    '    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_capture_before TIMESTAMPTZ;',
    '    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_captured_amount INTEGER NOT NULL DEFAULT 0;',
    '    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_captured_at TIMESTAMPTZ;',
    '    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_capture_reason TEXT;',
    '    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_capture_notes TEXT;',
    '    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_release_requested_at TIMESTAMPTZ;',
    '    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_released_at TIMESTAMPTZ;',
    '    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_expired_at TIMESTAMPTZ;',
    '    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_failure_reason TEXT;',
    '    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_attempt INTEGER NOT NULL DEFAULT 0;',
    '    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_customer_notified_at TIMESTAMPTZ;',
    '    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS damage_security_updated_at TIMESTAMPTZ;',
    '',
    '    CREATE TABLE IF NOT EXISTS damage_security_events(',
    '      id BIGSERIAL PRIMARY KEY,',
    '      booking_id TEXT NOT NULL,',
    '      stripe_payment_intent_id TEXT,',
    '      event_type TEXT NOT NULL,',
    '      previous_status TEXT,',
    '      new_status TEXT,',
    '      amount INTEGER,',
    "      detail JSONB NOT NULL DEFAULT '{}'::jsonb,",
    '      actor TEXT,',
    '      created_at TIMESTAMPTZ NOT NULL DEFAULT now()',
    '    );',
    '    CREATE INDEX IF NOT EXISTS damage_security_events_booking_idx ON damage_security_events(booking_id,created_at);'
  ].join('\n');
  s=s.replace(marker,marker+'\n'+migration);
}

if(!s.includes('function damageSecurityPublicView('))before("app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {",HELPERS,'helpers');
if(!s.includes("app.get('/api/bookings/:id/damage-security'"))before("app.get('/api/availability', async (req, res) => {",PUBLIC_ROUTES,'public routes');
if(!s.includes("app.get('/api/admin/bookings/:id/damage-security'"))before("app.get('/api/admin/summary'",ADMIN_ROUTES,'admin routes');

if(!s.includes('damage_security:damageSecuritySweep')){
  const marker="  res.json({processed:results.length,results,recovery_processed:recovery.length,recovery});";
  if(!s.includes(marker))throw new Error('Damage security patch marker missing: balance cron response');
  s=s.replace(marker,"  const damageSecuritySweep=await refreshDamageSecurityExpiries();\n  res.json({processed:results.length,results,recovery_processed:recovery.length,recovery,damage_security:damageSecuritySweep});");
}

fs.writeFileSync(path,s);
console.log('Applied E46 £2,500 Stripe manual-capture damage-security authorization flow.');
