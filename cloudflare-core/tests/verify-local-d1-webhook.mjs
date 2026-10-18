// Only calls a Wrangler Worker bound to the loopback address on port 8789.
// Uses dummy booking/customer records and a PUBLIC CI-only signing fixture.
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
const base="http://127.0.0.1:8789";
const secret="whsec_LOCAL_CI_FIXTURE_NOT_REAL";
const timestamp=1792317600; // fixed CI clock: 2026-10-18T10:00:00.000Z
const created=1792317540;   // Stripe-style event created 1 min earlier
const encoder=new TextEncoder();
const key=await webcrypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
const bookingIds=["bk_1234567890abcdef","bk_abcdef1234567890"];
const sessions=["cs_test_1234567890abcde","cs_test_abcdef1234567890"];
function event(id,bookingId,sessionId,date,amount=50000){
 return {
   id,type:"checkout.session.completed",created,
   data:{object:{
     object:"checkout.session",id:sessionId,mode:"payment",status:"complete",
     payment_status:"paid",currency:"gbp",payment_intent:"pi_1234567890abcde",
     customer:"cus_1234567890abcde",amount_subtotal:amount,amount_total:amount,
     metadata:{kind:"service_booking",booking_id:bookingId,service_id:"track_day_support",
       variant_id:"full_day",booking_date:date,terms_version:"2026-10-07-v10"}
   }}
 };
}
async function sign(body) {
 const signature=new Uint8Array(await webcrypto.subtle.sign(
  "HMAC",key,encoder.encode(timestamp+"."+body)));
 return `t=${timestamp},v1=${[...signature].map(x=>x.toString(16).padStart(2,"0")).join("")}`;
}
async function post(path,data,header) {
 const body=typeof data==="string"?data:JSON.stringify(data);
 const res=await fetch(base+path,{method:"POST",headers:{
  "Content-Type":"application/json",...(header?{"Stripe-Signature":header}:{})
 },body});
 return {status:res.status,body:await res.json()};
}
async function deliver(evt,mutate=false) {
 const raw=JSON.stringify(evt);
 const sig=await sign(raw);
 return post("/__test__/stripe-webhook",mutate?raw+" ":raw,sig);
}
async function status(){
 const response=await fetch(base+"/__test__/status");
 assert.equal(response.status,200);
 return response.json();
}
for(let i=0;i<2;i++){
 const r=await post("/__test__/seed",{
  bookingId:bookingIds[i],sessionId:sessions[i],date:i===0?"2026-11-15":"2026-11-16"
 });
 assert.equal(r.status,200);
 assert.equal(r.body.seeded,true);
}
const e1=event("evt_1234567890abcdef",bookingIds[0],sessions[0],"2026-11-15");
const forged=await post("/__test__/stripe-webhook",e1,"t="+timestamp+",v1="+"0".repeat(64));
assert.equal(forged.status,400);
assert.equal((await status()).events.length,0);
assert.equal((await deliver(e1,true)).status,400);
assert.equal((await status()).events.length,0);

const paid=await deliver(e1);
assert.deepEqual(paid,{status:200,body:{processed:true,duplicate:false}});
assert.equal((await deliver(e1)).status,200);
const another=await deliver(event("evt_abcdef1234567890",bookingIds[0],sessions[0],"2026-11-15"));
assert.deepEqual(another,{status:200,body:{processed:true,duplicate:true}});
const afterOne=await status();
assert.equal(afterOne.bookings.find(x=>x.public_id===bookingIds[0]).amount_paid,50000);
assert.equal(afterOne.events.filter(x=>x.state==="processed").length,2);
// A valid but conflicting event should remain UNACKNOWLEDGED for reconciliation.
const conflicting=await deliver(event("evt_999999999999aaaa",bookingIds[0],sessions[0],"2026-11-15",40000));
assert.equal(conflicting.status,409);
assert.equal((await status()).bookings.find(x=>x.public_id===bookingIds[0]).amount_paid,50000);

// Ten simultaneously delivered notifications for the same event must not double-charge.
const e2=event("evt_2222222222222222",bookingIds[1],sessions[1],"2026-11-16");
const concurrent=await Promise.all(Array.from({length:10},()=>deliver(e2)));
assert.ok(concurrent.some(x=>x.status===200),concurrent.map(x=>x.status));
assert.ok(concurrent.every(x=>[200,409].includes(x.status)));
const end=await status();
assert.equal(end.bookings.find(x=>x.public_id===bookingIds[1]).amount_paid,50000);
assert.equal(end.bookings.find(x=>x.public_id===bookingIds[1]).status,"confirmed");
assert.equal(end.events.filter(x=>x.event_id===e2.id).length,1);
assert.equal(end.events.find(x=>x.event_id===e2.id).state,"processed");
console.log("PASS: local Wrangler D1 full test-signed webhook, atomic booking payment, replay and 10 concurrent notifications");
