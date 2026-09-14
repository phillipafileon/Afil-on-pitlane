(()=>{
const DATA_KEY='afileon-pitlane-native-v2';
const CONFIG_URLS=[
  'https://raw.githubusercontent.com/phillipafileon/Afil-on-pitlane/main/dist/leaderboard-service.json',
  'https://afileonmotorsport.co.uk/leaderboard-service.json'
];
const LEGACY_API='https://afileonmotorsport.co.uk/api/pitlane';
const previousFetch=window.fetch.bind(window);
let endpoints=[];
let queued=false;

const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=ms=>{ms=Number(ms);if(!Number.isFinite(ms))return '—';const m=Math.floor(ms/60000),sec=(ms%60000)/1000;return `${m}:${sec.toFixed(3).padStart(6,'0')}`};
const readData=()=>{try{return JSON.parse(localStorage.getItem(DATA_KEY))||{}}catch{return {}}};

function normaliseEndpoint(raw){
  let v=String(raw||'').trim().replace(/\/+$/,'');
  if(!v)return '';
  if(!/^https:\/\//i.test(v))return '';
  return /\/api\/pitlane$/i.test(v)?v:`${v}/api/pitlane`;
}

async function loadConfig(){
  for(const url of CONFIG_URLS){
    try{
      const r=await previousFetch(`${url}${url.includes('?')?'&':'?'}t=${Date.now()}`,{cache:'no-store'});
      if(!r.ok)continue;
      const j=await r.json();
      const raw=Array.isArray(j.endpoints)?j.endpoints:(j.endpoint?[j.endpoint]:[]);
      const clean=[...new Set(raw.map(normaliseEndpoint).filter(Boolean))];
      if(clean.length){endpoints=clean;return}
    }catch{}
  }
}

function requestUrl(resource){
  if(typeof resource==='string')return resource;
  if(resource&&typeof resource.url==='string')return resource.url;
  return '';
}

window.fetch=async function(resource,options){
  const url=requestUrl(resource);
  if(url.startsWith(LEGACY_API)&&endpoints.length){
    const suffix=url.slice(LEGACY_API.length);
    for(const base of endpoints){
      try{
        const r=await previousFetch(`${base}${suffix}`,options);
        if(r.status!==404)return r;
      }catch{}
    }
  }
  return previousFetch(resource,options);
};

function localBests(){
  const d=readData(), best=new Map();
  const profiles=d.trackProfiles||{};
  for(const s of (d.sessions||[])){
    if(norm(s.source)!=='gps')continue;
    const track=String(s.track||'').trim(), layout=String(s.layout||'').trim();
    if(!track||!layout)continue;
    const profileKey=`${norm(track)}|${norm(layout)}`;
    if(profiles[profileKey]&&profiles[profileKey].confirmed===false)continue;
    for(const lap of (s.laps||[])){
      if(!lap||typeof lap!=='object'||norm(lap.source)!=='gps'||lap.status!=='valid'||!Number.isFinite(Number(lap.ms)))continue;
      const key=`${track}\u0000${layout}`,ms=Number(lap.ms),old=best.get(key);
      if(!old||ms<old.ms)best.set(key,{track,layout,ms});
    }
  }
  return [...best.values()].sort((a,b)=>a.track.localeCompare(b.track)||a.layout.localeCompare(b.layout));
}

function ensurePanel(){
  const page=document.getElementById('leaderboards');
  if(!page)return null;
  let p=document.getElementById('lbLocalFallback');
  if(!p){
    p=document.createElement('div');
    p.id='lbLocalFallback';p.className='panel';p.style.marginTop='10px';
    const detail=document.getElementById('lbDetail');
    if(detail)detail.insertAdjacentElement('beforebegin',p);else page.appendChild(p);
  }
  return p;
}

function renderLocalPanel(){
  const p=ensurePanel();if(!p)return;
  const rows=localBests();
  const sig=JSON.stringify(rows.map(r=>[r.track,r.layout,r.ms]));
  if(p.dataset.localSig===sig)return;
  p.dataset.localSig=sig;
  p.innerHTML=`<div class="eyebrow">YOUR GPS BESTS // THIS PHONE</div><h2>Local timing still works.</h2><p class="muted">If the shared online leaderboard cannot be reached, Pitlane keeps showing your valid GPS personal bests stored on this phone.</p>${rows.length?rows.map(r=>`<div class="lbRow"><div class="lbPos">PB</div><div><span class="lbName">${esc(r.track)}</span><span class="lbMeta">${esc(r.layout)}</span></div><div class="lbTime">${fmt(r.ms)}</div></div>`).join(''):'<p class="muted">No valid GPS personal bests are stored on this phone yet.</p>'}`;
}

function patchStatus(){
  const s=document.getElementById('lbSync');if(!s)return;
  const text=s.textContent||'';
  if(/Leaderboard service is not connected yet|Could not refresh|Offline .*no cached rankings/i.test(text)){
    const replacement='Online rankings unavailable right now • local GPS bests remain available below';
    if(!text.includes(replacement))s.innerHTML=`<span class="lbDot warn"></span>${replacement}`;
    renderLocalPanel();
  }
}

function refreshUi(){
  queued=false;
  patchStatus();
  renderLocalPanel();
}

function install(){
  renderLocalPanel();patchStatus();loadConfig();
  new MutationObserver(()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(refreshUi);
  }).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  window.addEventListener('online',()=>{loadConfig();setTimeout(patchStatus,500)});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
