import test from 'node:test';
import assert from 'node:assert/strict';
import {mcnodeOverview,McnodeError,clientGet} from '../lib/mcnode.js';
import {GET as overview} from '../app/api/mcnode/overview/route.js';
import {makeSession,COOKIE} from '../lib/security.js';

const config={
  MCNODE_PANEL_URL:'https://panel.mc-node.net',
  MCNODE_SERVER_ID:'f1771141',
  MCNODE_CLIENT_API_KEY:'ptlc_'+'x'.repeat(45)
};
function fakeFetch(handler){
  const prev=globalThis.fetch;
  globalThis.fetch=async (url,opts)=>handler(new URL(url).pathname,opts);
  return ()=>{globalThis.fetch=prev;};
}
const basic=(path)=>{
  if(path.endsWith('/resources'))return Response.json({attributes:{current_state:'running',resources:{memory_bytes:419430400,disk_bytes:524288000,cpu_absolute:17.5,uptime:3600000}}});
  if(path.endsWith('/backups'))return Response.json({meta:{pagination:{total:1}},data:[{attributes:{name:'Daily safe backup',bytes:12345,created_at:'2026-11-22T11:00:00Z',completed_at:'2026-11-22T11:03:00Z',is_successful:true,is_locked:true,uuid:'private-backup-id'}}]});
  if(path.endsWith('/schedules'))return Response.json({data:[{attributes:{name:'Scheduled backup',is_active:true,next_run_at:'2026-11-23T12:00:00Z',last_run_at:'2026-11-22T12:00:00Z',command:'sensitive'}}]});
  if(path.endsWith('/activity'))return Response.json({data:[{attributes:{event:'server:backup.create',timestamp:'2026-11-22T12:00:00Z',metadata:{token:'private'}}}]});
  if(path.endsWith('/files/list'))return Response.json({data:[{attributes:{name:'NexifyStaff.jar',is_file:true,size:1600000}},{attributes:{name:'../private.jar',is_file:true}},{attributes:{name:'secret.yml',is_file:true}}]});
  return Response.json({attributes:{name:'Nexify Server',limits:{memory:8192,disk:20000,cpu:200},uuid:'private'}});
};

test('extended MC-Node overview returns quotas, safe backups, schedules and activity',async()=>{
  const restore=fakeFetch((path,opts)=>{
    assert.equal(opts.method,'GET');
    assert.equal(opts.redirect,'error');
    return basic(path);
  });
  try{
    const v=await mcnodeOverview(config);
    assert.equal(v.connected,true);
    assert.equal(v.memoryLimitMiB,8192);
    assert.equal(v.diskLimitMiB,20000);
    assert.equal(v.backupStatus,'available');
    assert.equal(v.backupCount,1);
    assert.equal(v.backups.length,1);
    assert.equal(v.backups[0].locked,true);
    assert.equal(v.schedules[0].active,true);
    assert.equal(v.activity[0].event,'server:backup.create');
    assert.deepEqual(v.plugins,[{name:'NexifyStaff.jar',size:1600000}]);
    const serialized=JSON.stringify(v);
    for(const bad of ['private-backup-id','private','sensitive','secret.yml','../private.jar'])assert.ok(!serialized.includes(bad),bad);
  }finally{restore();}
});

test('missing optional permissions does not prevent server overview',async()=>{
  const restore=fakeFetch(path=>{
    if(['/backups','/schedules','/activity','/files/list'].some(x=>path.includes(x)))return new Response('',{status:403});
    return basic(path);
  });
  try{
    const v=await mcnodeOverview(config);
    assert.equal(v.connected,true);
    assert.equal(v.backupStatus,'forbidden');
    assert.equal(v.scheduleStatus,'forbidden');
    assert.equal(v.activityStatus,'forbidden');
    assert.equal(v.pluginStatus,'forbidden');
    assert.deepEqual(v.backups,[]);
  }finally{restore();}
});

test('Pterodactyl auth errors are actionable and do not leak a key',async()=>{
  const restore=fakeFetch(()=>new Response('private upstream response',{status:401}));
  try{
    await assert.rejects(mcnodeOverview(config),e=>e instanceof McnodeError&&e.code==='invalid_key');
    process.env.SESSION_SECRET='a'.repeat(64);
    const env=Object.fromEntries(Object.entries(config));
    for(const [k,v] of Object.entries(env))process.env[k]=v;
    const session=makeSession();
    const res=await overview({cookies:{get:key=>key===COOKIE?{value:session}:null}});
    assert.equal(res.status,502);
    const out=await res.json();
    assert.equal(out.code,'invalid_key');
    assert.equal(JSON.stringify(out).includes('ptlc_'),false);
  }finally{restore();for(const k of Object.keys(config))delete process.env[k];delete process.env.SESSION_SECRET;}
});

test('Pterodactyl rate limits and not-found error types are preserved',async()=>{
  const fixed={origin:'https://panel.mc-node.net',key:config.MCNODE_CLIENT_API_KEY,id:config.MCNODE_SERVER_ID};
  for(const [status,code] of [[403,'insufficient_permissions'],[404,'server_not_found'],[429,'rate_limited'],[503,'panel_unavailable']]){
    const restore=fakeFetch(()=>new Response('',{status}));
    try{await assert.rejects(clientGet(fixed,'/resources'),e=>e.code===code);}finally{restore();}
  }
});
