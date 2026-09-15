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
