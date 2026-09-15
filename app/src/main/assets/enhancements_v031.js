(()=>{
  const KEY='afileon-pitlane-native-v2';
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const norm=s=>(s||'').trim().toLowerCase().replace(/\s+/g,' ');
  const fmt=ms=>{if(!Number.isFinite(ms))return '—';const m=Math.floor(ms/60000),s=(ms%60000)/1000;return `${m}:${s.toFixed(3).padStart(6,'0')}`};
  const lapMs=l=>typeof l==='number'?l:l?.ms;
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY))||null}catch{return null}};
  const write=d=>localStorage.setItem(KEY,JSON.stringify(d));
  const selectedTrack=()=>$('#trackName')?.value?.trim()||'Unnamed circuit';
  const selectedLayout=()=>{const s=$('#layoutSelect')?.value||'';return s==='__custom__'?($('#customLayout')?.value?.trim()||'Custom'):s};
  const gpsActive=()=>/running|live/i.test($('#gps')?.textContent||'');
  const notice=t=>{let e=document.getElementById('v031Toast');if(!e){e=document.createElement('div');e.id='v031Toast';e.style.cssText='position:fixed;left:50%;bottom:100px;transform:translateX(-50%);z-index:9999;background:#111c28;color:#f7f9ff;border:1px solid #ffe500;padding:12px 15px;max-width:88%;font:700 12px Arial;box-shadow:0 10px 30px #0008';document.body.appendChild(e)}e.textContent=t;e.style.display='block';clearTimeout(e._t);e._t=setTimeout(()=>e.style.display='none',2600)};

  function addStyles(){
    if(document.getElementById('v031Styles'))return;
    const s=document.createElement('style');s.id='v031Styles';s.textContent=`
      .v031-delete{border:1px solid #6e2f39;background:#241019;color:#ffb8c2;padding:8px 10px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.8px}
      .v031-actions{grid-column:1/-1;display:flex;justify-content:flex-end;margin-top:6px;gap:8px}
      .v031-lap{display:grid;grid-template-columns:1fr auto;gap:6px;padding:10px 0;border-bottom:1px solid #172431;font-variant-numeric:tabular-nums}
      .v031-lap small{grid-column:1/-1;color:#aab5c9}
      .v031-pill{display:inline-block;padding:4px 7px;border:1px solid #314557;background:#06101a;font-size:9px;font-weight:900;letter-spacing:.7px;text-transform:uppercase}
      .v031-ok{color:#58e6a9;border-color:#235944}.v031-warn{color:#ffe500;border-color:#6a5f00}.v031-bad{color:#ff9aa8;border-color:#6e2f39}
    `;document.head.appendChild(s);
  }

  function ensureAutoLapStatus(){
    const gps=$('#gps');if(!gps)return;
    let box=$('#autoLapStatusV031');
    if(!box){
      box=document.createElement('div');box.id='autoLapStatusV031';box.className='status warn';gps.insertAdjacentElement('afterend',box);
    }
    if(gpsActive()){
      box.className='status ok';
      box.innerHTML='<b>AUTO LAP MODE ACTIVE</b> — each new lap starts automatically when you cross start/finish. Keep driving; no screen tap is required.';
    }else{
      box.className='status warn';
      box.innerHTML='<b>AUTO LAP MODE</b> — once GPS timing starts, each new lap begins automatically at start/finish. No tap is needed while driving.';
    }
  }

  function ensureSavedPanel(){
    const laps=$('#laps');if(!laps||$('#savedLapsV031'))return;
    const currentPanel=laps.closest('.panel');if(!currentPanel)return;
    const panel=document.createElement('div');panel.className='panel';panel.style.marginTop='10px';
    panel.innerHTML='<div class="eyebrow">SAVED TRACK TIMES</div><p class="tiny">Times for the selected track and layout. Delete an incorrect or unwanted GPS/manual time here. Deleted times are removed from your personal-best history.</p><div id="savedLapsV031"></div>';
    currentPanel.insertAdjacentElement('afterend',panel);
  }

  function renderSaved(){
    ensureSavedPanel();
    const holder=$('#savedLapsV031');if(!holder)return;
    const d=read();if(!d){holder.innerHTML='<p class="muted">No saved data yet.</p>';return}
    const track=selectedTrack(),layout=selectedLayout();
    const rows=[];
    (d.sessions||[]).forEach((s,si)=>{
      if(norm(s.track)!==norm(track)||norm(s.layout)!==norm(layout))return;
      (s.laps||[]).forEach((l,li)=>{const ms=lapMs(l);if(!Number.isFinite(ms))return;rows.push({si,li,s,l,ms,status:typeof l==='number'?'valid':(l.status||'valid'),source:(typeof l==='object'&&l.source)||s.source||'unknown'})});
    });
    rows.sort((a,b)=>String(b.s.date||'').localeCompare(String(a.s.date||''))||b.li-a.li);
    if(!rows.length){holder.innerHTML='<p class="muted">No saved times for this track and layout yet.</p>';return}
    holder.innerHTML=rows.map(r=>`<div class="v031-lap"><span>${r.source==='manual'?'Manual':'GPS'} <span class="v031-pill ${r.status==='invalid'?'v031-bad':r.status==='learning'?'v031-warn':'v031-ok'}">${String(r.status).toUpperCase()}</span></span><b>${fmt(r.ms)}</b><small>${r.s.date?new Date(r.s.date).toLocaleString():'Saved lap'}</small><div class="v031-actions"><button class="v031-delete" data-v031-delete-lap="${r.si}:${r.li}">Delete time</button></div></div>`).join('');
    $$('[data-v031-delete-lap]').forEach(btn=>btn.onclick=()=>{
      if(gpsActive()){notice('Finish the active GPS session before deleting saved times.');return}
      const [si,li]=btn.dataset.v031DeleteLap.split(':').map(Number);const data=read();const s=data?.sessions?.[si];if(!s?.laps?.[li])return;
      const ms=lapMs(s.laps[li]);
      if(!confirm(`Delete ${fmt(ms)} from ${s.track} — ${s.layout}?`))return;
      s.laps.splice(li,1);if(!s.laps.length)data.sessions.splice(si,1);write(data);notice('Track time deleted');setTimeout(()=>location.reload(),350);
    });
  }

  function decorateCars(){
    const box=$('#cars');if(!box)return;
    const d=read();const cars=d?.cars||[];const cards=[...box.querySelectorAll('.card')];
    cards.forEach((card,i)=>{
      if(card.querySelector('[data-v031-delete-car]'))return;
      const car=cars[i];if(!car)return;
      const wrap=document.createElement('div');wrap.className='actions';
      const b=document.createElement('button');b.className='v031-delete';b.textContent='Delete car';b.dataset.v031DeleteCar=String(car.id);wrap.appendChild(b);card.appendChild(wrap);
      b.onclick=()=>{
        if(gpsActive()){notice('Finish the active GPS session before changing garage data.');return}
        const data=read();const found=(data?.cars||[]).find(c=>String(c.id)===String(b.dataset.v031DeleteCar));if(!found)return;
        if(!confirm(`Delete ${found.name}? You can add it again with corrected details.`))return;
        data.cars=(data.cars||[]).filter(c=>String(c.id)!==String(b.dataset.v031DeleteCar));write(data);notice('Car deleted');setTimeout(()=>location.reload(),350);
      };
    });
  }

  function loadScript(id,src,onload){
    const existing=document.getElementById(id);
    if(existing){if(onload)onload();return}
    const s=document.createElement('script');s.id=id;s.src=src;if(onload)s.onload=onload;document.body.appendChild(s);
  }
  function loadBusinessScripts(){
    loadScript('pitlane-live-services-v047','https://appassets.androidplatform.net/assets/live_services_v047.js',()=>{
      loadScript('pitlane-live-services-patch-v048','https://appassets.androidplatform.net/assets/live_services_patch_v048.js',()=>{
        loadScript('pitlane-merch-v050','https://appassets.androidplatform.net/assets/merch_v050.js');
      });
    });
  }

  function hook(){
    addStyles();ensureAutoLapStatus();ensureSavedPanel();renderSaved();decorateCars();loadBusinessScripts();
    const gps=$('#gps');if(gps)new MutationObserver(ensureAutoLapStatus).observe(gps,{childList:true,subtree:true,characterData:true,attributes:true});
    const cars=$('#cars');if(cars)new MutationObserver(()=>setTimeout(decorateCars,0)).observe(cars,{childList:true,subtree:true});
    ['trackName','layoutSelect','customLayout'].forEach(id=>{const e=document.getElementById(id);if(e){e.addEventListener('input',renderSaved);e.addEventListener('change',renderSaved)}});
    $$('[data-go="track"]').forEach(b=>b.addEventListener('click',()=>setTimeout(()=>{ensureAutoLapStatus();renderSaved()},50)));
    $$('[data-go="garage"]').forEach(b=>b.addEventListener('click',()=>setTimeout(decorateCars,50)));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook);else hook();
})();

