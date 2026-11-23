import test from 'node:test';
import assert from 'node:assert/strict';
import {runStagingProbe} from '../scripts/probe-staging-upstash.mjs';
const opts={url:'https://test-upstash.example/',token:'unit-test-only-token',requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
test('staging probe uses only isolated key with REST EVAL, GET and guarded cleanup',async()=>{
  const calls=[];
  const response=await runStagingProbe({...opts,fetchFn:async(url,init)=>{
    const args=JSON.parse(init.body);calls.push(args);
    assert.equal(init.redirect,'error');
    assert.equal(init.method,'POST');
    if(calls.length===1)return Response.json({result:'OK'});
    if(calls.length===2)return Response.json({result:opts.requestId});
    return Response.json({result:1});
  }});
  assert.equal(response.ok,true);
  assert.deepEqual(calls.map(a=>a[0]),['EVAL','GET','EVAL']);
  assert.ok(calls.every(a=>JSON.stringify(a).includes('nexify:cloud:staging-probe:v1:')));
  assert.equal(calls.some(a=>JSON.stringify(a).includes('nexify:cloud:main:v1:')),false);
});
test('staging probe refuses unsafe URL and missing credentials',async()=>{
  await assert.rejects(runStagingProbe({...opts,url:'http://localhost/'}),/Invalid staging URL/);
  await assert.rejects(runStagingProbe({...opts,token:'short'}),/Missing staging credential/);
});
test('failed staging request does not retry or disclose provider body',async()=>{
  let count=0;
  await assert.rejects(runStagingProbe({...opts,fetchFn:async()=>{
    count++;return new Response('private credentials appear here',{status:503});
  }}),e=>!e.message.includes('private'));
  assert.equal(count,1);
});
