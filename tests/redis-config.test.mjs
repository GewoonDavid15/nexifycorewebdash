import test from 'node:test';
import assert from 'node:assert/strict';
import {redisConfiguration,keys} from '../lib/redis.js';

test('reuse existing Vercel KV REST variables',()=>{
  const v=redisConfiguration({KV_REST_API_URL:'https://existing.upstash.io',KV_REST_API_TOKEN:'example-token-long-enough'});
  assert.equal(v.base,'https://existing.upstash.io/');
});
test('manual Upstash environment variables remain supported',()=>{
  const v=redisConfiguration({UPSTASH_REDIS_REST_URL:'https://manual.upstash.io',UPSTASH_REDIS_REST_TOKEN:'manual-token-long-enough'});
  assert.equal(v.base,'https://manual.upstash.io/');
});
test('HTTPS and credentials are required',()=>{
  assert.throws(()=>redisConfiguration({}),/URL/);
  assert.throws(()=>redisConfiguration({KV_REST_API_URL:'http://example.test',KV_REST_API_TOKEN:'example-token-long-enough'}),/HTTPS/);
  assert.throws(()=>redisConfiguration({KV_REST_API_URL:'https://existing.upstash.io',KV_REST_API_TOKEN:'short'}),/token/);
});
test('all Nexify keys are namespaced to avoid other projects',()=>{
  const list=[keys.status,keys.pending,keys.recent,keys.request('id'),keys.login('ip'),keys.totpUsed(7),keys.backupCooldown,keys.diagnosticsCooldown];
  assert.equal(new Set(list).size,list.length);
  assert.ok(list.every(x=>x.startsWith('nexify:cloud:main:v1:')));
});
