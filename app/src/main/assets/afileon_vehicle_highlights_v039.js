(()=>{
const KEY='afileon-pitlane-native-v2';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function is924Text(t){return /porsche\s*(?:•\s*)?924/i.test(String(t||'')) || /porsche\s+924/i.test(String(t||''))}
function isE46Text(t){return /(?:bmw\s*(?:•\s*)?)?(?:3\s*series\s+)?e46/i.test(String(t||'')) || /bmw\s+318i/i.test(String(t||''))}
function vehicleClass(t){if(is924Text(t))return'am924';if(isE46Text(t))return'amE46';return''}

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
    .amChooser{position:relative;margin:12px 0 10px;padding:12px;border:1px solid #2a3a4b;background:#040b13}
    .amChooser label{margin:0}.amChooserHelp{margin:7px 0 0}
    .amPickerDrop{display:none;position:absolute;left:12px;right:12px;top:78px;max-height:330px;overflow:auto;background:#030a12;border:1px solid #435365;z-index:80;box-shadow:0 16px 40px rgba(0,0,0,.55)}
    .amPickerDrop.show{display:block}
    .amPickerRow{display:block;width:100%;border:0;border-bottom:1px solid #172633;background:#07111b;color:#eef4ff;padding:11px 12px;text-align:left;font-size:12px;line-height:1.35}
    .amPickerRow:hover,.amPickerRow:focus{background:#0b1b2b;outline:none}
    .amPickerRow.am924{border-left:4px solid #ffe500;color:#fff5a4;background:#151404}
    .amPickerRow.amE46{border-left:4px solid #3fcfff;color:#bdefff;background:#04151c}
    .amPickerRow .amMiniTag{display:block;margin-top:3px;font-size:9px;font-weight:900;letter-spacing:.8px;text-transform:uppercase}
    .amPickerRow.am924 .amMiniTag{color:#ffe500}.amPickerRow.amE46 .amMiniTag{color:#3fcfff}
    .amPickerEmpty{padding:12px;color:#aab5c9;font-size:11px}
    .amCustomUse{margin-top:8px;width:100%;background:transparent;border:1px solid #38495a;color:#c8d1de;padding:10px;font-weight:800}
    .amVariantBox{display:none;margin-top:10px;padding:10px;border:1px solid #223345;background:#06101a}
    .amVariantBox.show{display:block}
    .amVariantTitle{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#aab5c9;font-weight:900;margin-bottom:7px}
    .amVariantBtns{display:flex;flex-wrap:wrap;gap:7px}
    .amVariantBtn{border:1px solid #36526a;background:#081725;color:#e9f1fb;padding:8px 10px;font-size:11px;font-weight:800}
    .amVariantBtn.on{border-color:#ffe500;color:#ffe500;background:#171503}
    .amTyreNote{margin-top:8px;font-size:10px;line-height:1.45;color:#aab5c9}
    @media(max-width:600px){.amFeaturedGrid{grid-template-columns:1fr}.amPickerDrop{max-height:280px}}
  `;
  document.head.appendChild(s);
}

function allPresetValues(){return [...($('#vcPresets')?.options||[])].map(o=>o.value).filter(Boolean)}
function parsePreset(raw){
  const p=String(raw||'').split('•').map(x=>x.trim()).filter(Boolean);
  return {raw,make:p[0]||'',model:p[1]||'',years:p[2]||'',tyre:p.slice(3).join(' • ')};
}
function catalogueGroups(){
  const map=new Map();
  allPresetValues().map(parsePreset).forEach(p=>{
    const key=norm(`${p.make}|${p.model}`);
    if(!map.has(key))map.set(key,{key,make:p.make,model:p.model,label:`${p.make} ${p.model}`,rows:[]});
    map.get(key).rows.push(p);
  });
  return [...map.values()];
}
function generationGroups(group){
  const map=new Map();
  group.rows.forEach(r=>{const k=norm(r.years||'unspecified');if(!map.has(k))map.set(k,{years:r.years||'Reference',rows:[]});map.get(k).rows.push(r)});
  return [...map.values()];
}
function uniqueTyres(rows){return [...new Set(rows.map(r=>r.tyre).filter(Boolean))]}

function updateCatalogueCount(){
  const cat=$('#vcCatalogue');if(!cat)return;
  const models=catalogueGroups().length, configs=allPresetValues().length;
  const eyebrow=cat.querySelector(':scope > .eyebrow');
  const txt=`VEHICLE CATALOGUE // ${models} CAR MODELS`;
  if(eyebrow && eyebrow.textContent!==txt)eyebrow.textContent=txt;
  let note=$('#amCatalogueCountNote');
  if(!note){note=document.createElement('p');note.id='amCatalogueCountNote';note.className='tiny';cat.querySelector('.eyebrow')?.insertAdjacentElement('afterend',note)}
  note.textContent=`${configs} technical reference configurations are stored underneath those models. Tyre sizes no longer create duplicate cars in the picker.`;
}

function selectPreset(value){
  const make=$('#vcMake'),preset=$('#vcPreset');if(!make||!preset)return;
  const manufacturer=parsePreset(value).make;
  make.value=manufacturer;
  make.dispatchEvent(new Event('input',{bubbles:true}));
  setTimeout(()=>{
    const opts=allPresetValues();
    const exact=opts.find(v=>norm(v)===norm(value));
    if(!exact)return;
    preset.value=exact;
    preset.dispatchEvent(new Event('input',{bubbles:true}));
    preset.dispatchEvent(new Event('change',{bubbles:true}));
    $('#vcSelected')?.scrollIntoView({behavior:'smooth',block:'nearest'});
  },90);
}

function selectGeneration(group,gen,box){
  box.querySelectorAll('.amVariantBtn').forEach(b=>b.classList.toggle('on',b.dataset.amYears===gen.years));
  const representative=gen.rows[0];
  selectPreset(representative.raw);
  const tyres=uniqueTyres(gen.rows);
  const note=box.querySelector('.amTyreNote');
  if(note)note.innerHTML=`<b>${esc(group.label)} — ${esc(gen.years)}</b><br>${tyres.length?`Known tyre references: ${esc(tyres.join(', '))}. `:''}Tyre sizes are attached to this car as reference data; they do not create separate vehicle entries.`;
}

function showModel(group){
  const input=$('#amVehicleSearch'),variant=$('#amVariantBox');if(!input||!variant)return;
  input.value=group.label;
  const gens=generationGroups(group);
  variant.innerHTML=`<div class="amVariantTitle">${gens.length>1?'Choose year / generation':'Reference year / generation'}</div><div class="amVariantBtns"></div><div class="amTyreNote"></div>`;
  const btns=variant.querySelector('.amVariantBtns');
  gens.forEach((g,i)=>{
    const b=document.createElement('button');b.type='button';b.className='amVariantBtn';b.dataset.amYears=g.years;b.textContent=g.years;
    b.addEventListener('click',()=>selectGeneration(group,g,variant));btns.appendChild(b);
  });
  variant.classList.add('show');
  if(gens[0])selectGeneration(group,gens[0],variant);
}

function installChooser(){
  const cat=$('#vcCatalogue');if(!cat||$('#amVehicleChooser'))return;
  const oldGrid=cat.querySelector('.vcGrid');if(!oldGrid)return;
  oldGrid.style.display='none';
  const box=document.createElement('div');box.id='amVehicleChooser';box.className='amChooser';
  box.innerHTML=`<label>Car model<input id="amVehicleSearch" autocomplete="off" placeholder="Search MX-5, E46, Golf, Fiesta ST…"></label><div id="amPickerDrop" class="amPickerDrop"></div><div id="amVariantBox" class="amVariantBox"></div><button id="amUseCustom" class="amCustomUse" type="button" style="display:none">Use typed car as a custom vehicle</button><p class="tiny amChooserHelp">Each car model appears once. If that model has multiple generations, choose the year/generation after selecting it. Tyre sizes stay inside the vehicle record instead of making duplicate cars.</p>`;
  oldGrid.insertAdjacentElement('beforebegin',box);
  const input=$('#amVehicleSearch'),drop=$('#amPickerDrop'),custom=$('#amUseCustom'),variant=$('#amVariantBox');

  const render=()=>{
    const q=norm(input.value),groups=catalogueGroups();
    let rows=groups.filter(g=>!q||norm(`${g.make} ${g.model}`).includes(q));
    rows.sort((a,b)=>{const aa=vehicleClass(a.label)?0:1,bb=vehicleClass(b.label)?0:1;if(aa!==bb)return aa-bb;return a.label.localeCompare(b.label)});
    const exact=groups.some(g=>norm(g.label)===q);
    custom.style.display=input.value.trim()&&!exact?'block':'none';
    if(!rows.length){drop.innerHTML='<div class="amPickerEmpty">No built-in model match. You can still save this as a custom vehicle.</div>';drop.classList.add('show');return}
    drop.innerHTML=rows.map(g=>{const cls=vehicleClass(g.label),tag=cls?`<span class="amMiniTag">◆ AFILÉON MOTORSPORT</span>`:'';return `<button type="button" class="amPickerRow ${cls}" data-am-key="${esc(g.key)}">${esc(g.label)}${tag}</button>`}).join('');
    drop.classList.add('show');
    drop.querySelectorAll('[data-am-key]').forEach(b=>b.addEventListener('click',()=>{const g=groups.find(x=>x.key===b.dataset.amKey);if(!g)return;drop.classList.remove('show');custom.style.display='none';showModel(g)}));
  };
  input.addEventListener('focus',render);
  input.addEventListener('input',()=>{variant.classList.remove('show');render()});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const first=drop.querySelector('[data-am-key]');if(first)first.click();else custom.click()}});
  custom.addEventListener('click',()=>{
    const typed=input.value.trim();if(!typed)return;
    const model=$('#vcCustomModel');if(model)model.value=typed;
    const panel=model?.closest('.panel');panel?.scrollIntoView({behavior:'smooth',block:'start'});
    model?.focus();drop.classList.remove('show');variant.classList.remove('show');
  });
  document.addEventListener('click',e=>{if(!box.contains(e.target))drop.classList.remove('show')});
}

function chooseCatalogue(which){
  const groups=catalogueGroups();
  const group=which==='924'?groups.find(g=>is924Text(g.label)):groups.find(g=>isE46Text(g.label));
  if(group)showModel(group);
}

function featuredPanel(){
  const garage=$('#garage'); if(!garage || $('#amFeaturedVehicles')) return;
  const heading=garage.querySelector('h1');
  const box=document.createElement('div');
  box.id='amFeaturedVehicles';box.className='amFeaturedWrap';
  box.innerHTML=`
    <div class="eyebrow">AFILÉON MOTORSPORT VEHICLES</div>
    <p class="muted" style="margin:7px 0 0">Our own cars are colour-coded and marked with ◆ so they stand out from the normal catalogue models.</p>
    <div class="amFeaturedGrid">
      <button class="amFeaturedCar am924" data-am-vehicle="924"><span class="amTeamBadge">◆ Afiléon Motorsport</span><b>Porsche 924 // #77</b><small>Race programme car • 2.0 NA</small></button>
      <button class="amFeaturedCar amE46" data-am-vehicle="e46"><span class="amTeamBadge blue">◆ Afiléon Motorsport</span><b>BMW E46 318i</b><small>Track-day hire / support car</small></button>
    </div>`;
  heading?.insertAdjacentElement('afterend',box);
  box.querySelector('[data-am-vehicle="924"]')?.addEventListener('click',()=>chooseCatalogue('924'));
  box.querySelector('[data-am-vehicle="e46"]')?.addEventListener('click',()=>chooseCatalogue('e46'));
}

function fixStoredVerification(){
  let d;try{d=JSON.parse(localStorage.getItem(KEY))||{cars:[]}}catch{return}
  let changed=false;
  (d.cars||[]).forEach(c=>{
    if(/Pure Tyre UK/i.test(c.sourceLabel||'')){
      if(c.oem!==false){c.oem=false;changed=true}
      if(c.verification!=='third-party-reference'){c.verification='third-party-reference';changed=true}
    }else if(/Caterham Owners Handbook/i.test(c.sourceLabel||'')){
      if(c.oem!==true){c.oem=true;changed=true}
      if(c.verification!=='oem-handbook'){c.verification='oem-handbook';changed=true}
    }
  });
  if(changed)localStorage.setItem(KEY,JSON.stringify(d));
}

function patchSelectedReference(){
  const box=$('#vcSelected');if(!box)return;
  const t=box.textContent||'';
  const eyebrow=box.querySelector('.eyebrow'),warn=box.querySelector('.vcWarn');
  if(/Pure Tyre UK/i.test(t)){
    if(eyebrow&&eyebrow.textContent!=='SOURCED REFERENCE MATCH')eyebrow.textContent='SOURCED REFERENCE MATCH';
    if(warn&&!/Third-party road reference/i.test(warn.textContent||''))warn.innerHTML='<b>Third-party road reference — not an OEM guarantee or a track hot-pressure target.</b> Confirm the exact tyre pressure on the vehicle placard/owner handbook and the wheel-fastener torque in the manufacturer documentation for the actual wheel and fastener arrangement.';
  }else if(/Caterham Owners Handbook/i.test(t)){
    if(eyebrow&&eyebrow.textContent!=='OEM HANDBOOK REFERENCE')eyebrow.textContent='OEM HANDBOOK REFERENCE';
  }
}

function markSelected(){
  const box=$('#vcSelected');if(!box)return;
  patchSelectedReference();
  const t=box.textContent||'';
  const cls=vehicleClass(t);
  box.classList.toggle('amSelectedVehicle',!!cls);
  box.classList.toggle('am924',cls==='am924');
  box.classList.toggle('amE46',cls==='amE46');
  const existing=box.querySelector('[data-am-selected-tag]');
  if(!cls){existing?.remove();return}
  const label=cls==='am924'?'◆ Afiléon Motorsport // Porsche 924':'◆ Afiléon Motorsport // BMW E46';
  if(existing?.dataset.amClass===cls)return;
  existing?.remove();
  const tag=document.createElement('div');tag.dataset.amSelectedTag='1';tag.dataset.amClass=cls;tag.className='amSelectedTag';
  tag.innerHTML=`<span class="amTeamBadge ${cls==='amE46'?'blue':''}">${label}</span>`;
  box.prepend(tag);
}

function markSaved(){
  const root=$('#cars');if(!root)return;
  const candidates=[...root.querySelectorAll('.card, .panel, [data-car-id]')];
  candidates.forEach(card=>{
    if(card.closest('#amFeaturedVehicles')) return;
    const t=card.textContent||'';
    const sourceBadge=card.querySelector('.vcBadge');
    if(sourceBadge&&/Pure Tyre UK/i.test(t)&&sourceBadge.textContent!=='SOURCED REFERENCE')sourceBadge.textContent='SOURCED REFERENCE';
    if(sourceBadge&&/Caterham Owners Handbook/i.test(t)&&sourceBadge.textContent!=='OEM HANDBOOK')sourceBadge.textContent='OEM HANDBOOK';
    const cls=vehicleClass(t);
    if(!cls)return;
    card.classList.add('amGarageVehicle',cls);
    if(!card.querySelector('[data-am-garage-badge]')){
      const badge=document.createElement('div');badge.dataset.amGarageBadge='1';badge.style.marginBottom='8px';
      badge.innerHTML=`<span class="amTeamBadge ${cls==='amE46'?'blue':''}">${cls==='am924'?'◆ Afiléon Motorsport // 924':'◆ Afiléon Motorsport // E46'}</span>`;
      card.prepend(badge);
    }
  });
}

function hook(){addStyles();fixStoredVerification();updateCatalogueCount();installChooser();featuredPanel();markSelected();markSaved()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook);else hook();
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;hook()})}).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
})();
