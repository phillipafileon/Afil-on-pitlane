const fs=require('fs');
const path='server_v3.js';
let s=fs.readFileSync(path,'utf8');

function replaceRange(startMarker,endMarker,replacement,label){
  const a=s.indexOf(startMarker),b=s.indexOf(endMarker,a);
  if(a<0||b<0)throw new Error('scope patch missing '+label);
  s=s.slice(0,a)+replacement+s.slice(b);
}

if(!s.includes('ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS scope JSONB')){
  const m='    CREATE TABLE IF NOT EXISTS seasonal_campaigns(';
  if(!s.includes(m))throw new Error('scope migration marker missing');
  s=s.replace(m,"    ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS scope JSONB NOT NULL DEFAULT '{\"services\":[\"*\"],\"products\":[\"*\"]}'::jsonb;\n\n"+m);
}

if(!s.includes('function discountScope(row)')){
  const m="app.post('/api/discount-codes/check'";
  const i=s.indexOf(m); if(i<0)throw new Error('scope helper marker missing');
  const h=[
    "function discountScope(row){",
    "  let raw=row?.scope;",
    "  if(typeof raw==='string'){try{raw=JSON.parse(raw)}catch{raw=null}}",
    "  const services=Array.isArray(raw?.services)?raw.services.map(x=>String(x)):['*'];",
    "  const products=Array.isArray(raw?.products)?raw.products.map(x=>String(x)):['*'];",
    "  return {services,products};",
    "}",
    "function discountScopeAllowsService(row,serviceId){const x=discountScope(row).services;return x.includes('*')||x.includes(String(serviceId||''));}",
    "function discountScopeAllowsProduct(row,slug){const x=discountScope(row).products;return x.includes('*')||x.includes(String(slug||''));}",
    "function discountEligibleShopAmount(row,items){return (items||[]).reduce((n,x)=>n+(discountScopeAllowsProduct(row,x.slug)?Number(x.unit_price||0)*Number(x.quantity||1):0),0);}",
    "let shopEconomicsCache={at:0,data:null};",
    "async function loadShopEconomics(){",
    "  if(shopEconomicsCache.data&&Date.now()-shopEconomicsCache.at<10*60*1000)return shopEconomicsCache.data;",
    "  const out=[];",
    "  for(const p of SHOP_CATALOG){",
    "    const costs=[]; const errors=[];",
    "    for(const v of (p.variants||[])){",
    "      try{",
    "        const sv=await printfulRequest('GET','/store/variants/'+encodeURIComponent(v.sync_variant_id));",
    "        const catalogVariantId=Number(sv?.result?.variant_id||0);",
    "        if(!catalogVariantId)throw new Error('catalog_variant_missing');",
    "        const pj=await printfulRequest('GET','/v2/catalog-variants/'+catalogVariantId+'/prices?currency=GBP&selling_region_name=worldwide');",
    "        const techniques=pj?.data?.variant?.techniques||[];",
    "        const t=techniques.find(x=>x.technique_key==='embroidery')||techniques[0];",
    "        const val=Number(t?.discounted_price??t?.price);",
    "        if(Number.isFinite(val)&&val>0)costs.push(Math.round(val*100)); else errors.push(v.id+':cost_unavailable');",
    "      }catch(e){errors.push(v.id+':'+String(e?.message||'lookup_failed').slice(0,90));}",
    "    }",
    "    const minCost=costs.length?Math.min(...costs):null,maxCost=costs.length?Math.max(...costs):null;",
    "    const gross=maxCost==null?null:Number(p.price)-maxCost;",
    "    const margin=maxCost==null||!p.price?null:(gross/Number(p.price))*100;",
    "    out.push({slug:p.slug,name:p.name,price:Number(p.price),estimated_cost_min:minCost,estimated_cost_max:maxCost,gross_profit_conservative:gross,margin_percent_conservative:margin,variants_checked:costs.length,lookup_errors:errors.slice(0,4)});",
    "  }",
    "  shopEconomicsCache={at:Date.now(),data:out}; return out;",
    "}",
    ""
  ].join('\n');
  s=s.slice(0,i)+h+s.slice(i);
}

