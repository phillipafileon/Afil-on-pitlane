// This sends fake booking holds to localhost ONLY; no actual customer data.
import assert from "node:assert/strict";
const base="http://127.0.0.1:8788";
async function req(path,body) {
 const r=await fetch(base+path,body?{
  method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)
 }:{});
 assert.equal(r.status,200);
 return r.json();
}
function bookingId(n) {return "bk_"+String(n).padStart(18,"0");}
const date="2026-10-25";
const attempts=await Promise.all(Array.from({length:10},(_,i)=>
  req("/__test__/hold",{date,bookingId:bookingId(i)})));
assert.equal(attempts.filter(x=>x.accepted).length,1,
 "Only one of ten concurrent D1 hold writes may reserve the same date");
assert.equal((await req("/__test__/count?date="+date)).count,1);

await req("/__test__/block",{date:"2026-10-26",service_id:null});
assert.equal((await req("/__test__/hold",{date:"2026-10-26",bookingId:bookingId(20)})).accepted,false);

await req("/__test__/block",{date:"2026-10-27",service_id:"vehicle_hire_day"});
assert.equal((await req("/__test__/hold",{date:"2026-10-27",bookingId:bookingId(21)})).accepted,true,
 "Unrelated service-specific blocks must not suppress the support service");
assert.equal((await req("/__test__/hold",{date:"2026-10-27",bookingId:bookingId(22)})).accepted,false,
 "A second booking of the same date is prohibited");
console.log("PASS: Wrangler local D1 real SQL concurrent holds (10 contenders), global blocks and service-specific blocks");
