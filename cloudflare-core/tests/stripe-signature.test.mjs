import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { verifyStripeWebhook } from "../stripe-signature.mjs";
globalThis.crypto ??= webcrypto;
const encoder = new TextEncoder();
const secret = "whsec_test_only_not_real_credentials";
const t = 1792330000; // known fixture time; test injects this same clock
const nowMs = t * 1000;
async function signature(body, timestamp = t, signingSecret = secret) {
  const key = await crypto.subtle.importKey(
    "raw",encoder.encode(signingSecret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes = body instanceof Uint8Array ? body : encoder.encode(body);
  const prefix = encoder.encode(String(timestamp)+".");
  const signed = new Uint8Array(prefix.length+bytes.length);
  signed.set(prefix);signed.set(bytes,prefix.length);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC",key,signed));
  return Array.from(digest).map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function ok(body, header, override = {}) {
  return verifyStripeWebhook({rawBody:body,signatureHeader:header,
    webhookSecret:secret,nowMs,...override});
}
const body=JSON.stringify({id:"evt_test1",type:"checkout.session.completed",data:{object:{id:"cs_test1"}}});
test("valid signed raw payload passes",async()=>{
  assert.equal(await ok(body,`t=${t},v1=${await signature(body)}`),true);
});
test("same payload as Uint8Array passes",async()=>{
  assert.equal(await ok(encoder.encode(body),`t=${t},v1=${await signature(body)}`),true);
});
test("changed JSON whitespace fails; raw bytes matter",async()=>{
  assert.equal(await ok(body+" ",`t=${t},v1=${await signature(body)}`),false);
});
test("wrong endpoint secret fails",async()=>{
  assert.equal(await ok(body,`t=${t},v1=${await signature(body,t,"whsec_other")}`),false);
});
test("timestamp too old, future or malformed fails",async()=>{
  const old=t-301,future=t+301;
  assert.equal(await ok(body,`t=${old},v1=${await signature(body,old)}`),false);
  assert.equal(await ok(body,`t=${future},v1=${await signature(body,future)}`),false);
  assert.equal(await ok(body,`t=abc,v1=${await signature(body)}`),false);
  assert.equal(await ok(body,`t=${t},t=${t},v1=${await signature(body)}`),false);
});
test("signature rotation allows one valid v1 among invalid entries",async()=>{
  assert.equal(await ok(body,`t=${t},v1=${"0".repeat(64)},v1=${await signature(body)}`),true);
});
test("missing/bad/unrecognised signature fails",async()=>{
  assert.equal(await ok(body,`t=${t},v0=${await signature(body)}`),false);
  assert.equal(await ok(body,`t=${t},v1=not-hex`),false);
  assert.equal(await ok(body,""),false);
  assert.equal(await ok(body,`t=${t},v1=${"f".repeat(64)}`),false);
});
test("missing webhook secret fails",async()=>{
  assert.equal(await ok(body,`t=${t},v1=${await signature(body)}`,{webhookSecret:""}),false);
});
test("large bodies and oversized headers fail closed",async()=>{
  assert.equal(await ok("X".repeat(1048577),`t=${t},v1=${"f".repeat(64)}`),false);
  assert.equal(await ok(body,"x".repeat(2049)),false);
});
test("header is independent of querystring/URL but not body bytes",async()=>{
  const header=`t=${t},v1=${await signature(body)}`;
  assert.equal(await ok(body,header),true);
});
