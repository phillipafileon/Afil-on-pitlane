const token=process.env.PRINTFUL_API_TOKEN;
if(!token){console.log('PRINTFUL_STORE_PROBE token_missing');process.exit(0)}
const base='https://api.printful.com';
const auth={Authorization:`Bearer ${token}`};
async function jget(path,headers={}){const r=await fetch(base+path,{headers:{...auth,...headers}});let j={};try{j=await r.json()}catch{};if(!r.ok)throw new Error(`${path} ${r.status} ${j?.error?.message||j?.result||j?.error||''}`);return j}
(async()=>{
 try{
  let stores=[];try{const s=await jget('/stores');stores=s.result||[]}catch(e){console.log('PRINTFUL_STORE_PROBE stores_error',e.message)}
  const storeId=process.env.PRINTFUL_STORE_ID||stores[0]?.id||'';
  const sh=storeId?{'X-PF-Store-Id':String(storeId)}:{};
  const ids=[472343257,472342965];
  for(const id of ids){
   try{
    const d=await jget(`/store/products/${id}`,sh);
    const p=d.result?.sync_product||{};
    const vars=(d.result?.sync_variants||[]).map(v=>({id:v.id,external_id:v.external_id,variant_id:v.variant_id,name:v.name,retail_price:v.retail_price,currency:v.currency,is_ignored:v.is_ignored,files:(v.files||[]).map(f=>({type:f.type,filename:f.filename,visible:f.visible}))}));
    console.log('PRINTFUL_STORE_PROBE product',JSON.stringify({id:p.id,name:p.name,variants:p.variants,synced:p.synced,thumbnail:p.thumbnail_url,variants_detail:vars}));
   }catch(e){console.log('PRINTFUL_STORE_PROBE product_error',id,e.message)}
  }
 }catch(e){console.log('PRINTFUL_STORE_PROBE fatal',e.message)}
})();
