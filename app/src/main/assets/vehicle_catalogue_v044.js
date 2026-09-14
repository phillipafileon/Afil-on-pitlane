(()=>{
const KEY='afileon-pitlane-native-v2';
const MODELS=[{"make":"Mazda","model":"MX-5"},{"make":"BMW","model":"3 Series E46"},{"make":"BMW","model":"3 Series F30/F31"},{"make":"BMW","model":"1 Series"},{"make":"BMW","model":"Z3 E36"},{"make":"Ford","model":"Fiesta"},{"make":"Ford","model":"Fiesta ST"},{"make":"Ford","model":"Focus"},{"make":"Ford","model":"Focus RS"},{"make":"Ford","model":"Focus ST"},{"make":"Renault","model":"Clio"},{"make":"Renault","model":"Megane"},{"make":"Honda","model":"Civic"},{"make":"Volkswagen","model":"Golf"},{"make":"MINI","model":"Cooper"},{"make":"MINI","model":"John Cooper Works"},{"make":"Subaru","model":"BRZ"},{"make":"Subaru","model":"Impreza"},{"make":"Subaru","model":"Impreza STI"},{"make":"Vauxhall","model":"Corsa"},{"make":"Vauxhall","model":"Corsa VXR"},{"make":"Caterham","model":"Seven"},{"make":"Porsche","model":"924"},{"make":"Toyota","model":"GT86"},{"make":"Toyota","model":"GR86"},{"make":"Toyota","model":"MR2 SW20"},{"make":"Toyota","model":"MR2 Roadster W30"},{"make":"Toyota","model":"Celica GT-Four"},{"make":"Toyota","model":"Supra Mk4"},{"make":"Honda","model":"Civic Type R EP3"},{"make":"Honda","model":"Civic Type R FN2"},{"make":"Honda","model":"Civic Type R FK8"},{"make":"Honda","model":"S2000"},{"make":"Honda","model":"Integra Type R DC2"},{"make":"Honda","model":"Integra Type R DC5"},{"make":"Mazda","model":"RX-8"},{"make":"Mazda","model":"RX-7 FD"},{"make":"Nissan","model":"350Z"},{"make":"Nissan","model":"370Z"},{"make":"Nissan","model":"Silvia S14"},{"make":"Nissan","model":"Silvia S15"},{"make":"Nissan","model":"Skyline GT-R R32"},{"make":"Nissan","model":"Skyline GT-R R33"},{"make":"Nissan","model":"Skyline GT-R R34"},{"make":"Peugeot","model":"106"},{"make":"Peugeot","model":"205"},{"make":"Peugeot","model":"206"},{"make":"Peugeot","model":"306"},{"make":"Peugeot","model":"208 GTi"},{"make":"Citroen","model":"Saxo"},{"make":"Citroen","model":"C2"},{"make":"Citroen","model":"DS3"},{"make":"Vauxhall","model":"Astra VXR"},{"make":"Vauxhall","model":"VX220"},{"make":"Lotus","model":"Elise"},{"make":"Lotus","model":"Exige"},{"make":"Lotus","model":"Evora"},{"make":"Porsche","model":"Boxster 986"},{"make":"Porsche","model":"Boxster 987"},{"make":"Porsche","model":"Cayman 987"},{"make":"Porsche","model":"Cayman 981"},{"make":"Porsche","model":"911 996"},{"make":"Porsche","model":"911 997"},{"make":"Porsche","model":"944"},{"make":"Porsche","model":"968"},{"make":"BMW","model":"M3 E36"},{"make":"BMW","model":"M3 E46"},{"make":"BMW","model":"M3 E92"},{"make":"BMW","model":"Z4 E85"},{"make":"BMW","model":"2 Series M235i"},{"make":"BMW","model":"M2 F87"},{"make":"Mercedes-Benz","model":"SLK R170"},{"make":"Mercedes-Benz","model":"A45 AMG"},{"make":"Audi","model":"TT Mk1"},{"make":"Audi","model":"TT Mk2"},{"make":"Audi","model":"S3 8P"},{"make":"Audi","model":"RS3 8V"},{"make":"Volkswagen","model":"Golf GTI Mk5"},{"make":"Volkswagen","model":"Golf GTI Mk7"},{"make":"Volkswagen","model":"Golf R Mk7"},{"make":"SEAT","model":"Leon Cupra"},{"make":"Skoda","model":"Octavia vRS"},{"make":"Renault","model":"Clio Renaultsport 172/182"},{"make":"Renault","model":"Megane Renaultsport"},{"make":"Alfa Romeo","model":"147 GTA"},{"make":"Alfa Romeo","model":"Giulietta Quadrifoglio"},{"make":"Fiat","model":"500 Abarth"},{"make":"Abarth","model":"595"},{"make":"Mitsubishi","model":"Lancer Evolution VI"},{"make":"Mitsubishi","model":"Lancer Evolution VIII"},{"make":"Mitsubishi","model":"Lancer Evolution IX"},{"make":"Subaru","model":"Impreza WRX"},{"make":"Hyundai","model":"i30 N"},{"make":"Hyundai","model":"i20 N"},{"make":"Kia","model":"Stinger GT"},{"make":"Suzuki","model":"Swift Sport"},{"make":"MG","model":"TF"},{"make":"Rover","model":"MG ZR"},{"make":"TVR","model":"Chimaera"},{"make":"Westfield","model":"SEiW"}];
const $=s=>document.querySelector(s);
const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const keyOf=(m,model)=>norm(`${m}|${model}`);
const AF924=keyOf('Porsche','924');
const AFE46=keyOf('BMW','3 Series E46');
let selectedModel=null, selectedConfig=null, selectedTech=null;

function read(){try{return JSON.parse(localStorage.getItem(KEY))||{cars:[]}}catch{return {cars:[]}}}
function write(d){localStorage.setItem(KEY,JSON.stringify(d))}
function parseOption(raw){
  const p=String(raw||'').split('•').map(x=>x.trim()).filter(Boolean);
  return {raw,make:p[0]||'',model:p[1]||'',years:p[2]||'',tyre:p[3]||''};
}
function hiddenOptions(){return [...($('#vcPresets')?.options||[])].map(o=>parseOption(o.value)).filter(x=>x.make&&x.model)}
function configsFor(m){const k=keyOf(m.make,m.model);return hiddenOptions().filter(x=>keyOf(x.make,x.model)===k)}
function is924(m){return keyOf(m.make,m.model)===AF924}
function isE46(m){return keyOf(m.make,m.model)===AFE46}

function addStyles(){
  if($('#v044Styles'))return;
  const s=document.createElement('style');s.id='v044Styles';
  s.textContent=`
    .v044Start{margin:10px 0;padding:15px;border:1px solid #3fcfff;background:#05111b}
    .v044Catalogue{position:relative;margin:10px 0;padding:15px;border:1px solid #304256;background:linear-gradient(145deg,#071421,#040b13)}
    .v044SearchWrap{position:relative}
    .v044Drop{display:none;position:absolute;left:0;right:0;top:74px;z-index:90;max-height:340px;overflow:auto;background:#020912;border:1px solid #42566a;box-shadow:0 18px 50px rgba(0,0,0,.55)}
    .v044Drop.show{display:block}
    .v044Row{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid #182837;background:#06101a;color:#f7f9ff;padding:12px 13px;min-height:48px}
    .v044Row b{display:block;font-size:14px}.v044Row small{display:block;color:#aab5c9;margin-top:3px}
    .v044Row.am924{border-left:4px solid #ffe500;background:#151404;color:#fff5a4}
    .v044Row.amE46{border-left:4px solid #3fcfff;background:#04151c;color:#c8f3ff}
    .v044Tag{font-size:9px;letter-spacing:.8px;text-transform:uppercase;font-weight:900;margin-top:4px;display:block}
    .v044Row.am924 .v044Tag{color:#ffe500}.v044Row.amE46 .v044Tag{color:#3fcfff}
    .v044ModelBox{display:none;margin-top:12px;padding:13px;border:1px solid #223345;background:#040b13}
    .v044ModelBox.show{display:block}
    .v044Chips{display:flex;flex-wrap:wrap;gap:7px;margin:8px 0}
    .v044Chip{border:1px solid #36526a;background:#081725;color:#e9f1fb;padding:8px 10px;font-size:11px;font-weight:800}
    .v044Chip.on{border-color:#ffe500;color:#ffe500;background:#171503}
    .v044Spec{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
    .v044Spec>div{background:#06101a;border:1px solid #223345;padding:10px;min-width:0}
    .v044Spec span{display:block;color:#aab5c9;font-size:9px;letter-spacing:1px;text-transform:uppercase}
    .v044Spec b{display:block;margin-top:4px;overflow-wrap:anywhere}
    .v044Notice{margin-top:10px;padding:10px;border-left:3px solid #ffe500;background:#151504;color:#f7eaa0;font-size:11px;line-height:1.45}
    .v044Source{font-size:10px;color:#aab5c9;margin-top:8px;line-height:1.45}
    .v044Back{background:transparent;border:1px solid #405165;color:#dce8f6;padding:11px 13px;font-weight:900}
    .v044Afileon{margin:10px 0;padding:14px;border:1px solid #34485b;background:linear-gradient(145deg,#071522,#030a11)}
    .v044AfileonGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
    .v044AfileonCar{position:relative;text-align:left;padding:14px;border:1px solid #394957;background:#07111b;color:#f7f9ff;min-height:110px}
    .v044AfileonCar.am924{border-left:4px solid #ffe500}.v044AfileonCar.amE46{border-left:4px solid #3fcfff}
    .v044AfileonCar b{display:block;font-size:17px;margin:7px 0 4px}.v044AfileonCar small{color:#aab5c9}
    .v044Saved.am924{border-color:#8a7d00!important}.v044Saved.amE46{border-color:#207a99!important}
    .v044SavedBadge{display:inline-block;padding:4px 7px;border:1px solid #3d5266;color:#b8c8da;font-size:9px;font-weight:900;letter-spacing:.7px;text-transform:uppercase}
    .v044SavedBadge.source{border-color:#235944;color:#58e6a9}.v044SavedBadge.user{border-color:#6a5f00;color:#ffe500}
    @media(max-width:600px){.v044Spec,.v044AfileonGrid{grid-template-columns:1fr}.v044Drop{max-height:290px}}
  `;
  document.head.appendChild(s);
}

function customerPanel(){
  const garage=$('#garage');if(!garage||$('#v044Start'))return;
  const h=garage.querySelector('h1');if(!h)return;
  const p=document.createElement('div');p.id='v044Start';p.className='v044Start';
  p.innerHTML=`<div class="eyebrow">YOUR GARAGE // START HERE</div><h2>Find your car or enter your own</h2><p class="muted">Search the <b>100 distinct built-in car models</b> below. If your exact car is not listed, you can enter any make and model yourself. Afiléon Motorsport vehicles are examples, not a limit on what you can use.</p><div class="actions"><button id="v044StartSearch" class="btn">Search 100 cars</button><button id="v044StartCustom" class="btn alt">Add my own car</button></div>`;
  h.insertAdjacentElement('afterend',p);
  p.querySelector('#v044StartSearch').addEventListener('click',()=>{$('#v044Search')?.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>$('#v044Search')?.focus(),220)});
  p.querySelector('#v044StartCustom').addEventListener('click',()=>{$('#vcCustomMake')?.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>$('#vcCustomMake')?.focus(),220)});
}