const publicRoute=[
"app.post('/api/discount-codes/check',async(req,res)=>{",
"  const code=normaliseDiscountCode(req.body?.code||''),amount=Math.max(0,Number(req.body?.amount||0));",
"  const d=await getDiscountCode(code,amount);",
"  if(!d)return res.status(404).json({valid:false,detail:'Promo code not recognised, not active, expired or fully used.'});",
"  let eligibleAmount=amount;",
"  if(req.body?.service_id){if(!discountScopeAllowsService(d,req.body.service_id))return res.status(404).json({valid:false,detail:'This promo code does not apply to that service.'});}",
"  if(Array.isArray(req.body?.items)){",
"    let items; try{items=normaliseShopItems(req.body.items)}catch{return res.status(400).json({valid:false,detail:'Unable to check this basket.'})}",
"    eligibleAmount=discountEligibleShopAmount(d,items);",
"    if(eligibleAmount<=0)return res.status(404).json({valid:false,detail:'This promo code does not apply to the items in your basket.'});",
"  }",
"  const discountAmount=discountAmountFor(d,eligibleAmount);",
"  const remaining=d.max_uses==null?null:Math.max(0,Number(d.max_uses)-Number(d.uses_used||0)-Number(d.reserved_uses||0));",
"  res.json({valid:true,code:d.code,discount_type:d.discount_type,discount_value:Number(d.discount_value),discount_amount:discountAmount,eligible_amount:eligibleAmount,uses_remaining:remaining,starts_at:d.starts_at,expires_at:d.expires_at,scope:discountScope(d)});",
"});",
""
].join('\n');
replaceRange("app.post('/api/discount-codes/check'","app.get('/api/gift-vouchers/options'",publicRoute,'public discount route');

const adminRoutes=[
"app.get('/api/admin/discount-codes',admin,async(_req,res)=>{",
"  const {rows}=await pool.query(`SELECT d.*,COALESCE((SELECT count(*)::int FROM discount_redemptions r WHERE r.discount_code_id=d.id AND r.status='reserved'),0) reserved_uses FROM discount_codes d ORDER BY active DESC,created_at DESC LIMIT 250`);",
"  res.json({codes:rows.map(x=>({...x,scope:discountScope(x)}))});",
"});",
"app.get('/api/admin/shop-economics',admin,async(_req,res)=>{",
"  try{const products=await loadShopEconomics();res.json({products,method:'Printful catalog embroidery cost estimate',note:'Gross merchandise margin estimate before Stripe fees, VAT/tax, delivery, returns and other business costs.'});}",
"  catch(e){console.error('Shop economics',e);res.status(503).json({error:'shop_economics_unavailable',detail:'Printful cost data is temporarily unavailable.'});}",
"});",
"app.post('/api/admin/discount-code',admin,async(req,res)=>{",
"  const b=req.body||{},code=normaliseDiscountCode(b.code||''),type=clean(b.discount_type,20),value=Number(b.discount_value),maxUses=b.max_uses==null||b.max_uses===''?null:Number(b.max_uses),starts=b.starts_at||null,expires=b.expires_at||null;",
"  if(!/^[A-Z0-9_-]{3,40}$/.test(code))return res.status(400).json({error:'invalid_code',detail:'Use 3–40 letters, numbers, hyphens or underscores.'});",
"  if(!['percent','fixed'].includes(type))return res.status(400).json({error:'invalid_discount_type'});",
"  if(type==='percent'&&(!Number.isFinite(value)||value<=0||value>100))return res.status(400).json({error:'invalid_percentage'});",
"  if(type==='fixed'&&(!Number.isInteger(value)||value<=0))return res.status(400).json({error:'invalid_fixed_amount'});",
"  if(maxUses!=null&&(!Number.isInteger(maxUses)||maxUses<1))return res.status(400).json({error:'invalid_max_uses'});",
"  if(starts&&expires&&new Date(expires)<=new Date(starts))return res.status(400).json({error:'invalid_time_window',detail:'End time must be after start time.'});",
"  const allowedServices=new Set(['*',...SERVICES.map(x=>x.id)]),allowedProducts=new Set(['*',...SHOP_CATALOG.map(x=>x.slug)]);",
"  const rawServices=Array.isArray(b.scope?.services)?b.scope.services:['*'],rawProducts=Array.isArray(b.scope?.products)?b.scope.products:['*'];",
"  const services=[...new Set(rawServices.map(String).filter(x=>allowedServices.has(x)))],products=[...new Set(rawProducts.map(String).filter(x=>allowedProducts.has(x)))];",
"  if(!services.length&&!products.length)return res.status(400).json({error:'empty_scope',detail:'Choose at least one service or shop item for this code.'});",
"  const scope={services,products};",
"  const {rows}=await pool.query(`INSERT INTO discount_codes(code,discount_type,discount_value,max_uses,starts_at,expires_at,active,scope) VALUES($1,$2,$3,$4,$5,$6,true,$7::jsonb) ON CONFLICT(code) DO UPDATE SET discount_type=excluded.discount_type,discount_value=excluded.discount_value,max_uses=excluded.max_uses,starts_at=excluded.starts_at,expires_at=excluded.expires_at,active=true,scope=excluded.scope,updated_at=now() RETURNING *`,[code,type,value,maxUses,starts,expires,JSON.stringify(scope)]);",
"  res.json({ok:true,code:{...rows[0],scope}});",
"});",
"app.post('/api/admin/remove-discount-code',admin,async(req,res)=>{",
"  const code=normaliseDiscountCode(req.body?.code||'');",
"  const {rowCount}=await pool.query(`UPDATE discount_codes SET active=false,updated_at=now() WHERE UPPER(code)=UPPER($1)`,[code]);",
"  res.json({ok:true,removed:rowCount>0});",
"});",
""
].join('\n');
replaceRange("app.get('/api/admin/discount-codes'","app.get('/api/admin/gift-vouchers'",adminRoutes,'admin discount routes');

