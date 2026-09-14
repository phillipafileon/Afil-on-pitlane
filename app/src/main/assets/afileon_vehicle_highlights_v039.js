(()=>{
const KEY='afileon-pitlane-native-v2';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function is924Text(t){return /porsche\s*(?:•\s*)?924/i.test(String(t||''))}
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
    @media(max-width:600px){.amFeaturedGrid{grid-template-columns:1fr}.amPickerDrop{max-height:280px}}
  `;
  document.head.appendChild(s);
}

function allPresetValues(){return [...($('#vcPresets')?.options||[])].map(o=>o.value).filter(Boolean)}

function updateCatalogueCount(){
  const cat=$('#vcCatalogue');if(!cat)return;
  const count=allPresetValues().length;
  const eyebrow=cat.querySelector(':scope > .eyebrow');
  const txt=`VEHICLE CATALOGUE // ${count || 101} PRELOADED TRACK-DAY REFERENCES`;
  if(eyebrow && eyebrow.textContent!==txt)eyebrow.textContent=txt;
}

function selectPreset(value){
  const make=$('#vcMake'),preset=$('#vcPreset');if(!make||!preset)return;
  const manufacturer=String(value).split('•')[0].trim();
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

function installChooser(){
  const cat=$('#vcCatalogue');if(!cat||$('#amVehicleChooser'))return;
  const oldGrid=cat.querySelector('.vcGrid');if(!oldGrid)return;
  oldGrid.style.display='none';
  const box=document.createElement('div');box.id='amVehicleChooser';box.className='amChooser';
  box.innerHTML=`<label>Vehicle<input id="amVehicleSearch" autocomplete="off" placeholder="Type your car or choose from the 101 built-in references…"></label><div id="amPickerDrop" class="amPickerDrop"></div><button id="amUseCustom" class="amCustomUse" type="button" style="display:none">Use typed car as a custom vehicle</button><p class="tiny amChooserHelp">Search the built-in catalogue or type any car. If your exact configuration is not listed, continue with the Custom / unlisted vehicle form below.</p>`;
  oldGrid.insertAdjacentElement('beforebegin',box);
  const input=$('#amVehicleSearch'),drop=$('#amPickerDrop'),custom=$('#amUseCustom');

  const render=()=>{
    const q=norm(input.value);
    let rows=allPresetValues().filter(v=>!q||norm(v).includes(q));
    rows.sort((a,b)=>{const aa=vehicleClass(a)?0:1,bb=vehicleClass(b)?0:1;if(aa!==bb)return aa-bb;return a.localeCompare(b)});
    const exact=allPresetValues().some(v=>norm(v)===q);
    custom.style.display=input.value.trim()&&!exact?'block':'none';
    if(!rows.length){drop.innerHTML='<div class="amPickerEmpty">No built-in match. You can still save this as a custom vehicle.</div>';drop.classList.add('show');return}
    drop.innerHTML=rows.map(v=>{const cls=vehicleClass(v);const tag=cls?`<span class="amMiniTag">◆ AFILÉON MOTORSPORT</span>`:'';return `<button type="button" class="amPickerRow ${cls}" data-am-value="${esc(v)}">${esc(v)}${tag}</button>`}).join('');
    drop.classList.add('show');
    drop.querySelectorAll('[data-am-value]').forEach(b=>b.addEventListener('click',()=>{input.value=b.dataset.amValue;drop.classList.remove('show');custom.style.display='none';selectPreset(b.dataset.amValue)}));
  };
  input.addEventListener('focus',render);
  input.addEventListener('input',render);
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const first=drop.querySelector('[data-am-value]');if(first)first.click();else custom.click()}});
  custom.addEventListener('click',()=>{
    const typed=input.value.trim();if(!typed)return;
    const model=$('#vcCustomModel');if(model)model.value=typed;
    const panel=model?.closest('.panel');panel?.scrollIntoView({behavior:'smooth',block:'start'});
    model?.focus();drop.classList.remove('show');
  });
  document.addEventListener('click',e=>{if(!box.contains(e.target))drop.classList.remove('show')});
}

function chooseCatalogue(which){
  const opts=allPresetValues();let value=null;
  if(which==='924')value=opts.find(v=>is924Text(v));
  else value=opts.find(v=>/BMW\s*•\s*3 Series E46/i.test(v));
  if(!value)return;
  const input=$('#amVehicleSearch');if(input)input.value=value;
  selectPreset(value);
}

function featuredPanel(){
  const garage=$('#garage'); if(!garage || $('#amFeaturedVehicles')) return;
  const heading=garage.querySelector('h1');
  const box=document.createElement('div');
  box.id='amFeaturedVehicles';box.className='amFeaturedWrap';
  box.innerHTML=`
    <div class="eyebrow">AFILÉON MOTORSPORT VEHICLES</div>
    <p class="muted" style="margin:7px 0 0">Our own cars are colour-coded and marked with ◆ so they stand out from the normal catalogue references.</p>
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
