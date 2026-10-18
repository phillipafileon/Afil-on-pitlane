// CI-ONLY: protected admin test endpoint, NEVER DEPLOY as a customer Worker.
import {adminSessionHash,verifyOwnerSession} from "../admin/owner-session.mjs";
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const VALID="^adms_[a-f0-9]{64}$";
export default {
 async fetch(req,env) {
  if(env.LOCAL_D1_TEST!=="only_action_runner")return new Response("Not found",{status:404});
  const path=new URL(req.url).pathname;
  if(req.method==="POST" && path==="/__test__/seed"){
    const data=await req.json().catch(()=>null);
    if(!data||typeof data.token!=="string"||!(new RegExp(VALID)).test(data.token)||
      !["owner@example.invalid","staff@example.invalid"].includes(data.username)||
      !["2026-10-19T11:00:00.000Z","2026-10-19T09:00:00.000Z"].includes(data.expiresAt))
      return json({error:"invalid_test_fixture"},400);
    const hash=await adminSessionHash(data.token);
    await env.DB.prepare(
      "INSERT INTO admin_sessions(token_hash,username,expires_at) VALUES(?1,?2,?3)"
    ).bind(hash,data.username,data.expiresAt).run();
    return json({seeded:true});
  }
  if(req.method==="POST"&&path==="/__test__/revoke"){
    const data=await req.json().catch(()=>null);
    if(!data||typeof data.token!=="string"||!(new RegExp(VALID)).test(data.token))
      return json({error:"invalid_test_fixture"},400);
    const hash=await adminSessionHash(data.token);
    await env.DB.prepare("UPDATE admin_sessions SET revoked_at='2026-10-19T10:00:00.000Z' WHERE token_hash=?1").bind(hash).run();
    return json({revoked:true});
  }
  if(req.method==="GET"&&path==="/__test__/private"){
    const auth=await verifyOwnerSession(req,env,{now:new Date("2026-10-19T10:00:00.000Z")});
    if(!auth.ok)return json({error:auth.error},auth.status);
    return json({owner:true}); // no token, PII, or hash in response
  }
  return new Response("Not found",{status:404});
 }
};
