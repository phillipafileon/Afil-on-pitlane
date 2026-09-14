(()=>{
const API='https://afileon-live-api-production.up.railway.app';
const originalFetch=window.fetch.bind(window);
let cfg={services:[],cancellation_note:''};
const $=s=>document.querySelector(s);

function currentService(){
 const text=$('#lsSummary')?.textContent||'';
 return cfg.services.find(s=>text.includes(s.name))||null;
}
function selectedDate(){return $('.lsDay.selected')?.dataset?.date||'';}
function status(msg,state='warn'){
 const e=$('#lsStatus');if(!e)return;
 e.style.display='block';e.className=`status ${state}`;e.textContent=msg;
}

window.fetch=async function(resource,options={}){
 const url=typeof resource==='string'?resource:(resource?.url||'');
 if(url.startsWith(`${API}/api/config`)){
   const r=await originalFetch(resource,options);
   try{
     const j=await r.clone().json();
     if(Array.isArray(j.services)){
       j.services=j.services.map(s=>s.id==='vehicle_hire_day'&&s.bookable===false?{...s,description:`Online booking is not open yet. ${s.description||''}`} : s);
     }
     cfg=j||cfg;
     return new Response(JSON.stringify(j),{status:r.status,statusText:r.statusText,headers:r.headers});
   }catch{return r}
 }
 if(url.includes('/api/bookings/hold')&&String(options?.method||'GET').toUpperCase()==='POST'&&options?.body){
   try{
     const b=JSON.parse(options.body);
     if(b.service_id==='pre_track_inspection')b.safe_work_area_confirmed=!!$('#lsSafeWorkArea')?.checked;
     options={...options,body:JSON.stringify(b)};
   }catch{}
 }
 return originalFetch(resource,options);
};

function enhanceRules(){
 const rules=$('#lsRules'),summary=$('#lsSummary'),button=$('#lsContinue');
 if(!rules||!summary||!button)return;
 const s=currentService();
 if(!s)return;
 if(s.id==='pre_track_inspection'&&!$('#lsSafeWorkArea')){
   const row=document.createElement('label');row.className='checkrow';row.style.marginTop='10px';
   row.innerHTML='<input id="lsSafeWorkArea" type="checkbox" style="width:auto;margin:2px 0 0"> <span>I confirm the vehicle will be on safe, level, off-road hardstanding with enough working room to jack the car and remove wheels.</span>';
   rules.appendChild(row);
 }
 if(s.id==='track_day_support'&&!$('#lsSupportScopeV048')){
   const n=document.createElement('div');n.id='lsSupportScopeV048';n.className='lsNotice';
   n.innerHTML='<b>What the support rate covers.</b> Your booked attendance, tools, routine checks, tyre-pressure adjustments, wheel changes, minor adjustments and basic fault finding. Parts, tyres, fluids, fuel, major repairs and fabrication are extra. Travel or circuit-specific extras are agreed before payment where applicable.';
   rules.appendChild(n);
 }
 if(s.id==='vehicle_hire_day'&&s.bookable===false){
   button.textContent='Contact us about E46 hire';
   if(!$('#lsHireNotLiveV048')){
     const n=document.createElement('div');n.id='lsHireNotLiveV048';n.className='lsNotice';
     n.innerHTML='<b>E46 online booking is not open yet.</b> The package and planned price are shown so customers can see what is coming, but payment will not be taken until the vehicle, testing and commercial arrangements are ready.';
     rules.appendChild(n);
   }
 }
 if(cfg.cancellation_note&&!$('#lsCancelNoteV048')){
   const n=document.createElement('div');n.id='lsCancelNoteV048';n.className='lsNotice';n.textContent=cfg.cancellation_note;rules.appendChild(n);
 }
}

async function requestQuote(s){
 const payload={
   service_id:s.id,
   variant_id:s.variants?.[0]?.id||'quote',
   requested_date:selectedDate(),
   customer_name:$('#lsName')?.value?.trim()||'',
   customer_email:$('#lsEmail')?.value?.trim()||'',
   customer_phone:$('#lsPhone')?.value?.trim()||'',
   vehicle_details:$('#lsVehicle')?.value?.trim()||'',
   service_address:$('#lsAddress')?.value?.trim()||'',
   postcode:$('#lsPostcode')?.value?.trim()||'',
   notes:$('#lsNotes')?.value?.trim()||''
 };
 if(!payload.customer_name||!payload.customer_email){status('Please enter your name and email so we can reply to the quote request.','bad');return;}
 try{
   const r=await originalFetch(`${API}/api/quotes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const j=await r.json();
   if(!r.ok){status(j.error||'Could not send the quote request.','bad');return;}
   status(`Quote request received — reference ${j.quote_id}. The date is not blocked until Afiléon Motorsport confirms the quote.`,'ok');
 }catch{status('Could not reach the quote service. Please try again when online.','bad')}
}

document.addEventListener('click',e=>{
 const b=e.target.closest?.('#lsContinue');if(!b)return;
 const s=currentService();if(!s)return;
 if(s.bookable===false){
   e.preventDefault();e.stopImmediatePropagation();
   status('Online booking is not open for this service yet. Opening an email so you can register your interest.','warn');
   location.href=`mailto:contact@afileonmotorsport.co.uk?subject=${encodeURIComponent('Afiléon E46 hire enquiry')}`;
   return;
 }
 if(s.variants?.every(v=>v.price==null)){
   e.preventDefault();e.stopImmediatePropagation();requestQuote(s);
 }
},true);

let q=false;
new MutationObserver(()=>{if(q)return;q=true;requestAnimationFrame(()=>{q=false;enhanceRules()})}).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhanceRules);else enhanceRules();
})();
