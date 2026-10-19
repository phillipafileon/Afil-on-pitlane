import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {createHandler} from '../server.mjs';
const TOKEN='0123456789abcdef'.repeat(4);
test('auth, two-stage approval, sandbox cleanup, no arbitrary shell, no replay',async t=>{
  let started=0,killed=0,script='',command='';
  const server=http.createServer(createHandler({
    tokenSHA256:crypto.createHash('sha256').update(TOKEN).digest('hex'),
    sandboxFactory:async()=>{started++;return{
      files:{write:async(p,c)=>{assert.equal(p,'/tmp/spark-task.py');script=c;}},
      commands:{run:async(c)=>{command=c;return{exitCode:0,stdout:'42',stderr:''};}},
      kill:async()=>{killed++;}
    };},logger:{info(){},warn(){},error(){}}
  }));
  await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>server.close());
  const base='http://127.0.0.1:'+server.address().port;
  const call=async(path,body,token=TOKEN)=>{
    const r=await fetch(base+path,{method:body?'POST':'GET',
      headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},
      body:body?JSON.stringify(body):undefined});
    return{status:r.status,result:await r.json()};
  };
  assert.equal((await call('/v1/status',null,'invalid')).status,401);
  assert.equal((await call('/v1/status')).result.autonomy,'Balanced');
  const code="print(6 * 7)";
  const p=await call('/v1/preview',{action:'python',code});assert.equal(p.status,200);
  assert.equal(started,0);
  const id=p.result.approval_id;
  assert.equal((await call('/v1/execute',{approval_id:id})).status,400);
  assert.equal(started,0);
  const x=await call('/v1/execute',{approval_id:id,confirm:true});
  assert.equal(x.status,200);assert.equal(script,code);assert.equal(killed,1);
  assert.equal(command,'python3 -I -B /tmp/spark-task.py');
  assert.equal((await call('/v1/execute',{approval_id:id,confirm:true})).status,410);
  assert.equal((await call('/v1/preview',{action:'shell',code:'ls'})).status,400);
});