function referenceLabel(source){
  if(/Caterham Owners Handbook/i.test(source))return 'OEM HANDBOOK REFERENCE';
  if(/Pure Tyre UK/i.test(source))return 'SOURCED ROAD REFERENCE';
  if(/Porsche 924/i.test(source)||/BRSCC/i.test(source))return 'AFILÉON / HISTORIC RACE REFERENCE';
  return 'REFERENCE DATA';
}
function sourceFromHidden(){
  const t=$('#vcSelected .vcSource')?.textContent||'';
  return t.replace(/^Reference:\s*/i,'').replace(/\.\s*Match the exact.*$/i,'').replace(/\.$/,'').trim();
}
function extractHiddenTech(config){
  const hidden=$('#vcPreset'),panel=$('#vcSelected');if(!hidden||!panel)return null;
  hidden.value=config.raw;hidden.dispatchEvent(new Event('input',{bubbles:true}));hidden.dispatchEvent(new Event('change',{bubbles:true}));
  const cells=[...panel.querySelectorAll('.vcSpec>div')];
  const vals={};
  cells.forEach(d=>{const k=norm(d.querySelector('span')?.textContent);const v=(d.querySelector('b')?.textContent||'').trim();if(k)vals[k]=v});
  const pressure=vals['oem cold pressure']||vals['cold pressure']||'';
  const pm=pressure.match(/([0-9.]+)\s*\/\s*([0-9.]+)/);
  const torque=(vals['wheel torque']||'').match(/[0-9.]+/)?.[0]||'';
  return {
    make:config.make,model:config.model,years:config.years,tyre:config.tyre,
    torque,pressureFront:pm?.[1]||'',pressureRear:pm?.[2]||'',
    source:sourceFromHidden()||'Existing Pitlane reference',note:panel.querySelector('.vcWarn')?.textContent?.trim()||''
  };
}

