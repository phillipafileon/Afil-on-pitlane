const token=process.env.PRINTFUL_API_TOKEN;
if(!token){console.log('PRINTFUL_PROBE token_missing');process.exit(0)}
const base='https://api.printful.com';
const auth={Authorization:`Bearer ${token}`};
async function jget(path,headers={}){const r=await fetch(base+path,{headers:{...auth,...headers}});let j={};try{j=await r.json()}catch{};if(!r.ok)throw new Error(`${path} ${r.status} ${j?.error?.message||j?.result||j?.error||''}`);return j}
const sizesWanted=new Set(['XS','S','M','L','XL','2XL','3XL','4XL']);
(async()=>{
 try{
  const scopes=await jget('/oauth/scopes');
  console.log('PRINTFUL_PROBE scopes',JSON.stringify((scopes.result?.scopes||[]).map(x=>x.scope||x)));
  let stores=[];try{const s=await jget('/stores');stores=s.result||[];console.log('PRINTFUL_PROBE stores',JSON.stringify(stores.map(x=>({id:x.id,name:x.name,type:x.type}))))}catch(e){console.log('PRINTFUL_PROBE stores_error',e.message)}
  const storeId=process.env.PRINTFUL_STORE_ID||stores[0]?.id||'';
  const sh=storeId?{'X-PF-Store-Id':String(storeId)}:{};
  try{const sp=await jget('/store/products?limit=100',sh);console.log('PRINTFUL_PROBE sync_products',JSON.stringify((sp.result||[]).map(x=>({id:x.id,name:x.name,variants:x.variants,synced:x.synced}))))}catch(e){console.log('PRINTFUL_PROBE sync_products_error',e.message)}
  const cat=await jget('/products');
  const products=Array.isArray(cat.result)?cat.result:[];
  const targets=[
   {key:'tshirt',match:/64000/i,label:'Gildan 64000'},
   {key:'hoodie',match:/M2580/i,label:'Cotton Heritage M2580'}
  ];
  for(const t of targets){
   const candidates=products.filter(p=>t.match.test(String(p.model||p.title||p.name||''))||t.match.test(JSON.stringify(p)));
   console.log(`PRINTFUL_PROBE ${t.key}_candidates`,JSON.stringify(candidates.map(p=>({id:p.id,type:p.type,model:p.model,title:p.title,name:p.name,variant_count:p.variant_count}))));
   for(const p of candidates.slice(0,5)){
    try{
     const d=await jget(`/products/${p.id}`);
     const prod=d.result?.product||{};
     const vars=(d.result?.variants||[]).filter(v=>String(v.color||'').toLowerCase()==='black'&&sizesWanted.has(String(v.size||'').toUpperCase())).map(v=>({id:v.id,name:v.name,size:v.size,color:v.color,price:v.price,in_stock:v.in_stock,availability_regions:v.availability_regions,availability_status:v.availability_status,is_discontinued:v.is_discontinued}));
     console.log(`PRINTFUL_PROBE ${t.key}_product`,JSON.stringify({id:prod.id,type:prod.type,model:prod.model,title:prod.title,name:prod.name,techniques:prod.techniques,files:prod.files?.map(f=>f.type)}));
     console.log(`PRINTFUL_PROBE ${t.key}_black_variants`,JSON.stringify(vars));
    }catch(e){console.log(`PRINTFUL_PROBE ${t.key}_product_error`,e.message)}
   }
  }
 }catch(e){console.log('PRINTFUL_PROBE fatal',e.message)}
})();
