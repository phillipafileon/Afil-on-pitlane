/** SPARK hybrid gateway: all cloud runs are explicit, approved, isolated and short-lived. */
import http from 'node:http';
import crypto from 'node:crypto';

const MAX_CODE=3000, MAX_BODY=12000, TTL=120000;
const respond=(res,status,body)=>{
  res.writeHead(status,{'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
    'content-security-policy':"default-src 'none'",'strict-transport-security':'max-age=31536000'});
  res.end(JSON.stringify(body));
};
const fail=(res,status,error)=>respond(res,status,{ok:false,error});
const hash=s=>crypto.createHash('sha256').update(s).digest();
const auth=(header,expected)=>{
  if(!/^[a-f0-9]{64}$/i.test(expected||'')||typeof header!=='string'||!header.startsWith('Bearer '))return false;
  const token=header.slice(7);
  return token.length>=24&&token.length<=200&&
    crypto.timingSafeEqual(hash(token),Buffer.from(expected,'hex'));
};
async function parse(req){
  let data='';
  for await(const chunk of req){
    data+=chunk.toString('utf8');
    if(data.length>MAX_BODY)throw Object.assign(new Error('payload_too_large'),{status:413});
  }
  try{return JSON.parse(data);}catch{throw Object.assign(new Error('invalid_json'),{status:400});}
}
const validCode=code=>typeof code==='string'&&code.trim().length>0&&code.length<=MAX_CODE&&!code.includes('\0');
export function createHandler({tokenSHA256=process.env.SPARK_GATEWAY_TOKEN_SHA256,
  apiKey=process.env.E2B_API_KEY,sandboxFactory,clock=()=>Date.now(),logger=console}={}){
  const pending=new Map();let executing=false,history=[];
  const prune=()=>{
    for(const [id,job]of pending)if(job.until<clock())pending.delete(id);
    history=history.filter(t=>clock()-t<3600000);
  };
  return async(req,res)=>{
    const path=(req.url||'').split('?')[0];
    if(path==='/health'&&req.method==='GET')return respond(res,200,{ok:true,service:'spark-e2b-gateway'});
    if(!['/v1/status','/v1/preview','/v1/execute'].includes(path))return fail(res,404,'not_found');
    if(!auth(req.headers.authorization,tokenSHA256))return fail(res,401,'unauthorized');
    if(path==='/v1/status'&&req.method==='GET')return respond(res,200,{
      ok:true,configured:!!(apiKey||sandboxFactory),autonomy:'Balanced',
      offline_unaffected:true,approval_required:true,allowed_action:'python'});
    if(req.method!=='POST')return fail(res,405,'method_not_allowed');
    if(!apiKey&&!sandboxFactory)return fail(res,503,'e2b_not_configured');
    if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))
      return fail(res,415,'json_only');
    try{
      const body=await parse(req);prune();
      if(path==='/v1/preview'){
        if(body?.action!=='python'||!validCode(body.code))return fail(res,400,'invalid_python_request');
        if(pending.size>=40)return fail(res,429,'queue_full');
        const approvalId=crypto.randomBytes(24).toString('hex');
        const until=clock()+TTL;
        pending.set(approvalId,{code:body.code,until});
        return respond(res,200,{ok:true,approval_id:approvalId,
          expires_at:new Date(until).toISOString(),requires_confirmation:true,
          action:'python',preview:body.code,
          warning:'Cloud sandbox usage may be billed; no live website credentials are provided.'});
      }
      if(!/^[a-f0-9]{48}$/i.test(String(body?.approval_id||'')))return fail(res,400,'invalid_approval');
      const job=pending.get(body.approval_id);
      if(!job||job.until<clock())return fail(res,410,'approval_expired_or_used');
      if(body.confirm!==true)return fail(res,400,'explicit_confirmation_required');
      if(executing||history.length>=6)return fail(res,429,'cloud_limit_reached');
      pending.delete(body.approval_id);executing=true;history.push(clock());
      let sandbox;
      try{
        sandbox=sandboxFactory?await sandboxFactory():await(async()=>{
          const {Sandbox}=await import('e2b');
          // Explicitly block sandbox internet egress. Do NOT pass gateway secrets.
          return Sandbox.create({apiKey,allowInternetAccess:false,timeoutMs:120000});
        })();
        await sandbox.files.write('/tmp/spark-task.py',job.code);
        const result=await sandbox.commands.run('python3 -I -B /tmp/spark-task.py',{timeoutMs:25000});
        logger.info?.('spark_e2b_complete',{exitCode:result.exitCode});
        return respond(res,200,{ok:true,action:'python',exit_code:result.exitCode,
          stdout:String(result.stdout||'').slice(0,6000),
          stderr:String(result.stderr||'').slice(0,2000)});
      }catch(e){
        logger.error?.('spark_e2b_failed',{error:String(e?.message||'failed').slice(0,160)});
        return fail(res,502,'sandbox_execution_failed');
      }finally{
        try{if(sandbox)await sandbox.kill();}catch{logger.warn?.('spark_e2b_cleanup_failed');}
        executing=false;
      }
    }catch(e){return fail(res,e.status||400,
      e.message==='payload_too_large'?'payload_too_large':'invalid_request');}
  };
}
if(process.env.NODE_ENV!=='test'){
  http.createServer(createHandler()).listen(Number(process.env.PORT||8787),'0.0.0.0');
}
