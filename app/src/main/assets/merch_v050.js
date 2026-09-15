(()=>{
const API='https://afileon-live-api-production.up.railway.app';
const $=s=>document.querySelector(s);
const money=p=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format((Number(p)||0)/100);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const BASKET_KEY='afileon_shop_basket_v1';
const ORDER_KEY='afileon_shop_recent_order_v1';
let catalog=[],basket=[],delivery=499,checkoutLive=false,loading=false,recentOrder='',recentOrderData=null,orderPoll=null;

function loadLocal(){
  try{basket=JSON.parse(localStorage.getItem(BASKET_KEY)||'[]');if(!Array.isArray(basket))basket=[]}catch{basket=[]}
  recentOrder=localStorage.getItem(ORDER_KEY)||'';
}
function saveBasket(){try{localStorage.setItem(BASKET_KEY,JSON.stringify(basket))}catch{}}
function saveOrder(id){recentOrder=id||'';try{if(recentOrder)localStorage.setItem(ORDER_KEY,recentOrder);else localStorage.removeItem(ORDER_KEY)}catch{}}
function updateHome(){const shopBtn=$('[data-go="shop"]');const p=shopBtn?.querySelector('.muted');if(p)p.textContent='T-shirts, polos, hoodies, beanies and snapbacks.'}
function basketKey(slug,variant){return `${slug}::${variant}`}
function lineInfo(row){const p=catalog.find(x=>x.slug===row.slug);const v=p?.variants?.find(x=>x.id===row.variant_id);return {p,v}}
function add(slug){const p=catalog.find(x=>x.slug===slug);if(!p)return;const sel=$(`[data-shop-variant="${CSS.escape(slug)}"]`);const variant=sel?.value||p.variants?.[0]?.id||'';if(!variant)return;const key=basketKey(slug,variant),row=basket.find(x=>x.key===key);if(row)row.quantity=Math.min(10,row.quantity+1);else basket.push({key,slug,variant_id:variant,quantity:1});saveBasket();renderBasket()}
function changeQty(key,delta){const row=basket.find(x=>x.key===key);if(!row)return;row.quantity=Math.max(0,Math.min(10,row.quantity+delta));basket=basket.filter(x=>x.quantity>0);saveBasket();renderBasket()}
function showStatus(msg,state='warn'){const e=$('#aShopStatus');if(!e)return;e.style.display='block';e.className=`status ${state}`;e.textContent=msg}

function customerOrderState(o){
  const s=String(o?.status||'pending');
  const map={
    pending:['Payment pending','Complete payment in the secure checkout window.','warn'],
    paid:['Payment received','Your order has been received and is being prepared.','ok'],
    shipped:['Dispatched','Your order has been dispatched.','ok'],
    returned:['Returned','The shipment has been returned. Please contact Afiléon Motorsport if you need help.','warn'],
    partially_refunded:['Partially refunded','A partial refund has been processed. Bank or card-provider processing times can vary.','warn'],
    refunded:['Refunded','Your refund has been processed. Bank or card-provider processing times can vary.','ok'],
    cancelled:['Cancelled','This order has been cancelled.','warn'],
    fulfilment_attention:['Order needs attention','We need to review this order before it can continue.','warn'],
    fulfilment_failed:['Order needs attention','We need to review this order before it can continue.','warn'],
    failed:['Checkout not completed','The order was not completed. You can try again from the shop.','bad'],
    expired:['Checkout expired','The checkout session expired before payment.','warn']
  };
  return map[s]||['Order update',s.replaceAll('_',' '),'warn'];
}
function fulfilmentCopy(s){
  const map={awaiting_payment:'Awaiting payment',draft:'Order received',pending:'Being prepared',inreview:'Being reviewed',inprocess:'Being prepared',shipped:'Dispatched',returned:'Returned',failed:'Needs attention',cancelled:'Cancelled'};
  return map[String(s||'')]||'';
}
function renderRecentOrder(){
  const host=$('#aRecentOrder');if(!host)return;
  if(!recentOrder){host.innerHTML='';host.style.display='none';return}
  host.style.display='block';
  if(!recentOrderData){host.innerHTML=`<div class="panel"><div class="eyebrow">RECENT ORDER</div><h2>Checking order…</h2><p class="tiny">${esc(recentOrder)}</p></div>`;return}
  const [title,detail,state]=customerOrderState(recentOrderData);
  const f=fulfilmentCopy(recentOrderData.fulfilment_status);
  const refund=Number(recentOrderData.amount_refunded||0);
  host.innerHTML=`<div class="panel"><div class="eyebrow">RECENT ORDER</div><h2>${esc(title)}</h2><div class="status ${esc(state)}">${esc(detail)}</div><p class="tiny">Order ${esc(recentOrder)}</p>${f?`<p class="tiny">Order progress: ${esc(f)}</p>`:''}${refund>0?`<p><b>Refunded: ${money(refund)}</b></p>`:''}${recentOrderData.tracking_url?`<button class="btn alt wide" id="aTrackOrder">Track shipment</button>`:''}<button class="btn ghost wide" id="aRefreshOrder" style="margin-top:8px">Refresh order status</button></div>`;
  const track=$('#aTrackOrder');if(track)track.onclick=()=>{location.href=recentOrderData.tracking_url};
  const refresh=$('#aRefreshOrder');if(refresh)refresh.onclick=()=>refreshRecentOrder(true);
}
async function refreshRecentOrder(force=false){
  if(!recentOrder)return;
  try{
    const r=await fetch(`${API}/api/shop/orders/${encodeURIComponent(recentOrder)}?t=${Date.now()}`,{cache:'no-store'});
    const j=await r.json().catch(()=>({}));
    if(r.status===404){if(force){saveOrder('');recentOrderData=null;renderRecentOrder()}return}
    if(!r.ok)return;
    recentOrderData=j;
    if(['paid','shipped','returned','partially_refunded','refunded','cancelled'].includes(j.status)){
      basket=[];saveBasket();renderBasket();
    }
    renderRecentOrder();
  }catch{}
}
function startOrderPolling(){if(orderPoll)clearInterval(orderPoll);orderPoll=setInterval(()=>{if(!document.hidden&&recentOrder)refreshRecentOrder(false)},5000)}

function renderBasket(){
  const host=$('#aShopBasket');if(!host)return;
  basket=basket.filter(row=>catalog.some(p=>p.slug===row.slug&&p.variants?.some(v=>v.id===row.variant_id)));saveBasket();
  if(!basket.length){host.innerHTML='<div class="panel"><div class="eyebrow">BASKET</div><h2>Your basket is empty</h2><p class="muted">Choose a size or colour and add a product.</p></div>';return}
  const subtotal=basket.reduce((sum,row)=>{const {p}=lineInfo(row);return sum+(p?.price||0)*row.quantity},0);
  host.innerHTML=`<div class="panel"><div class="eyebrow">BASKET</div><h2>Your order</h2>${basket.map(row=>{const {p,v}=lineInfo(row);return `<div class="lsCartRow"><div><b>${esc(p?.name||row.slug)}</b><div class="tiny">${esc(v?.label||row.variant_id)} • ${money(p?.price||0)} each</div></div><div class="lsQty"><button class="btn ghost" data-minus="${esc(row.key)}">−</button><b>${row.quantity}</b><button class="btn ghost" data-plus="${esc(row.key)}">+</button></div><b>${money((p?.price||0)*row.quantity)}</b></div>`}).join('')}<div style="display:flex;justify-content:space-between;margin-top:12px"><span>Subtotal</span><b>${money(subtotal)}</b></div><div style="display:flex;justify-content:space-between;margin-top:6px"><span>UK delivery</span><b>${money(delivery)}</b></div><div style="display:flex;justify-content:space-between;margin-top:8px;font-size:20px"><span>Total before applicable tax</span><b>${money(subtotal+delivery)}</b></div><button id="aShopCheckout" class="btn wide" style="margin-top:12px" ${checkoutLive?'':'disabled'}>${checkoutLive?'Secure checkout':'Checkout temporarily unavailable'}</button><div id="aShopStatus" class="status" style="display:none;margin-top:10px"></div><p class="tiny" style="margin-top:10px">Shipping address, phone and payment details are collected securely at checkout. Made-to-order teamwear is covered by the Afiléon Motorsport shop terms and your statutory rights.</p></div>`;
  host.querySelectorAll('[data-minus]').forEach(b=>b.onclick=()=>changeQty(b.dataset.minus,-1));
  host.querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>changeQty(b.dataset.plus,1));
  const c=$('#aShopCheckout');if(c)c.onclick=checkout;
}

async function checkout(){
  if(loading||!basket.length)return;
  if(!checkoutLive){showStatus('Online checkout is temporarily unavailable. Please try again later.','warn');return}
  loading=true;showStatus('Preparing secure checkout…');
  try{
    const r=await fetch(`${API}/api/shop/checkout`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:basket.map(x=>({slug:x.slug,variant_id:x.variant_id,quantity:x.quantity}))})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.checkout_url){showStatus(j.detail||'Checkout is temporarily unavailable. Please try again.','bad');return}
    if(j.order_id){saveOrder(j.order_id);recentOrderData={status:'pending'};renderRecentOrder()}
    location.href=j.checkout_url;
  }catch{showStatus('Could not reach the checkout service. Please try again.','bad')}
  finally{loading=false}
}

