import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequest,CREATE_REQUEST_LUA} from '../lib/request-creation.js';

function mockRedis(initialPending=0){
  const ids=Array.from({length:initialPending},(_,i)=>'seed-'+i);
  const data=new Map(), recent=[];
  async function redisFn(command,script,count,pendingKey,cooldownKey,recordKey,recentKey,id,record,maxCount){
    assert.equal(command,'EVAL');
    assert.equal(typeof script,'string');
    assert.equal(count,4);
    if(ids.length>=Number(maxCount))return -1;
    if(data.has(cooldownKey))return 0;
    if(data.has(recordKey))return -2;
    data.set(cooldownKey,'1');
    data.set(recordKey,record);
    ids.unshift(id);recent.unshift(id);
    if(recent.length>50)recent.length=50;
    return 1;
  }
  return {redisFn,ids,data,recent};
}
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');

test('creation Lua enforces capacity and cooldown before writes',()=>{
  assert.match(CREATE_REQUEST_LUA,/LLEN/);
  assert.match(CREATE_REQUEST_LUA,/EXISTS/);
  assert.match(CREATE_REQUEST_LUA,/LPUSH/);
  assert.match(CREATE_REQUEST_LUA,/LTRIM/);
});

test('same-action concurrent attempts create exactly one request',async()=>{
  const store=mockRedis();
  const outcome=await Promise.all(Array.from({length:15},(_,i)=>
    createRequest({action:'backup.now',id:id(i+1),redisFn:store.redisFn})));
  assert.equal(outcome.filter(x=>x.outcome==='created').length,1);
  assert.equal(outcome.filter(x=>x.outcome==='cooldown').length,14);
  assert.equal(store.ids.length,1);
  assert.equal(store.recent.length,1);
});

test('capacity restriction cannot be bypassed by two different action types',async()=>{
  const store=mockRedis(9);
  const result=await Promise.all([
    createRequest({action:'backup.now',id:id(21),redisFn:store.redisFn}),
    createRequest({action:'diagnostics.capture',id:id(22),redisFn:store.redisFn})
  ]);
  assert.equal(result.filter(x=>x.outcome==='created').length,1);
  assert.equal(result.filter(x=>x.outcome==='queue_full').length,1);
  assert.equal(store.ids.length,10);
});

test('rejection does not create cooldown or request record',async()=>{
  const store=mockRedis(10);
  const out=await createRequest({action:'backup.now',id:id(31),redisFn:store.redisFn});
  assert.equal(out.outcome,'queue_full');
  assert.equal(store.data.size,0);
});

test('unknown actions and invalid request IDs cannot reach Redis',async()=>{
  const store=mockRedis();
  await assert.rejects(createRequest({action:'console.exec',id:id(1),redisFn:store.redisFn}));
  await assert.rejects(createRequest({action:'backup.now',id:'../unsafe',redisFn:store.redisFn}));
  assert.equal(store.ids.length,0);
});
