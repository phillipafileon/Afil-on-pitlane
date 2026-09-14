(()=>{
const KEY='afileon-pitlane-native-v2';
const PORSCHE_924=[
  {
    label:'Porsche • 924 2.0 NA • Afiléon Motorsport / BRSCC reference • 205/50R15',
    years:'Afiléon Motorsport / historic BRSCC Class 924 reference',
    wheel:'7x15 competition wheel',
    tyre:'Toyo Proxes R888R 205/50R15',
    torque:'130',
    pf:'29',
    pr:'29',
    engine:'2.0L naturally aspirated • 1,984 cc',
    source:'Porsche 924 technical data + published BRSCC 2019 Porsche Championship Class 924 regulations',
    note:'The 7x15 wheel and 205/50R15 tyre are from the historic BRSCC Class 924 reference. The 29/29 PSI pressure and 130 Nm torque shown here are clearly-labelled Porsche OEM road fallback values, not a prescribed race setup. Always use the specification for the actual wheels, fasteners and tyres fitted to the car.',
    race:true
  }
];
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{cars:[]}}catch{return {cars:[]}}};
const write=d=>localStorage.setItem(KEY,JSON.stringify(d));
const match=()=>PORSCHE_924.find(x=>norm(x.label)===norm($('#vcPreset')?.value))||null;

function ensureOptions(){
  const makes=$('#vcMakes');
  if(makes && ![...makes.options].some(o=>norm(o.value)==='porsche')){
    const o=document.createElement('option');o.value='Porsche';makes.appendChild(o);
  }
  const list=$('#vcPresets');if(!list)return;
  PORSCHE_924.forEach(x=>{
    if(![...list.options].some(o=>norm(o.value)===norm(x.label))){const o=document.createElement('option');o.value=x.label;list.appendChild(o)}
  });
}
function raceHtml(){return `<div style="margin-top:10px;padding:12px;border:1px solid #3fcfff;background:#05111b"><div class="eyebrow">OFFICIAL HISTORIC RACE REFERENCE // BRSCC 2019</div><div class="vcSpec"><div><span>Power ceiling</span><b>143 hp flywheel</b></div><div><span>Compression</span><b>Max 9.6:1</b></div><div><span>Race wheel</span><b>7 × 15 in</b></div><div><span>Control tyre</span><b>Toyo R888R 205/50R15</b></div><div><span>Minimum weight</span><b>1000 kg incl. driver</b></div><div><span>Dampers</span><b>Leda VO200F/VO200R or GAZ GGA479</b></div></div><p class="vcSource">Source: published 2019 BRSCC Porsche Championship Class 924 regulations. Historic reference only; not a statement of current eligibility.</p></div>`}
function render924(){
  const r=match();if(!r)return false;
  const box=$('#vcSelected');if(!box)return false;
  box.className='panel';
  box.innerHTML=`<div class="eyebrow">AFILÉON MOTORSPORT // PORSCHE 924</div><h2>Porsche 924 2.0 NA</h2><p class="muted">${esc(r.years)} • ${esc(r.engine)}</p><div class="vcSpec"><div><span>Wheel / tyre reference</span><b>${esc(r.wheel)} • ${esc(r.tyre)}</b></div><div><span>OEM road pressure fallback</span><b>${r.pf} / ${r.pr} PSI F/R</b></div><div><span>OEM alloy torque fallback</span><b>${r.torque} Nm</b></div></div><p class="vcSource">Reference: ${esc(r.source)}.</p><div class="vcWarn"><b>Important:</b> ${esc(r.note)}</div>${raceHtml()}`;
  const eng=$('#vcEngine');if(eng&&!eng.value)eng.value='2.0 NA • 1,984 cc';
  return true;
}
function add924(ev){
  const r=match();if(!r)return;
  ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();
  const d=read();d.cars=d.cars||[];
  d.cars.push({id:Date.now(),name:'Porsche 924 2.0 NA',manufacturer:'Porsche',model:'924',years:r.years,engine:'2.0 NA • 1,984 cc',wheel:r.wheel,tyres:r.tyre,torque:r.torque,pressureFront:r.pf,pressureRear:r.pr,sourceType:'catalogue',sourceLabel:r.source,oem:true,verification:'mixed-oem-and-race-reference',raceReference:true,raceReferenceLabel:'BRSCC 2019 Class 924'});
  write(d);
  const h=$('#hCars');if(h)h.textContent=d.cars.length;
  alert('Afiléon Porsche 924 reference vehicle added. OEM fallback values are clearly labelled separately from the historic race specification.');
  const nav=document.querySelector('[data-go="home"]');
  if(nav){nav.click();setTimeout(()=>document.querySelector('[data-go="garage"]')?.click(),20)}
}
function addFeaturedPanel(){
  const cat=$('#vcCatalogue');if(!cat||$('#vc924Featured'))return;
  const p=document.createElement('div');p.id='vc924Featured';p.className='panel';p.style.marginBottom='10px';
  p.innerHTML=`<div class="eyebrow">◆ AFILÉON MOTORSPORT REFERENCE CAR</div><h2>Porsche 924 2.0 NA // #77</h2><p class="muted">The 924 is the 101st built-in catalogue reference and is highlighted because it is Afiléon Motorsport's race programme car.</p><div class="vcSpec"><div><span>Engine</span><b>1,984 cc inline-four</b></div><div><span>OEM road pressure fallback</span><b>29 / 29 PSI F/R</b></div><div><span>OEM alloy torque fallback</span><b>130 Nm</b></div></div><p class="vcSource">Historic BRSCC race reference: 7×15 wheels, Toyo R888R 205/50R15, 143 hp maximum, 9.6:1 maximum compression and 1000 kg minimum including driver.</p>`;
  cat.insertAdjacentElement('beforebegin',p);
}
function augmentSavedCards(){
  const box=$('#cars');if(!box)return;
  const d=read();
  [...box.querySelectorAll('.card')].forEach(card=>{
    if(!/Porsche\s+924/i.test(card.querySelector('h2')?.textContent||'')||card.querySelector('[data-924-extra]'))return;
    const cars=(d.cars||[]).filter(c=>/Porsche\s+924/i.test(c.name||''));
    const car=cars[cars.length-1];
    const extra=document.createElement('div');extra.dataset['924Extra']='1';
    extra.innerHTML=`<p class="vcSource"><b>◆ Afiléon 924 reference.</b> Historic BRSCC reference: 7×15 wheels and Toyo R888R 205/50R15. The shown 29/29 PSI pressure and 130 Nm torque are OEM road fallback values only. ${car?.raceReference?'Historic BRSCC 2019 reference also records 143 hp maximum, 9.6:1 maximum compression and 1000 kg minimum including driver.':''}</p>`;
    card.appendChild(extra);
  });
}
function hook(){
  ensureOptions();addFeaturedPanel();augmentSavedCards();
  const preset=$('#vcPreset');if(preset&&!preset.dataset.p924){preset.dataset.p924='1';const rer=()=>setTimeout(()=>{ensureOptions();render924()},0);preset.addEventListener('input',rer);preset.addEventListener('change',rer)}
  const make=$('#vcMake');if(make&&!make.dataset.p924){make.dataset.p924='1';make.addEventListener('input',()=>setTimeout(ensureOptions,0))}
  const add=$('#vcAddCatalogue');if(add&&!add.dataset.p924){add.dataset.p924='1';add.addEventListener('click',add924,true)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook);else hook();
new MutationObserver(()=>requestAnimationFrame(hook)).observe(document.documentElement,{childList:true,subtree:true});
})();
