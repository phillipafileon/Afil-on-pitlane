// STAGING ONLY: validated hold contract, deliberately NOT routed in Worker.
// No customer traffic, payments or Stripe keys are connected to this module.
// Server must supply a trusted travel quote, not accept client-supplied prices.
import { evaluateDatePolicy, validIsoDate, daysBetween, ukClock } from "../booking-policy-prototype.mjs";
import contract from "../compiled-public-service-snapshot.json" with { type: "json" };

const TERMS_VERSION = "2026-10-07-v10";
const CURRENCY = "GBP";
const MAX_SERVICE_PRICE_PENCE = 5_000_000;
const E46_DAMAGE_SECURITY_PENCE = 250_000;

function clean(value, length) {
  return typeof value === "string" ? value.trim().slice(0, length) : "";
}
const failure = (reason) => ({ ok: false, error: reason });
function addDays(date, amount) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0,10);
}
function trustedInt(value, upper = MAX_SERVICE_PRICE_PENCE) {
  return Number.isSafeInteger(value) && value >= 0 && value <= upper;
}
function validCustomerEmail(email) {
  return email.length >= 5 && email.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Accept only a quote produced and validated by a server-side Kent travel module. */
export function validateTrustedTravelQuote(service, trustedTravel) {
  if (!service.travelMode) return {ok:true,surcharge:0};
  if (!trustedTravel || trustedTravel.__server_verified !== true ||
      trustedTravel.service_id !== service.id ||
      !trustedInt(trustedTravel.surcharge, 1_000_000))
    return failure("trusted_travel_quote_required");
  if (!["venue","postcode"].includes(service.travelMode) ||
      !trustedTravel.kent_confirmed)
    return failure("kent_travel_validation_required");
  return {ok:true,surcharge:trustedTravel.surcharge};
}

/** Service and variant must already include D1 pricing overrides; no client prices. */
export function prepareHold({
  request, service, now = new Date(), trustedTravel,
  closure = null, blocks = [], durationMinutes = 20,
  allowBookingWrites = false
} = {}) {
  // Prevent future callers from treating this prototype as production by default.
  if (!allowBookingWrites) return failure("booking_writes_not_enabled");
  if (!service || !contract.services.some(x => x.id === service.id)) return failure("unknown_service");
  if (service.bookable !== true || service.payment === "quote") return failure("service_not_live");
  if (!request || typeof request !== "object" || Array.isArray(request)) return failure("invalid_request");
  if (!request.booking_date || !validIsoDate(request.booking_date)) return failure("invalid_date");
  if (request.terms_accepted !== true) return failure("terms_acceptance_required");
  if (request.terms_version !== TERMS_VERSION) return failure("terms_version_outdated");
  if (request.discount_code || request.gift_voucher_id || request.discount_amount)
    return failure("unported_discount_or_voucher");
  const variant = service.variants?.find(x => x.id === request.variant_id);
  if (!variant || !trustedInt(variant.price)) return failure("invalid_service_price");
  const name = clean(request.customer_name,120);
  const email = clean(request.customer_email,200).toLowerCase();
  const phone = clean(request.customer_phone,60);
  if (!name || !validCustomerEmail(email) || !phone) return failure("contact_details_required");
  if (service.addressRequired &&
      (!clean(request.service_address,500) || !clean(request.postcode,20)))
    return failure("service_address_required");
  if (service.hardstandingRequired && request.safe_work_area_confirmed !== true)
    return failure("safe_work_area_confirmation_required");
  if (service.id === "vehicle_hire_day" &&
      request.payment_choice !== undefined &&
      !["deposit","full"].includes(request.payment_choice))
    return failure("invalid_payment_choice");

  const datePolicy = evaluateDatePolicy({
    service, bookingDate:request.booking_date, now, phase:"checkout_start",
    cutoffs:contract.booking_cutoffs,inspectionSlots:contract.inspection_slots,
    appointmentTime:request.appointment_time,closure,blocks
  });
  if (!datePolicy.ok) return failure(datePolicy.reason);
  const verifiedTravel = validateTrustedTravelQuote(service,trustedTravel);
  if (!verifiedTravel.ok) return verifiedTravel;

  const price = variant.price;
  const amountTotal = price + verifiedTravel.surcharge;
  if (!trustedInt(amountTotal, MAX_SERVICE_PRICE_PENCE + 1_000_000))
    return failure("invalid_total");

  let paymentKind = "full";
  let payNow = amountTotal;
  let balance = 0;
  let balanceNotice = null, balanceDue = null, balanceStatus = null;
  if (service.id === "vehicle_hire_day" && datePolicy.days > 3 &&
      request.payment_choice !== "full") {
    paymentKind = "deposit_then_balance";
    payNow = Math.min(25_000,amountTotal);
    balance = amountTotal - payNow;
    balanceNotice = addDays(request.booking_date,-9)+"T12:00:00.000Z";
    balanceDue = addDays(request.booking_date,-3)+"T12:00:00.000Z";
    balanceStatus = "scheduled";
  }
  if (payNow <= 0) return failure("no_payment_due");

  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 20)
    return failure("invalid_hold_duration");
  let expiryMs = now.getTime() + durationMinutes*60_000;
  if (datePolicy.days === 1) {
    const policy = contract.booking_cutoffs[service.id] || contract.booking_cutoffs.default;
    const [hour,minute] = policy.payment_cutoff.split(":").map(Number);
    const remaining = hour*3600 + minute*60 - ukClock(now).seconds;
    if (remaining <= 0) return failure("next_day_cutoff_passed");
    expiryMs = Math.min(expiryMs,now.getTime()+remaining*1000);
  }
  if (expiryMs <= now.getTime()) return failure("hold_window_closed");
  const licenceRequired = service.licenceRequired === true;
  return {
    ok:true, terms_version:TERMS_VERSION, currency:CURRENCY,
    service_id:service.id, variant_id:variant.id,
    booking_date:request.booking_date, customer_name:name,
    customer_email:email, customer_phone:phone,
    service_address:clean(request.service_address,500)||null,
    postcode:clean(request.postcode,20)||null,
    vehicle_details:clean(request.vehicle_details,500)||null,
    notes:clean(request.notes,1000)||null,
    appointment_time:service.id==="pre_track_inspection"?request.appointment_time:null,
    amount_total:amountTotal,booking_payment_amount:payNow,
    balance_amount:balance,balance_notice_at:balanceNotice,balance_due_at:balanceDue,
    balance_status:balanceStatus,payment_kind:paymentKind,
    hold_expires_at:new Date(expiryMs).toISOString(),
    licence_required:licenceRequired?1:0,
    licence_status:licenceRequired?"required":null,
    safe_work_area_confirmed:request.safe_work_area_confirmed===true?1:0,
    terms_accepted_at:now.toISOString(),
    terms_customer_name:name,
    // Authorisation is handled in a separate Stripe setup, never charged as normal booking cost.
    damage_security_amount:licenceRequired?E46_DAMAGE_SECURITY_PENCE:null
  };
}

/** Fixed SQL binding contract, paired with atomic-booking-hold-full.sql. */
export function holdBindings(hold, publicId, now = new Date()) {
  if (!hold?.ok || !/^bk_[a-zA-Z0-9_-]{16,80}$/.test(publicId))
    throw Error("invalid_hold");
  if (!validIsoDate(hold.booking_date)) throw Error("invalid_hold_date");
  return [
    publicId,hold.service_id,hold.variant_id,hold.booking_date,
    hold.customer_name,hold.customer_email,hold.customer_phone,
    hold.service_address,hold.postcode,hold.vehicle_details,hold.notes,
    hold.hold_expires_at,hold.amount_total,hold.booking_payment_amount,
    hold.balance_amount,hold.balance_notice_at,hold.balance_due_at,
    hold.balance_status,hold.licence_required,hold.licence_status,
    hold.safe_work_area_confirmed,hold.appointment_time,hold.terms_version,
    hold.terms_accepted_at,hold.terms_customer_name,
    JSON.stringify([{type:"booking",version:hold.terms_version}]),
    hold.damage_security_amount,now.toISOString(),ukClock(now).date
  ];
}
