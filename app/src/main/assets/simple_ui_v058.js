(()=>{
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const ALLOWED_NAV=new Set(['home','track','garage','liveServices','more']);

function go(id){
  $('.view').forEach(v=>v.classList.toggle('active',v.id===id));
  const navId=ALLOWED_NAV.has(id)?id:'more';
  $('.nav button').forEach(b=>b.classList.toggle('on',b.dataset.go===navId));
  if(id==='liveServices')setTimeout(()=>simplifyBooking(),40);
}

function makeDetails(panel,label){
  if(!panel||panel.tagName==='DETAILS'||panel.dataset.simpleWrapped)return panel;
  const d=document.createElement('details');
  d.className=(panel.className||'panel')+' compactDrop';
  d.style.marginTop=panel.style.marginTop||'10px';
  d.dataset.simpleWrapped='1';
  const summary=document.createElement('summary');summary.textContent=label;
  const inner=document.createElement('div');inner.className='compactInner';
  while(panel.firstChild)inner.appendChild(panel.firstChild);
  d.append(summary,inner);panel.replaceWith(d);return d;
}

function simplifyHome(){
  const home=$('#home');if(!home)return;
  [...home.querySelectorAll('.panel')].forEach(p=>{
    if((p.querySelector('.eyebrow')?.textContent||'').trim()==='PRIVACY BY DESIGN')p.remove();
  });
  [...home.querySelectorAll('.grid')].forEach(g=>{
    const promo=g.querySelector('[data-go="team"],[data-go="shop"],[data-live-book]');
    if(promo&&g.querySelectorAll('.stat').length===0)g.remove();
  });
}

function simplifyTrack(){
  const laps=$('#laps');
  if(laps){
    const panel=laps.closest('.panel');
    if(panel&&panel.tagName!=='DETAILS')makeDetails(panel,'Lap history');
  }
  [...document.querySelectorAll('#track .panel')].forEach(p=>{
    const eyebrow=(p.querySelector('.eyebrow')?.textContent||'').trim();
    if(eyebrow==='HOW CIRCUIT LEARNING WORKS')makeDetails(p,'How circuit learning works');
  });
  const manual=$('#openManual');
  if(manual&&!manual.closest('details')){
    const actions=manual.closest('.actions');
    const d=document.createElement('details');d.className='panel compactDrop';d.style.marginTop='10px';
    const summary=document.createElement('summary');summary.textContent='Other timing options';
    const inner=document.createElement('div');inner.className='compactInner';
    const p=document.createElement('p');p.className='muted';p.textContent='Manual timing is for a passenger, pit crew member, or stationary use only.';
    inner.append(p,manual);d.append(summary,inner);
    actions?.insertAdjacentElement('afterend',d);
    if(actions&&!actions.querySelector('button'))actions.remove();
  }
}

function simplifyGarage(){
  const garage=$('#garage');if(!garage)return;
  const panel=[...garage.children].find(x=>x.classList?.contains('panel')&&x.querySelector('#carName'));
  if(panel&&panel.tagName!=='DETAILS')makeDetails(panel,'Add a car');
  if(!garage.querySelector('.pageIntro')){
    const p=document.createElement('p');p.className='pageIntro';p.textContent='Your saved cars are shown here. Open “Add a car” only when you need it.';
    garage.querySelector('h1')?.insertAdjacentElement('afterend',p);
  }
}

function bindMore(){
  $$('[data-simple-go]').forEach(b=>{
    if(b.dataset.simpleBound)return;b.dataset.simpleBound='1';
    b.addEventListener('click',()=>go(b.dataset.simpleGo));
  });
}

function moveTimesIntoMore(){
  const navTimes=$('.nav [data-go="leaderboards"]'),menu=$('#simpleMoreMenu');
  if(!navTimes||!menu)return;
  navTimes.className='simpleMenuItem';
  navTimes.innerHTML='<b>Lap times & rankings</b><span>View your saved times and the public leaderboard.</span>';
  if(!navTimes.dataset.simpleMoreBound){
    navTimes.dataset.simpleMoreBound='1';
    navTimes.addEventListener('click',()=>setTimeout(()=>$('.nav [data-go="more"]')?.classList.add('on'),0));
  }
  menu.prepend(navTimes);
}

function cleanNav(){
  $$('.nav button').forEach(b=>{
    if(!ALLOWED_NAV.has(b.dataset.go)&&b.dataset.go!=='leaderboards')b.remove();
  });
  moveTimesIntoMore();
}

function moveUpdate(){
  const p=$('#pitlaneUpdatePanel'),mount=$('#pitlaneUpdateMount');
  if(p&&mount&&p.parentElement!==mount)mount.appendChild(p);
}

function findDatePanel(){
  const cal=$('#lsCalendar');if(!cal)return null;
  const panel=cal.closest('.panel');if(panel&&!panel.id)panel.id='lsDatePanel';
  if(panel)panel.classList.remove('lsHidden');
  return panel;
}
function bookingStep(n){
  const date=findDatePanel(),services=$('#lsServicePanel'),details=$('#lsDetailsPanel');
  if(date)date.classList.remove('lsHidden');
  if(services)services.classList.toggle('lsHidden',n!==2);
  if(details)details.classList.toggle('lsHidden',n!==3);
  $$('.lsSteps span').forEach((x,i)=>x.classList.toggle('on',i<n));
  const target=n===1?date:n===2?services:details;
  target?.scrollIntoView({block:'start',behavior:'smooth'});
}
function simplifyBooking(){
  const root=$('#liveServices');if(!root)return;
  const date=findDatePanel(),services=$('#lsServicePanel'),details=$('#lsDetailsPanel');
  if(!date||!services||!details)return;
  if(!$('#lsBackDate')){
    const b=document.createElement('button');b.id='lsBackDate';b.type='button';b.className='lsWizardBack';b.textContent='← Change date';b.onclick=()=>bookingStep(1);services.prepend(b);
  }
  if(!$('#lsBackService')){
    const b=document.createElement('button');b.id='lsBackService';b.type='button';b.className='lsWizardBack';b.textContent='← Change service';b.onclick=()=>bookingStep(2);details.prepend(b);
  }
  const notes=$('#lsNotes');
  if(notes&&!notes.closest('details')){
    const label=notes.closest('label');
    if(label){
      const d=document.createElement('details');d.className='compactDrop';
      const sm=document.createElement('summary');sm.textContent='Notes (optional)';
      const inner=document.createElement('div');inner.className='compactInner';
      label.replaceWith(d);inner.appendChild(label);d.append(sm,inner);
    }
  }
  if(!root.dataset.simpleWizard){
    root.dataset.simpleWizard='1';
    root.addEventListener('click',e=>{
      if(e.target.closest?.('[data-date]'))setTimeout(()=>bookingStep(2),40);
      if(e.target.closest?.('[data-service]'))setTimeout(()=>bookingStep(3),40);
    },true);
    const hasService=!!$('#lsSummary')?.textContent?.trim()&&!/Choose a date/i.test($('#lsSummary')?.textContent||'');
    bookingStep(hasService?3:$('.lsDay.selected')?2:1);
    date.classList.remove('lsHidden');
    const cal=$('#lsCalendar'); if(cal&&!cal.children.length){ setTimeout(()=>{ try{ window.dispatchEvent(new Event('resize')); }catch(e){} },100); }
  }
}

function apply(){
  simplifyHome();simplifyTrack();simplifyGarage();bindMore();cleanNav();moveUpdate();simplifyBooking();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);else apply();
let queued=false;
new MutationObserver(()=>{
  if(queued)return;queued=true;
  requestAnimationFrame(()=>{queued=false;apply()});
}).observe(document.documentElement,{childList:true,subtree:true});
})();