// CI-ONLY LOCAL WRANGLER HARNESS, NEVER DEPLOY.
// The signing string is a public test fixture, NOT a Stripe secret.
// All routes are disabled without an explicit local-test-only variable.
import {verifyStripeWebhook} from "../stripe-signature.mjs";
import {rawPayloadHash,eventInboxClaimBindings} from "../webhooks/event-inbox.mjs";
import {prepareVerifiedBookingPayment,bookingPaymentBindings} from "../webhooks/booking-payment-completed.mjs";
import {evaluateDatePolicy,ukClock} from "../booking-policy-prototype.mjs";
import contract from "../compiled-public-service-snapshot.json" with {type:"json"};
import {CLAIM_SQL,APPLY_SQL,COMPLETE_SQL} from "./_generated-payment-sql.mjs";

const NOW=new Date("2026-10-18T10:00:00.000Z");
const FIXTURE_SECRET="whsec_LOCAL_CI_FIXTURE_NOT_REAL";
const allowedDates=new Set(["2026-11-15","2026-11-16"]);
function reply(value,status=200){
 return new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
}
const resultCount = (row) => row?.results?.length || 0;
export default {
 async fetch(request,env) {
   if(env.LOCAL_D1_TEST!=="only_action_runner")return new Response("Not found",{status:404});
   const path=new URL(request.url).pathname;
   if(request.method==="POST" && path==="/__test__/seed"){
     const data=await request.json().catch(()=>null);
     if(!data|| !allowedDates.has(data.date) ||
       !/^bk_[A-Za-z0-9]{16,64}$/.test(data.bookingId||"") ||
       !/^cs_test_[A-Za-z0-9]{8,64}$/.test(data.sessionId||""))
       return reply({error:"invalid_fixture"},400);
     const result=await env.DB.prepare(
       "INSERT INTO bookings(public_id,service_id,variant_id,booking_date,customer_name,customer_email,customer_phone,status,hold_expires_at,stripe_checkout_session_id,amount_total,booking_payment_amount,balance_amount,terms_version,terms_accepted_at) VALUES(?1,'track_day_support','full_day',?2,'Dummy','dummy@example.invalid','000','hold','2026-10-18T10:20:00.000Z',?3,50000,50000,0,'2026-10-07-v10','2026-10-18T09:00:00.000Z') RETURNING public_id"
     ).bind(data.bookingId,data.date,data.sessionId).first();
     return reply({seeded:!!result});
   }
   if(request.method==="GET" && path==="/__test__/status"){
     const ids=["bk_1234567890abcdef","bk_abcdef1234567890"];
     const records=await env.DB.prepare("SELECT public_id,status,amount_paid,stripe_payment_intent_id FROM bookings WHERE public_id IN (?1,?2) ORDER BY public_id").bind(...ids).all();
     const inbox=await env.DB.prepare("SELECT event_id,state,attempt_count FROM stripe_webhook_inbox ORDER BY event_id").all();
     return reply({bookings:records.results||[],events:inbox.results||[]});
   }
   if(request.method!=="POST"||path!=="/__test__/stripe-webhook")
     return new Response("Not found",{status:404});
   const original=new Uint8Array(await request.arrayBuffer());
   const header=request.headers.get("Stripe-Signature");
   if(!(await verifyStripeWebhook({
     rawBody:original,signatureHeader:header,webhookSecret:FIXTURE_SECRET,
     nowMs:NOW.getTime()
   })))return reply({error:"invalid_signature"},400);
   let event;
   try{event=JSON.parse(new TextDecoder().decode(original));}
   catch{return reply({error:"invalid_json"},400);}
   const payment=prepareVerifiedBookingPayment(event,{signatureVerified:true});
   if(!payment.ok)return reply({error:payment.error},422);
   if(payment.event_created_iso>NOW.toISOString())return reply({error:"future_event"},422);
   const service=contract.services.find(s=>s.id===payment.service_id);
   if(!service||service.bookable!==true)return reply({error:"not_bookable"},422);
   const policy=evaluateDatePolicy({
     service,bookingDate:payment.booking_date,now:new Date(payment.event_created_iso),
     phase:"payment",cutoffs:contract.booking_cutoffs,
     inspectionSlots:contract.inspection_slots
   });
   if(!policy.ok)return reply({error:"date_policy_rejected"},422);
   const digest=await rawPayloadHash(original);
   const lease="lease_"+crypto.randomUUID();
   const bindings=eventInboxClaimBindings({
     eventId:payment.event_id,eventType:payment.event_type,
     bodySha256:digest,leaseToken:lease,now:NOW,leaseSeconds:60
   });
   const claim=await env.DB.prepare(CLAIM_SQL).bind(...bindings).first();
   if(!claim){
     const prior=await env.DB.prepare(
       "SELECT state,body_sha256,event_type FROM stripe_webhook_inbox WHERE event_id=?1"
     ).bind(payment.event_id).first();
     if(prior?.state==="processed" && prior.body_sha256===digest &&
       prior.event_type===payment.event_type)return reply({processed:true,duplicate:true});
     return reply({processed:false,error:"event_claim_conflict"},409);
   }
   const applyBindings=bookingPaymentBindings(payment,{
     leaseToken:lease,now:NOW,eventLondonDate:ukClock(new Date(payment.event_created_iso)).date,
     cutoffApproved:true
   });
   const [updated,acknowledged]=await env.DB.batch([
     env.DB.prepare(APPLY_SQL).bind(...applyBindings),
     env.DB.prepare(COMPLETE_SQL).bind(...applyBindings)
   ]);
   if(resultCount(acknowledged)!==1)
     return reply({processed:false,error:"reconciliation_required"},409);
   return reply({processed:true,duplicate:resultCount(updated)===0});
 }
};
