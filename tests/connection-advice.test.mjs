import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionAdvice} from '../lib/connection-advice.js';
const env={checks:[{id:'agent',status:'ready'},{id:'redis',status:'ready'},{id:'mcnode',status:'ready'}],redis_connection:'connected'};
const m={configured:true,connected:true,state:'running'};
test('missing heartbeat gives safe configuration instructions without secrets',()=>{
  const x=connectionAdvice({readiness:env,mcnode:m,status:{online:false,status:null}});
  assert.deepEqual(x.map(y=>y.id),['heartbeat-missing']);
  assert.ok(!JSON.stringify(x).includes('Bearer '));
});
test('offline MC-Node takes priority over heartbeat',()=>{
  const x=connectionAdvice({readiness:env,mcnode:{...m,state:'offline'},status:{online:false,status:null}});
  assert.deepEqual(x.map(y=>y.id),['paper-offline']);
});
test('running host and current heartbeat report healthy connection',()=>{
  const x=connectionAdvice({readiness:env,mcnode:m,status:{online:true,status:{plugin_version:'2.4.0'}}});
  assert.deepEqual(x.map(y=>y.id),['connected']);
});
test('missing credentials are distinguished from a failed live connection',()=>{
  const x=connectionAdvice({readiness:{checks:[{id:'agent',status:'missing'},{id:'mcnode',status:'optional'},{id:'redis',status:'missing'}],redis_connection:'not_configured'},mcnode:{configured:false,connected:false}});
  assert.deepEqual(x.map(y=>y.id),['redis-config','agent-secret','mcnode-setup']);
});
test('rejected hosting API token gives targeted read-only advice',()=>{
  const x=connectionAdvice({readiness:env,mcnode:{configured:true,connected:false,code:'invalid_key'},status:{online:true,status:{}}});
  assert.equal(x[0].id,'mcnode-api');
  assert.match(x[0].detail,/Client API/);
});
