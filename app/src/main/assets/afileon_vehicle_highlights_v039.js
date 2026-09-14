(()=>{
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');

function is924Text(t){return /porsche\s+924/i.test(String(t||''))}
function isE46Text(t){return /(?:bmw\s+)?(?:3\s*series\s+)?e46/i.test(String(t||'')) || /bmw\s+318i/i.test(String(t||''))}

function addStyles(){
  if($('#amVehicleHighlightStyle')) return;
  const s=document.createElement('style');
  s.id='amVehicleHighlightStyle';
  s.textContent=`
    .amFeaturedWrap{margin:10px 0 12px;padding:14px;border:1px solid #34485b;background:linear-gradient(145deg,#071522,#030a11)}
    .amFeaturedGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
    .amFeaturedCar{position:relative;text-align:left;padding:15px;border:1px solid #394957;background:#07111b;color:#f7f9ff;overflow:hidden;min-height:118px}
    .amFeaturedCar:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px}
    .amFeaturedCar.am924{border-color:#776d00;box-shadow:0 0 0 1px #2a2700 inset}.amFeaturedCar.am924:before{background:#ffe500}
    .amFeaturedCar.amE46{border-color:#17617a;box-shadow:0 0 0 1px #082c3a inset}.amFeaturedCar.amE46:before{background:#3fcfff}
    .amFeaturedCar b{display:block;font-size:17px;margin:6px 0 4px}.amFeaturedCar small{display:block;color:#aab5c9;line-height:1.35}
    .amTeamBadge{display:inline-block;padding:4px 7px;border:1px solid #ffe500;color:#ffe500;background:#191804;font-size:9px;font-weight:900;letter-spacing:.9px;text-transform:uppercase}
    .amTeamBadge.blue{border-color:#3fcfff;color:#3fcfff;background:#04151c}
    .amGarageVehicle{position:relative!important;overflow:hidden!important}
    .amGarageVehicle.am924{border-color:#8a7d00!important;box-shadow:0 0 22px rgba(255,229,0,.08) inset!important}
    .amGarageVehicle.amE46{border-color:#207a99!important;box-shadow:0 0 22px rgba(63,207,255,.08) inset!important}
    .amGarageVehicle.am924:after,.amGarageVehicle.amE46:after{content:"";position:absolute;left:0;top:0;bottom:0;width:4px}
    .amGarageVehicle.am924:after{background:#ffe500}.amGarageVehicle.amE46:after{background:#3fcfff}
    .amSelectedVehicle.am924{border-color:#8a7d00!important;box-shadow:0 0 24px rgba(255,229,0,.08) inset!important}
    .amSelectedVehicle.amE46{border-color:#207a99!important;box-shadow:0 0 24px rgba(63,207,255,.08) inset!important}
    .amSelectedTag{margin-bottom:8px}
    @media(max-width:600px){.amFeaturedGrid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(s);
}

function chooseCatalogue(which){
  const make=$('#vcMake'), preset=$('#vcPreset');
  if(!make||!preset) return;
  make.value=which==='924'?'Porsche':'BMW';
  make.dispatchEvent(new Event('input',{bubbles:true}));
  setTimeout(()=>{
    const opts=[...($('#vcPresets')?.options||[])];
    let o=null;
    if(which==='924') o=opts.find(x=>/Porsche\s*•\s*924 2\.0 NA\s*•\s*BRSCC/i.test(x.value)) || opts.find(x=>/Porsche\s*•\s*924/i.test(x.value));
    else o=opts.find(x=>/BMW\s*•\s*3 Series E46/i.test(x.value));
    if(o){preset.value=o.value;preset.dispatchEvent(new Event('input',{bubbles:true}));preset.dispatchEvent(new Event('change',{bubbles:true}));preset.scrollIntoView({behavior:'smooth',block:'center'});}
  },80);
}

function featuredPanel(){
  const garage=$('#garage'); if(!garage || $('#amFeaturedVehicles')) return;
  const heading=garage.querySelector('h1');
  const box=document.createElement('div');
  box.id='amFeaturedVehicles';box.className='amFeaturedWrap';
  box.innerHTML=`
    <div class="eyebrow">AFILÉON MOTORSPORT VEHICLES</div>
    <p class="muted" style="margin:7px 0 0">Our own cars are highlighted so they are easy to spot in the catalogue and Garage.</p>
    <div class="amFeaturedGrid">
      <button class="amFeaturedCar am924" data-am-vehicle="924"><span class="amTeamBadge">Afiléon Motorsport</span><b>Porsche 924 // #77</b><small>Race programme car • 2.0 NA</small></button>
      <button class="amFeaturedCar amE46" data-am-vehicle="e46"><span class="amTeamBadge blue">Afiléon Motorsport</span><b>BMW E46 318i</b><small>Track-day hire / support car</small></button>
    </div>`;
  heading?.insertAdjacentElement('afterend',box);
  box.querySelector('[data-am-vehicle="924"]')?.addEventListener('click',()=>chooseCatalogue('924'));
  box.querySelector('[data-am-vehicle="e46"]')?.addEventListener('click',()=>chooseCatalogue('e46'));
}

function markSelected(){
  const box=$('#vcSelected');if(!box)return;
  const t=box.textContent||'';
  box.classList.remove('amSelectedVehicle','am924','amE46');
  box.querySelector('[data-am-selected-tag]')?.remove();
  let cls=null,label=null;
  if(is924Text(t)){cls='am924';label='Afiléon Motorsport // Porsche 924'}
  else if(isE46Text(t)){cls='amE46';label='Afiléon Motorsport // BMW E46'}
  if(!cls)return;
  box.classList.add('amSelectedVehicle',cls);
  const tag=document.createElement('div');tag.dataset.amSelectedTag='1';tag.className='amSelectedTag';
  tag.innerHTML=`<span class="amTeamBadge ${cls==='amE46'?'blue':''}">${label}</span>`;
  box.prepend(tag);
}

function markSaved(){
  const root=$('#cars');if(!root)return;
  const candidates=[...root.querySelectorAll('.card, .panel, [data-car-id]')];
  candidates.forEach(card=>{
    if(card.closest('#amFeaturedVehicles')) return;
    const t=card.textContent||'';
    let cls=null,label=null;
    if(is924Text(t)){cls='am924';label='Afiléon Motorsport // 924'}
    else if(isE46Text(t)){cls='amE46';label='Afiléon Motorsport // E46'}
    if(!cls)return;
    card.classList.add('amGarageVehicle',cls);
    if(!card.querySelector('[data-am-garage-badge]')){
      const badge=document.createElement('div');badge.dataset.amGarageBadge='1';badge.style.marginBottom='8px';
      badge.innerHTML=`<span class="amTeamBadge ${cls==='amE46'?'blue':''}">${label}</span>`;
      card.prepend(badge);
    }
  });
}

function hook(){addStyles();featuredPanel();markSelected();markSaved()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook);else hook();
new MutationObserver(()=>requestAnimationFrame(hook)).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
})();
