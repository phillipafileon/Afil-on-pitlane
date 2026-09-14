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

async function recordFor(env,track,layout){
  return await env.DB.prepare(`
    SELECT track, layout, record_ms, record_holder, record_vehicle, record_source, source_url, verified_at, updated_at
    FROM track_records
    WHERE track = ? COLLATE NOCASE AND layout = ? COLLATE NOCASE
    LIMIT 1
  `).bind(track,layout).first();
}

async function validateAgainstRecord(env,track,layout,lap_ms){
  const ref=await recordFor(env,track,layout);
  if(!ref) return {ok:false,status:422,error:'reference_record_required'};
  if(Number(lap_ms)<Number(ref.record_ms)){
    return {ok:false,status:422,error:'faster_than_reference_record',reference:ref};
  }
  return {ok:true,reference:ref};
}

async function top10(env){
  const {results=[]}=await env.DB.prepare(`
    SELECT le.id, le.display_name, le.country, le.track, le.layout, le.lap_ms, le.source, le.verified, le.created_at,
           tr.record_ms, tr.record_holder, tr.record_vehicle, tr.record_source, tr.source_url, tr.verified_at
    FROM leaderboard_entries le
    JOIN track_records tr
      ON le.track = tr.track COLLATE NOCASE
     AND le.layout = tr.layout COLLATE NOCASE
    WHERE le.approved=1
      AND le.source='pitlane-gps'
      AND le.lap_ms >= tr.record_ms
    ORDER BY le.track COLLATE NOCASE, le.layout COLLATE NOCASE, le.lap_ms ASC, le.created_at ASC
  `).all();
  const tracks={}, references={};
  for(const r of results){
    tracks[r.track] ||= {};
    tracks[r.track][r.layout] ||= [];
    references[r.track] ||= {};
    references[r.track][r.layout] ||= {
      record_ms:r.record_ms,
      record_holder:r.record_holder,
      record_vehicle:r.record_vehicle,
      record_source:r.record_source,
      source_url:r.source_url,
      verified_at:r.verified_at
    };
    if(tracks[r.track][r.layout].length<10){
      tracks[r.track][r.layout].push({
        id:r.id, display_name:r.display_name, country:r.country,
        lap_ms:r.lap_ms, source:r.source, verified:!!r.verified, created_at:r.created_at
      });
    }
  }
  const {results:refRows=[]}=await env.DB.prepare(`
    SELECT track, layout, record_ms, record_holder, record_vehicle, record_source, source_url, verified_at
    FROM track_records
    ORDER BY track COLLATE NOCASE, layout COLLATE NOCASE
  `).all();
  for(const r of refRows){
    references[r.track] ||= {};
    references[r.track][r.layout] = {
      record_ms:r.record_ms,
      record_holder:r.record_holder,
      record_vehicle:r.record_vehicle,
      record_source:r.record_source,
      source_url:r.source_url,
      verified_at:r.verified_at
    };
  }
  return {version:2,updated_at:new Date().toISOString(),tracks,references};
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
      const gate=await validateAgainstRecord(env,track,layout,lap_ms);
      if(!gate.ok) return json({error:gate.error,reference:gate.reference||null},gate.status);
      try{
        await env.DB.prepare(`INSERT INTO submissions
          (submission_id,driver_id,display_name,country,track,layout,lap_ms,source,status,profile_confirmed,app_version,review_state,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
          .bind(submission_id,clean(b.driver_id,160),clean(b.display_name,80)||'Anonymous',clean(b.country,80),track,layout,Math.round(lap_ms),'gps','valid',1,clean(b.app_version,40),'pending').run();
      }catch(e){
        if(String(e).toLowerCase().includes('unique')) return json({ok:true,duplicate:true},409);
        return json({error:'storage_error'},500);
      }
      return json({ok:true,state:'pending_review',reference_ms:gate.reference.record_ms},202);
    }

    if(request.method==='POST' && path.endsWith('/api/pitlane/admin/add')){
      if(!adminOK(request,env)) return json({error:'unauthorized'},401);
      let b; try{b=await request.json()}catch{return json({error:'invalid_json'},400)}
      const track=clean(b.track),layout=clean(b.layout),lap_ms=Number(b.lap_ms),source=clean(b.source,20);
      if(!track||!layout||source!=='gps'||!Number.isFinite(lap_ms)||lap_ms<5000||lap_ms>3600000) return json({error:'gps_only'},400);
      const gate=await validateAgainstRecord(env,track,layout,lap_ms);
      if(!gate.ok) return json({error:gate.error,reference:gate.reference||null},gate.status);
      const id=crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO leaderboard_entries
        (id,display_name,country,track,layout,lap_ms,source,verified,approved,created_at)
        VALUES (?,?,?,?,?,?,?,?,1,datetime('now'))`)
        .bind(id,clean(b.display_name,80)||'Anonymous',clean(b.country,80),track,layout,Math.round(lap_ms),'pitlane-gps',1).run();
      return json({ok:true,id});
    }

    if(request.method==='POST' && path.endsWith('/api/pitlane/admin/approve')){
      if(!adminOK(request,env)) return json({error:'unauthorized'},401);
      let b; try{b=await request.json()}catch{return json({error:'invalid_json'},400)}
      const sid=clean(b.submission_id,160);if(!sid)return json({error:'missing_submission_id'},400);
      const row=await env.DB.prepare(`SELECT * FROM submissions WHERE submission_id=?`).bind(sid).first();
      if(!row)return json({error:'not_found'},404);
      if(row.source!=='gps'||row.status!=='valid'||Number(row.profile_confirmed)!==1) return json({error:'gps_only'},400);
      const gate=await validateAgainstRecord(env,row.track,row.layout,row.lap_ms);
      if(!gate.ok){
        await env.DB.prepare(`UPDATE submissions SET review_state='rejected', reviewed_at=datetime('now') WHERE submission_id=?`).bind(sid).run();
        return json({error:gate.error,reference:gate.reference||null},gate.status);
      }
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

    if(request.method==='POST' && path.endsWith('/api/pitlane/admin/set-record')){
      if(!adminOK(request,env)) return json({error:'unauthorized'},401);
      let b; try{b=await request.json()}catch{return json({error:'invalid_json'},400)}
      const track=clean(b.track),layout=clean(b.layout),record_ms=Math.round(Number(b.record_ms));
      if(!track||!layout||!Number.isFinite(record_ms)||record_ms<5000||record_ms>3600000) return json({error:'invalid_record'},400);
      const source_url=clean(b.source_url,500),record_source=clean(b.record_source,160);
      if(!record_source) return json({error:'record_source_required'},400);
      await env.DB.prepare(`
        INSERT INTO track_records
          (track,layout,record_ms,record_holder,record_vehicle,record_source,source_url,verified_at,updated_at)
        VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))
        ON CONFLICT(track,layout) DO UPDATE SET
          record_ms=excluded.record_ms,
          record_holder=excluded.record_holder,
          record_vehicle=excluded.record_vehicle,
          record_source=excluded.record_source,
          source_url=excluded.source_url,
          verified_at=datetime('now'),
          updated_at=datetime('now')
      `).bind(track,layout,record_ms,clean(b.record_holder,120),clean(b.record_vehicle,160),record_source,source_url).run();
      return json({ok:true,track,layout,record_ms});
    }

    if(request.method==='GET' && path.endsWith('/api/pitlane/admin/records')){
      if(!adminOK(request,env)) return json({error:'unauthorized'},401);
      const {results=[]}=await env.DB.prepare(`SELECT * FROM track_records ORDER BY track COLLATE NOCASE, layout COLLATE NOCASE`).all();
      return json({records:results});
    }

    return json({error:'not_found'},404);
  }
};