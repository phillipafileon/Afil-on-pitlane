(()=>{
  const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
  function addStyles(){if($('#enh031'))return;const s=document.createElement('style');s.id='enh031';s.textContent=`
      .v031-pills{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.v031-pill{font-size:9px;border:1px solid #38495a;padding:4px 7px;background:#071421;color:#b8ddeb}.v031-muted{color:#8e9bb0}.v031-ok{color:#58e6a9;border-color:#235944}.v031-warn{color:#ffe500;border-color:#6a5f00}.v031-bad{color:#ff9aa8;border-color:#6e2f39}
      .v031-save{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}.v031-save label{display:block;font-size:9px;color:#9ca9ba;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}.v031-save input{width:100%}
      .v031-saved{display:grid;gap:7px;margin-top:9px}.v031-srow{border:1px solid #273442;background:#050d16;padding:9px;display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}.v031-srow b{display:block}.v031-srow small{display:block;color:#9ca9ba;margin-top:2px;line-height:1.25}.v031-srow button{padding:7px 9px}
      .v031-carhead{display:flex;justify-content:space-between;gap:8px;align-items:center}.v031-carhead .v031-pills{margin-top:0}.v031-cardnote{font-size:10px;color:#9ca9ba;line-height:1.35;margin-top:7px}.v031-reset{margin-top:8px}
    `;document.head.appendChild(s)}
  function ensureAutoLapStatus(){const host=$('#gps');if(!host||$('#autoLapStatus'))return;const p=document.createElement('div');p.id='autoLapStatus';p.className='v031-pills';p.innerHTML='<span class="v031-pill">Auto lap: waiting</span><span class="v031-pill">GPS: idle</span>';host.appendChild(p)}
  function renderSaved(){const host=$('#savedTracks');if(!host)return;let rows=[];try{rows=JSON.parse(localStorage.getItem('pitlaneSavedTracks')||'[]')}catch(e){}host.innerHTML='';rows.forEach((r,i)=>{const d=document.createElement('div');d.className='v031-srow';d.innerHTML=`<div><b>${esc(r.name||'Saved setup')}</b><small>${esc(r.track||'')} ${r.layout?'• '+esc(r.layout):''}</small></div><button class="btn ghost" data-del="${i}">Remove</button>`;host.appendChild(d)});host.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{rows.splice(+b.dataset.del,1);localStorage.setItem('pitlaneSavedTracks',JSON.stringify(rows));renderSaved()})}
  function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function decorateCars(){const host=$('#cars');if(!host)return;host.querySelectorAll('.card').forEach(card=>{if(card.dataset.v031)return;card.dataset.v031='1';const title=card.querySelector('b');if(!title)return;const head=document.createElement('div');head.className='v031-carhead';title.parentNode.insertBefore(head,title);head.appendChild(title);const p=document.createElement('div');p.className='v031-pills';p.innerHTML='<span class="v031-pill">Garage</span>';head.appendChild(p)})}
  function loadBusinessScripts(){if(window.PitlaneBusinessEnhancementsLoaded)return;window.PitlaneBusinessEnhancementsLoaded=true}
  function hook(){
    addStyles();ensureAutoLapStatus();ensureSavedPanel();renderSaved();decorateCars();loadBusinessScripts();
    const gps=$('#gps');if(gps)new MutationObserver(ensureAutoLapStatus).observe(gps,{childList:true,subtree:true,characterData:true,attributes:true});
    const cars=$('#cars');if(cars)new MutationObserver(()=>setTimeout(decorateCars,0)).observe(cars,{childList:true,subtree:true});
    ['trackName','layoutSelect','customLayout'].forEach(id=>{const e=document.getElementById(id);if(e){e.addEventListener('input',renderSaved);e.addEventListener('change',renderSaved)}});
    $$('[data-go="track"]').forEach(b=>b.addEventListener('click',()=>setTimeout(()=>{ensureAutoLapStatus();renderSaved()},50)));
    $$('[data-go="garage"]').forEach(b=>b.addEventListener('click',()=>setTimeout(decorateCars,50)));
  }
  function ensureSavedPanel(){const host=$('#track');if(!host||$('#savedTracks'))return;const p=document.createElement('div');p.className='panel';p.innerHTML='<div class="eyebrow">Saved setups</div><div class="v031-save"><div><label>Setup name</label><input id="savedTrackName" placeholder="e.g. Brands Hatch dry"></div><button class="btn alt" id="saveTrackBtn">Save</button></div><div id="savedTracks" class="v031-saved"></div>';host.appendChild(p);$('#saveTrackBtn').onclick=()=>{let rows=[];try{rows=JSON.parse(localStorage.getItem('pitlaneSavedTracks')||'[]')}catch(e){}rows.unshift({name:($('#savedTrackName')||{}).value||'Saved setup',track:($('#trackName')||{}).value||'',layout:($('#layoutSelect')||{}).value||($('#customLayout')||{}).value||'',ts:Date.now()});localStorage.setItem('pitlaneSavedTracks',JSON.stringify(rows.slice(0,20)));renderSaved()}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook);else hook();
})();

// Legacy monochrome factory-theme override removed.
// Layout is now controlled by factory_layout_v057.css so Pitlane matches the website palette exactly.
