(()=>{
const DATA_KEY='afileon-pitlane-native-v2', CACHE_KEY='pitlane-global-leaderboards-v2', SEEN_KEY='pitlane-leaderboard-seen-v2', BLOCK_KEY='pitlane-leaderboard-blocked-v1', DEFER_KEY='pitlane-leaderboard-deferred-v1';
const API='https://afileonmotorsport.co.uk/api/pitlane';
const APP_VERSION='0.3.3-test';
const TRACKS={
 'Brands Hatch':['Indy','Grand Prix'],'Silverstone Circuit':['Grand Prix','National','International'],'Donington Park':['National','Grand Prix'],'Snetterton Circuit':['300','200','100'],'Oulton Park':['International','Island','Fosters'],'Cadwell Park':['Full Circuit','Club Circuit','Woodland Circuit'],'Lydden Hill':['Full Circuit'],'Goodwood Motor Circuit':['Full Circuit'],'Castle Combe Circuit':['Full Circuit'],'Thruxton Circuit':['Full Circuit'],'Circuit de Spa-Francorchamps':['Grand Prix'],'Nürburgring':['Grand Prix','Nordschleife','Combined'],'Autodromo Nazionale Monza':['Grand Prix'],'Circuit de Barcelona-Catalunya':['Grand Prix'],'Red Bull Ring':['Grand Prix'],'Circuit Paul Ricard':['Full Circuit'],'Circuit Zandvoort':['Grand Prix'],'Suzuka Circuit':['Grand Prix'],'Circuit of the Americas':['Grand Prix'],'Mount Panorama Circuit':['Full Circuit']
};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>(s||'').trim().toLowerCase().replace(/\s+/g,' ');
const fmt=ms=>{ms=Number(ms);if(!Number.isFinite(ms))return '—';const m=Math.floor(ms/60000),sec=(ms%60000)/1000;return `${m}:${sec.toFixed(3).padStart(6,'0')}`};
const readJSON=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k))??fallback}catch{return fallback}};
const readData=()=>readJSON(DATA_KEY,{});
let lb=null, selected=null;

function addStyles(){if($('#lb033style'))return;const s=document.createElement('style');s.id='lb033style';s.textContent=`
.nav{grid-template-columns:repeat(6,1fr)!important}.nav button{font-size:10px!important;padding-left:2px!important;padding-right:2px!important}
.lbTrack{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;text-align:left;margin-top:8px;padding:14px;background:#06111b;border:1px solid #223345;color:#f7f9ff}
.lbTrack b{font-size:15px}.lbTrack small{display:block;color:#aab5c9;margin-top:3px}.lbLayout{margin-top:14px}.lbRow{display:grid;grid-template-columns:32px 1fr auto;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid #172431;font-variant-numeric:tabular-nums}.lbPos{font-weight:900;color:#ffe500}.lbName{font-weight:800}.lbMeta{display:block;color:#aab5c9;font-size:10px;margin-top:2px}.lbTime{font-weight:900}.lbDot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#aab5c9;margin-right:6px}.lbDot.ok{background:#58e6a9}.lbDot.warn{background:#ffe500}.lbRecord{margin:8px 0;padding:9px 10px;border-left:3px solid #3fcfff;background:#05111b;color:#b8ddeb;font-size:11px}
`;document.head.appendChild(s)}

