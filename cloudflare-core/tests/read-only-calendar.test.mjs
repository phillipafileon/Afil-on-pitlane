import test from "node:test";
import assert from "node:assert/strict";
import worker from "../dashboard-staging-worker.js";
function db({ tables = 25, indexes = 13, availability = [], closure = null, products = [] } = {}) {
  return { prepare(sql) {
    const query = { bind(...args) { this.args = args; return this; },
      async first() {
        if (sql.includes("name NOT LIKE") && sql.includes("type='table'")) return {n:tables};
        if (sql.includes("name NOT LIKE") && sql.includes("type='index'")) return {n:indexes};
        if (sql.includes("FROM business_availability_settings")) return closure;
        return null;
      },
      async all() {
        if (sql.includes("FROM availability_blocks")) return {results:availability};
        if (sql.includes("FROM shop_products")) return {results:products};
        return {results:[]};
      }
    };
    return query;
  }};
}
const call = (path, d = db(), options = {}) =>
  worker.fetch(new Request("https://test.invalid"+path, options), {DB:d, SITE_ORIGIN:"https://afileonmotorsport.co.uk"});
test("health checks the bound D1 counts", async () => {
  const r=await call("/__migration/health"); assert.equal(r.status,200);
  assert.deepEqual([ (await r.json()).ok ], [true]);
  const bad=await call("/__migration/health",db({indexes:12}));
  assert.equal(bad.status,503);
});
test("shop response remains read-only and uses expected format",async()=>{
  const r=await call("/api/shop/products"); assert.deepEqual(await r.json(),{products:[]});
});
test("calendar preserves booked and blocked days without disclosing customers", async()=>{
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const data=db({availability:[
    {date:"2099-10-02",service_id:"vehicle_hire_day",status:"confirmed",kind:"booking",customer_email:"private@example.com"},
    {date:"2099-10-03",service_id:"vehicle_hire_day",status:"blocked",kind:"block"},
    {date:"2099-10-03",service_id:"track_day_support",status:"blocked",kind:"block"},
    {date:"2099-10-03",service_id:"vehicle_transport",status:"blocked",kind:"block"}
  ]});
  const r=await call("/api/availability?months=6",data);
  assert.equal(r.status,200);
  const out=await r.json();
  assert.equal(out.months,6);
  assert.equal(out.busy.some(x=>x.kind==="legacy_all_services"),true);
  assert.equal(JSON.stringify(out).includes("private@example.com"),false);
});
test("temporary closure is advertised with London date and no internal notes",async()=>{
  const today = Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  const date=`${today.year}-${today.month}-${today.day}`;
  const data=db({closure:{start_date:date,end_date:date,public_message:"Back tomorrow",internal_note:"SECRET"}});
  const r=await call("/api/business-availability",data);
  const out=await r.json();
  assert.equal(out.closed_now,true);
  assert.equal(out.status,"closed");
  assert.equal(out.public_message,"Back tomorrow");
  assert.equal(JSON.stringify(out).includes("SECRET"),false);
  const calendar=await (await call("/api/availability",data)).json();
  assert.equal(calendar.busy.filter(x=>x.kind==="master_closure").length,1);
});
test("mutating and unported routes stay disabled",async()=>{
  const r=await call("/api/bookings/hold",db(),{method:"POST"});
  assert.equal(r.status,503);
  assert.equal((await r.json()).error,"not_migrated");
});
