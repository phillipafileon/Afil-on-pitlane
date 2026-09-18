const fs=require('fs');
const path='server_v3.js';
let s=fs.readFileSync(path,'utf8');
if(!s.includes("app.get('/api/admin/discount-codes'")){
 const m="app.get('/api/admin/gift-vouchers'";
 const i=s.indexOf(m);if(i<0)throw new Error('discount admin marker missing');
 const r=`app.get('/api/admin/discount-codes',admin,async(_req,res)=>{
 const {rows}=await pool.query(\`SELECT d.*,COALESCE((SELECT count(*)::int FROM discount_redemptions r WHERE r.discount_code_id=d.id AND r.status='reserved'),0) reserved_uses FROM discount_codes d ORDER BY active DESC,created_at DESC LIMIT 250\`);
 res.json({codes:rows});
});
app.post('/api/admin/discount-code',admin,async(req,res)=>{
 const b=req.body||{},code=normaliseDiscountCode(b.code||''),type=clean(b.discount_type,20),value=Number(b.discount_value),maxUses=b.max_uses==null||b.max_uses===''?null:Number(b.max_uses),starts=b.starts_at||null,expires=b.expires_at||null;
 if(!/^[A-Z0-9_-]{3,40}$/.test(code))return res.status(400).json({error:'invalid_code',detail:'Use 3–40 letters, numbers, hyphens or underscores.'});
 if(!['percent','fixed'].includes(type))return res.status(400).json({error:'invalid_discount_type'});
 if(type==='percent'&&(!Number.isFinite(value)||value<=0||value>100))return res.status(400).json({error:'invalid_percentage'});
 if(type==='fixed'&&(!Number.isInteger(value)||value<=0))return res.status(400).json({error:'invalid_fixed_amount'});
 if(maxUses!=null&&(!Number.isInteger(maxUses)||maxUses<1))return res.status(400).json({error:'invalid_max_uses'});
 if(starts&&expires&&new Date(expires)<=new Date(starts))return res.status(400).json({error:'invalid_time_window',detail:'End time must be after start time.'});
 const {rows}=await pool.query(\`INSERT INTO discount_codes(code,discount_type,discount_value,max_uses,starts_at,expires_at,active) VALUES($1,$2,$3,$4,$5,$6,true)
 ON CONFLICT(code) DO UPDATE SET discount_type=excluded.discount_type,discount_value=excluded.discount_value,max_uses=excluded.max_uses,starts_at=excluded.starts_at,expires_at=excluded.expires_at,active=true,updated_at=now() RETURNING *\`,[code,type,value,maxUses,starts,expires]);
 res.json({ok:true,code:rows[0]});
});
app.post('/api/admin/remove-discount-code',admin,async(req,res)=>{
 const code=normaliseDiscountCode(req.body?.code||'');
 const {rowCount}=await pool.query(\`UPDATE discount_codes SET active=false,updated_at=now() WHERE UPPER(code)=UPPER($1)\`,[code]);
 res.json({ok:true,removed:rowCount>0});
});
`;
 s=s.slice(0,i)+r+s.slice(i);
}
fs.writeFileSync(path,s);
console.log('Applied discount admin routes');