function installPage(){if($('#leaderboards'))return;const sec=document.createElement('section');sec.id='leaderboards';sec.className='view';sec.innerHTML=`
<h1>Best Track Times</h1>
<div class="hero"><div class="eyebrow">AFILÉON PITLANE // GLOBAL TOP 10</div><h1 style="font-size:28px">Circuit leaderboards.</h1><p class="muted">Top approved GPS-tracked Pitlane times are grouped by circuit and layout. Rankings refresh online and the last downloaded copy remains available offline.</p><div class="actions"><button id="lbRefresh" class="btn">Refresh rankings</button></div><p class="tiny" id="lbSync"><span class="lbDot"></span>Not synced yet</p></div>
<div class="panel" style="margin-top:10px"><div class="eyebrow">TRACKS</div><p class="tiny">Choose a circuit to see the Top 10 for each layout.</p><div id="lbTracks"></div></div>
<div id="lbDetail"></div>
<div class="panel" style="margin-top:10px"><div class="eyebrow">SUBMISSION RULES</div><p class="muted"><b>GPS only.</b> Manual laps never upload to the public leaderboard. A lap must come from automatic Pitlane GPS timing, use a confirmed circuit profile and pass the circuit/layout reference-record check. Any time faster than the verified reference record is rejected automatically.</p><p class="tiny">If no verified reference record has been configured for a layout yet, Pitlane keeps the lap locally but does not publish it.</p></div>`;$('.app').appendChild(sec);
 const nav=$('.nav');if(nav&&!nav.querySelector('[data-go="leaderboards"]')){const b=document.createElement('button');b.dataset.go='leaderboards';b.textContent='Times';nav.insertBefore(b,nav.children[2]||null);b.onclick=go}
 const home=$('#home');const grids=home?.querySelectorAll('.grid');const g=grids?.[grids.length-1];if(g&&!g.querySelector('[data-lb-home]')){const b=document.createElement('button');b.className='card';b.dataset.lbHome='1';b.style.cssText='color:var(--text);text-align:left';b.innerHTML='<div class="eyebrow">BEST TRACK TIMES</div><b>Global Top 10</b><p class="muted">GPS-verified rankings by circuit and layout.</p>';b.onclick=go;g.appendChild(b)}
 $('#lbRefresh').onclick=()=>refresh(true)
}
function go(){ $$('.view').forEach(v=>v.classList.toggle('active',v.id==='leaderboards'));$$('.nav button').forEach(b=>b.classList.toggle('on',b.dataset.go==='leaderboards'));renderTracks();refresh(false)}
function cache(){lb=readJSON(CACHE_KEY,null)}
function syncText(t,state=''){const e=$('#lbSync');if(e)e.innerHTML=`<span class="lbDot ${state}"></span>${esc(t)}`}
function groups(){return lb?.tracks||{}}
function refs(){return lb?.references||{}}
function refFor(track,layout){const rt=Object.keys(refs()).find(k=>norm(k)===norm(track));if(!rt)return null;const layouts=refs()[rt]||{};const rl=Object.keys(layouts).find(k=>norm(k)===norm(layout));return rl?layouts[rl]:null}
function renderTracks(){const h=$('#lbTracks');if(!h)return;const g=groups();h.innerHTML=Object.keys(TRACKS).map(track=>{const layouts=g[track]||{};const n=Object.values(layouts).reduce((a,x)=>a+(Array.isArray(x)?x.length:0),0);return `<button class="lbTrack" data-track="${esc(track)}"><span><b>${esc(track)}</b><small>${TRACKS[track].map(esc).join(' • ')}</small></span><span class="pill ${n?'ok':'warn'}">${n?n+' ranked':'No data'}</span></button>`}).join('');$$('[data-track]').forEach(b=>b.onclick=()=>{selected=b.dataset.track;renderDetail()});if(!selected)selected=Object.keys(TRACKS)[0];renderDetail()}
function renderDetail(){const box=$('#lbDetail');if(!box||!selected)return;const g=groups()[selected]||{};const layouts=TRACKS[selected]||Object.keys(g);box.innerHTML=`<div class="panel" style="margin-top:10px"><div class="eyebrow">${esc(selected)}</div><h2>Top times by layout</h2>${layouts.map(layout=>{const rows=(g[layout]||[]).slice(0,10),ref=refFor(selected,layout);const record=ref?`<div class="lbRecord"><b>Reference track best:</b> ${fmt(ref.record_ms)}${ref.record_holder?` • ${esc(ref.record_holder)}`:''}${ref.record_vehicle?` • ${esc(ref.record_vehicle)}`:''}</div>`:`<div class="lbRecord"><b>Reference track best:</b> not verified yet — public submissions are held.</div>`;return `<div class="lbLayout"><span class="pill">${esc(layout)}</span>${record}${rows.length?rows.map((r,i)=>`<div class="lbRow"><div class="lbPos">${i+1}</div><div><span class="lbName">${esc(r.display_name||'Anonymous')}</span><span class="lbMeta">${esc(r.country||'')}${r.verified?' • GPS VERIFIED':''}</span></div><div class="lbTime">${fmt(r.lap_ms)}</div></div>`).join(''):'<p class="muted">No approved GPS times yet.</p>'}</div>`}).join('')}</div>`}
async function refresh(){cache();renderTracks();if(!navigator.onLine){syncText(lb?.updated_at?`Offline • cached ${new Date(lb.updated_at).toLocaleString()}`:'Offline • no cached rankings','warn');return}syncText('Checking latest rankings…','warn');try{const r=await fetch(`${API}/leaderboards`,{cache:'no-store'});if(!r.ok)throw 0;const j=await r.json();lb=j;localStorage.setItem(CACHE_KEY,JSON.stringify(j));syncText(`Updated ${new Date(j.updated_at||Date.now()).toLocaleString()}`,'ok');renderTracks()}catch{syncText(lb?.updated_at?`Could not refresh • showing cached ${new Date(lb.updated_at).toLocaleString()}`:'Leaderboard service is not connected yet','warn')}}

