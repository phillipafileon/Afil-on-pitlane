// Afiléon Core booking policy prototype — STAGING / TESTS ONLY.
// NOT imported by the deployed Worker. Do not use it to authorise payment or
// take bookings until DB-atomic conflict checks and compiled runtime parity pass.
export function ukClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"
  }).formatToParts(now).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
  const hour=Number(parts.hour), minute=Number(parts.minute), second=Number(parts.second);
  return {
    date:`${parts.year}-${parts.month}-${parts.day}`,
    seconds:hour*3600+minute*60+second
  };
}
export function validIsoDate(date) {
  if(typeof date!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) return false;
  const d=new Date(date+"T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===date;
}
export function daysBetween(a,b) {
  if(!validIsoDate(a)||!validIsoDate(b)) throw Error("invalid_iso_date");
  return Math.round((Date.parse(b+"T12:00:00Z")-Date.parse(a+"T12:00:00Z"))/86400000);
}
function cutoffSeconds(value) {
  if(value==="24:00")return 86400;
  if(!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value))throw Error("invalid_cutoff");
  const [h,m]=value.split(":").map(Number);
  return h*3600+m*60;
}
function fail(reason) { return {ok:false,reason}; }
export function evaluateDatePolicy({service,bookingDate,now=new Date(),
  phase="checkout_start",cutoffs,inspectionSlots=[],appointmentTime,
  closure=null,blocks=[]}) {
  if(!service||!service.id)return fail("unknown_service");
  if(service.bookable===false)return fail("service_not_live");
  if(!validIsoDate(bookingDate))return fail("invalid_date");
  const clock=ukClock(now);
  const days=daysBetween(clock.date,bookingDate);
  if(days<1)return fail("same_day_unavailable");
  if(days>=184)return fail("date_outside_booking_window");
  if(!cutoffs||!cutoffs.default)return fail("booking_policy_unavailable");
  const policy=cutoffs[service.id]||cutoffs.default;
  if(days===1) {
    if(cutoffSeconds(policy.payment_cutoff)<=clock.seconds)return fail("next_day_cutoff_passed");
    if(phase==="checkout_start" && service.payment!=="quote" &&
      cutoffSeconds(policy.checkout_start_cutoff)<=clock.seconds)
      return fail("checkout_window_closed");
  }
  const start=closure?.start_date||null,end=closure?.end_date||null;
  if(start&&end&&start<=end){
    const closedNow=clock.date>=start&&clock.date<=end;
    const requestedClosed=bookingDate>=start&&bookingDate<=end;
    if(closedNow||requestedClosed)return fail("business_temporarily_closed");
  }
  const matching=blocks.filter(b=>b.block_date===bookingDate).map(b=>b.service_id||"");
  const legacy=new Set(matching);
  if(legacy.has("")||legacy.has("*")||legacy.has(service.id)||
    ["vehicle_hire_day","track_day_support","vehicle_transport"].every(x=>legacy.has(x)))
    return fail("date_unavailable");
  if(service.id==="pre_track_inspection"&&!inspectionSlots.includes(appointmentTime))
    return fail("inspection_time_required");
  return {ok:true,reason:null,days};
}

// Date-only policy evaluation CANNOT prevent double-bookings. Any booking
// insert must later recheck active holds/confirmed/manual reservations against
// D1 using an atomic database write and recheck at Stripe checkout time.
