const fs=require('fs');
const path='server_v3.js';
let s=fs.readFileSync(path,'utf8');
if(!s.includes("app.post('/api/discount-codes/check'")){
 const m="app.get('/api/gift-vouchers/options'";
 const i=s.indexOf(m);if(i<0)throw new Error('discount marker missing');
 const r=`app.post('/api/discount-codes/check',async(req,res)=>{
 const code=normaliseDiscountCode(req.body?.code||''),amount=Math.max(0,Number(req.body?.amount||0));
 const d=await getDiscountCode(code,amount);
 if(!d)return res.status(404).json({valid:false,detail:'Promo code not recognised, not active, expired or fully used.'});
 const remaining=d.max_uses==null?null:Math.max(0,Number(d.max_uses)-Number(d.uses_used||0)-Number(d.reserved_uses||0));
 res.json({valid:true,code:d.code,discount_type:d.discount_type,discount_value:Number(d.discount_value),discount_amount:Number(d.preview_discount||0),uses_remaining:remaining,starts_at:d.starts_at,expires_at:d.expires_at});
});
`;
 s=s.slice(0,i)+r+s.slice(i);
}
fs.writeFileSync(path,s);
console.log('Applied discount check route');
