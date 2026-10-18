// Staging-only Stripe event-inbox helpers, NOT WIRED TO THE WORKER.
// A signature must be verified before use. Claims alone never acknowledge payment.
// Completion and the corresponding booking/order mutation MUST be batched atomically.
const bytes = new TextEncoder();
export async function rawPayloadHash(rawBody) {
  if (!(rawBody instanceof Uint8Array) && typeof rawBody !== "string")
    throw Error("invalid_raw_body");
  const input = typeof rawBody === "string" ? bytes.encode(rawBody) : rawBody;
  if (input.length > 1048576) throw Error("payload_too_large");
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256",input));
  return [...hash].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export function eventInboxClaimBindings({
  eventId,eventType,bodySha256,leaseToken,now=new Date(),leaseSeconds=60
}) {
  if (!/^evt_[A-Za-z0-9]{8,128}$/.test(eventId || "")) throw Error("invalid_event_id");
  if (typeof eventType!=="string"|| !/^[a-z_]+(?:[.][a-z_]+){1,5}$/.test(eventType))
    throw Error("invalid_event_type");
  if (!/^[a-f0-9]{64}$/.test(bodySha256||"")) throw Error("invalid_body_hash");
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(leaseToken||"")) throw Error("invalid_lease_token");
  if (!(now instanceof Date)|| !Number.isFinite(now.getTime())||
      !Number.isInteger(leaseSeconds)||leaseSeconds<10||leaseSeconds>180)
    throw Error("invalid_event_lease");
  return [
    eventId,eventType,bodySha256,leaseToken,now.toISOString(),
    new Date(now.getTime()+leaseSeconds*1000).toISOString()
  ];
}
