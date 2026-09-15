(()=>{
const $=s=>document.querySelector(s);

const RANGE=[
  {name:'Embroidered T-Shirt',price:'£24.99',code:'01 / T-SHIRT',copy:'Black T-shirt with a restrained left-chest Afiléon Motorsport embroidery. Clean everyday teamwear rather than a large printed graphic.'},
  {name:'Embroidered Polo',price:'£39.99',code:'02 / POLO',copy:'Black paddock/team polo with left-chest embroidery. The smarter option for events, support days and teamwear.'},
  {name:'Embroidered Hoodie',price:'£49.99',code:'03 / HOODIE',copy:'Black mid/heavyweight hoodie with a small embroidered chest mark. The premium piece in the first Afiléon clothing range.'}
];

function updateHome(){
  const shopBtn=$('[data-go="shop"]');
  if(!shopBtn)return;
  const p=shopBtn.querySelector('.muted');
  if(p)p.textContent='Embroidered T-shirts, polos and hoodies — first range selected.';
}

function previewShop(){
  const shop=$('#shop');
  if(!shop||shop.dataset.merchV050==='1')return;
  const hasLive=!!shop.querySelector('[data-add]');
  if(hasLive)return;
  const text=shop.textContent||'';
  if(!/No products are live yet|COMING SOON|merchandise/i.test(text))return;
  shop.dataset.merchV050='1';
  shop.innerHTML=`
    <h1>Afiléon Shop</h1>
    <div class="panel"><div class="eyebrow">EMBROIDERED // MADE TO ORDER</div><h2>First Afiléon clothing range</h2><p class="muted">We have deliberately moved away from a printed launch range. The first three garments are embroidery-first, black and restrained, with UK made-to-order fulfilment planned.</p></div>
    <div class="lsShopGrid" style="margin-top:10px">${RANGE.map(x=>`<div class="lsProduct"><div class="eyebrow">${x.code}</div><h2>${x.name}</h2><p class="muted">${x.copy}</p><div class="lsPrice">${x.price}</div><span class="pill warn">SAMPLE APPROVAL NEXT</span></div>`).join('')}</div>
    <div class="panel" style="margin-top:10px"><div class="eyebrow">ORDERING STATUS</div><p class="muted">The range and target retail prices are confirmed. Customer checkout stays closed until the first samples, garment sizes and fulfilment automation are approved. That avoids taking money for clothing we have not physically checked.</p><button class="btn alt wide" onclick="location.href='https://afileonmotorsport.co.uk/shop.html'">View shop details</button></div>`;
}

function run(){updateHome();previewShop();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
let queued=false;
new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;run()})}).observe(document.documentElement,{childList:true,subtree:true});
})();
