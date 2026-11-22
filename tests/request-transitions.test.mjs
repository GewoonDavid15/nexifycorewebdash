import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionRequest,TRANSITION_REQUEST_LUA} from '../lib/request-transitions.js';
import {keys} from '../lib/redis.js';

const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fakeStorage(record){
  const records=new Map([[keys.request(id),JSON.stringify(record)]]);
  let pending=[id];
  const commands=[];
  async function redisFn(command,...args){
    commands.push(command);
    if(command==='GET')return records.get(args[0])??null;
    if(command==='EVAL'){
      const [_script,keyCount,recordKey,pendingKey,oldRaw,newRaw,requestId,ttl]=args;
      assert.equal(keyCount,2);
      assert.equal(pendingKey,keys.pending);
      assert.ok(Number(ttl)>0);
      // This conditional is performed without yielding, simulating Redis Lua atomicity.
      if(!records.has(recordKey))return -1;
      if(records.get(recordKey)!==oldRaw)return 0;
      records.set(recordKey,newRaw);
      pending=pending.filter(x=>x!==requestId);
      return 1;
    }
    throw new Error('Unexpected command');
  }
  return {redisFn,commands,record:()=>JSON.parse(records.get(keys.request(id))),pending:()=>pending};
}
const pending=(action,ms=Date.now())=>({id,action,state:'pending',created_at:new Date(ms).toISOString()});

test('transition Lua uses compare-and-set before touching queue and record',()=>{
  assert.match(TRANSITION_REQUEST_LUA,/current ~= ARGV\[1\]/);
  assert.match(TRANSITION_REQUEST_LUA,/redis.call\('LREM'/);
  assert.match(TRANSITION_REQUEST_LUA,/redis.call\('SET'/);
});

test('simultaneous acknowledgements only mutate a pending backup once',async()=>{
  const store=fakeStorage(pending('backup.now'));
  const run=localId=>transitionRequest({id,action:'backup.now',finalState:'awaiting_console',localId,redisFn:store.redisFn});
  const results=await Promise.all([run(11),run(12)]);
  assert.equal(results.filter(x=>x.outcome==='updated').length,1);
  assert.equal(results.filter(x=>x.outcome==='conflict').length,1);
  assert.equal(store.record().state,'awaiting_console');
  assert.equal(store.pending().length,0);
  assert.equal(store.commands.filter(c=>c==='EVAL').length,2);
});

test('diagnostics completion is idempotent and does not overwrite first report',async()=>{
  const store=fakeStorage(pending('diagnostics.capture'));
  const first=await transitionRequest({id,action:'diagnostics.capture',finalState:'completed',report:{tps:19},redisFn:store.redisFn});
  const again=await transitionRequest({id,action:'diagnostics.capture',finalState:'completed',report:{tps:15},redisFn:store.redisFn});
  assert.equal(first.outcome,'updated');
  assert.equal(again.outcome,'already_completed');
  assert.equal(store.record().report.tps,19);
  assert.deepEqual(store.pending(),[]);
});

test('expired request never reaches atomic mutation',async()=>{
  const store=fakeStorage(pending('backup.now',Date.now()-21*60*1000));
  const res=await transitionRequest({id,action:'backup.now',finalState:'awaiting_console',localId:1,redisFn:store.redisFn});
  assert.equal(res.outcome,'expired');
  assert.equal(store.commands.includes('EVAL'),false);
});

test('wrong action cannot cross-complete a backup request',async()=>{
  const store=fakeStorage(pending('backup.now'));
  const res=await transitionRequest({id,action:'diagnostics.capture',finalState:'completed',report:{tps:20},redisFn:store.redisFn});
  assert.equal(res.outcome,'conflict');
  assert.deepEqual(store.pending(),[id]);
});
