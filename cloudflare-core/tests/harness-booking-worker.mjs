// NEVER DEPLOY: dummy-data-only local Wrangler D1 booking conflict harness.
// All endpoints 404 unless the explicit CI-only local variable is provided.
// This is NOT the site's real booking API.
import {HOLD_SQL} from "./_generated-hold-sql.mjs";
const ALLOWED_DATES=new Set(["2026-10-25","2026-10-26","2026-10-27","2026-10-28"]);
const NOW="2026-10-18T07:00:00.000Z";
const EXPIRY="2026-10-18T07:20:00.000Z";
const json=(body,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{"content-type":"application/json","cache-control":"no-store"}
});
export default {
 async fetch(request,env) {
   if(env.LOCAL_D1_TEST!=="only_action_runner")return new Response("Not found",{status:404});
   const u=new URL(request.url);
   if(request.method==="GET"&&u.pathname==="/__test__/count"){
     const date=u.searchParams.get("date");
     if(!ALLOWED_DATES.has(date))return json({error:"invalid_date"},400);
     const r=await env.DB.prepare("SELECT COUNT(*) AS count FROM bookings WHERE booking_date=?1").bind(date).first();
     return json({count:Number(r.count)});
   }
   if(request.method==="POST"&&u.pathname==="/__test__/block"){
     const b=await request.json().catch(()=>null);
     if(!b||!ALLOWED_DATES.has(b.date))return json({error:"invalid_date"},400);
     const sid=b.service_id===null?null:
       (b.service_id==="vehicle_hire_day"?"vehicle_hire_day":undefined);
     if(sid===undefined)return json({error:"invalid_scope"},400);
     await env.DB.prepare("INSERT INTO availability_blocks(block_date,service_id,label) VALUES (?1,?2,'CI test')").bind(b.date,sid).run();
     return json({blocked:true});
   }
   if(request.method==="POST"&&u.pathname==="/__test__/hold"){
     const b=await request.json().catch(()=>null);
     if(!b||!ALLOWED_DATES.has(b.date)|| !/^bk_[A-Za-z0-9]{16,36}$/.test(b.bookingId||""))
       return json({error:"invalid_fixture"},400);
     const values=[
       b.bookingId,"track_day_support","full_day",b.date,
       "Example Dummy","dummy@example.invalid","0000000000",
       null,null,null,null,EXPIRY,50000,50000,0,
       null,null,null,0,null,0,null,
       "2026-10-07-v10",NOW,"Example Dummy",
       '[{"type":"booking","version":"2026-10-07-v10"}]',
       null,NOW,"2026-10-18"
     ];
     const result=await env.DB.prepare(HOLD_SQL).bind(...values).first();
     return json({accepted:!!result});
   }
   return new Response("Not found",{status:404});
 }
};
