// Real Redis 7 integration checks against an EPHEMERAL GitHub Actions service.
// Hard-coded loopback only. No production Redis credentials are consulted.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {transitionRequest} from '../lib/request-transitions.js';
import {createRequest} from '../lib/request-creation.js';
import {prunePending} from '../lib/queue.js';
import {keys} from '../lib/redis.js';

const exec=promisify(execFile);
async function cmd(...args){
  const {stdout}=await exec('redis-cli',['-h','127.0.0.1','-p','6379','--raw',...args.map(String)],{
    timeout:5000,env:{PATH:process.env.PATH},maxBuffer:1024*1024
  });
  const result=stdout.trimEnd();
  if(result.startsWith('ERR ')||result.startsWith('WRONGTYPE '))throw Error('Redis rejected command');
  return result;
}
async function adapter(op,...args){
  const value=await cmd(op,...args);
  if(op==='LRANGE')return value?value.split(String.fromCharCode(10)):[];
  if(op==='GET')return value||null;
  return value;
}
const id=randomUUID(),requestKey=keys.request(id);
const now=Date.now();
const record=(action,created_at=new Date(now).toISOString())=>({id,action,state:'pending',created_at});
async function seed(action,created_at){
  await cmd('SET',requestKey,JSON.stringify(record(action,created_at)));
  await cmd('DEL',keys.pending);
  await cmd('LPUSH',keys.pending,id);
}
async function check(){
  assert.equal(await cmd('PING'),'PONG');
  try{
    await seed('backup.now');
    const attempts=await Promise.all(Array.from({length:12},(_,i)=>transitionRequest({
      id,action:'backup.now',finalState:'awaiting_console',localId:i+1,redisFn:adapter,now
    })));
    assert.equal(attempts.filter(a=>a.outcome==='updated').length,1);
    assert.equal(attempts.filter(a=>a.outcome==='conflict').length,11);
    const saved=JSON.parse(await cmd('GET',requestKey));
    assert.equal(saved.state,'awaiting_console');
    assert.equal(await cmd('LLEN',keys.pending),'0');
    assert.equal((await transitionRequest({id,action:'backup.now',finalState:'awaiting_console',
      localId:saved.local_id,redisFn:adapter})).outcome,'already_acknowledged');

    await seed('diagnostics.capture');
    const reports=await Promise.all(Array.from({length:8},(_,i)=>transitionRequest({
      id,action:'diagnostics.capture',finalState:'completed',report:{tps:i+10},redisFn:adapter,now
    })));
    assert.equal(reports.filter(a=>a.outcome==='updated').length,1);
    assert.equal(reports.filter(a=>['conflict','already_completed'].includes(a.outcome)).length,7);
    const completed=JSON.parse(await cmd('GET',requestKey));
    assert.equal(completed.state,'completed');
    assert.equal(await cmd('LLEN',keys.pending),'0');
    assert.equal((await transitionRequest({id,action:'diagnostics.capture',finalState:'completed',
      report:{tps:0},redisFn:adapter})).outcome,'already_completed');

    await seed('backup.now',new Date(now-21*60*1000).toISOString());
    const expired=await transitionRequest({id,action:'backup.now',finalState:'awaiting_console',
      localId:11,redisFn:adapter,now});
    assert.equal(expired.outcome,'expired');
    assert.equal(JSON.parse(await cmd('GET',requestKey)).state,'pending');
    assert.equal(await cmd('LLEN',keys.pending),'1');
    // Creation also uses an atomic Redis EVAL instead of GET/SET/LPUSH races.
    await cmd('DEL',keys.pending,keys.backupCooldown,keys.diagnosticsCooldown,keys.recent);
    const createdIds=Array.from({length:14},()=>randomUUID());
    const attemptsCreate=await Promise.all(createdIds.map(requestId=>createRequest({
      action:'backup.now',id:requestId,redisFn:adapter,now
    })));
    assert.equal(attemptsCreate.filter(v=>v.outcome==='created').length,1);
    assert.equal(attemptsCreate.filter(v=>v.outcome==='cooldown').length,13);
    assert.equal(await cmd('LLEN',keys.pending),'1');
    assert.equal(await cmd('LLEN',keys.recent),'1');
    await cmd('DEL',keys.pending,keys.backupCooldown,keys.diagnosticsCooldown);
    for(let n=0;n<9;n++)await cmd('LPUSH',keys.pending,'seed-'+n);
    const finalIds=[randomUUID(),randomUUID()];
    const capacity=await Promise.all([
      createRequest({action:'backup.now',id:finalIds[0],redisFn:adapter,now}),
      createRequest({action:'diagnostics.capture',id:finalIds[1],redisFn:adapter,now})
    ]);
    assert.equal(capacity.filter(v=>v.outcome==='created').length,1);
    assert.equal(capacity.filter(v=>v.outcome==='queue_full').length,1);
    assert.equal(await cmd('LLEN',keys.pending),'10');
    await cmd('DEL',...createdIds.map(keys.request),...finalIds.map(keys.request),
      keys.pending,keys.backupCooldown,keys.diagnosticsCooldown,keys.recent);
    await cmd('SET',requestKey,JSON.stringify(record('backup.now',new Date(now-21*60*1000).toISOString())));
    await cmd('LPUSH',keys.pending,id);
    const pruned=await prunePending(adapter,now);
    assert.equal(pruned.removed,1);
    assert.equal(await cmd('LLEN',keys.pending),'0');
    assert.equal(JSON.parse(await cmd('GET',requestKey)).state,'expired');
    console.log('Real Redis 7: atomic transitions, creation, cooldown, queue capacity and pruning PASS');
  }finally{
    await cmd('DEL',requestKey,keys.pending);
  }
}
await check();
