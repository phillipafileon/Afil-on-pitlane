// Dedicated Essential Trackside Support: run LAST, after existing runtime patches.
const fs=require('fs');
const path='server_v3.js';
let s=fs.readFileSync(path,'utf8');
if(s.includes("id: 'essential_trackside_support'")){console.log('Essential already present');process.exit(0)}
function change(from,to,label){if(!s.includes(from))throw Error('Essential booking: missing '+label);s=s.replace(from,to)}
const essential=`  {
    id: 'essential_trackside_support',
    name: 'Essential Trackside Support',
    colour: '#23d5dc',
    duration: 'full_day',
    variants: [
      { id: 'half_day', label: 'Half day', price: 10500 },
      { id: 'full_day', label: 'Full day', price: 17500 }
    ],
    payment: 'full',
    kentOnly: true,
    travelMode: 'venue',
    travelRatePencePerMile: 20,
    bookable: true,
    description: 'Routine checks for one customer vehicle: tyre pressures, oil and coolant levels, single-point tread depth per tyre, and wheel-fastener torque checks using suitable specifications and a calibrated torque wrench. Brief reading record. No brake inspections, repairs, gazebo or refreshments. Circuit entry excluded.'
  },
`;
change("  {\n    id: 'track_day_support',",essential+"  {\n    id: 'track_day_support',",'full-support service');
const a=s.indexOf("    id: 'track_day_support',"),b=s.indexOf('  },',a);
if(a<0||b<0)throw Error('Essential booking: full service block missing');
let full=s.slice(a,b).replace(/name: '[^']+'/ ,"name: 'Full Trackside Support'");
full=full.replace(/description: '[^']*'/,"description: 'Everything in Essential, plus three-point tyre tread measurements, detailed brake/pad inspections, brake and coolant temperature observations, agreed minor mechanical work, covered paddock area and basic refreshments. Parts, consumables, major repairs and event admission are extra.'");
s=s.slice(0,a)+full+s.slice(b);
if(!s.includes('pg_advisory_xact_lock(hashtext($1))')||!s.includes('FROM bookings WHERE booking_date=$1 AND'))throw Error('Essential booking: date-wide calendar lock not verified');
const prior='service_id=$2 OR EXISTS (SELECT 1 FROM availability_blocks legacy';
if(!s.includes(prior))throw Error('Essential booking: shared-block checks missing');
s=s.split(prior).join("service_id=$2 OR (service_id IN ('track_day_support','essential_trackside_support') AND $2 IN ('track_day_support','essential_trackside_support')) OR EXISTS (SELECT 1 FROM availability_blocks legacy");
const anchor="app.get('/api/availability'";
const overlay=`// ESSENTIAL_TRACKSIDE_BOOKING_V1
app.use('/api/availability',(req,res,next)=>{
 const original=res.json.bind(res);
 res.json=body=>{
  if(body&&Array.isArray(body.busy)){const more=[];
   for(const row of body.busy){
    if(row.status!=='blocked')continue;
    if(row.service_id==='track_day_support')more.push({...row,service_id:'essential_trackside_support',kind:'shared_trackside_block'});
    if(row.service_id==='essential_trackside_support')more.push({...row,service_id:'track_day_support',kind:'shared_trackside_block'});
   }body.busy.push(...more);
  }return original(body);
 };next();
});
`;
change(anchor,overlay+anchor,'public availability feed');
s=s.replaceAll("['track_day_support','race_day_support','full_package']","['track_day_support','essential_trackside_support','race_day_support','full_package']");
s=s.replaceAll("b.service_id==='track_day_support'||b.service_id==='race_day_support'","b.service_id==='track_day_support'||b.service_id==='essential_trackside_support'||b.service_id==='race_day_support'");
s=s.replaceAll("serviceId==='track_day_support'||serviceId==='race_day_support'","serviceId==='track_day_support'||serviceId==='essential_trackside_support'||serviceId==='race_day_support'");
s=s.replaceAll("track_support:'2026-09-19-v1'","track_support:'2026-10-26-v4'");
fs.writeFileSync(path,s);
console.log('Installed Essential Trackside Support with separate Stripe service identity and server-priced variants.');