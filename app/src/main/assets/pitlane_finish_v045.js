(()=>{
const KEY='afileon-pitlane-native-v2';
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function read(){try{return JSON.parse(localStorage.getItem(KEY))||{cars:[]}}catch{return {cars:[]}}}
function write(d){localStorage.setItem(KEY,JSON.stringify(d))}

function research(name){
  const n=String(name||'').trim();
  if(!n)return;
  const q=encodeURIComponent(`${n} owner manual tyre pressure wheel torque`);
  location.href=`https://www.google.com/search?q=${q}`;
}

function enhanceModelBox(){
  const box=$('#v044ModelBox.show');
  if(!box)return;
  const actions=box.querySelector('#v044ModelActions');
  const name=box.querySelector('h2')?.textContent?.trim();
  if(actions&&name&&!actions.querySelector('[data-v045-research]')){
    const b=document.createElement('button');
    b.type='button';b.className='btn alt';b.dataset.v045Research='1';b.textContent='Research / verify this car';
    b.addEventListener('click',()=>research(name));
    const back=actions.querySelector('#v044Back');
    if(back)actions.insertBefore(b,back);else actions.appendChild(b);
  }
  const back=box.querySelector('#v044Back');
  if(back)back.textContent='← Back / search another car';
}

function refreshGarage(){
  const home=document.querySelector('[data-go="home"]');
  const garage=document.querySelector('[data-go="garage"]');
  if(home&&garage){home.click();setTimeout(()=>garage.click(),30)}
}

function enhanceSavedCars(){
  const root=$('#cars');if(!root)return;
  const cards=[...root.querySelectorAll('.card.v044Saved')];
  const d=read();
  cards.forEach((card,index)=>{
    if(card.querySelector('[data-v045-card-actions]'))return;
    const car=(d.cars||[])[index];
    const name=car?.name||card.querySelector('h2')?.textContent?.trim()||'';
    const actions=document.createElement('div');actions.className='actions';actions.dataset.v045CardActions='1';
    actions.innerHTML=`<button type="button" class="btn alt" data-v045-card-research>Research / verify</button><button type="button" class="btn ghost" data-v045-card-remove>Remove</button>`;
    actions.querySelector('[data-v045-card-research]')?.addEventListener('click',()=>research(name));
    actions.querySelector('[data-v045-card-remove]')?.addEventListener('click',()=>{
      if(!confirm(`Remove ${name||'this vehicle'} from your Garage?`))return;
      const now=read();now.cars=now.cars||[];
      if(index>=0&&index<now.cars.length)now.cars.splice(index,1);
      write(now);
      const h=$('#hCars');if(h)h.textContent=now.cars.length;
      refreshGarage();
    });
    card.appendChild(actions);
  });
}

function handleBack(){
  const model=$('#v044ModelBox.show');
  if(model){
    const back=model.querySelector('#v044Back');
    if(back){back.click();return true}
  }
  const drop=$('#v044Drop.show');
  if(drop){drop.classList.remove('show');return true}
  const active=$('.view.active');
  if(active&&active.id&&active.id!=='home'){
    const home=document.querySelector('[data-go="home"]');
    if(home){home.click();return true}
  }
  return false;
}
window.AfileonPitlaneHandleBack=handleBack;

function enhance(){enhanceModelBox();enhanceSavedCars()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance);else enhance();
let queued=false;
new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance()})}).observe(document.documentElement,{childList:true,subtree:true});
})();

(()=>{
  const id='pitlane-lb-service-v046';
  if(document.getElementById(id))return;
  const s=document.createElement('script');
  s.id=id;
  s.src='https://appassets.androidplatform.net/assets/leaderboard_service_v046.js';
  document.body.appendChild(s);
})();
