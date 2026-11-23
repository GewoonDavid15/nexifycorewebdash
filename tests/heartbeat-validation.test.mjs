import test from 'node:test';
import assert from 'node:assert/strict';
import {POST as sync} from '../app/api/agent/sync/route.js';
import {GET as status} from '../app/api/status/route.js';
import {makeSession,COOKIE} from '../lib/security.js';
import {keys} from '../lib/redis.js';

const saved={...process.env};
process.env.AGENT_SECRET='a'.repeat(64);
process.env.SESSION_SECRET='b'.repeat(64);
process.env.UPSTASH_REDIS_REST_URL='https://fake-redis.example';
process.env.UPSTASH_REDIS_REST_TOKEN='local-test-only';
const originalFetch=globalThis.fetch;
let heartbeat=null;
globalThis.fetch=async(_url,opts)=>{
  const [command,key]=JSON.parse(opts.body);
  if(command==='GET'&&key===keys.status)return Response.json({result:heartbeat});
  throw new Error('unexpected Redis operation: '+command);
};
const request=body=>new Request('https://nexify.example/api/agent/sync',{
  method:'POST',headers:{Authorization:'Bearer '+process.env.AGENT_SECRET},body
});
const authed=()=>({cookies:{get:key=>key===COOKIE?{value:makeSession()}:null}});

test('malformed and invalid Cloud Bridge JSON is rejected before Redis writes',async()=>{
  for(const body of ['{','null','[]','{"server_id":"main","plugin_version":"\\n"}']){
    const r=await sync(request(body));
    assert.equal(r.status,400,body);
  }
});

test('status route treats future-dated, corrupted, or missing heartbeat time as offline',async()=>{
  for(const time of [new Date(Date.now()+3600000).toISOString(),'not-a-date',undefined]){
    heartbeat=JSON.stringify({server_id:'main',received_at:time,tps:20});
    const r=await status(authed());
    assert.equal(r.status,200);
    assert.deepEqual(await r.json(),{online:false,status:null});
  }
});

test('recent heartbeat still reports live stats',async()=>{
  heartbeat=JSON.stringify({server_id:'main',received_at:new Date(Date.now()-2000).toISOString(),tps:19.9});
  const r=await status(authed());
  assert.equal(r.status,200);
  const out=await r.json();
  assert.equal(out.online,true);
  assert.equal(out.status.tps,19.9);
});
process.on('exit',()=>{
  globalThis.fetch=originalFetch;
  for(const k of ['AGENT_SECRET','SESSION_SECRET','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN']){
    if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];
  }
});
