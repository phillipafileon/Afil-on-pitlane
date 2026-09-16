(()=>{
  const $=s=>document.querySelector(s);
  const $$=s=>[...document.querySelectorAll(s)];
  const svg=(name)=>({
    garage:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 4l9 6.5V21H3zM8 21v-6h8v6"/></svg>',
    trophy:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v4c0 4-1.8 6-4 6s-4-2-4-6V4Zm0 2H4v2c0 3 2 5 5 5M16 6h4v2c0 3-2 5-5 5M12 14v4m-4 3h8"/></svg>',
    shop:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h2l2 10h10l2-7H6m3 11a1 1 0 1 0 0 .01M17 20a1 1 0 1 0 0 .01"/></svg>',
    more:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>',
    plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    tyre:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4v3m0 10v3M4 12h3m10 0h3"/></svg>',
    wrench:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5a5 5 0 0 0-6 6L3 16l5 5 5-5a5 5 0 0 0 6-6l-3 3-3-3z"/></svg>',
    note:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6zM15 3v4h4M9 11h6M9 15h6"/></svg>',
    flag:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m0 1h11l-2 3 2 3H5"/></svg>'
  }[name]||'');

  function addStyles(){
    if($('#referenceLayoutV03Styles'))return;
    const s=document.createElement('style');
    s.id='referenceLayoutV03Styles';
    s.textContent=`
      .nav{display:none!important}
      .app{padding-bottom:30px!important}
      .top{justify-content:center!important;min-height:82px!important;padding:12px 0 10px!important;position:relative}
      .top .badge{display:none!important}
      .top .header-logo{width:min(66vw,280px)!important;max-height:58px;object-fit:contain}
      .pitRefTabs{display:grid;grid-template-columns:repeat(4,1fr);position:sticky;top:0;z-index:85;background:rgba(2,7,17,.96);backdrop-filter:blur(14px);border-bottom:1px solid var(--line);box-shadow:0 12px 34px rgba(0,0,0,.32);margin:0 -14px 15px;padding:0 10px}
      .pitRefTab{position:relative;border:0;background:transparent;color:var(--muted);padding:11px 2px 10px;min-height:66px;font:800 9px Arial;text-transform:uppercase;letter-spacing:.65px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px}
      .pitRefTab svg,.pitRefIcon svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .pitRefTab.on{color:var(--y)}
      .pitRefTab.on:after{content:"";position:absolute;left:20%;right:20%;bottom:0;height:3px;background:var(--y);box-shadow:0 0 13px rgba(255,229,0,.42)}
      #garage>h1{display:none!important}
      #v044Start{border:1px solid rgba(255,229,0,.34)!important;border-top:4px solid var(--y)!important;background:linear-gradient(145deg,rgba(8,22,36,.98),rgba(3,12,22,.98))!important;padding:20px 16px!important;margin:4px 0 13px!important}
      #v044Start h2{font-size:24px;line-height:1;margin:7px 0 6px;text-transform:uppercase;letter-spacing:-.7px}
      #v044Start p{margin:0 0 15px;font-size:12px}
      .pitRefPrimary{display:grid;gap:8px}
      .pitRefAction{width:100%;min-height:58px;border:1px solid rgba(255,255,255,.15);background:var(--panel);color:var(--text);display:grid;grid-template-columns:42px 1fr 18px;align-items:center;gap:8px;text-align:left;padding:8px 12px;font-weight:900}
      .pitRefAction.primary{background:var(--y);color:#07101b;border-color:var(--y)}
      .pitRefAction .pitRefIcon{display:flex;align-items:center;justify-content:center}
      .pitRefAction small{display:block;font-weight:700;opacity:.7;margin-top:2px;font-size:10px}
      .pitRefArrow{font-size:24px;line-height:1;opacity:.65;text-align:right}
      .v044Catalogue{display:none!important;margin:0 0 14px!important;border-color:rgba(63,207,255,.35)!important}
      .v044Catalogue.ref-open{display:block!important}
      .pitRefCatalogueTop{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}
      .pitRefClose{border:1px solid rgba(255,255,255,.18);background:transparent;color:var(--text);padding:9px 11px;font-weight:900;text-transform:uppercase;font-size:9px;letter-spacing:.7px}
      .pitRefSectionTitle{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:18px 0 8px;color:var(--text);font-size:11px;font-weight:900;letter-spacing:1.6px;text-transform:uppercase}
      .pitRefSectionTitle span{color:var(--muted);font-size:9px;letter-spacing:.4px}
      #cars{display:grid;gap:8px;margin:0}
      #cars>.card{min-height:auto!important;padding:13px!important;border-color:rgba(255,255,255,.13)!important;background:linear-gradient(145deg,rgba(8,22,36,.98),rgba(3,12,22,.98))!important}
      #cars>.card h2,#cars>.card b{font-size:16px!important;margin:2px 0 4px!important}
      #cars>.card .actions{margin-top:9px!important}
      .pitRefTools{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .pitRefTool{border:1px solid rgba(255,255,255,.13);background:var(--panel);color:var(--text);min-height:92px;padding:13px;text-align:left;display:flex;flex-direction:column;justify-content:space-between;gap:10px}
      .pitRefTool .pitRefIcon{color:var(--c);display:flex}
      .pitRefTool b{display:block;font-size:13px}.pitRefTool small{display:block;color:var(--muted);font-size:9px;line-height:1.35;margin-top:3px}
      .pitRefExplore{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
      .pitRefExploreCard{border:1px solid rgba(255,255,255,.13);background:linear-gradient(145deg,rgba(8,22,36,.98),rgba(3,12,22,.98));color:var(--text);padding:14px;min-height:112px;text-align:left;position:relative;overflow:hidden}
      .pitRefExploreCard:before{content:"";position:absolute;left:0;top:0;width:42px;height:3px;background:var(--y)}
      .pitRefExploreCard:nth-child(2):before{background:var(--c)}
      .pitRefExploreCard b{font-size:15px;display:block;margin:24px 0 4px}.pitRefExploreCard small{color:var(--muted);font-size:9px;line-height:1.35}
      .v044Afileon{margin-top:12px!important}
      .pitMoreSheet{position:fixed;inset:0;z-index:500;display:none;background:rgba(0,0,0,.74);align-items:flex-end}
      .pitMoreSheet.show{display:flex}
      .pitMorePanel{width:100%;max-height:78vh;overflow:auto;background:var(--bg);border-top:3px solid var(--y);padding:18px 16px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -24px 70px rgba(0,0,0,.58)}
      .pitMorePanel h2{margin:0 0 13px;text-transform:uppercase;font-size:22px}
      .pitMoreGrid{display:grid;gap:8px}.pitMoreGrid button{min-height:54px;border:1px solid rgba(255,255,255,.14);background:var(--panel);color:var(--text);font-weight:900;text-align:left;padding:12px 14px}
      .pitMoreGrid button b{display:block}.pitMoreGrid button small{display:block;color:var(--muted);margin-top:3px}
      #garage #carName{display:none}
      @media(min-width:700px){.pitRefTabs{margin-left:-20px;margin-right:-20px}.pitRefPrimary{grid-template-columns:1fr 1fr}.pitRefTools{grid-template-columns:repeat(4,1fr)}.pitRefExplore{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(s);
  }

  function clickOld(go){
    const b=$(`.nav [data-go="${go}"]`)||$(`[data-go="${go}"]`);
    if(b){b.click();return true}
    const v=$(`#${go}`);if(!v)return false;
    $$('.view').forEach(x=>x.classList.toggle('active',x===v));
    return true;
  }
  function setTab(id){$$('.pitRefTab').forEach(b=>b.classList.toggle('on',b.dataset.refGo===id));}
  function go(id){
    $('#pitMoreSheet')?.classList.remove('show');
    if(id==='more'){ $('#pitMoreSheet')?.classList.add('show'); return; }
    clickOld(id);setTab(id);
    setTimeout(()=>window.scrollTo({top:0,behavior:'smooth'}),20);
  }

  function buildTabs(){
    if($('#pitRefTabs'))return;
    const top=$('.top');if(!top)return;
    const n=document.createElement('nav');n.id='pitRefTabs';n.className='pitRefTabs';
    n.innerHTML=`
      <button class="pitRefTab" data-ref-go="garage">${svg('garage')}<span>Garage</span></button>
      <button class="pitRefTab" data-ref-go="team">${svg('trophy')}<span>Motorsport</span></button>
      <button class="pitRefTab" data-ref-go="shop">${svg('shop')}<span>Shop</span></button>
      <button class="pitRefTab" data-ref-go="more">${svg('more')}<span>More</span></button>`;
    top.insertAdjacentElement('afterend',n);
    $$('.pitRefTab').forEach(b=>b.addEventListener('click',()=>go(b.dataset.refGo)));
  }

  function buildMore(){
    if($('#pitMoreSheet'))return;
    const m=document.createElement('div');m.id='pitMoreSheet';m.className='pitMoreSheet';
    m.innerHTML=`<div class="pitMorePanel"><h2>More</h2><div class="pitMoreGrid">
      <button data-more-go="track"><b>Track-day tools</b><small>GPS timing, sessions, saved laps and circuit tools.</small></button>
      <button data-more-go="home"><b>Dashboard & app updates</b><small>Personal bests, sessions and update status.</small></button>
      <button data-more-go="garage"><b>Garage</b><small>Your vehicles and technical reference data.</small></button>
      <button data-more-site><b>Afiléon Motorsport website</b><small>Services, bookings, partners and shop.</small></button>
      <button data-more-close><b>Close</b></button>
    </div></div>`;
    document.body.appendChild(m);
    m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('show')});
    m.querySelectorAll('[data-more-go]').forEach(b=>b.onclick=()=>go(b.dataset.moreGo));
    m.querySelector('[data-more-site]').onclick=()=>location.href='https://afileonmotorsport.co.uk';
    m.querySelector('[data-more-close]').onclick=()=>m.classList.remove('show');
  }

  function openCatalogue(target){
    const c=$('.v044Catalogue');if(!c)return;
    c.classList.add('ref-open');
    c.scrollIntoView({behavior:'smooth',block:'start'});
    setTimeout(()=>$(target)?.focus(),260);
  }
  function decorateGarage(){
    const g=$('#garage'),start=$('#v044Start');if(!g||!start)return false;
    g.classList.add('pitRefGarage');
    const oldManual=$('#carName')?.closest('.panel');if(oldManual)oldManual.style.display='none';
    if(!start.dataset.refDone){
      start.dataset.refDone='1';
      start.innerHTML=`<div class="eyebrow">YOUR GARAGE // START HERE</div><h2>Your cars. The right data.</h2><p class="muted">Search the vehicle catalogue or add any unlisted car. Pitlane keeps your own vehicles and useful track-day information together.</p><div class="pitRefPrimary"><button id="pitRefSearch" class="pitRefAction primary"><span class="pitRefIcon">${svg('search')}</span><span>Search vehicle catalogue<small>Find your make, model and reference data</small></span><span class="pitRefArrow">›</span></button><button id="pitRefAdd" class="pitRefAction"><span class="pitRefIcon">${svg('plus')}</span><span>Add an unlisted car<small>Enter any vehicle manually</small></span><span class="pitRefArrow">›</span></button></div>`;
      $('#pitRefSearch').onclick=()=>openCatalogue('#v044Search');
      $('#pitRefAdd').onclick=()=>openCatalogue('#vcCustomMake');
    }
    const cat=$('.v044Catalogue');
    if(cat&&!$('#pitRefCatalogueTop')){
      const t=document.createElement('div');t.id='pitRefCatalogueTop';t.className='pitRefCatalogueTop';
      t.innerHTML='<div class="eyebrow">VEHICLE CATALOGUE</div><button type="button" class="pitRefClose">← Back to garage</button>';
      cat.prepend(t);t.querySelector('button').onclick=()=>{cat.classList.remove('ref-open');start.scrollIntoView({behavior:'smooth',block:'start'});};
    }
    const cars=$('#cars');
    if(cars&&!$('#pitRefCarsTitle')){
      const h=document.createElement('div');h.id='pitRefCarsTitle';h.className='pitRefSectionTitle';h.innerHTML='<b>My vehicles</b><span>Your saved garage</span>';cars.insertAdjacentElement('beforebegin',h);
    }
    if(cars&&!$('#pitRefTools')){
      const tools=document.createElement('div');tools.id='pitRefTools';
      tools.innerHTML=`<div class="pitRefSectionTitle"><b>Quick tools</b><span>Reference & track</span></div><div class="pitRefTools">
        <button class="pitRefTool" data-tool="pressure"><span class="pitRefIcon">${svg('tyre')}</span><span><b>Tyre pressures</b><small>Select a car to view reference pressures.</small></span></button>
        <button class="pitRefTool" data-tool="torque"><span class="pitRefIcon">${svg('wrench')}</span><span><b>Wheel torque</b><small>Check saved or catalogue torque data.</small></span></button>
        <button class="pitRefTool" data-tool="notes"><span class="pitRefIcon">${svg('note')}</span><span><b>Notes & setup</b><small>Open your track session setup tools.</small></span></button>
        <button class="pitRefTool" data-tool="track"><span class="pitRefIcon">${svg('flag')}</span><span><b>Track-day tools</b><small>Timing, laps and circuit sessions.</small></span></button>
      </div>`;
      cars.insertAdjacentElement('afterend',tools);
      tools.querySelector('[data-tool="pressure"]').onclick=()=>openCatalogue('#v044Search');
      tools.querySelector('[data-tool="torque"]').onclick=()=>openCatalogue('#v044Search');
      tools.querySelector('[data-tool="notes"]').onclick=()=>go('track');
      tools.querySelector('[data-tool="track"]').onclick=()=>go('track');
    }
    const tools=$('#pitRefTools');
    if(tools&&!$('#pitRefExplore')){
      const e=document.createElement('div');e.id='pitRefExplore';
      e.innerHTML=`<div class="pitRefSectionTitle"><b>Explore Afiléon</b><span>Motorsport & shop</span></div><div class="pitRefExplore"><button class="pitRefExploreCard" data-exp="team"><b>Afiléon Motorsport</b><small>Race programme, track support, vehicle services and partners.</small></button><button class="pitRefExploreCard" data-exp="shop"><b>Shop</b><small>Merchandise and Afiléon Motorsport products.</small></button></div>`;
      tools.insertAdjacentElement('afterend',e);
      e.querySelector('[data-exp="team"]').onclick=()=>go('team');
      e.querySelector('[data-exp="shop"]').onclick=()=>go('shop');
    }
    return true;
  }

  function install(){
    addStyles();buildTabs();buildMore();
    if(!decorateGarage())return false;
    if(!sessionStorage.getItem('pitlaneRefLayoutSeen')){
      sessionStorage.setItem('pitlaneRefLayoutSeen','1');
      go('garage');
    } else {
      const active=$('.view.active')?.id||'garage';
      setTab(['garage','team','shop'].includes(active)?active:'more');
    }
    return true;
  }

  let tries=0;
  const timer=setInterval(()=>{tries++;if(install()||tries>50)clearInterval(timer)},100);
  new MutationObserver(()=>{if($('#v044Start'))decorateGarage()}).observe(document.documentElement,{childList:true,subtree:true});
})();
