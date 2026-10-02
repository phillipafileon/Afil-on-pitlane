/* Afiléon Pitlane v0.6.1 — cyberpunk glitch. Safe to load after redbull_app_v060.js.
   - Screen titles glitch in when you open a screen.
   - While scrolling (up OR down) there is a small random chance that ONE card/stat/panel glitches.
   - Never touches the lap timer screen, timers, the lap button, forms, modals or the Terms & Safety notice. */
(()=>{
const root=document.documentElement;
if(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches)return;
root.classList.add('gx');
const P=0.15,MAX=4,GAP=6000,GRACE=2500,STEP=300;
const start=Date.now();let last=0,count=0,busy=false;
const pick=a=>a[Math.floor(Math.random()*a.length)];
function glitch(el,v){
  const c='gl-'+v;el.classList.remove('gl-shake','gl-tear','gl-flicker');void el.offsetWidth;el.classList.add(c);
  setTimeout(()=>el.classList.remove(c),v==='flicker'?950:750);
}
/* 1. titles glitch in when a screen opens (and once at launch) */
function titleOf(view){return view&&view.querySelector('h1,h2')}
function titleGlitch(view){
  const h=titleOf(view);if(!h)return;
  h.classList.remove('gl-title');void h.offsetWidth;h.classList.add('gl-title');
  const off=()=>h.classList.remove('gl-title');
  h.addEventListener('animationend',e=>{if(/cpa-title/.test(e.animationName))off()},{once:true});
  setTimeout(off,1600);
}
const views=[...document.querySelectorAll('.view')];
views.forEach(v=>new MutationObserver(()=>{if(v.classList.contains('active'))titleGlitch(v)}).observe(v,{attributes:true,attributeFilter:['class']}));
titleGlitch(document.querySelector('.view.active'));
/* 2. random glitch while scrolling in either direction */
const SAFE='.panel,.stat,.card,.trackCard,.hero,h2';
function eligible(el){
  if(el.closest('#track,.timer,.timers,.bigLap,.overlay,.modal,.manualOverlay,.top,.nav,form'))return false;
  if(el.querySelector('input,select,textarea,.timer,.bigLap'))return false;
  return el.offsetHeight>0&&el.offsetHeight<520;
}
const blocked=()=>!!document.querySelector('.overlay.show,.manualOverlay.show,.manualOverlay[style*="flex"]');
function visible(){
  return [...document.querySelectorAll('.view.active '+SAFE.split(',').join(',.view.active '))].filter(el=>{
    if(!eligible(el))return false;
    const r=el.getBoundingClientRect(),seen=Math.min(r.bottom,innerHeight)-Math.max(r.top,0);
    return seen>0&&seen>=Math.min(r.height,innerHeight)*.5;
  });
}
function roll(){
  const now=Date.now();
  if(busy||blocked()||now-start<GRACE||now-last<GAP||count>=MAX||Math.random()>P)return;
  const v=visible();if(!v.length)return;
  const el=pick(v);busy=true;
  setTimeout(()=>{
    const r=el.getBoundingClientRect();
    if(r.bottom>0&&r.top<innerHeight&&!blocked()){
      const noTear=el.matches('.hero');
      glitch(el,el.tagName==='H2'?pick(['shake','shake','flicker']):pick(noTear?['shake','flicker']:['shake','tear','flicker']));
      last=Date.now();count++;
      if(Math.random()<.25)setTimeout(()=>glitch(el,'shake'),950);
    }
    setTimeout(()=>{busy=false},1300);
  },120+Math.random()*450);
}
let travel=0,lastY=window.scrollY||0;
addEventListener('scroll',()=>{const y=window.scrollY||0;travel+=Math.abs(y-lastY);lastY=y;if(travel>=STEP){travel=0;roll()}},{passive:true});
/* the header logo occasionally glitches on its own */
const logo=document.querySelector('.header-logo');
if(logo&&Math.random()<.4)setTimeout(()=>glitch(logo,'shake'),6000+Math.random()*16000);
})();