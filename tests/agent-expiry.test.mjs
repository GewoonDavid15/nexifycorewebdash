import test from 'node:test';
import assert from 'node:assert/strict';
import {isPendingFresh,MAX_PENDING_AGE_MS} from '../lib/queue.js';
import {POST as acknowledge} from '../app/api/agent/ack/route.js';
import {POST as report} from '../app/api/agent/report/route.js';
import {keys} from '../lib/redis.js';

const previous={
  AGENT_SECRET:process.env.AGENT_SECRET,
  UPSTASH_REDIS_REST_URL:process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN:process.env.UPSTASH_REDIS_REST_TOKEN
};
process.env.AGENT_SECRET='a'.repeat(64);
process.env.UPSTASH_REDIS_REST_URL='https://fake-upstash.example';
process.env.UPSTASH_REDIS_REST_TOKEN='local-test-token-only';
const id='00000000-0000-4000-8000-000000000099';
const originalFetch=globalThis.fetch;
let savedRecord=null;
let writes=0;

globalThis.fetch=async(_url,opts)=>{
  const [cmd,key]=JSON.parse(opts.body);
  if(cmd==='GET'&&key===keys.request(id))return Response.json({result:savedRecord?JSON.stringify(savedRecord):null});
  writes++;
  throw new Error('Unexpected Redis mutation');
};
const request=body=>new Request('https://nexify.example/api/agent/action',{
  method:'POST',headers:{Authorization:'Bearer '+process.env.AGENT_SECRET},body:JSON.stringify(body)
});

test('shared expiry predicate rejects old, missing and future timestamps',()=>{
  const now=Date.now();
  const recent={state:'pending',created_at:new Date(now-30000).toISOString()};
  assert.equal(isPendingFresh(recent,now),true);
  assert.equal(isPendingFresh({...recent,created_at:new Date(now-MAX_PENDING_AGE_MS-1).toISOString()},now),false);
  assert.equal(isPendingFresh({...recent,created_at:'bad'},now),false);
  assert.equal(isPendingFresh({...recent,created_at:new Date(now+3600000).toISOString()},now),false);
  assert.equal(isPendingFresh({...recent,state:'expired'},now),false);
});

test('stale backup acknowledgment cannot change record into awaiting_console',async()=>{
  writes=0;
  savedRecord={id,action:'backup.now',state:'pending',created_at:new Date(Date.now()-MAX_PENDING_AGE_MS-60000).toISOString()};
  const response=await acknowledge(request({id,local_id:42}));
  assert.equal(response.status,409);
  assert.equal(writes,0);
  assert.equal(savedRecord.state,'pending');
});

test('stale diagnostics report cannot complete an expired pending request',async()=>{
  writes=0;
  savedRecord={id,action:'diagnostics.capture',state:'pending',created_at:new Date(Date.now()-MAX_PENDING_AGE_MS-60000).toISOString()};
  const response=await report(request({id,report:{tps:20,mspt:12}}));
  assert.equal(response.status,409);
  assert.equal(writes,0);
  assert.equal(savedRecord.state,'pending');
});

process.on('exit',()=>{
  globalThis.fetch=originalFetch;
  for(const [key,value] of Object.entries(previous)){
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