function eligible(){
 const d=readData(),out=[];const seen=new Set(readJSON(SEEN_KEY,[])),blocked=new Set(readJSON(BLOCK_KEY,[])),deferred=readJSON(DEFER_KEY,{});const now=Date.now();
 (d.sessions||[]).forEach(s=>{
   if(String(s.source||'').toLowerCase()!=='gps')return;
   const pk=`${norm(s.track)}|${norm(s.layout)}`;if(!d.trackProfiles?.[pk]?.confirmed)return;
   (s.laps||[]).forEach((l,i)=>{
     if(typeof l!=='object'||String(l.source||'').toLowerCase()!=='gps'||l.status!=='valid'||!Number.isFinite(l.ms))return;
     const id=l.id||`${s.id}-${i}`;if(seen.has(id)||blocked.has(id))return;if(deferred[id]&&deferred[id]>now)return;
     const ref=refFor(s.track,s.layout);
     if(ref&&Number(l.ms)<Number(ref.record_ms)){blocked.add(id);return}
     out.push({submission_id:id,driver_id:d.profile?.id||'',display_name:d.profile?.name||'Anonymous',country:d.profile?.country||'',track:s.track,layout:s.layout,lap_ms:l.ms,source:'gps',status:'valid',profile_confirmed:true,app_version:APP_VERSION})
   })
 });
 localStorage.setItem(BLOCK_KEY,JSON.stringify([...blocked]));return {out,seen,blocked,deferred}
}
async function flush(){
 if(!navigator.onLine)return;const state=eligible();
 for(const item of state.out){
   try{
     const r=await fetch(`${API}/submit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item)});let j={};try{j=await r.json()}catch{}
     if(r.ok||r.status===409){state.seen.add(item.submission_id);delete state.deferred[item.submission_id];localStorage.setItem(SEEN_KEY,JSON.stringify([...state.seen]));localStorage.setItem(DEFER_KEY,JSON.stringify(state.deferred));continue}
     if(r.status===422&&j.error==='faster_than_reference_record'){
       state.blocked.add(item.submission_id);localStorage.setItem(BLOCK_KEY,JSON.stringify([...state.blocked]));continue
     }
     if(r.status===422&&j.error==='reference_record_required'){
       state.deferred[item.submission_id]=Date.now()+12*60*60*1000;localStorage.setItem(DEFER_KEY,JSON.stringify(state.deferred));continue
     }
     if(r.status===400){state.blocked.add(item.submission_id);localStorage.setItem(BLOCK_KEY,JSON.stringify([...state.blocked]));continue}
     state.deferred[item.submission_id]=Date.now()+60*60*1000;localStorage.setItem(DEFER_KEY,JSON.stringify(state.deferred));
   }catch{return}
 }
}
function hook(){addStyles();installPage();cache();renderTracks();setTimeout(()=>{refresh(false);flush()},700);setInterval(flush,30000);window.addEventListener('online',()=>{refresh(false);flush()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook);else hook();
})();