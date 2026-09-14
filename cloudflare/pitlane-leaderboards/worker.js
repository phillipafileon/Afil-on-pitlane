const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store'
};
const json = (body, status=200) => new Response(JSON.stringify(body), {status, headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
const clean = (v,max=120) => String(v??'').trim().slice(0,max);
const adminOK = (req,env) => {
  const a=req.headers.get('Authorization')||'';
  return env.ADMIN_TOKEN && a===`Bearer ${env.ADMIN_TOKEN}`;
};

async function top10(env){
  const {results=[]}=await env.DB.prepare(`
    SELECT id, display_name, country, track, layout, lap_ms, source, verified, created_at
    FROM leaderboard_entries
    WHERE approved=1
    ORDER BY track COLLATE NOCASE, layout COLLATE NOCASE, lap_ms ASC, created_at ASC
  `).all();
  const tracks={};
  for(const r of results){
    tracks[r.track] ||= {};
    tracks[r.track][r.layout] ||= [];
    if(tracks[r.track][r.layout].length<10){
      tracks[r.track][r.layout].push({
        id:r.id, display_name:r.display_name, country:r.country,
        lap_ms:r.lap_ms, source:r.source, verified:!!r.verified, created_at:r.created_at
      });
    }
  }
  return {version:1,updated_at:new Date().toISOString(),tracks};
}

export default {
  async fetch(request, env){
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    const url=new URL(request.url);
    const path=url.pathname.replace(/\/+$/,'');

    if(request.method==='GET' && path.endsWith('/api/pitlane/leaderboards')){
      return json(await top10(env));
    }

    if(request.method==='POST' && path.endsWith('/api/pitlane/submit')){
      let b; try{b=await request.json()}catch{return json({error:'invalid_json'},400)}
      const submission_id=clean(b.submission_id,160), track=clean(b.track), layout=clean(b.layout), source=clean(b.source,20);
      const lap_ms=Number(b.lap_ms);
      if(!submission_id||!track||!layout||source!=='gps'||b.status!=='valid'||b.profile_confirmed!==true||!Number.isFinite(lap_ms)||lap_ms<5000||lap_ms>3600000){
        return json({error:'invalid_submission'},400);
      }
      try{
        await env.DB.prepare(`INSERT INTO submissions
          (submission_id,driver_id,display_name,country,track,layout,lap_ms,source,status,profile_confirmed,app_version,review_state,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
          .bind(submission_id,clean(b.driver_id,160),clean(b.display_name,80)||'Anonymous',clean(b.country,80),track,layout,Math.round(lap_ms),'gps','valid',1,clean(b.app_version,40),'pending').run();
      }catch(e){
        if(String(e).toLowerCase().includes('unique')) return json({ok:true,duplicate:true},409);
        return json({error:'storage_error'},500);
      }
      return json({ok:true,state:'pending_review'},202);
    }

    if(request.method==='POST' && path.endsWith('/api/pitlane/admin/add')){
      if(!adminOK(request,env)) return json({error:'unauthorized'},401);
      let b; try{b=await request.json()}catch{return json({error:'invalid_json'},400)}
      const track=clean(b.track),layout=clean(b.layout),lap_ms=Number(b.lap_ms);
      if(!track||!layout||!Number.isFinite(lap_ms)||lap_ms<5000||lap_ms>3600000) return json({error:'invalid_entry'},400);
      const id=crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO leaderboard_entries
        (id,display_name,country,track,layout,lap_ms,source,verified,approved,created_at)
        VALUES (?,?,?,?,?,?,?,?,1,datetime('now'))`)
        .bind(id,clean(b.display_name,80)||'Anonymous',clean(b.country,80),track,layout,Math.round(lap_ms),clean(b.source,30)||'admin',b.verified===false?0:1).run();
      return json({ok:true,id});
    }

    if(request.method==='POST' && path.endsWith('/api/pitlane/admin/approve')){
      if(!adminOK(request,env)) return json({error:'unauthorized'},401);
      let b; try{b=await request.json()}catch{return json({error:'invalid_json'},400)}
      const sid=clean(b.submission_id,160);if(!sid)return json({error:'missing_submission_id'},400);
      const row=await env.DB.prepare(`SELECT * FROM submissions WHERE submission_id=?`).bind(sid).first();
      if(!row)return json({error:'not_found'},404);
      const id=crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO leaderboard_entries
          (id,display_name,country,track,layout,lap_ms,source,verified,approved,created_at)
          VALUES (?,?,?,?,?,?,?,?,1,datetime('now'))`)
          .bind(id,row.display_name,row.country,row.track,row.layout,row.lap_ms,'pitlane-gps',1),
        env.DB.prepare(`UPDATE submissions SET review_state='approved', reviewed_at=datetime('now') WHERE submission_id=?`).bind(sid)
      ]);
      return json({ok:true,id});
    }

    if(request.method==='POST' && path.endsWith('/api/pitlane/admin/reject')){
      if(!adminOK(request,env)) return json({error:'unauthorized'},401);
      let b; try{b=await request.json()}catch{return json({error:'invalid_json'},400)}
      const sid=clean(b.submission_id,160);if(!sid)return json({error:'missing_submission_id'},400);
      await env.DB.prepare(`UPDATE submissions SET review_state='rejected', reviewed_at=datetime('now') WHERE submission_id=?`).bind(sid).run();
      return json({ok:true});
    }

    if(request.method==='GET' && path.endsWith('/api/pitlane/admin/pending')){
      if(!adminOK(request,env)) return json({error:'unauthorized'},401);
      const {results=[]}=await env.DB.prepare(`SELECT submission_id,driver_id,display_name,country,track,layout,lap_ms,app_version,created_at FROM submissions WHERE review_state='pending' ORDER BY created_at ASC LIMIT 250`).all();
      return json({pending:results});
    }

    return json({error:'not_found'},404);
  }
};