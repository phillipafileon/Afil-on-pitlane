(()=>{
  const DATA_KEY='afileon-pitlane-native-v2';
  const CACHE_KEY='pitlane-global-leaderboards-v2';
  const BEST_SENT_KEY='pitlane-leaderboard-best-sent-v1';
  const SHORT_FLOOR=38032;
  const GP_FLOOR=62939;
  const API_PATH='/api/pitlane/submit';
  const realFetch=window.fetch.bind(window);
  const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
  const readJSON=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
  const writeJSON=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const synthetic=(body,status=202)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}));
  const isGP=layout=>/(grand\s*prix|\bgp\b|international|nordschleife|combined)/i.test(String(layout||''));
  const fallbackFloor=layout=>isGP(layout)?GP_FLOOR:SHORT_FLOOR;

  function referenceFor(track,layout){
    const lb=readJSON(CACHE_KEY,null),refs=lb?.references||{};
    const tk=Object.keys(refs).find(k=>norm(k)===norm(track));if(!tk)return null;
    const ls=refs[tk]||{};const lk=Object.keys(ls).find(k=>norm(k)===norm(layout));
    return lk?ls[lk]:null;
  }

  function minimumFor(track,layout){
    const ref=referenceFor(track,layout);
    if(ref&&Number.isFinite(Number(ref.record_ms)))return {ms:Number(ref.record_ms),kind:'verified',ref};
    return {ms:fallbackFloor(layout),kind:isGP(layout)?'gp-fallback':'short-fallback',ref:null};
  }

  function profileConfirmed(d,track,layout){
    const key=`${norm(track)}|${norm(layout)}`;
    return !!d?.trackProfiles?.[key]?.confirmed;
  }

  function localBestFor(track,layout){
    const d=readJSON(DATA_KEY,{});let best=null;
    if(!profileConfirmed(d,track,layout))return null;
    const floor=minimumFor(track,layout).ms;
    for(const s of (d.sessions||[])){
      if(norm(s.track)!==norm(track)||norm(s.layout)!==norm(layout)||norm(s.source)!=='gps')continue;
      for(let i=0;i<(s.laps||[]).length;i++){
        const l=s.laps[i];
        if(!l||typeof l!=='object'||norm(l.source)!=='gps'||l.status!=='valid'||!Number.isFinite(Number(l.ms)))continue;
        const ms=Number(l.ms);if(ms<floor)continue;
        const id=l.id||`${s.id}-${i}`;
        if(!best||ms<best.ms)best={id,ms};
      }
    }
    return best;
  }

  async function parseSubmission(resource,options){
    let url='',method='GET',body=null;
    if(typeof resource==='string')url=resource;else if(resource?.url)url=resource.url;
    method=String(options?.method||resource?.method||'GET').toUpperCase();
    if(method!=='POST'||!url.includes(API_PATH))return null;
    body=options?.body;
    if(typeof body!=='string')return null;
    try{return {url,method,payload:JSON.parse(body),options:{...(options||{})}}}catch{return null}
  }

  window.fetch=async function(resource,options){
    const sub=await parseSubmission(resource,options);
    if(!sub)return realFetch(resource,options);
    const p=sub.payload||{};

    // First gate: never send manual or malformed laps to the network.
    if(norm(p.source)!=='gps'||p.status!=='valid'||p.profile_confirmed!==true||!Number.isFinite(Number(p.lap_ms))){
      return synthetic({ok:true,local_filtered:true,reason:'gps_only'},202);
    }

    // Second gate: do the same plausibility check locally before Cloudflare sees the request.
    const min=minimumFor(p.track,p.layout);
    if(Number(p.lap_ms)<min.ms){
      return synthetic({error:'faster_than_reference_record',local_filtered:true,minimum_ms:min.ms,minimum_kind:min.kind},422);
    }

    // Third gate: only the driver's current plausible personal best for this track/layout is worth uploading.
    // All slower laps are consumed locally and never touch the website/API.
    const localBest=localBestFor(p.track,p.layout);
    if(!localBest||Number(p.lap_ms)!==Number(localBest.ms)){
      return synthetic({ok:true,local_filtered:true,reason:'not_personal_best'},202);
    }

    // Fourth gate: once a PB has already been sent, only a genuinely faster PB can create another request.
    const bestSent=readJSON(BEST_SENT_KEY,{}),key=`${norm(p.track)}|${norm(p.layout)}`;
    const previous=Number(bestSent[key]);
    if(Number.isFinite(previous)&&Number(p.lap_ms)>=previous){
      return synthetic({ok:true,local_filtered:true,reason:'already_sent_equal_or_faster'},202);
    }

    // Keep the app version accurate even though the older leaderboard module builds the request body.
    p.app_version='0.3.6-test';
    sub.options.body=JSON.stringify(p);

    const response=await realFetch(resource,sub.options);
    if(response.ok||response.status===409){
      bestSent[key]=Number(p.lap_ms);writeJSON(BEST_SENT_KEY,bestSent);
    }
    return response;
  };

  // Small visible explanation on the leaderboard page when it exists.
  function addNote(){
    const panels=[...document.querySelectorAll('.panel')];
    const rules=panels.find(x=>x.querySelector('.eyebrow')?.textContent.trim()==='SUBMISSION RULES');
    if(!rules||rules.querySelector('[data-v036-local-filter]'))return;
    const p=document.createElement('p');p.className='tiny';p.dataset.v036LocalFilter='1';
    p.textContent='Pitlane validates laps on the phone first. Impossible times, manual laps and slower duplicate laps are discarded locally; only a new plausible GPS personal best is sent to the leaderboard service.';
    rules.appendChild(p);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addNote);else addNote();
  new MutationObserver(addNote).observe(document.documentElement,{childList:true,subtree:true});
})();
