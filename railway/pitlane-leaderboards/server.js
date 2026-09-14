import express from 'express';
import pg from 'pg';
import crypto from 'crypto';

const {Pool}=pg;
const app=express();
app.set('trust proxy',1);
app.use(express.json({limit:'32kb'}));
app.use((req,res,next)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  res.setHeader('Cache-Control','no-store');
  if(req.method==='OPTIONS')return res.sendStatus(204);
  next();
});

const PORT=Number(process.env.PORT||3000);
const ADMIN_TOKEN=String(process.env.ADMIN_TOKEN||'');
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false}}):null;
const memory={entries:[],submissions:new Set(),records:new Map()};
const clean=(v,max=120)=>String(v??'').trim().slice(0,max);
const keyOf=(track,layout)=>`${String(track).toLowerCase()}|${String(layout).toLowerCase()}`;

const BANNED_NAMES=new Set(['fuck','fucker','fucking','shit','shitty','bitch','cunt','twat','wanker','bollocks','arsehole','asshole','dick','dickhead','cock','pussy','prick','slut','whore','bastard','motherfucker']);
const RESERVED_NAMES=new Set(['admin','administrator','moderator','afileon','afileonmotorsport','pitlaneofficial','officialafileon']);
function displayNameCheck(raw){
  const name=String(raw??'').trim().replace(/\s+/g,' ');
  if(name.length<2||name.length>30)return {ok:false};
  if(!/^[\p{L}\p{N} .,'’_-]+$/u.test(name))return {ok:false};
  const n=name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[@4]/g,'a').replace(/[3]/g,'e').replace(/[1!|]/g,'i').replace(/[0]/g,'o').replace(/[5$]/g,'s').replace(/[7]/g,'t');
  const words=n.split(/[^a-z0-9]+/).filter(Boolean),compact=words.join('');
  if(words.some(w=>BANNED_NAMES.has(w))||BANNED_NAMES.has(compact)||RESERVED_NAMES.has(compact))return {ok:false};
  return {ok:true,name};
}

const FALLBACK_FLOORS={
  short:{class_name:'Short / Indy',record_ms:38032,record_holder:'Scott Mansell',record_vehicle:'Benetton B197',record_source:'Brands Hatch official circuit record',source_url:'https://www.brandshatch.co.uk/about/circuit-map'},
  gp:{class_name:'Grand Prix / long',record_ms:62939,record_holder:'Valtteri Bottas',record_vehicle:'Mercedes F1 W11',record_source:'Formula 1 2020 Austrian GP qualifying',source_url:'https://www.formula1.com/en/results/2020/races/1045/austria/qualifying'}
};
const layoutClass=layout=>/(grand\s*prix|\bgp\b|international|nordschleife|combined)/i.test(String(layout||''))?'gp':'short';
const fallbackFor=layout=>({...FALLBACK_FLOORS[layoutClass(layout)],fallback:true,layout_class:layoutClass(layout)});

async function initDb(){
  if(!pool)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS leaderboard_entries(
    id TEXT PRIMARY KEY,
    submission_id TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT '',
    track TEXT NOT NULL,
    layout TEXT NOT NULL,
    lap_ms INTEGER NOT NULL,
    source TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lb_track_layout_time ON leaderboard_entries(track,layout,lap_ms,created_at)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS track_records(
    track TEXT NOT NULL,
    layout TEXT NOT NULL,
    record_ms INTEGER NOT NULL,
    record_holder TEXT NOT NULL DEFAULT '',
    record_vehicle TEXT NOT NULL DEFAULT '',
    record_source TEXT NOT NULL,
    source_url TEXT NOT NULL DEFAULT '',
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(track,layout)
  )`);
}

async function recordFor(track,layout){
  if(pool){
    const r=await pool.query('SELECT * FROM track_records WHERE LOWER(track)=LOWER($1) AND LOWER(layout)=LOWER($2) LIMIT 1',[track,layout]);
    return r.rows[0]||null;
  }
  return memory.records.get(keyOf(track,layout))||null;
}
async function validateLap(track,layout,lapMs){
  const exact=await recordFor(track,layout);
  const ref=exact?{...exact,fallback:false,layout_class:layoutClass(layout)}:fallbackFor(layout);
  if(Number(lapMs)<Number(ref.record_ms))return {ok:false,error:exact?'faster_than_reference_record':'faster_than_fallback_floor',reference:ref};
  return {ok:true,reference:ref,mode:exact?'exact':'fallback'};
}

const ipHits=new Map();
function rateLimited(req){
  const ip=req.ip||req.socket.remoteAddress||'unknown',now=Date.now(),windowMs=60_000,limit=60;
  let x=ipHits.get(ip);
  if(!x||now-x.start>windowMs)x={start:now,count:0};
  x.count++;ipHits.set(ip,x);
  return x.count>limit;
}

app.get('/health',(req,res)=>res.json({ok:true,service:'Afiléon Pitlane Leaderboards',database:!!pool,time:new Date().toISOString()}));

app.get('/api/pitlane/leaderboards',async(req,res)=>{
  try{
    let rows=[],records=[];
    if(pool){
      rows=(await pool.query(`SELECT id,display_name,country,track,layout,lap_ms,source,verified,created_at FROM leaderboard_entries ORDER BY track,layout,lap_ms ASC,created_at ASC`)).rows;
      records=(await pool.query(`SELECT * FROM track_records ORDER BY track,layout`)).rows;
    }else{
      rows=[...memory.entries].sort((a,b)=>a.track.localeCompare(b.track)||a.layout.localeCompare(b.layout)||a.lap_ms-b.lap_ms);
      records=[...memory.records.values()];
    }
    const references={},tracks={};
    const exactMap=new Map();
    for(const r of records){
      exactMap.set(keyOf(r.track,r.layout),r);
      references[r.track]??={};
      references[r.track][r.layout]={record_ms:r.record_ms,record_holder:r.record_holder||'',record_vehicle:r.record_vehicle||'',record_source:r.record_source||'',source_url:r.source_url||'',verified_at:r.verified_at||''};
    }
    for(const r of rows){
      if(!displayNameCheck(r.display_name).ok)continue;
      const ref=exactMap.get(keyOf(r.track,r.layout))||fallbackFor(r.layout);
      if(Number(r.lap_ms)<Number(ref.record_ms))continue;
      tracks[r.track]??={};tracks[r.track][r.layout]??=[];
      if(tracks[r.track][r.layout].length<10)tracks[r.track][r.layout].push({id:r.id,display_name:r.display_name,country:r.country||'',lap_ms:Number(r.lap_ms),source:r.source,verified:!!r.verified,created_at:r.created_at});
    }
    res.json({version:5,updated_at:new Date().toISOString(),tracks,references,fallback_floors:FALLBACK_FLOORS,service:'railway'});
  }catch(e){res.status(500).json({error:'leaderboard_read_failed'});}
});

app.post('/api/pitlane/submit',async(req,res)=>{
  if(rateLimited(req))return res.status(429).json({error:'rate_limited'});
  try{
    const b=req.body||{},submissionId=clean(b.submission_id,160),track=clean(b.track),layout=clean(b.layout),source=clean(b.source,20),lapMs=Math.round(Number(b.lap_ms)),name=displayNameCheck(b.display_name);
    if(!name.ok)return res.status(422).json({error:'invalid_display_name'});
    if(!submissionId||!track||!layout||source!=='gps'||b.status!=='valid'||b.profile_confirmed!==true||!Number.isFinite(lapMs)||lapMs<5000||lapMs>3600000)return res.status(400).json({error:'invalid_submission'});
    const gate=await validateLap(track,layout,lapMs);
    if(!gate.ok)return res.status(422).json({error:gate.error,reference:gate.reference});
    const row={id:crypto.randomUUID(),submission_id:submissionId,display_name:name.name,country:clean(b.country,80),track,layout,lap_ms:lapMs,source:'pitlane-gps',verified:true,created_at:new Date().toISOString()};
    if(pool){
      try{
        await pool.query(`INSERT INTO leaderboard_entries(id,submission_id,display_name,country,track,layout,lap_ms,source,verified) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[row.id,row.submission_id,row.display_name,row.country,row.track,row.layout,row.lap_ms,row.source,true]);
      }catch(e){if(String(e.code)==='23505')return res.status(409).json({ok:true,duplicate:true});throw e;}
    }else{
      if(memory.submissions.has(submissionId))return res.status(409).json({ok:true,duplicate:true});
      memory.submissions.add(submissionId);memory.entries.push(row);
    }
    res.status(202).json({ok:true,state:'accepted',validation_mode:gate.mode,reference:gate.reference});
  }catch(e){res.status(500).json({error:'leaderboard_write_failed'});}
});

