// CI-only calls to 127.0.0.1:8790, using dummy admin identities.
import assert from "node:assert/strict";
const base="http://127.0.0.1:8790";
const token="adms_"+"a".repeat(64);
const staffToken="adms_"+"b".repeat(64);
const expiredToken="adms_"+"c".repeat(64);
async function post(path,value) {
 const r=await fetch(base+path,{method:"POST",
  headers:{"content-type":"application/json"},body:JSON.stringify(value)});
 return {status:r.status,value:await r.json()};
}
async function privateRead({authorization,origin,legacy}={}) {
 const headers={};
 if(authorization)headers.Authorization=authorization;
 if(origin)headers.Origin=origin;
 if(legacy)headers["x-admin-token"]=legacy;
 const r=await fetch(base+"/__test__/private",{headers});
 return {status:r.status,value:await r.json()};
}
assert.equal((await privateRead()).status,401);
assert.equal((await privateRead({legacy:"shared_token"})).status,401);
assert.equal((await privateRead({authorization:"Bearer "+token})).status,401);
for(const fixture of [
 {token,username:"owner@example.invalid",expiresAt:"2026-10-19T11:00:00.000Z"},
 {token:staffToken,username:"staff@example.invalid",expiresAt:"2026-10-19T11:00:00.000Z"},
 {token:expiredToken,username:"owner@example.invalid",expiresAt:"2026-10-19T09:00:00.000Z"}
])assert.equal((await post("/__test__/seed",fixture)).status,200);
assert.deepEqual(await privateRead({authorization:"Bearer "+token}),
 {status:200,value:{owner:true}});
assert.equal((await privateRead({authorization:"Bearer "+staffToken})).status,403);
assert.equal((await privateRead({authorization:"Bearer "+expiredToken})).status,401);
assert.equal((await privateRead({authorization:"Bearer "+token,origin:"https://evil.invalid"})).status,403);
assert.equal((await privateRead({authorization:"Bearer "+token,origin:"https://afileonmotorsport.co.uk"})).status,200);
assert.equal((await post("/__test__/revoke",{token})).status,200);
assert.equal((await privateRead({authorization:"Bearer "+token})).status,401);
console.log("PASS: Wrangler local D1 owner-only bearer session, non-owner rejection, expiry, origin and revocation");
