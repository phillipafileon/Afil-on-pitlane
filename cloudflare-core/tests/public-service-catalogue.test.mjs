import test from "node:test";
import assert from "node:assert/strict";
import worker from "../dashboard-staging-worker.js";

function d1({prices=[],travel=[]}={}) {
  return {prepare(sql) {
    return {async all() {
      if(sql.includes("service_price_overrides")) return {results:prices};
      if(sql.includes("travel_price_overrides")) return {results:travel};
      return {results:[]};
    }, async first() {return null;}};
  }};
}
async function get(path,database) {
  const res=await worker.fetch(new Request("https://test.invalid"+path), {
    DB:database, SITE_ORIGIN:"https://afileonmotorsport.co.uk"
  });
  return {res,data:await res.json()};
}
test("compiled four-service endpoint is a safe public read",async()=>{
  const {res,data}=await get("/api/services",d1());
  assert.equal(res.status,200);
  assert.deepEqual(data.services.map(x=>x.id), [
    "pre_track_inspection","vehicle_hire_day","track_day_support","vehicle_transport"
  ]);
  assert.equal(data.operations_base,"Gravesend");
  assert.deepEqual(data.venues.map(x=>x.id),["brands_hatch","lydden_hill"]);
  const e46=data.services.find(x=>x.id==="vehicle_hire_day");
  assert.equal(e46.bookable,false);
  assert.equal(e46.variants[0].price,70000);
  assert.equal(data.services.find(x=>x.id==="pre_track_inspection").variants[0].price,12000);
  assert.equal(data.services.find(x=>x.id==="vehicle_transport").variants[0].price,null);
});
test("D1 service and travel pricing overrides are applied without modifying defaults",async()=>{
  const first=await get("/api/services",d1({
    prices:[{service_id:"track_day_support",variant_id:"half_day",price_pence:17500},
      {service_id:"vehicle_hire_day",variant_id:"full_day",price_pence:45000},
      {service_id:"vehicle_transport",variant_id:"quote",price_pence:45000}],
    travel:[{service_id:"track_day_support",rate_pence_per_mile:88}]
  }));
  const support=first.data.services.find(x=>x.id==="track_day_support");
  assert.equal(support.variants[0].price,17500);
  assert.equal(support.variants[1].price,50000);
  assert.equal(support.travelRatePencePerMile,88);
  assert.equal(first.data.services.find(x=>x.id==="vehicle_hire_day").bookable,false);
  assert.equal(first.data.services.find(x=>x.id==="vehicle_hire_day").variants[0].price,45000);
  assert.equal(first.data.services.find(x=>x.id==="vehicle_transport").variants[0].price,null);
  const again=await get("/api/services",d1());
  assert.equal(again.data.services.find(x=>x.id==="track_day_support").variants[0].price,30000);
  assert.equal(again.data.services.find(x=>x.id==="track_day_support").travelRatePencePerMile,55);
});
test("service API fails closed if database unavailable",async()=>{
  const broken={prepare(){throw Error("offline");}};
  const {res,data}=await get("/api/services",broken);
  assert.equal(res.status,503);
  assert.equal(data.error,"database_unavailable");
});
test("unknown write and checkout endpoints remain closed",async()=>{
  const res=await worker.fetch(new Request("https://test.invalid/api/bookings/hold",{
    method:"POST",headers:{"Content-Type":"application/json"},body:"{}"
  }),{DB:d1(),SITE_ORIGIN:"https://afileonmotorsport.co.uk"});
  assert.equal(res.status,503);
  assert.equal((await res.json()).error,"not_migrated");
});
