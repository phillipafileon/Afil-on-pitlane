import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ukClock,daysBetween,validIsoDate,evaluateDatePolicy} from "../booking-policy-prototype.mjs";
const c=JSON.parse(readFileSync(new URL("../compiled-public-service-snapshot.json",import.meta.url)));
const service = id => ({...c.services.find(s=>s.id===id),bookable:true});
const evalDate=(id,day,now,extra={})=>evaluateDatePolicy({
  service:service(id), bookingDate:day, now:new Date(now),
  cutoffs:c.booking_cutoffs, inspectionSlots:c.inspection_slots,
  appointmentTime:"10:00",...extra
});
test("final compiled cutoffs are used, not intermediate source patches",()=>{
  assert.equal(c.booking_cutoffs.vehicle_hire_day.payment_cutoff,"11:30");
  assert.equal(c.booking_cutoffs.vehicle_hire_day.checkout_start_cutoff,"11:30");
  assert.equal(c.booking_cutoffs.pre_track_inspection.payment_cutoff,"22:00");
  assert.equal(c.booking_cutoffs.default.payment_cutoff,"20:00");
  assert.equal(evalDate("vehicle_hire_day","2026-10-19","2026-10-18T10:29:59Z").ok,true);
  assert.equal(evalDate("vehicle_hire_day","2026-10-19","2026-10-18T10:30:00Z").reason,"next_day_cutoff_passed");
  assert.equal(evalDate("pre_track_inspection","2026-10-19","2026-10-18T20:59:59Z").ok,true);
  assert.equal(evalDate("pre_track_inspection","2026-10-19","2026-10-18T21:00:00Z").reason,"next_day_cutoff_passed");
  assert.equal(evalDate("track_day_support","2026-10-19","2026-10-18T18:59:59Z").ok,true);
  assert.equal(evalDate("track_day_support","2026-10-19","2026-10-18T19:00:00Z").reason,"next_day_cutoff_passed");
});
test("UK calendar is consistent across daylight saving boundaries",()=>{
  assert.equal(ukClock(new Date("2026-03-29T00:59:00Z")).date,"2026-03-29");
  assert.equal(ukClock(new Date("2026-03-29T01:01:00Z")).date,"2026-03-29");
  assert.equal(ukClock(new Date("2026-10-25T00:30:00Z")).date,"2026-10-25");
  assert.equal(ukClock(new Date("2026-10-25T01:30:00Z")).date,"2026-10-25");
  assert.equal(daysBetween("2026-03-28","2026-03-30"),2);
  assert.equal(daysBetween("2026-10-24","2026-10-26"),2);
});
test("invalid dates, same-day, long booking window are rejected",()=>{
  assert.equal(validIsoDate("2026-02-29"),false);
  assert.equal(validIsoDate("2028-02-29"),true);
  assert.equal(evalDate("track_day_support","2026-10-18","2026-10-18T10:00:00Z").reason,"same_day_unavailable");
  assert.equal(evalDate("track_day_support","2026-10-20","2026-10-18T10:00:00Z").ok,true);
  assert.equal(evalDate("track_day_support","2027-05-01","2026-10-18T10:00:00Z").reason,"date_outside_booking_window");
});
test("business-wide closures guard current time and future booking date",()=>{
  const closure={start_date:"2026-10-19",end_date:"2026-10-20"};
  assert.equal(evalDate("track_day_support","2026-10-19","2026-10-18T08:00:00Z",{closure}).reason,"business_temporarily_closed");
  assert.equal(evalDate("track_day_support","2026-10-21","2026-10-19T08:00:00Z",{closure}).reason,"business_temporarily_closed");
});
test("service-specific, global and legacy combined blocks are honored",()=>{
  const block=service_id=>({block_date:"2026-10-20",service_id});
  assert.equal(evalDate("track_day_support","2026-10-20","2026-10-18T08:00:00Z",{blocks:[block("track_day_support")]}).reason,"date_unavailable");
  assert.equal(evalDate("pre_track_inspection","2026-10-20","2026-10-18T08:00:00Z",{blocks:[block("track_day_support")]}).ok,true);
  assert.equal(evalDate("vehicle_hire_day","2026-10-20","2026-10-18T08:00:00Z",{blocks:[block("*")]}).reason,"date_unavailable");
  assert.equal(evalDate("pre_track_inspection","2026-10-20","2026-10-18T08:00:00Z",{blocks:[block("vehicle_hire_day"),block("track_day_support"),block("vehicle_transport")]}).reason,"date_unavailable");
});
test("inspection time and staging E46 launch remain fail-closed",()=>{
  assert.equal(evalDate("pre_track_inspection","2026-10-20","2026-10-18T08:00:00Z",{appointmentTime:"09:30"}).reason,"inspection_time_required");
  const e46=c.services.find(s=>s.id==="vehicle_hire_day");
  assert.equal(e46.bookable,false);
  assert.equal(evaluateDatePolicy({service:e46,bookingDate:"2026-10-20",cutoffs:c.booking_cutoffs}).reason,"service_not_live");
});
