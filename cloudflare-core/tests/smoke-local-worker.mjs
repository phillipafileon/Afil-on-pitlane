// GitHub Actions smoke check against a locally hosted Wrangler Worker + D1.
// NEVER targets cloudflare.com, workers.dev, real Stripe or the production site.
import assert from "node:assert/strict";
const url="http://127.0.0.1:8787";
const [tables,indexes]=process.argv.slice(2).map(Number);
if (![25,26].includes(tables)||![13,14].includes(indexes))throw Error("invalid_expected_schema");
async function fetchJson(path,init={}) {
 const r=await fetch(url+path,init);
 assert.equal(r.headers.get("cache-control"),"no-store");
 return {status:r.status,value:await r.json()};
}
const h=await fetchJson("/__migration/health");
assert.equal(h.status,200);
assert.equal(h.value.ok,true);
assert.equal(h.value.production_ready,false);
assert.equal(h.value.tables,tables);
assert.equal(h.value.indexes,indexes);
const app=await fetchJson("/api/availability");
assert.equal(app.status,200);
assert.deepEqual(app.value,{months:6,busy:[]});
const biz=await fetchJson("/api/business-availability");
assert.equal(biz.status,200);
assert.equal(biz.value.configured,false);
assert.equal(biz.value.closed_now,false);
const services=await fetchJson("/api/services");
assert.equal(services.status,200);
assert.equal(services.value.services.length,4);
assert.equal(services.value.services.find(s=>s.id==="vehicle_hire_day").bookable,false);
const shop=await fetchJson("/api/shop/products");
assert.equal(shop.status,200);
assert.deepEqual(shop.value.products,[]);
const season=await fetchJson("/api/season");
assert.equal(season.status,200);
assert.equal(season.value.season,null);
const writes=await fetchJson("/api/bookings/hold",{
 method:"POST",headers:{"Content-Type":"application/json"},body:"{}"
});
assert.equal(writes.status,503);
assert.equal(writes.value.error,"not_migrated");
const bad=await fetchJson("/api/admin/summary");
assert.equal(bad.status,503);
console.log("PASS: Wrangler Worker/D1 local smoke, "+tables+" tables/"+indexes+" indexes. No real writes.");