function renderTech(tech){
  selectedTech=tech;
  const spec=$('#v044Specs');if(!spec)return;
  const source=tech.source||'Reference';
  spec.innerHTML=`<div class="eyebrow">${referenceLabel(source)}</div><div class="v044Spec"><div><span>Tyre / wheel reference</span><b>${esc(tech.tyre||'Not specified')}</b></div><div><span>Cold pressure</span><b>${tech.pressureFront&&tech.pressureRear?`${esc(tech.pressureFront)} / ${esc(tech.pressureRear)} PSI F/R`:'Not loaded'}</b></div><div><span>Wheel torque</span><b>${tech.torque?`${esc(tech.torque)} Nm`:'Not loaded'}</b></div></div><p class="v044Source">Source: ${esc(source)}.</p><div class="v044Notice"><b>Road/reference values are not track hot-pressure targets.</b> Confirm the exact fitted wheel, fastener and tyre arrangement against the vehicle placard/handbook. Wheel/tyre configuration can change the correct cold pressure.</div>`;
}
function render924(){
  selectedTech={make:'Porsche',model:'924',years:'Afiléon Motorsport / historic BRSCC Class 924 reference',tyre:'7×15 competition wheel • Toyo Proxes R888R 205/50R15',torque:'130',pressureFront:'29',pressureRear:'29',source:'Porsche 924 road data + published BRSCC 2019 Class 924 regulations',verification:'mixed-oem-and-race-reference'};
  const spec=$('#v044Specs');if(!spec)return;
  spec.innerHTML=`<div class="eyebrow">◆ AFILÉON MOTORSPORT // PORSCHE 924</div><div class="v044Spec"><div><span>Race wheel / tyre reference</span><b>7×15 • Toyo R888R 205/50R15</b></div><div><span>OEM road pressure fallback</span><b>29 / 29 PSI F/R</b></div><div><span>OEM road torque fallback</span><b>130 Nm</b></div></div><p class="v044Source">Historic BRSCC 2019 reference: 143 hp maximum, 9.6:1 maximum compression and 1000 kg minimum including driver.</p><div class="v044Notice"><b>Do not treat the race tyre entry as a prescribed current setup.</b> The pressure and torque above are road-reference fallbacks; confirm the actual wheels, fasteners and tyres fitted.</div>`;
}

