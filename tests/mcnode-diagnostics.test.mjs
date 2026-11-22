import test from 'node:test';
import assert from 'node:assert/strict';
import {mcnodeOverview} from '../lib/mcnode.js';

const env={
  MCNODE_PANEL_URL:'https://panel.example.net',
  MCNODE_CLIENT_API_KEY:'ptlc_'+'a'.repeat(40),
  MCNODE_SERVER_ID:'abcd1234'
};

test('optional MC-Node endpoints distinguish authentication, timeout and malformed JSON',async()=>{
  const before=globalThis.fetch;
  globalThis.fetch=async(url)=>{
    const path=String(url);
    if(path.endsWith('/resources'))return Response.json({attributes:{current_state:'running',resources:{}}});
    if(path.includes('/files/list'))return new Response('',{status:401});
    if(path.endsWith('/backups'))throw Object.assign(new Error('timeout'),{name:'TimeoutError'});
    if(path.endsWith('/schedules'))return new Response('<invalid>',{status:200,headers:{'content-type':'application/json'}});
    if(path.endsWith('/activity'))return new Response('',{status:429});
    return Response.json({attributes:{name:'Nexify',limits:{}}});
  };
  try{
    const report=await mcnodeOverview(env);
    assert.equal(report.connected,true);
    assert.equal(report.pluginStatus,'invalid_key');
    assert.equal(report.backupStatus,'timeout');
    assert.equal(report.scheduleStatus,'invalid_response');
    assert.equal(report.activityStatus,'rate_limited');
    assert.deepEqual(report.plugins,[]);
    assert.deepEqual(report.backups,[]);
    assert.deepEqual(report.schedules,[]);
    assert.deepEqual(report.activity,[]);
    assert.equal(JSON.stringify(report).includes(env.MCNODE_CLIENT_API_KEY),false);
  }finally{globalThis.fetch=before;}
});
