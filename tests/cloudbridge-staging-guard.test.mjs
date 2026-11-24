import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyIsolatedCloudbridgeStaging} from '../scripts/probe-cloudbridge-staging.mjs';

const defaults={url:'https://isolated.staging.example/',token:'staging-example-token-only',
  requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};

test('staging probe rejects matching production endpoint before any Redis call',async()=>{
  let calls=0;
  await assert.rejects(verifyIsolatedCloudbridgeStaging({
    ...defaults,productionUrls:['https://isolated.staging.example/'],
    fetchFn:async()=>{calls++;return Response.json({result:1});}
  }),/matches production/);
  assert.equal(calls,0);
});

test('staging probe rejects unsafe host, invalid credentials and non-UUID identifiers',async()=>{
  for(const invalid of [
    {...defaults,url:'http://isolated.staging.example/'},
    {...defaults,url:'https://localhost/'},
    {...defaults,token:'short'},
    {...defaults,requestId:'abcdef0123456789abcdefghijkl01234567'}
  ])await assert.rejects(verifyIsolatedCloudbridgeStaging(invalid));
});

test('upstream errors do not leak provider bodies or retry writes',async()=>{
  let calls=0;
  await assert.rejects(verifyIsolatedCloudbridgeStaging({
    ...defaults,fetchFn:async()=>{
      calls++;
      return new Response('SECRET_TEST_PROVIDER_BODY',{status:503});
    }
  }),e=>!e.message.includes('SECRET_TEST_PROVIDER_BODY'));
  assert.equal(calls,1);
});

test('REST probe never uses production Redis key prefixes',async()=>{
  let calls=0;
  const replies=[1,0,JSON.stringify({
    id:defaults.requestId,action:'diagnostics.capture',state:'pending'
  })];
  // Simulate a rejection after the initial safe creation. Inspect all sent commands.
  await assert.rejects(verifyIsolatedCloudbridgeStaging({
    ...defaults,fetchFn:async(_url,options)=>{
      const args=JSON.parse(options.body);
      calls++;
      assert.equal(JSON.stringify(args).includes('nexify:cloud:main:v1:'),false);
      assert.match(JSON.stringify(args),/nexify:cloud:staging-probe:v2:/);
      return Response.json({result:replies[calls-1]??null});
    }
  }));
  assert.ok(calls>=3);
});
