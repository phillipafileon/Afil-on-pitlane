(()=>{
const API='https://afileon-live-api-production.up.railway.app';
const $=s=>document.querySelector(s);
const money=p=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format((Number(p)||0)/100);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog=[],basket=[],delivery=499,checkoutLive=false,loading=false;

function updateHome(){
  const shopBtn=$('[data-go="shop"]');
  const p=shopBtn?.querySelector('.muted');
  if(p)p.textContent='T-shirts, polos, hoodies, beanies and snapbacks.';
}

function basketKey(slug,variant){return `${slug}::${variant}`}

function add(slug){
  const p=catalog.find(x=>x.slug===slug); if(!p)return;
  const sel=$(`[data-shop-variant="${CSS.escape(slug)}"]`);
  const variant=sel?.value||p.variants?.[0]?.id||'';
  if(!variant)return;
  const key=basketKey(slug,variant),row=basket.find(x=>x.key===key);
  if(row)row.quantity=Math.min(10,row.quantity+1);
  else basket.push({key,slug,variant_id:variant,quantity:1});
  renderBasket();
}

function changeQty(key,delta){
  const row=basket.find(x=>x.key===key); if(!row)return;
  row.quantity=Math.max(0,Math.min(10,row.quantity+delta));
  basket=basket.filter(x=>x.quantity>0);
  renderBasket();
}

function lineInfo(row){
  const p=catalog.find(x=>x.slug===row.slug);
  const v=p?.variants?.find(x=>x.id===row.variant_id);
  return {p,v};
}

function renderBasket(){
  const host=$('#aShopBasket'); if(!host)return;
  if(!basket.length){
    host.innerHTML='<div class="panel"><div class="eyebrow">BASKET</div><h2>Your basket is empty</h2><p class="muted">Choose a size or colour and add a product.</p></div>';
    return;
  }
  const subtotal=basket.reduce((sum,row)=>{const {p}=lineInfo(row);return sum+(p?.price||0)*row.quantity},0);
  host.innerHTML=`<div class="panel"><div class="eyebrow">BASKET</div><h2>Your order</h2>
    ${basket.map(row=>{const {p,v}=lineInfo(row);return `<div class="lsCartRow"><div><b>${esc(p?.name||row.slug)}</b><div class="tiny">${esc(v?.label||row.variant_id)} • ${money(p?.price||0)} each</div></div><div class="lsQty"><button class="btn ghost" data-minus="${esc(row.key)}">−</button><b>${row.quantity}</b><button class="btn ghost" data-plus="${esc(row.key)}">+</button></div><b>${money((p?.price||0)*row.quantity)}</b></div>`}).join('')}
    <div style="display:flex;justify-content:space-between;margin-top:12px"><span>Subtotal</span><b>${money(subtotal)}</b></div>
    <div style="display:flex;justify-content:space-between;margin-top:6px"><span>UK delivery</span><b>${money(delivery)}</b></div>
    <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:20px"><span>Total before applicable tax</span><b>${money(subtotal+delivery)}</b></div>
    <button id="aShopCheckout" class="btn wide" style="margin-top:12px">${checkoutLive?'Secure checkout':'Checkout setup complete — live payments pending'}</button>
    <div id="aShopStatus" class="status" style="display:none;margin-top:10px"></div>
    <p class="tiny" style="margin-top:10px">Shipping address, phone and payment details are collected securely at Stripe Checkout. Orders are made to order and fulfilled by Printful.</p>
  </div>`;
  host.querySelectorAll('[data-minus]').forEach(b=>b.onclick=()=>changeQty(b.dataset.minus,-1));
  host.querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>changeQty(b.dataset.plus,1));
  $('#aShopCheckout').onclick=checkout;
}

function showStatus(msg,state='warn'){
  const e=$('#aShopStatus'); if(!e)return;
  e.style.display='block';e.className=`status ${state}`;e.textContent=msg;
}

async function checkout(){
  if(loading||!basket.length)return;
  loading=true;
  showStatus(checkoutLive?'Preparing secure checkout…':'Checking payment readiness…');
  try{
    const r=await fetch(`${API}/api/shop/checkout`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:basket.map(x=>({slug:x.slug,variant_id:x.variant_id,quantity:x.quantity}))})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.checkout_url){showStatus(j.detail||j.error||'Checkout is not available yet.','bad');return}
    location.href=j.checkout_url;
  }catch{showStatus('Could not reach the shop service. Please try again.','bad')}
  finally{loading=false}
}

function renderShop(){
  const shop=$('#shop'); if(!shop)return;
  shop.dataset.merchV050='1';
  if(!catalog.length){
    shop.innerHTML='<h1>Afiléon Shop</h1><div class="panel"><div class="eyebrow">AFILÉON MOTORSPORT</div><h2>Loading teamwear…</h2></div>';
    return;
  }
  shop.innerHTML=`<h1>Afiléon Shop</h1>
    <div class="panel"><div class="eyebrow">AFILÉON MOTORSPORT TEAMWEAR</div><h2>Made-to-order embroidered merchandise</h2><p class="muted">Choose your size or colour below. UK delivery is ${money(delivery)} per order.</p></div>
    <div class="lsShopGrid" style="margin-top:10px">${catalog.map(p=>`<div class="lsProduct">
      ${p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.name)}">`:''}
      <div class="eyebrow">PRINTFUL FULFILMENT</div><h2>${esc(p.name)}</h2><p class="muted">${esc(p.description||'')}</p>
      <div class="lsPrice">${money(p.price)}</div>
      <label style="display:block;margin-top:10px">${p.variants?.length>1?'Size / colour':'Option'}<select data-shop-variant="${esc(p.slug)}">${(p.variants||[]).map(v=>`<option value="${esc(v.id)}">${esc(v.label)}</option>`).join('')}</select></label>
      <button class="btn wide" data-shop-add="${esc(p.slug)}" style="margin-top:10px">Add to basket</button>
    </div>`).join('')}</div>
    <div id="aShopBasket" style="margin-top:10px"></div>`;
  shop.querySelectorAll('[data-shop-add]').forEach(b=>b.onclick=()=>add(b.dataset.shopAdd));
  renderBasket();
}

async function load(){
  updateHome();
  const shop=$('#shop'); if(shop)shop.dataset.merchV050='1';
  try{
    const r=await fetch(`${API}/api/shop/products?t=${Date.now()}`,{cache:'no-store'});
    const j=await r.json();
    if(r.ok){catalog=j.products||[];delivery=Number(j.delivery_price||499);checkoutLive=!!j.checkout_live}
  }catch{}
  renderShop();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load);else load();
})();
