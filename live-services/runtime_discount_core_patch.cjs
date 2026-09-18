const fs=require('fs');
const path='server_v3.js';
let s=fs.readFileSync(path,'utf8');

if(!s.includes('CREATE TABLE IF NOT EXISTS discount_codes(')){
  const m='    CREATE TABLE IF NOT EXISTS seasonal_campaigns(';
  if(!s.includes(m))throw new Error('discount migration marker missing');
  const sql=`    CREATE TABLE IF NOT EXISTS discount_codes(
      id BIGSERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      discount_type TEXT NOT NULL,
      discount_value INTEGER NOT NULL,
      max_uses INTEGER,
      uses_used INTEGER NOT NULL DEFAULT 0,
      starts_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS discount_redemptions(
      id BIGSERIAL PRIMARY KEY,
      discount_code_id BIGINT NOT NULL REFERENCES discount_codes(id),
      context_type TEXT NOT NULL,
      context_id TEXT NOT NULL,
      discount_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'reserved',
      stripe_session_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      used_at TIMESTAMPTZ,
      released_at TIMESTAMPTZ,
      UNIQUE(context_type,context_id)
    );
    CREATE INDEX IF NOT EXISTS discount_redemptions_code_status_idx ON discount_redemptions(discount_code_id,status);
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_code_id BIGINT;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS original_amount_total INTEGER;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code_id BIGINT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_total INTEGER;

`;
  s=s.replace(m,sql+m);
}

