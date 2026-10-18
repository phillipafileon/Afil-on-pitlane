// STAGING ONLY — NOT IMPORTED BY THE LIVE OR STAGING WORKER.
// Parses a *previously signature-verified* Stripe checkout.session.completed
// event. No unverified JSON body or HTTP request should call this function.
// Bookings with discounts/vouchers are deliberately unsupported until migrated.
const bad=(error)=>({ok:false,error});
export function prepareVerifiedBookingPayment(event,{signatureVerified=false}={}) {
  if (signatureVerified!==true) return bad("signature_not_verified");
  if (!event || typeof event!=="object" || event.type!=="checkout.session.completed" ||
      !/^evt_[A-Za-z0-9]{8,128}$/.test(event.id||"")) return bad("invalid_event");
  const session=event.data?.object;
  if (!session || session.object!=="checkout.session" ||
      session.mode!=="payment" || session.status!=="complete" ||
      session.payment_status!=="paid" || session.currency!=="gbp") return bad("invalid_checkout_session");
  if (!/^cs_(?:test_|live_)[A-Za-z0-9]{8,160}$/.test(session.id||"") ||
      !/^pi_[A-Za-z0-9]{8,160}$/.test(session.payment_intent||""))
    return bad("missing_stripe_payment_ids");
  const meta=session.metadata||{};
  if(meta.kind!=="service_booking" ||
     !/^bk_[A-Za-z0-9_-]{16,80}$/.test(meta.booking_id||"") ||
     !/^[a-z_]{4,80}$/.test(meta.service_id||"") ||
     !/^[a-z_]{3,80}$/.test(meta.variant_id||"") ||
     !/^\d{4}-\d{2}-\d{2}$/.test(meta.booking_date||"") ||
     meta.terms_version!=="2026-10-07-v10")
    return bad("unsupported_booking_metadata");
  if (meta.discount_code_id || Number(meta.discount_amount||0)!==0 ||
      meta.gift_voucher_id || Number(meta.gift_voucher_amount||0)!==0)
    return bad("discount_voucher_requires_manual_reconciliation");
  const paid=session.amount_subtotal;
  if (!Number.isSafeInteger(paid) || paid<1 || paid>6_000_000 ||
      !Number.isSafeInteger(session.amount_total) || session.amount_total < paid)
    return bad("invalid_paid_amount");
  if (!Number.isSafeInteger(event.created) || event.created<1_000_000_000 ||
      event.created>4_000_000_000) return bad("invalid_event_time");
  const created=new Date(event.created*1000);
  const customer=session.customer==null?null:session.customer;
  if(customer!==null && !/^cus_[A-Za-z0-9]{8,160}$/.test(customer))
    return bad("invalid_customer_id");
  return {ok:true,
    event_id:event.id,event_type:event.type,event_created_iso:created.toISOString(),
    booking_id:meta.booking_id,service_id:meta.service_id,
    variant_id:meta.variant_id,booking_date:meta.booking_date,
    session_id:session.id,payment_intent_id:session.payment_intent,
    customer_id:customer,amount_subtotal_pence:paid,
    terms_version:meta.terms_version
  };
}
// ?1..?16 are used by apply-verified-booking-payment.sql.
// The context is expected to come from the CLAIMED inbox event, the trusted
// session, a DB-consistent booking state and UK policy check. No user input.
export function bookingPaymentBindings(payment,{
  leaseToken,now=new Date(),eventLondonDate,cutoffApproved=false
}={}) {
  if (!payment?.ok || !/^[a-zA-Z0-9_-]{16,100}$/.test(leaseToken||"") ||
      !(now instanceof Date)||!Number.isFinite(now.getTime())||
      !/^\d{4}-\d{2}-\d{2}$/.test(eventLondonDate||"") ||
      cutoffApproved!==true)
    throw Error("verified_payment_policy_required");
  return [payment.booking_id,payment.session_id,payment.payment_intent_id,
    payment.customer_id,payment.amount_subtotal_pence,payment.event_created_iso,
    payment.event_id,leaseToken,now.toISOString(),payment.terms_version,
    payment.service_id,payment.variant_id,payment.booking_date,eventLondonDate,
    "checkout.session.completed",1];
}
