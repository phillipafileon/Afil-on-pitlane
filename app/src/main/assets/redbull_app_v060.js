/* Afiléon Pitlane v0.6.0 — nav reliability + icon support. Safe to load alongside all earlier patches. */
(()=>{
const NAVBTN='.nav button';
const ICONS={leaderboards:'M7 4h10v3a5 5 0 0 1-4 4.9V15h3v2H8v-2h3v-3.1A5 5 0 0 1 7 7zM4 5h2v2a3 3 0 0 1-2-2zm16 0h-2v2a3 3 0 0 0 2-2zM8 19h8v2H8z'};
function views(){return [...document.querySelectorAll('.view')]}
function showView(id){
  const v=document.getElementById(id); if(!v||!v.classList.contains('view'))return false;
  views().forEach(x=>x.classList.toggle('active',x===v));
  document.querySelectorAll(NAVBTN).forEach(b=>b.classList.toggle('on',b.dataset.go===id));
  return true;
}
document.addEventListener('click',e=>{
  const b=e.target.closest&&e.target.closest(NAVBTN); if(!b)return;
  try{navigator.vibrate&&navigator.vibrate(8)}catch(_){}
  const id=b.dataset.go; if(!id)return;
  setTimeout(()=>{
    const v=document.getElementById(id);
    if(v&&!v.classList.contains('active'))showView(id);
    window.scrollTo({top:0,behavior:'smooth'});
  },60);
},true);
function decorate(){
  document.querySelectorAll(NAVBTN).forEach(b=>{
    if(b.querySelector('svg')){return}
    const label=(b.textContent||'').trim(); const d=ICONS[b.dataset.go]; if(!d||!label)return;
    b.setAttribute('aria-label',label);
    b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="'+d+'"/></svg><span>'+label+'</span>';
  });
}
decorate();
new MutationObserver(decorate).observe(document.querySelector('.nav')||document.body,{childList:true,subtree:true});
})();