(()=>{
  function applyFactoryTheme(){
    if(document.getElementById('afileonFactoryTheme'))return;
    const s=document.createElement('style');
    s.id='afileonFactoryTheme';
    s.textContent=`
:root{--bg:#050505;--panel:#101010;--panel2:#171717;--y:#d8b446;--c:#d8b446;--m:#fff;--text:#f7f5ef;--muted:#aaa79f;--line:#30302d}
html,body{background:#050505!important}body{background:#050505!important;color:var(--text)!important;font-family:Arial,"Helvetica Neue",Helvetica,sans-serif!important;padding-top:5px}
body:before{content:"";position:fixed;left:0;right:0;top:0;height:5px;background:linear-gradient(90deg,var(--y) 0 72%,#fff 72% 78%,#242424 78%);z-index:999;pointer-events:none}
.app{max-width:980px!important;padding:10px 14px calc(100px + env(safe-area-inset-bottom))!important}
.top{min-height:68px;padding:7px 0 10px!important;border-bottom:1px solid #2e2e2b!important}.header-logo{width:min(53vw,240px)!important}.badge{color:#fff!important;letter-spacing:1.4px!important;font-size:9px!important}
.hero,.panel,.stat,.card,.trackCard{background:#101010!important;border:1px solid #30302d!important;box-shadow:none!important}.hero{margin-top:12px!important;padding:28px 20px 24px!important;clip-path:none!important;border-top:0!important;overflow:hidden!important}.hero:after{content:"77";position:absolute;right:-6px;bottom:-34px;font-size:126px;font-weight:900;color:#ffffff09;letter-spacing:-10px;pointer-events:none}.hero:before,.panel:before,.stat:before,.card:before,.trackCard:before{width:58px!important;height:4px!important;background:var(--y)!important}
h1{font-size:38px!important;line-height:.85!important;letter-spacing:-1.8px!important;margin:14px 0 10px!important}.hero h1{max-width:8ch!important;font-size:46px!important}.eyebrow{font-size:9px!important;letter-spacing:2.6px!important}.muted{color:#b8b5ad!important}.tiny{color:#99958c!important}
.grid{gap:7px!important}.stat,.card,.panel,.trackCard{padding:16px!important}.stat b{font-size:30px!important;letter-spacing:-1.3px}.stat span{font-size:9px!important;letter-spacing:1.4px!important}
.btn{border:0!important;border-bottom:3px solid var(--y)!important;background:#fff!important;color:#070707!important;clip-path:polygon(0 0,calc(100% - 11px) 0,100% 11px,100% 100%,0 100%)!important;letter-spacing:1.2px!important}.btn.alt{background:#171717!important;color:#fff!important;border:1px solid #3b3b38!important;border-bottom:3px solid var(--y)!important}.btn.ghost{background:transparent!important;color:#aaa79f!important;border:1px solid #3b3b38!important;border-bottom:3px solid #3b3b38!important}.btn.danger{background:#251319!important;color:#ffdce3!important;border:1px solid #65313a!important;border-bottom:3px solid var(--bad)!important}
.nav{bottom:0!important;background:#080808f7!important;border-top:1px solid #343431!important;padding-bottom:env(safe-area-inset-bottom)!important;box-shadow:0 -8px 26px #0008!important}.nav:before{content:"";position:absolute;left:0;top:-3px;width:28%;height:3px;background:var(--y)}.nav button{padding:13px 2px 11px!important;font-size:10px!important;letter-spacing:.35px!important;text-transform:uppercase!important}.nav button.on{color:var(--y)!important;background:#ffffff06!important}
input,select,textarea{background:#080808!important;border-color:#383835!important;border-radius:0!important}.timer{background:#0b0b0b!important;border-color:#30302d!important}.status{background:#0c0c0c!important}.pill,.v031-pill{background:#0b0b0b!important;border-color:#40403d!important}.modal{background:#0c0c0c!important;border-color:#383835!important}.manualOverlay{background:#050505!important}.bigLap{background:#0c0c0c!important}.card{min-height:120px!important}.card b{font-size:18px!important}.shop{gap:7px!important}
@media(min-width:700px){.hero h1{font-size:64px!important}.app{padding-inline:20px!important}.nav{left:50%!important;right:auto!important;transform:translateX(-50%)!important;width:min(980px,100%)!important;border-left:1px solid #30302d!important;border-right:1px solid #30302d!important}}
`;
    document.head.appendChild(s);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyFactoryTheme);else applyFactoryTheme();
})();
