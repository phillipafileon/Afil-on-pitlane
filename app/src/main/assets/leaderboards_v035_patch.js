(()=>{
  const SHORT_FLOOR=38032;
  const GP_FLOOR=62939;
  const fmt=ms=>{const m=Math.floor(ms/60000),s=(ms%60000)/1000;return `${m}:${s.toFixed(3).padStart(6,'0')}`};
  const isGP=layout=>/(grand\s*prix|\bgp\b|international|nordschleife|combined)/i.test(String(layout||''));

  function patchRules(){
    const panels=[...document.querySelectorAll('.panel')];
    const p=panels.find(x=>x.querySelector('.eyebrow')?.textContent.trim()==='SUBMISSION RULES');
    if(!p)return;
    const ps=p.querySelectorAll('p');
    if(ps[0])ps[0].innerHTML='<b>GPS only.</b> Manual laps never upload. A lap must come from automatic Pitlane GPS timing, use a confirmed circuit profile, have a valid leaderboard name and pass the anti-cheat time floor.';
    if(ps[1])ps[1].textContent='If an exact verified circuit/layout record exists, that record is the minimum possible accepted time. If no exact record exists yet, Pitlane uses a global fallback floor: 0:38.032 for Short/Indy-style layouts and 1:02.939 for Grand Prix/long layouts.';
  }

  function patchDetail(){
    document.querySelectorAll('.lbLayout').forEach(section=>{
      const layout=section.querySelector('.pill')?.textContent?.trim()||'';
      const record=section.querySelector('.lbRecord');
      if(!record)return;
      if(/not verified yet|public submissions are held/i.test(record.textContent)){
        const gp=isGP(layout), floor=gp?GP_FLOOR:SHORT_FLOOR;
        record.innerHTML=`<b>No exact verified ${gp?'Grand Prix/long':'Short/Indy'} record yet.</b> Pitlane accepts GPS laps at or above the global safety floor of ${fmt(floor)}. Faster times are rejected.`;
      }
    });
  }

  function patchAll(){patchRules();patchDetail()}
  function hook(){
    patchAll();
    const root=document.body;
    new MutationObserver(()=>requestAnimationFrame(patchAll)).observe(root,{childList:true,subtree:true,characterData:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook);else hook();
})();