function renderShop(){
  const shop=$('#shop');if(!shop)return;shop.dataset.merchV050='1';
  if(!catalog.length){shop.innerHTML='<h1>Afiléon Shop</h1><div class="panel"><div class="eyebrow">AFILÉON MOTORSPORT</div><h2>Loading teamwear…</h2></div>';return}
  shop.innerHTML=`<h1>Afiléon Shop</h1><div id="aRecentOrder" style="display:none;margin-bottom:10px"></div><div class="panel"><div class="eyebrow">AFILÉON MOTORSPORT TEAMWEAR</div><h2>Made-to-order embroidered merchandise</h2><p class="muted">Choose your size or colour below. UK delivery is ${money(delivery)} per order.</p></div><div class="lsShopGrid" style="margin-top:10px">${catalog.map(p=>`<div class="lsProduct">${p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.name)}">`:''}<div class="eyebrow">AFILÉON MOTORSPORT</div><h2>${esc(p.name)}</h2><p class="muted">${esc(p.description||'')}</p><div class="lsPrice">${money(p.price)}</div><label style="display:block;margin-top:10px">${p.variants?.length>1?'Size / colour':'Option'}<select data-shop-variant="${esc(p.slug)}">${(p.variants||[]).map(v=>`<option value="${esc(v.id)}">${esc(v.label)}</option>`).join('')}</select></label><button class="btn wide" data-shop-add="${esc(p.slug)}" style="margin-top:10px">Add to basket</button></div>`).join('')}</div><div id="aShopBasket" style="margin-top:10px"></div>`;
  shop.querySelectorAll('[data-shop-add]').forEach(b=>b.onclick=()=>add(b.dataset.shopAdd));renderBasket();renderRecentOrder();
}

async function load(){loadLocal();updateHome();const shop=$('#shop');if(shop)shop.dataset.merchV050='1';try{const r=await fetch(`${API}/api/shop/products?t=${Date.now()}`,{cache:'no-store'});const j=await r.json();if(r.ok){catalog=j.products||[];delivery=Number(j.delivery_price||499);checkoutLive=!!j.checkout_live}}catch{}renderShop();refreshRecentOrder(false);startOrderPolling()}
window.addEventListener('focus',()=>refreshRecentOrder(false));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshRecentOrder(false)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load);else load();
})();
