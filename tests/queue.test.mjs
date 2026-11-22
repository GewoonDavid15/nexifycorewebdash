import test from 'node:test';
import assert from 'node:assert/strict';
import {prunePending,MAX_PENDING_AGE_MS} from '../lib/queue.js';
import {keys} from '../lib/redis.js';

function mockRedis(initialIds,records) {
  let ids=[...initialIds];
  const data=new Map(Object.entries(records));
  const calls=[];
  return {
    calls,
    ids:()=>ids,
    get:key=>data.get(key),
    async command(name,...args){
      calls.push([name,...args]);
      switch(name){
        case 'LRANGE':return ids.slice(args[1],args[2]+1);
        case 'GET':return data.get(args[0])??null;
        case 'SET':data.set(args[0],args[1]);return 'OK';
        case 'LREM':{const count=ids.length;ids=ids.filter(v=>v!==args[2]);return count-ids.length;}
        default:throw Error('Unexpected redis command '+name);
      }
    }
  };
}

const uid=(a)=>'00000000-0000-4000-8000-'+a.padStart(12,'0');
const request=(id,action,createdAt)=>({id,action,created_at:new Date(createdAt).toISOString(),state:'pending'});

test('old backup request expires and is never returned for execution',async()=>{
  const now=Date.now();
  const old=uid('1'),recent=uid('2');
  const values={
    [keys.request(old)]:JSON.stringify(request(old,'backup.now',now-MAX_PENDING_AGE_MS-60000)),
    [keys.request(recent)]:JSON.stringify(request(recent,'diagnostics.capture',now-30000))
  };
  const mem=mockRedis([old,recent],values);
  const done=await prunePending(mem.command,now);
  assert.deepEqual(done.live.map(x=>x.id),[recent]);
  assert.equal(done.removed,1);
  assert.deepEqual(mem.ids(),[recent]);
  const previous=JSON.parse(mem.get(keys.request(old)));
  assert.equal(previous.state,'expired');
  assert.equal(previous.action,'backup.now');
  assert.ok(previous.expired_at);
  assert.ok(mem.calls.every(x=>['LRANGE','GET','SET','LREM'].includes(x[0])));
});

test('missing, completed and malformed requests are pruned from the pending list',async()=>{
  const now=Date.now();
  const completed=uid('3'),missing=uid('4'),bad='not-an-id';
  const mem=mockRedis([completed,missing,bad],{
    [keys.request(completed)]:JSON.stringify({...request(completed,'backup.now',now-1000),state:'completed'})
  });
  const done=await prunePending(mem.command,now);
  assert.equal(done.removed,3);
  assert.equal(done.live.length,0);
  assert.deepEqual(mem.ids(),[]);
});

test('anomalous future created_at cannot bypass expiry',async()=>{
  const now=Date.now(),id=uid('5');
  const mem=mockRedis([id],{
    [keys.request(id)]:JSON.stringify(request(id,'diagnostics.capture',now+3600000))
  });
  const done=await prunePending(mem.command,now);
  assert.deepEqual(done.live,[]);
  assert.equal(JSON.parse(mem.get(keys.request(id))).state,'expired');
});

test('unrecognized action is removed but never executed',async()=>{
  const now=Date.now(),id=uid('6');
  const mem=mockRedis([id],{
    [keys.request(id)]:JSON.stringify(request(id,'console.exec',now))
  });
  const done=await prunePending(mem.command,now);
  assert.deepEqual(done.live,[]);
  assert.deepEqual(mem.ids(),[]);
});
