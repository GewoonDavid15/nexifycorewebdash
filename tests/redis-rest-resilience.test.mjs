import test from 'node:test';
import assert from 'node:assert/strict';
import {redis,RedisError} from '../lib/redis.js';
const originalFetch=globalThis.fetch;
const previous={url:process.env.UPSTASH_REDIS_REST_URL,token:process.env.UPSTASH_REDIS_REST_TOKEN};
process.env.UPSTASH_REDIS_REST_URL='https://redis.example.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN='local-test-credential';
const check=(code,fn)=>assert.rejects(fn,e=>e instanceof RedisError&&e.code===code&&!JSON.stringify(e).includes('local-test-credential'));
test('Upstash REST EVAL uses the official JSON command-array protocol',async()=>{
  const before=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async(url,opts)=>{
    calls++;
    assert.equal(url,'https://redis.example.invalid/');
    assert.equal(opts.method,'POST');
    assert.equal(opts.redirect,'error');
    assert.equal(opts.headers.Authorization,'Bearer local-test-credential');
    assert.deepEqual(JSON.parse(opts.body),['EVAL','return 1',1,'nexify:test']);
    return Response.json({result:1});
  };
  try{assert.equal(await redis('EVAL','return 1',1,'nexify:test'),1);assert.equal(calls,1);}
  finally{globalThis.fetch=before;}
});
test('HTTP auth, throttling and provider outages return safe error categories',async()=>{
  const before=globalThis.fetch;
  try{
    for(const [http,code] of [[401,'authorization_failed'],[403,'authorization_failed'],[429,'rate_limited'],[503,'provider_unavailable']]){
      globalThis.fetch=async()=>new Response('sensitive upstream body',{status:http});
      await check(code,()=>redis('GET','test'));
    }
  }finally{globalThis.fetch=before;}
});
test('timeout on uncertain write is not retried, preserving command idempotence',async()=>{
  const before=globalThis.fetch;let requests=0;
  globalThis.fetch=async()=>{requests++;throw Object.assign(new Error('sensitive network details'),{name:'TimeoutError'});};
  try{await check('timeout',()=>redis('EVAL','return 1',1,'key'));assert.equal(requests,1);}
  finally{globalThis.fetch=before;}
});
test('malformed responses and Redis script errors are safely classified',async()=>{
  const before=globalThis.fetch;
  try{
    globalThis.fetch=async()=>new Response('<html>token</html>');
    await check('invalid_response',()=>redis('PING'));
    globalThis.fetch=async()=>Response.json({error:'private REDIS internal details'});
    await check('command_failed',()=>redis('PING'));
    globalThis.fetch=async()=>Response.json({unexpected:true});
    await check('invalid_response',()=>redis('PING'));
  }finally{globalThis.fetch=before;}
});
process.on('exit',()=>{
  globalThis.fetch=originalFetch;
  for(const [key,value] of Object.entries({UPSTASH_REDIS_REST_URL:previous.url,UPSTASH_REDIS_REST_TOKEN:previous.token})){
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
