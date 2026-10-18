import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {adminSessionHash,verifyOwnerSession} from "../admin/owner-session.mjs";
globalThis.crypto??=webcrypto;
const now=new Date("2026-10-19T10:00:00.000Z");
const token="adms_"+"a".repeat(64);
let records=new Map();
const env=()=>({
  SITE_ORIGIN:"https://afileonmotorsport.co.uk",
  ADMIN_OWNER_USERNAME:"test-owner@example.invalid",
  DB:{prepare(sql) {
    assert.match(sql,/FROM admin_sessions/);
    return {bind(hash,at){
      assert.equal(at,now.toISOString());
      return {async first(){return records.get(hash)||null;}};
    }};
  }}
});
const make=(auth,origin=null)=>new Request("https://example.invalid/api/admin/summary",{
  headers:{...(auth?{Authorization:auth}:{}),...(origin?{Origin:origin}:{})}
});
test("session SHA256 matches bearer contract and no legacy token fallback",async()=>{
  assert.match(await adminSessionHash(token),/^[a-f0-9]{64}$/);
  await assert.rejects(()=>adminSessionHash("unknown"));
  records.clear();
  assert.equal((await verifyOwnerSession(make(null),env(),{now})).ok,false);
  assert.equal((await verifyOwnerSession(make("admin_shared_token"),env(),{now})).ok,false);
  assert.equal((await verifyOwnerSession(make("Bearer "+token.toUpperCase()),env(),{now})).ok,false);
});
test("only valid unrevoked, future-expiring owner token may read private data",async()=>{
  records.clear();
  const hash=await adminSessionHash(token);
  records.set(hash,{username:"test-owner@example.invalid",expires_at:"2026-10-20T12:00:00.000Z",revoked_at:null});
  const out=await verifyOwnerSession(make("Bearer "+token),env(),{now});
  assert.equal(out.ok,true);
  assert.equal(out.session_hash,hash);
  assert.equal((await verifyOwnerSession(make("Bearer "+token,"https://afileonmotorsport.co.uk"),env(),{now})).ok,true);
});
test("other users, revoked or expired sessions cannot access owner functions",async()=>{
  const hash=await adminSessionHash(token);
  for(const row of [
    {username:"staff@example.invalid",expires_at:"2026-10-20T12:00:00.000Z",revoked_at:null},
    {username:"test-owner@example.invalid",expires_at:"2026-10-18T12:00:00.000Z",revoked_at:null},
    {username:"test-owner@example.invalid",expires_at:"2026-10-20T12:00:00.000Z",revoked_at:"2026-10-19T09:00:00.000Z"},
    {username:"test-owner@example.invalid",expires_at:"wrong",revoked_at:null}
  ]) {
    records.set(hash,row);
    assert.equal((await verifyOwnerSession(make("Bearer "+token),env(),{now})).ok,false);
  }
});
test("explicit Origin restrictions prevent cross-site admin token use",async()=>{
  const hash=await adminSessionHash(token);
  records.set(hash,{username:"test-owner@example.invalid",expires_at:"2026-10-20T12:00:00.000Z",revoked_at:null});
  for(const origin of [
    "https://afileonmotorsport.co.uk.attacker.invalid",
    "http://afileonmotorsport.co.uk",
    "https://unauthorised.invalid"
  ]) {
    const res=await verifyOwnerSession(make("Bearer "+token,origin),env(),{now});
    assert.equal(res.error,"origin_forbidden");
  }
});
test("missing admin identity/DB and errors always fail closed",async()=>{
  const broken=env(); delete broken.ADMIN_OWNER_USERNAME;
  assert.equal((await verifyOwnerSession(make("Bearer "+token),broken,{now})).status,503);
  const failed=env();failed.DB={prepare(){throw Error("local db down")}};
  assert.equal((await verifyOwnerSession(make("Bearer "+token),failed,{now})).status,503);
});