if(!s.includes('function normaliseDiscountCode(')){
  const m='const GIFT_VOUCHER_AMOUNTS =';
  const i=s.indexOf(m); if(i<0)throw new Error('discount helper marker missing');
  const h=`function normaliseDiscountCode(value){return clean(value,80).toUpperCase().replace(/\\s+/g,'');}
function discountAmountFor(row,amount){
  const base=Math.max(0,Number(amount||0));
  if(!row||base<=0)return 0;
  if(row.discount_type==='percent')return Math.min(base,Math.floor(base*Math.max(0,Math.min(100,Number(row.discount_value||0)))/100));
  if(row.discount_type==='fixed')return Math.min(base,Math.max(0,Number(row.discount_value||0)));
  return 0;
}
async function cleanupDiscountReservations(){await pool.query(\`UPDATE discount_redemptions SET status='released',released_at=now() WHERE status='reserved' AND created_at<now()-interval '24 hours'\`);}
async function getDiscountCode(code,amount=0){
  await cleanupDiscountReservations();
  const normal=normaliseDiscountCode(code); if(!normal)return null;
  const {rows}=await pool.query(\`SELECT d.*,COALESCE((SELECT count(*)::int FROM discount_redemptions r WHERE r.discount_code_id=d.id AND r.status='reserved'),0) reserved_uses FROM discount_codes d WHERE UPPER(d.code)=UPPER($1) LIMIT 1\`,[normal]);
  const d=rows[0];
  if(!d||!d.active||(d.starts_at&&new Date(d.starts_at)>new Date())||(d.expires_at&&new Date(d.expires_at)<=new Date()))return null;
  if(d.max_uses!=null&&(Number(d.uses_used||0)+Number(d.reserved_uses||0))>=Number(d.max_uses))return null;
  return {...d,preview_discount:discountAmountFor(d,amount)};
}
async function reserveDiscountCode(code,contextType,contextId,amount){
  const normal=normaliseDiscountCode(code); if(!normal)return null;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query(\`UPDATE discount_redemptions SET status='released',released_at=now() WHERE status='reserved' AND created_at<now()-interval '24 hours'\`);
    const ex=await client.query(\`SELECT r.*,d.code,d.discount_type,d.discount_value FROM discount_redemptions r JOIN discount_codes d ON d.id=r.discount_code_id WHERE r.context_type=$1 AND r.context_id=$2 FOR UPDATE\`,[contextType,contextId]);
    if(ex.rows[0]&&['reserved','used'].includes(ex.rows[0].status)){await client.query('COMMIT');return ex.rows[0];}
    if(ex.rows[0]&&ex.rows[0].status==='released')await client.query(\`DELETE FROM discount_redemptions WHERE id=$1\`,[ex.rows[0].id]);
    const q=await client.query(\`SELECT * FROM discount_codes WHERE UPPER(code)=UPPER($1) FOR UPDATE\`,[normal]);
    const d=q.rows[0];
    if(!d||!d.active||(d.starts_at&&new Date(d.starts_at)>new Date())||(d.expires_at&&new Date(d.expires_at)<=new Date())){await client.query('ROLLBACK');return null;}
    if(d.max_uses!=null){
      const rc=await client.query(\`SELECT count(*)::int n FROM discount_redemptions WHERE discount_code_id=$1 AND status='reserved'\`,[d.id]);
      if(Number(d.uses_used||0)+Number(rc.rows[0]?.n||0)>=Number(d.max_uses)){await client.query('ROLLBACK');return null;}
    }
    const amountOff=discountAmountFor(d,amount); if(amountOff<=0){await client.query('ROLLBACK');return null;}
    const ins=await client.query(\`INSERT INTO discount_redemptions(discount_code_id,context_type,context_id,discount_amount,status) VALUES($1,$2,$3,$4,'reserved') RETURNING *\`,[d.id,contextType,contextId,amountOff]);
    await client.query('COMMIT');
    return {...ins.rows[0],code:d.code,discount_type:d.discount_type,discount_value:d.discount_value};
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
async function attachDiscountSession(contextType,contextId,sessionId){await pool.query(\`UPDATE discount_redemptions SET stripe_session_id=$1 WHERE context_type=$2 AND context_id=$3 AND status='reserved'\`,[sessionId,contextType,contextId]);}
async function releaseDiscountCode(contextType,contextId){await pool.query(\`UPDATE discount_redemptions SET status='released',released_at=now() WHERE context_type=$1 AND context_id=$2 AND status='reserved'\`,[contextType,contextId]);}
async function markDiscountUsed(contextType,contextId){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const q=await client.query(\`SELECT * FROM discount_redemptions WHERE context_type=$1 AND context_id=$2 FOR UPDATE\`,[contextType,contextId]);
    const r=q.rows[0];
    if(!r||r.status==='used'){await client.query('COMMIT');return r||null;}
    if(r.status!=='reserved'){await client.query('COMMIT');return null;}
    await client.query(\`UPDATE discount_redemptions SET status='used',used_at=now() WHERE id=$1\`,[r.id]);
    await client.query(\`UPDATE discount_codes SET uses_used=uses_used+1,updated_at=now() WHERE id=$1\`,[r.discount_code_id]);
    await client.query('COMMIT'); return r;
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
async function finaliseBookingDiscount(bookingId){
  const r=await markDiscountUsed('booking',bookingId); if(!r)return null;
  const q=await pool.query(\`SELECT booking_payment_amount,amount_total,balance_amount,discount_amount FROM bookings WHERE public_id=$1 LIMIT 1\`,[bookingId]);
  const b=q.rows[0]; if(!b||Number(b.discount_amount||0)>0)return r;
  const off=Number(r.discount_amount||0),current=Math.min(off,Number(b.booking_payment_amount||0)),future=Math.max(0,off-current);
  await pool.query(\`UPDATE bookings SET discount_code_id=$1,discount_amount=$2,original_amount_total=COALESCE(original_amount_total,amount_total),amount_total=GREATEST(0,amount_total-$2),balance_amount=GREATEST(0,COALESCE(balance_amount,0)-$3),balance_status=CASE WHEN GREATEST(0,COALESCE(balance_amount,0)-$3)<=0 THEN 'paid' ELSE balance_status END,updated_at=now() WHERE public_id=$4\`,[r.discount_code_id,off,future,bookingId]);
  return r;
}
async function finaliseShopDiscount(orderId){return markDiscountUsed('shop',orderId);}
`;
  s=s.slice(0,i)+h+s.slice(i);
}

fs.writeFileSync(path,s);
console.log('Applied discount database and helpers');
