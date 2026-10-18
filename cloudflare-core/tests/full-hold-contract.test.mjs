import test from "node:test";
import assert from "node:assert/strict";
import contract from "../compiled-public-service-snapshot.json" with {type:"json"};
import {prepareHold,holdBindings,validateTrustedTravelQuote} from "../booking/hold-contract.mjs";

const now=new Date("2026-10-18T07:00:00Z");
const service=id=>({...contract.services.find(s=>s.id===id),bookable:true});
function req(overrides={}) {return {
  service_id:"track_day_support",variant_id:"full_day",booking_date:"2026-10-23",
  customer_name:"Example Person",customer_email:"example@test.invalid",
  customer_phone:"01234567890",terms_accepted:true,terms_version:"2026-10-07-v10",
  ...overrides
};}
function travel(id,surcharge=1500) {return {
 __server_verified:true,service_id:id,kent_confirmed:true,surcharge
};}
const build=(id="track_day_support",input=req(),override={})=>prepareHold({
 request:input,service:service(id),now,
 trustedTravel:travel(id),allowBookingWrites:true,...override
});
test("no routing capability unless explicit authorization flag",()=>{
  assert.equal(prepareHold({request:req(),service:service("track_day_support"),now}).error,
  "booking_writes_not_enabled");
});
test("full-payment service pricing includes trusted, server-side travel only",()=>{
  const a=build();
  assert.equal(a.ok,true);
  assert.equal(a.amount_total,51500);
  assert.equal(a.booking_payment_amount,51500);
  assert.equal(a.balance_amount,0);
  assert.equal(a.payment_kind,"full");
  assert.equal(a.terms_version,"2026-10-07-v10");
  assert.equal(a.hold_expires_at,"2026-10-18T07:20:00.000Z");
  const bindings=holdBindings(a,"bk_1234567890abcdef",now);
  assert.equal(bindings.length,29);
  assert.equal(bindings[0],"bk_1234567890abcdef");
  assert.equal(bindings[27],now.toISOString());
});
test("untrusted client travel surcharges cannot enter pricing",()=>{
  const x=build("track_day_support",req(),{trustedTravel:{service_id:"track_day_support",kent_confirmed:true,surcharge:1}});
  assert.equal(x.error,"trusted_travel_quote_required");
  assert.equal(validateTrustedTravelQuote(service("track_day_support"),travel("wrong")).ok,false);
});
test("legal acceptance and contact rules fail closed",()=>{
  assert.equal(build("track_day_support",req({terms_accepted:false})).error,"terms_acceptance_required");
  assert.equal(build("track_day_support",req({terms_version:"older"})).error,"terms_version_outdated");
  assert.equal(build("track_day_support",req({customer_email:"invalid"})).error,"contact_details_required");
  assert.equal(build("track_day_support",req({gift_voucher_id:1})).error,"unported_discount_or_voucher");
});
test("inspection appointment/address/hardstanding requirements are preserved",()=>{
  const id="pre_track_inspection";
  const valid=req({variant_id:"standard",service_address:"Test Address",postcode:"CT4 6ET",
    safe_work_area_confirmed:true,appointment_time:"14:00"});
  const a=build(id,valid,{trustedTravel:travel(id,500)});
  assert.equal(a.ok,true);assert.equal(a.appointment_time,"14:00");assert.equal(a.amount_total,12500);
  assert.equal(build(id,{...valid,appointment_time:"09:00"},{trustedTravel:travel(id)}).error,
    "inspection_time_required");
  assert.equal(build(id,{...valid,postcode:""},{trustedTravel:travel(id)}).error,"service_address_required");
  assert.equal(build(id,{...valid,safe_work_area_confirmed:false},{trustedTravel:travel(id)}).error,
    "safe_work_area_confirmation_required");
});
test("E46 £250 deposit, 9-day notice and 3-day due, £2500 security",()=>{
  const id="vehicle_hire_day";
  const a=build(id,req({variant_id:"full_day",booking_date:"2026-11-08",payment_choice:"deposit"}),
    {trustedTravel:travel(id,0)});
  assert.equal(a.ok,true);assert.equal(a.amount_total,70000);
  assert.equal(a.booking_payment_amount,25000);assert.equal(a.balance_amount,45000);
  assert.equal(a.balance_notice_at,"2026-10-30T12:00:00.000Z");
  assert.equal(a.balance_due_at,"2026-11-05T12:00:00.000Z");
  assert.equal(a.damage_security_amount,250000);assert.equal(a.licence_required,1);
  const full=build(id,req({variant_id:"full_day",booking_date:"2026-11-08",payment_choice:"full"}),
    {trustedTravel:travel(id,0)});
  assert.equal(full.booking_payment_amount,70000);assert.equal(full.balance_amount,0);
});
test("E46 within three days requires full payment",()=>{
  const a=build("vehicle_hire_day",
    req({variant_id:"full_day",booking_date:"2026-10-20",payment_choice:"deposit"}),
    {trustedTravel:travel("vehicle_hire_day",0)});
  assert.equal(a.payment_kind,"full");assert.equal(a.booking_payment_amount,70000);
});
test("bookable=false always prevents reserving disabled E46",()=>{
  const x=prepareHold({request:req({variant_id:"full_day"}),service:contract.services[1],now,
    trustedTravel:travel("vehicle_hire_day"),allowBookingWrites:true});
  assert.equal(x.error,"service_not_live");
});
test("never create a hold for quote-only vehicle transport",()=>{
  const x=build("vehicle_transport",req({variant_id:"quote"}),{trustedTravel:travel("vehicle_transport",0)});
  assert.equal(x.error,"service_not_live");
});
test("UK next-day deadline caps hold expiry",()=>{
  const boundary=new Date("2026-10-18T18:58:00Z"); // London 19:58
  const a=build("track_day_support",req({booking_date:"2026-10-19"}),
    {now:boundary,trustedTravel:travel("track_day_support",0)});
  assert.equal(a.ok,true);
  assert.equal(a.hold_expires_at,"2026-10-18T19:00:00.000Z");
  const late=build("track_day_support",req({booking_date:"2026-10-19"}),
    {now:new Date("2026-10-18T19:00:00Z"),trustedTravel:travel("track_day_support",0)});
  assert.equal(late.error,"next_day_cutoff_passed");
});
test("blank venue/terms rules never silently pass unsupported inputs",()=>{
  const x=build("track_day_support",req({discount_code:"FREE"}));
  assert.equal(x.error,"unported_discount_or_voucher");
});
