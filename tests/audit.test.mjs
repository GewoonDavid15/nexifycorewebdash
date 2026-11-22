import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanAuditEntry,writeAudit,readAudit} from '../lib/audit.js';
import {keys} from '../lib/redis.js';
import {GET as auditGet} from '../app/api/audit/route.js';
import {COOKIE,makeSession} from '../lib/security.js';

const request_id='7b6fd5fe-57dd-48a9-97ab-198c937054cc';
const event={source:'dashboard',state:'queued',action:'diagnostics.capture',request_id};
const stored=[];
const commands=[];
const mock=async(name,...args)=>{
  commands.push([name,...args]);
  if(name==='LPUSH'){stored.unshift(args[1]);return stored.length;}
  if(name==='LTRIM'){stored.splice(args[2]+1);return 'OK';}
  if(name==='EXPIRE')return 1;
  if(name==='LRANGE')return stored.slice(args[1],args[2]+1);
  throw Error('Unexpected Redis method: '+name);
};

test('audit events contain only safe properties, never credentials or user identities',async()=>{
  const created=await writeAudit({...event,token:'sensitive-value',ip:'sensitive-value',player_uuid:'sensitive-value'},mock);
  assert.deepEqual(Object.keys(created).sort(),['action','at','request_id','source','state']);
  assert.equal(JSON.stringify(created).includes('sensitive-value'),false);
  const results=await readAudit(mock);
  assert.equal(results.length,1);
  assert.deepEqual(results[0],created);
  assert.ok(commands.some(x=>x[0]==='EXPIRE'&&x[2]===2592000));
  assert.ok(commands.some(x=>x[0]==='LTRIM'&&x[3]===199));
  assert.equal(commands[0][1],keys.audit);
});

test('audit rejects unsupported actions or malformed request IDs',async()=>{
  for(const invalid of [
    {...event,action:'console.exec'},
    {...event,request_id:'../etc/passwd'},
    {...event,source:'anonymous'},
    {...event,state:'reinstalled'}
  ])await assert.rejects(writeAudit(invalid,mock),/Invalid audit event/);
});

test('audit entry reader strips untrusted fields and ignores invalid records',async()=>{
  const item={...event,at:'2026-11-22T20:00:00.000Z',raw_console:'secret'};
  assert.equal(cleanAuditEntry(item).raw_console,undefined);
  assert.equal(cleanAuditEntry({event:'console'}),null);
  assert.equal(cleanAuditEntry({...item,at:'not-a-date'}),null);
});

test('operations audit API denies anonymous users before storage access',async()=>{
  const res=await auditGet({cookies:new Map()});
  assert.equal(res.status,401);
});

test('audit API returns only safe metadata to an authenticated admin',async()=>{
  process.env.SESSION_SECRET='safe-test-secret-with-a-length-over-thirty-two-characters';
  process.env.UPSTASH_REDIS_REST_URL='https://unit-test.upstash.example';
  process.env.UPSTASH_REDIS_REST_TOKEN='unit-test-secret-token';
  const prev=globalThis.fetch;
  globalThis.fetch=async (_url,options)=>{
    const [method]=JSON.parse(options.body);
    if(method!=='LRANGE')throw Error('Unexpected call');
    return Response.json({result:[JSON.stringify({...event,at:'2026-11-22T20:00:00.000Z',token:'should-not-return'})]});
  };
  try{
    const res=await auditGet({cookies:new Map([[COOKIE,{value:makeSession()}]])});
    assert.equal(res.status,200);
    const body=await res.json();
    assert.equal(body.events.length,1);
    assert.equal(JSON.stringify(body).includes('should-not-return'),false);
  }finally{
    globalThis.fetch=prev;
    delete process.env.SESSION_SECRET;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
});
