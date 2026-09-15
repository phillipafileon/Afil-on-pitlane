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
  const ids=[472343236,472343634,472342455];
  for(const id of ids){
   try{
    const d=await jget(`/store/products/${id}`,sh);
    const p=d.result?.sync_product||{};
    const vars=[];
    for(const v of (d.result?.sync_variants||[])){
      let cat=null;
      if(v.variant_id){
        try{
          const c=await jget(`/products/variant/${v.variant_id}`);
          const cv=c.result?.variant||c.result||{};
          cat={id:cv.id,name:cv.name,size:cv.size,color:cv.color,price:cv.price,in_stock:cv.in_stock,availability_regions:cv.availability_regions,availability_status:cv.availability_status,is_discontinued:cv.is_discontinued};
        }catch(e){cat={error:e.message}}
      }
      vars.push({sync_id:v.id,variant_id:v.variant_id,name:v.name,retail_price:v.retail_price,currency:v.currency,is_ignored:v.is_ignored,files:(v.files||[]).map(f=>({type:f.type,filename:f.filename,visible:f.visible})),catalog:cat});
    }
    console.log('PRINTFUL_STORE_PROBE product',JSON.stringify({id:p.id,name:p.name,variants:p.variants,synced:p.synced,thumbnail:p.thumbnail_url,variants_detail:vars}));
   }catch(e){console.log('PRINTFUL_STORE_PROBE product_error',id,e.message)}
  }
 }catch(e){console.log('PRINTFUL_STORE_PROBE fatal',e.message)}
})();
