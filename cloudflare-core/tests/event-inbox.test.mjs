import test from "node:test";
import assert from "node:assert/strict";
import {rawPayloadHash,eventInboxClaimBindings} from "../webhooks/event-inbox.mjs";
test("Stripe raw body SHA256 is deterministic and detects tampering",async()=>{
  const first=await rawPayloadHash('{"id":"evt_xxxxxxxxxxx"}');
  const next=await rawPayloadHash('{"id":"evt_xxxxxxxxxxx"} ');
  assert.match(first,/^[a-f0-9]{64}$/);
  assert.notEqual(first,next);
  assert.equal(first,await rawPayloadHash(new TextEncoder().encode('{"id":"evt_xxxxxxxxxxx"}')));
});
test("claims require event IDs, types, hashes, non-reused leases",async()=>{
  const sha="a".repeat(64);
  const valid={
    eventId:"evt_1234567890",eventType:"checkout.session.completed",
    bodySha256:sha,leaseToken:"lease_1234567890abcdef",
    now:new Date("2026-10-18T08:00:00.000Z")
  };
  const a=eventInboxClaimBindings(valid);
  assert.equal(a.length,6);assert.equal(a[0],valid.eventId);
  assert.equal(a[5],"2026-10-18T08:01:00.000Z");
  for(const update of [
    {eventId:"evt_bad"},{eventType:"checkout;drop"},
    {bodySha256:"not-sha"},{leaseToken:"tiny"},
    {leaseSeconds:181}
  ])assert.throws(()=>eventInboxClaimBindings({...valid,...update}));
});
test("overlarge / invalid bodies reject",async()=>{
  await assert.rejects(()=>rawPayloadHash(new Uint8Array(1048577)));
  await assert.rejects(()=>rawPayloadHash(null));
});