function saveSelected(){
  if(!selectedModel||!selectedTech)return;
  const d=read();d.cars=d.cars||[];
  const src=selectedTech.source||'Pitlane reference';
  const oem=/Owners Handbook|manufacturer|OEM/i.test(src) && !/Pure Tyre/i.test(src);
  const verification=is924(selectedModel)?'mixed-oem-and-race-reference':(/Pure Tyre/i.test(src)?'third-party-reference':(oem?'oem-handbook':'reference'));
  d.cars.push({
    id:Date.now(),name:`${selectedModel.make} ${selectedModel.model}`,manufacturer:selectedModel.make,model:selectedModel.model,
    years:selectedTech.years||'',engine:'',tyres:selectedTech.tyre||'',torque:selectedTech.torque||'',
    pressureFront:selectedTech.pressureFront||'',pressureRear:selectedTech.pressureRear||'',
    sourceType:'catalogue',sourceLabel:src,oem,verification
  });
  write(d);renderCarsV044();const h=$('#hCars');if(h)h.textContent=d.cars.length;
  alert('Vehicle added to your Garage.');
}
function useCustom(){
  if(!selectedModel)return;
  if($('#vcCustomMake'))$('#vcCustomMake').value=selectedModel.make;
  if($('#vcCustomModel'))$('#vcCustomModel').value=selectedModel.model;
  $('#vcCustomMake')?.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>$('#vcCustomYear')?.focus(),220);
}
function backToSearch(){
  selectedModel=null;selectedConfig=null;selectedTech=null;
  const box=$('#v044ModelBox');if(box){box.classList.remove('show');box.innerHTML=''}
  const input=$('#v044Search');if(input){input.value='';input.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>input.focus(),220)}
}