function adminOK(req){return !!ADMIN_TOKEN&&req.get('Authorization')===`Bearer ${ADMIN_TOKEN}`;}
app.post('/api/pitlane/admin/set-record',async(req,res)=>{
  if(!adminOK(req))return res.status(401).json({error:'unauthorized'});
  try{
    const b=req.body||{},track=clean(b.track),layout=clean(b.layout),recordMs=Math.round(Number(b.record_ms)),recordSource=clean(b.record_source,160);
    if(!track||!layout||!recordSource||!Number.isFinite(recordMs)||recordMs<5000||recordMs>3600000)return res.status(400).json({error:'invalid_record'});
    const row={track,layout,record_ms:recordMs,record_holder:clean(b.record_holder,120),record_vehicle:clean(b.record_vehicle,160),record_source:recordSource,source_url:clean(b.source_url,500),verified_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    if(pool){
      await pool.query(`INSERT INTO track_records(track,layout,record_ms,record_holder,record_vehicle,record_source,source_url,verified_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) ON CONFLICT(track,layout) DO UPDATE SET record_ms=EXCLUDED.record_ms,record_holder=EXCLUDED.record_holder,record_vehicle=EXCLUDED.record_vehicle,record_source=EXCLUDED.record_source,source_url=EXCLUDED.source_url,verified_at=NOW(),updated_at=NOW()`,[track,layout,recordMs,row.record_holder,row.record_vehicle,row.record_source,row.source_url]);
    }else memory.records.set(keyOf(track,layout),row);
    res.json({ok:true,track,layout,record_ms:recordMs});
  }catch(e){res.status(500).json({error:'record_write_failed'});}
});

app.get('/api/pitlane/admin/records',async(req,res)=>{
  if(!adminOK(req))return res.status(401).json({error:'unauthorized'});
  try{
    const records=pool?(await pool.query('SELECT * FROM track_records ORDER BY track,layout')).rows:[...memory.records.values()];
    res.json({records,fallback_floors:FALLBACK_FLOORS});
  }catch(e){res.status(500).json({error:'record_read_failed'});}
});

app.use((req,res)=>res.status(404).json({error:'not_found'}));

initDb().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log(`Afiléon Pitlane leaderboard service listening on ${PORT}`))).catch(err=>{console.error('Database initialisation failed',err);process.exit(1);});
