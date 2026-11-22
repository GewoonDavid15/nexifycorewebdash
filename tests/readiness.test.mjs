import test from 'node:test';
import assert from 'node:assert/strict';
import {systemReadiness} from '../lib/readiness.js';
import {GET as readinessGet} from '../app/api/system/readiness/route.js';
import {COOKIE,makeSession} from '../lib/security.js';

const valid={
  SESSION_SECRET:'session-test-secret-sufficient-length-123456',
  AGENT_SECRET:'agent-test-secret-sufficient-length-123456',
  DASHBOARD_PASSWORD_HASH:'scrypt$'+'a'.repeat(32)+'$'+'b'.repeat(128),
  DASHBOARD_TOTP_SECRET:'A'.repeat(32),
  KV_REST_API_URL:'https://test-upstash.example',
  KV_REST_API_TOKEN:'redis-test-token-long-enough',
  MCNODE_PANEL_URL:'https://panel.mc-node.example',
  MCNODE_CLIENT_API_KEY:'ptlc_'+'c'.repeat(42),
  MCNODE_SERVER_ID:'f1771141'
};

test('ready configuration reports only safe labels and booleans, never secret data',()=>{
  const report=systemReadiness(valid);
  assert.equal(report.summary.ready,6);
  assert.equal(report.summary.missing,0);
  assert.equal(report.summary.invalid,0);
  assert.equal(report.checks.length,6);
  const output=JSON.stringify(report);
  for(const [key,value] of Object.entries(valid)){
    assert.ok(!output.includes(value),'Secret leaked for '+key);
  }
});

test('missing credentials fail closed without exposing values',()=>{
  const report=systemReadiness({});
  assert.equal(report.summary.ready,0);
  assert.equal(report.summary.missing,5);
  assert.equal(report.summary.optional,1);
  assert.deepEqual(report.checks.map(x=>x.id),['session','password','totp','agent','redis','mcnode']);
});

test('partially configured MC-Node integration is a warning, not an accepted configuration',()=>{
  const report=systemReadiness({...valid,MCNODE_CLIENT_API_KEY:''});
  assert.equal(report.checks.find(x=>x.id==='mcnode').status,'invalid');
  assert.equal(report.summary.invalid,1);
});

test('malformed Redis URL and short token are not accepted',()=>{
  const report=systemReadiness({...valid,KV_REST_API_URL:'http://unsafe.invalid',KV_REST_API_TOKEN:'short'});
  assert.equal(report.checks.find(x=>x.id==='redis').status,'missing');
});

test('unauthenticated readiness requests are rejected before any Redis call',async()=>{
  const original=globalThis.fetch;
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Should not call upstream');};
  try{
    const response=await readinessGet({cookies:new Map()});
    assert.equal(response.status,401);
    assert.equal(calls,0);
  }finally{globalThis.fetch=original;}
});

test('authenticated readiness performs safe Redis PING with no credentials in response',async()=>{
  const names=Object.keys(valid);
  const previous=Object.fromEntries(names.map(k=>[k,process.env[k]]));
  const original=globalThis.fetch;
  let calls=0;
  try{
    Object.assign(process.env,valid);
    globalThis.fetch=async (_url,opts)=>{
      calls++;
      assert.deepEqual(JSON.parse(opts.body),['PING']);
      assert.equal(opts.method,'POST');
      return Response.json({result:'PONG'});
    };
    const res=await readinessGet({cookies:new Map([[COOKIE,{value:makeSession()}]])});
    assert.equal(res.status,200);
    const body=await res.json();
    assert.equal(body.mode,'read_only');
    assert.equal(body.redis_connection,'connected');
    assert.equal(calls,1);
    const output=JSON.stringify(body);
    for(const [key,value] of Object.entries(valid))assert.ok(!output.includes(value),'Secret leaked for '+key);
  }finally{
    globalThis.fetch=original;
    for(const k of names){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}
  }
});
