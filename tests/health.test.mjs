import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHealth} from '../lib/health.js';

test('health warnings distinguish missing telemetry from server failure',()=>{
  const alerts=analyzeHealth(null,null);
  assert.ok(alerts.some(x=>x.title.includes('Cloud Bridge')));
  assert.equal(alerts.some(x=>x.title.includes('hosting')),false);
});

test('health rules catch low TPS, high MSPT and depleted disk without modifying anything',()=>{
  const data=analyzeHealth({online:true,status:{tps:14,mspt:65,heap_used_mib:950,heap_max_mib:1000}},
    {configured:true,connected:true,state:'running',memoryPercent:95,diskPercent:97});
  const text=data.map(x=>x.title).join(';');
  for(const fragment of ['TPS','MSPT','heap','RAM','Schijfruimte'])assert.ok(text.includes(fragment));
  assert.ok(data.every(x=>['warning','info'].includes(x.level)));
});

test('healthy measurements do not invent alerts',()=>{
  const messages=analyzeHealth({online:true,status:{tps:20,mspt:18,heap_used_mib:1000,heap_max_mib:4096}},
     {configured:true,connected:true,state:'running',memoryPercent:40,diskPercent:20});
  assert.deepEqual(messages,[]);
});

test('unknown resource metrics do not generate false high usage alarms',()=>{
  const messages=analyzeHealth({online:true,status:{tps:null,mspt:null}},
    {configured:true,connected:true,state:'running',memoryPercent:null,diskPercent:null});
  assert.deepEqual(messages,[]);
});


test('plugin startup preflight critical count is an actionable but non-destructive warning',()=>{
  const alerts=analyzeHealth({online:true,status:{tps:20,mspt:15,startup_high:2,startup_warnings:5}},
    {configured:true,connected:true,state:'running',memoryPercent:20,diskPercent:20});
  assert.equal(alerts.length,1);
  assert.equal(alerts[0].level,'warning');
  assert.ok(alerts[0].title.includes('opstart'));
});

test('only noncritical preflight warnings are informational',()=>{
  const alerts=analyzeHealth({online:true,status:{tps:20,mspt:10,startup_high:0,startup_warnings:3}},
    {configured:true,connected:true,state:'running',memoryPercent:20,diskPercent:20});
  assert.equal(alerts.length,1);
  assert.equal(alerts[0].level,'info');
});
