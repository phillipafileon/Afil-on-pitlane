(()=>{
const $=s=>document.querySelector(s);

const RANGE=[
  {name:'Embroidered T-Shirt',price:'£24.99',code:'01 / T-SHIRT',sizes:'XS–4XL',copy:'Black T-shirt with restrained left-chest Afiléon Motorsport embroidery.'},
  {name:'Embroidered Polo',price:'£39.99',code:'02 / POLO',sizes:'XS–4XL',copy:'Black paddock/team polo with left-chest embroidery.'},
  {name:'Embroidered Hoodie',price:'£49.99',code:'03 / HOODIE',sizes:'XS–4XL',copy:'Black mid/heavyweight hoodie with a small embroidered chest mark.'}
];

function updateHome(){
  const shopBtn=$('[data-go="shop"]');
  if(!shopBtn)return;
  const p=shopBtn.querySelector('.muted');
  if(p)p.textContent='Embroidered T-shirts, polos and hoodies in XS–4XL.';
}

function previewShop(){
  const shop=$('#shop');
  if(!shop||shop.dataset.merchV050==='1')return;
  if(shop.querySelector('[data-add]'))return;
  const text=shop.textContent||'';
  if(!/No products are live yet|COMING SOON|merchandise/i.test(text))return;
  shop.dataset.merchV050='1';
  shop.innerHTML=`
    <h1>Afiléon Shop</h1>
    <div class="panel"><div class="eyebrow">EMBROIDERED TEAMWEAR</div><h2>Afiléon Motorsport clothing</h2><p class="muted">Black garments with restrained embroidery. Standard launch sizing will run from XS through 4XL across the range.</p></div>
    <div class="lsShopGrid" style="margin-top:10px">${RANGE.map(x=>`<div class="lsProduct"><div class="eyebrow">${x.code}</div><h2>${x.name}</h2><p class="muted">${x.copy}</p><div class="lsPrice">${x.price}</div><div class="pill" style="margin-top:8px">SIZES ${x.sizes}</div><span class="pill warn" style="margin-top:8px">COMING SOON</span></div>`).join('')}</div>
    <div class="panel" style="margin-top:10px"><p class="muted">Orders will open once the fulfilment account, exact garment variants and sample approval are complete.</p><button class="btn alt wide" onclick="location.href='https://afileonmotorsport.co.uk/shop.html'">View the shop</button></div>`;
}

function run(){updateHome();previewShop();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
let queued=false;
new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;run()})}).observe(document.documentElement,{childList:true,subtree:true});
})();