const bookingOld="  if(discount_code){\n    discount=await reserveDiscountCode(discount_code,'booking',b.public_id,Number(b.amount_total||0));\n    if(!discount)return res.status(400).json({error:'discount_code_invalid',detail:'Promo code not recognised, not active, expired or fully used.'});\n    discountTotal=Number(discount.discount_amount||0);";
const bookingNew="  if(discount_code){\n    const candidate=await getDiscountCode(discount_code,Number(b.amount_total||0));\n    if(!candidate||!discountScopeAllowsService(candidate,b.service_id))return res.status(400).json({error:'discount_code_invalid',detail:'This promo code does not apply to this service, is expired or has been fully used.'});\n    discount=await reserveDiscountCode(discount_code,'booking',b.public_id,Number(b.amount_total||0));\n    if(!discount)return res.status(400).json({error:'discount_code_invalid',detail:'Promo code not recognised, not active, expired or fully used.'});\n    discountTotal=Number(discount.discount_amount||0);";
if(!s.includes(bookingNew)){if(!s.includes(bookingOld))throw new Error('booking scope marker missing');s=s.replace(bookingOld,bookingNew);}

const shopOld="  if(discountCode){\n    discount=await reserveDiscountCode(discountCode,'shop',id,originalTotal);\n    if(!discount)return res.status(400).json({error:'discount_code_invalid',detail:'Promo code not recognised, not active, expired or fully used.'});\n    discountAmount=Number(discount.discount_amount||0);";
const shopNew="  if(discountCode){\n    const candidate=await getDiscountCode(discountCode,originalTotal);\n    const eligibleTotal=candidate?discountEligibleShopAmount(candidate,items):0;\n    if(!candidate||eligibleTotal<=0)return res.status(400).json({error:'discount_code_invalid',detail:'This promo code does not apply to the items in your basket, is expired or has been fully used.'});\n    discount=await reserveDiscountCode(discountCode,'shop',id,eligibleTotal);\n    if(!discount)return res.status(400).json({error:'discount_code_invalid',detail:'Promo code not recognised, not active, expired or fully used.'});\n    discountAmount=Number(discount.discount_amount||0);";
if(!s.includes(shopNew)){if(!s.includes(shopOld))throw new Error('shop scope marker missing');s=s.replace(shopOld,shopNew);}

fs.writeFileSync(path,s);
console.log('Applied discount scope and shop margin admin patch');
