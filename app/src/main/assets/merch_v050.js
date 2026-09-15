(()=>{
const $=s=>document.querySelector(s);

const RANGE=[
  {name:'Embroidered T-Shirt',price:'£24.99',code:'01 / T-SHIRT',detail:'Sizes S • M • L • XL • 2XL',copy:'Black Afiléon Motorsport T-shirt with restrained embroidery.'},
  {name:'Embroidered Polo',price:'£39.99',code:'02 / POLO',detail:'Sizes S • M • L • XL • 2XL • 3XL • 4XL • 5XL',copy:'Black paddock/team polo with Afiléon Motorsport embroidery.'},
  {name:'Embroidered Hoodie',price:'£49.99',code:'03 / HOODIE',detail:'Sizes S • M • L • XL • 2XL • 3XL',copy:'Black Afiléon Motorsport hoodie with restrained embroidery.'},
  {name:'Afiléon Motorsport Beanie',price:'£25.42',code:'04 / BEANIE',detail:'One size • Black or White',copy:'Cuffed embroidered Afiléon Motorsport beanie.'},
  {name:'Afiléon Motorsport Snapback',price:'£26.00',code:'05 / SNAPBACK',detail:'One size • Dark Navy',copy:'Structured Afiléon Motorsport snapback with embroidered branding.'}
];

function updateHome(){
  const shopBtn=$('[data-go="shop"]');
  if(!shopBtn)return;
  const p=shopBtn.querySelector('.muted');
  if(p)p.textContent='T-shirts, polos, hoodies, beanies and snapbacks.';
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
    <div class="panel"><div class="eyebrow">AFILÉON MOTORSPORT TEAMWEAR</div><h2>Five-piece launch range</h2><p class="muted">The shop now reflects the products already synced to the Afiléon Motorsport Printful store.</p></div>
    <div class="lsShopGrid" style="margin-top:10px">${RANGE.map(x=>`<div class="lsProduct"><div class="eyebrow">${x.code}</div><h2>${x.name}</h2><p class="muted">${x.copy}</p><div class="lsPrice">${x.price}</div><div class="tiny" style="margin-top:10px">${x.detail}</div><span class="pill warn" style="margin-top:10px">COMING SOON</span></div>`).join('')}</div>
    <div class="panel" style="margin-top:10px"><p class="muted">Online ordering will open once the live fulfilment checkout is connected.</p><button class="btn alt wide" onclick="location.href='https://afileonmotorsport.co.uk/shop.html'">View the shop</button></div>`;
}

function run(){updateHome();previewShop();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
let queued=false;
new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;run()})}).observe(document.documentElement,{childList:true,subtree:true});
})();