function chooseConfig(config){
  selectedConfig=config;
  setTimeout(()=>renderTech(extractHiddenTech(config)||{...config,source:'Reference data unavailable'}),0);
}
function chooseGeneration(configs,years){
  const subset=configs.filter(c=>c.years===years);
  const wrap=$('#v044ConfigWrap');if(!wrap)return;
  if(subset.length>1){
    wrap.innerHTML=`<label>Wheel / tyre configuration<select id="v044ConfigSelect"></select></label>`;
    const sel=$('#v044ConfigSelect');
    subset.forEach(c=>{const o=document.createElement('option');o.value=c.raw;o.textContent=c.tyre||'Reference configuration';sel.appendChild(o)});
    sel.addEventListener('change',()=>{const c=subset.find(x=>x.raw===sel.value);if(c)chooseConfig(c)});
  } else {wrap.innerHTML=''}
  if(subset[0])chooseConfig(subset[0]);
}
function openModel(m){
  selectedModel=m;selectedConfig=null;selectedTech=null;
  const input=$('#v044Search');if(input)input.value=`${m.make} ${m.model}`;
  $('#v044Drop')?.classList.remove('show');
  const box=$('#v044ModelBox');if(!box)return;
  const special=is924(m)?'am924':isE46(m)?'amE46':'';
  const tag=special?`<div class="eyebrow" style="color:${special==='am924'?'#ffe500':'#3fcfff'}">◆ AFILÉON MOTORSPORT VEHICLE</div>`:'';
  const configs=is924(m)?[]:configsFor(m);
  box.className=`v044ModelBox show ${special}`;
  box.innerHTML=`${tag}<h2>${esc(m.make)} ${esc(m.model)}</h2><div id="v044Generation"></div><div id="v044ConfigWrap"></div><div id="v044Specs"></div><div class="actions" id="v044ModelActions"></div>`;
  const gen=$('#v044Generation'),actions=$('#v044ModelActions');
  if(is924(m)){
    gen.innerHTML='<p class="muted">Afiléon Motorsport race programme reference.</p>';render924();
    actions.innerHTML='<button id="v044Save" class="btn">Add to my Garage</button><button id="v044Back" class="v044Back">← Back to car search</button>';
  } else if(configs.length){
    const years=[...new Set(configs.map(c=>c.years).filter(Boolean))];
    gen.innerHTML=`<div class="tiny" style="margin-top:6px">Choose year / generation</div><div class="v044Chips"></div>`;
    const chips=gen.querySelector('.v044Chips');
    years.forEach((y,i)=>{const b=document.createElement('button');b.type='button';b.className='v044Chip'+(i===0?' on':'');b.textContent=y;b.addEventListener('click',()=>{chips.querySelectorAll('.v044Chip').forEach(x=>x.classList.remove('on'));b.classList.add('on');chooseGeneration(configs,y)});chips.appendChild(b)});
    if(years[0])chooseGeneration(configs,years[0]); else chooseConfig(configs[0]);
    actions.innerHTML='<button id="v044Save" class="btn">Add to my Garage</button><button id="v044Back" class="v044Back">← Back to car search</button>';
  } else {
    gen.innerHTML='<p class="muted">This model is included in the 100-car directory, but Pitlane does not yet have verified wheel-torque and pressure data loaded for it.</p>';
    $('#v044Specs').innerHTML='<div class="v044Notice"><b>No invented figures.</b> Use the vehicle handbook/placard or enter your own known setup values below rather than Pitlane guessing.</div>';
    actions.innerHTML='<button id="v044UseCustom" class="btn alt">Use this model in custom entry</button><button id="v044Back" class="v044Back">← Back to car search</button>';
  }
  $('#v044Save')?.addEventListener('click',saveSelected);
  $('#v044UseCustom')?.addEventListener('click',useCustom);
  $('#v044Back')?.addEventListener('click',backToSearch);
  box.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function cataloguePanel(){
  if($('#v044Catalogue'))return;
  const old=$('#vcCatalogue');if(!old)return;
  old.style.display='none';
  const p=document.createElement('div');p.id='v044Catalogue';p.className='v044Catalogue';
  p.innerHTML=`<div class="eyebrow">VEHICLE CATALOGUE // EXACTLY 100 CAR MODELS</div><p class="muted">Search by make or model. Each model appears once; year/generation and wheel/tyre configuration are chosen <b>after</b> the car, so tyre sizes do not create duplicate cars.</p><div class="v044SearchWrap"><label>Search cars<input id="v044Search" autocomplete="off" placeholder="Try MX-5, E46, GT86, Clio, Golf…"></label><div id="v044Drop" class="v044Drop"></div></div><div id="v044ModelBox" class="v044ModelBox"></div><p class="tiny">Technical data is only shown where Pitlane has a sourced reference. Models without verified figures stay in the directory without made-up torque or pressure values.</p>`;
  old.insertAdjacentElement('beforebegin',p);
  const input=$('#v044Search'),drop=$('#v044Drop');
  const render=()=>{
    const q=norm(input.value);
    const rows=MODELS.filter(m=>!q||norm(`${m.make} ${m.model}`).includes(q));
    if(!rows.length){drop.innerHTML='<div class="v044Row"><b>No built-in match</b><small>Use “Add my own car” above.</small></div>';drop.classList.add('show');return}
    drop.innerHTML=rows.map((m,i)=>{const k=keyOf(m.make,m.model),cls=k===AF924?'am924':k===AFE46?'amE46':'',tag=cls?'<span class="v044Tag">◆ Afiléon Motorsport</span>':'';return `<button type="button" class="v044Row ${cls}" data-v044="${i}"><b>${esc(m.make)} ${esc(m.model)}</b>${tag}</button>`}).join('');
    drop.classList.add('show');
    drop.querySelectorAll('[data-v044]').forEach(b=>b.addEventListener('click',()=>openModel(rows[Number(b.dataset.v044)])));
  };
  input.addEventListener('focus',render);input.addEventListener('input',render);
  document.addEventListener('click',e=>{if(!p.contains(e.target))drop.classList.remove('show')});
}

function afileonPanel(){
  if($('#v044Afileon'))return;
  const custom=$('#addCar')?.closest('.panel');if(!custom)return;
  const p=document.createElement('div');p.id='v044Afileon';p.className='v044Afileon';
  p.innerHTML=`<div class="eyebrow">AFILÉON MOTORSPORT REFERENCE VEHICLES</div><p class="muted">These sit below the customer controls so it is clear Pitlane works with your own car too.</p><div class="v044AfileonGrid"><button class="v044AfileonCar am924" data-car="924"><span class="v044Tag" style="color:#ffe500">◆ Afiléon Motorsport</span><b>Porsche 924 // #77</b><small>Race programme car</small></button><button class="v044AfileonCar amE46" data-car="e46"><span class="v044Tag" style="color:#3fcfff">◆ Afiléon Motorsport</span><b>BMW E46 318i</b><small>Track-day hire / support car</small></button></div>`;
  custom.insertAdjacentElement('afterend',p);
  p.querySelector('[data-car="924"]').addEventListener('click',()=>openModel(MODELS.find(is924)));
  p.querySelector('[data-car="e46"]').addEventListener('click',()=>openModel(MODELS.find(isE46)));
}

function renderCarsV044(){
  const d=read(),box=$('#cars');if(!box)return;const cars=d.cars||[];
  box.innerHTML=cars.length?cars.map(c=>{
    const k=keyOf(c.manufacturer,c.model),cls=k===AF924?'am924':k===AFE46?'amE46':'';
    let badge='USER INPUT',bc='user';
    if(c.sourceType==='catalogue'){badge=c.verification==='third-party-reference'?'SOURCED REFERENCE':c.verification==='oem-handbook'?'OEM HANDBOOK':c.verification==='mixed-oem-and-race-reference'?'AFILÉON / MIXED REFERENCE':'REFERENCE DATA';bc='source'}
    const meta=[c.years,c.engine,c.tyres].filter(Boolean).map(esc).join(' • ');
    const specs=[];
    if(c.pressureFront||c.pressureRear)specs.push(`<div><span>Cold pressure</span><b>${esc(c.pressureFront||'—')} / ${esc(c.pressureRear||'—')} PSI F/R</b></div>`);
    if(c.torque)specs.push(`<div><span>Wheel torque</span><b>${esc(c.torque)} Nm</b></div>`);
    if(c.sourceLabel)specs.push(`<div><span>Source</span><b>${esc(c.sourceLabel)}</b></div>`);
    return `<div class="card v044Saved ${cls}" style="margin-top:10px"><div class="v044SavedBadge ${bc}">${badge}</div><h2>${esc(c.name)}</h2><p class="muted">${meta||'No specification entered'}</p>${specs.length?`<div class="v044Spec">${specs.join('')}</div>`:''}${c.sourceType!=='catalogue'?'<p class="v044Source">User-entered values are not verified by Afiléon Motorsport.</p>':''}</div>`;
  }).join(''):'<p class="muted">Your garage is empty.</p>';
}

function reorder(){
  const g=$('#garage'),h=g?.querySelector('h1'),start=$('#v044Start'),cat=$('#v044Catalogue'),custom=$('#addCar')?.closest('.panel'),team=$('#v044Afileon'),cars=$('#cars');
  if(!h)return;let a=h;[start,cat,custom,team,cars].forEach(n=>{if(n){a.insertAdjacentElement('afterend',n);a=n}});
}

function install(){
  addStyles();
  if(MODELS.length!==100)console.error('Pitlane model catalogue must contain exactly 100 models');
  const old=$('#vcCatalogue');if(!old||!$('#vcPresets')||!$('#addCar')){setTimeout(install,50);return}
  customerPanel();cataloguePanel();afileonPanel();reorder();renderCarsV044();
  $('#addCar')?.addEventListener('click',()=>setTimeout(renderCarsV044,20));
  document.querySelectorAll('[data-go="garage"]').forEach(b=>b.addEventListener('click',()=>setTimeout(renderCarsV044,40)));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
