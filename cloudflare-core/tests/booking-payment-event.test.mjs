import test from "node:test";
import assert from "node:assert/strict";
import {prepareVerifiedBookingPayment,bookingPaymentBindings} from "../webhooks/booking-payment-completed.mjs";

const fixture=()=>({
  id:"evt_1234567890abcdef",type:"checkout.session.completed",created:1792330000,
  data:{object:{
    object:"checkout.session",id:"cs_test_1234567890abcde",mode:"payment",
    status:"complete",payment_status:"paid",currency:"gbp",
    payment_intent:"pi_1234567890abcde",customer:"cus_1234567890abcde",
    amount_subtotal:25000,amount_total:30000,
    metadata:{kind:"service_booking",booking_id:"bk_1234567890abcdef",
      service_id:"vehicle_hire_day",variant_id:"full_day",
      booking_date:"2026-11-08",terms_version:"2026-10-07-v10"}
  }}
});
const verify=e=>prepareVerifiedBookingPayment(e,{signatureVerified:true});
test("unverified webhook payloads are always refused",()=>{
  assert.equal(prepareVerifiedBookingPayment(fixture()).error,"signature_not_verified");
});
test("verified paid GBP service booking produces SQL bindings",()=>{
  const x=verify(fixture());assert.equal(x.ok,true);
  assert.equal(x.amount_subtotal_pence,25000);
  const b=bookingPaymentBindings(x,{leaseToken:"lease_1234567890abcde",
    now:new Date("2026-10-18T10:00:00Z"),eventLondonDate:"2026-10-18",cutoffApproved:true});
  assert.equal(b.length,16);assert.equal(b[0],"bk_1234567890abcdef");
  assert.equal(b[4],25000);assert.equal(b[15],1);
  assert.throws(()=>bookingPaymentBindings(x,{leaseToken:"lease_1234567890abcde"}));
});
test("event missing booking metadata or unsupported discounts fails closed",()=>{
  const f=fixture();delete f.data.object.metadata.booking_id;
  assert.equal(verify(f).ok,false);
  const d=fixture();d.data.object.metadata.discount_code_id="disc_one";
  assert.equal(verify(d).error,"discount_voucher_requires_manual_reconciliation");
  const v=fixture();v.data.object.metadata.gift_voucher_amount="2000";
  assert.equal(verify(v).ok,false);
});
test("nonpaid, other currency, refunds and wrong event are rejected",()=>{
  const f=fixture();f.data.object.payment_status="unpaid";
  assert.equal(verify(f).ok,false);
  const c=fixture();c.data.object.currency="usd";
  assert.equal(verify(c).ok,false);
  const e=fixture();e.type="checkout.session.expired";
  assert.equal(verify(e).ok,false);
  const p=fixture();p.data.object.amount_subtotal=0;
  assert.equal(verify(p).ok,false);
  const o=fixture();o.data.object.mode="subscription";
  assert.equal(verify(o).ok,false);
});
test("payment session identifiers and amount consistency are required",()=>{
  const f=fixture();f.data.object.id="bad";
  assert.equal(verify(f).ok,false);
  const t=fixture();t.data.object.payment_intent=null;
  assert.equal(verify(t).ok,false);
  const a=fixture();a.data.object.amount_total=10000;
  assert.equal(verify(a).ok,false);
  const m=fixture();m.data.object.metadata.terms_version="old";
  assert.equal(verify(m).ok,false);
});
