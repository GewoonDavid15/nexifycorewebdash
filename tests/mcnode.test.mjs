import test from 'node:test';
import assert from 'node:assert/strict';
import {panelConfig,mcnodeOverview} from '../lib/mcnode.js';
import {GET as overviewRoute} from '../app/api/mcnode/overview/route.js';
import {makeSession,COOKIE} from '../lib/security.js';

const valid={
  MCNODE_PANEL_URL:'https://panel.mc-node.example',
  MCNODE_CLIENT_API_KEY:'ptlc_'+ 'a'.repeat(40),
  MCNODE_SERVER_ID:'1234abcd'
};

test('MC-Node panel accepts HTTPS and private client token only in server environment',()=>{
  const v=panelConfig(valid);
  assert.equal(v.origin,'https://panel.mc-node.example');
  assert.equal(v.id,'1234abcd');
  assert.equal(v.key,valid.MCNODE_CLIENT_API_KEY);
});

test('MC-Node rejects unsafe panel URLs and malformed credentials',()=>{
  const badUrls=[
    'http://panel.mc-node.example',
    'https://localhost',
    'https://127.0.0.1',
    'https://[::1]',
    'https://panel.mc-node.example.evil.example/path',
    'https://panel.mc-node.example?redirect=1',
    'https://user:password@panel.mc-node.example',
    'https://panel.mc-node.example:8080'
  ];
  for(const url of badUrls)assert.throws(()=>panelConfig({...valid,MCNODE_PANEL_URL:url}),url);
  assert.throws(()=>panelConfig({...valid,MCNODE_CLIENT_API_KEY:'not-a-pterodactyl-key'}));
  assert.throws(()=>panelConfig({...valid,MCNODE_SERVER_ID:'x/../../../'}));
});

test('MC-Node overview returns only safe server info using GET requests',async()=>{
  const before=globalThis.fetch;
  const seen=[];
  globalThis.fetch=async (url,opts)=>{
    seen.push({url:String(url),method:opts.method,auth:opts.headers.Authorization});
    if(String(url).endsWith('/resources'))return Response.json({attributes:{current_state:'running',resources:{cpu_absolute:12.5,memory_bytes:500000000,disk_bytes:1200000000,uptime:7200000}}});
    if(String(url).includes('/files/list'))return Response.json({data:[
      {attributes:{is_file:true,name:'NexifyStaff.jar',size:1234}},
      {attributes:{is_file:true,name:'.env',size:30}},
      {attributes:{is_file:true,name:'more.txt',size:20}},
      {attributes:{is_file:false,name:'bukkit',size:0}}
    ]});
    return Response.json({attributes:{name:'Nexify Test Server',identifier:'1234abcd',node:'do-not-send',uuid:'sensitive'}});
  };
  try{
    const info=await mcnodeOverview(valid);
    assert.equal(info.connected,true);
    assert.equal(info.name,'Nexify Test Server');
    assert.equal(info.state,'running');
    assert.equal(info.cpu,12.5);
    assert.equal(info.pluginStatus,'available');
    assert.equal(info.backupStatus,'available');
    assert.equal(info.scheduleStatus,'available');
    assert.deepEqual(info.plugins,[{name:'NexifyStaff.jar',size:1234}]);
    assert.equal(JSON.stringify(info).includes('do-not-send'),false);
    assert.equal(seen.length,6);
    assert.ok(seen.every(x=>x.method==='GET'));
    assert.ok(seen.every(x=>x.auth==='Bearer '+valid.MCNODE_CLIENT_API_KEY));
  }finally{globalThis.fetch=before;}
});

test('MC-Node overview tolerates missing files permission',async()=>{
  const before=globalThis.fetch;
  globalThis.fetch=async url=>{
    if(String(url).includes('/files/list'))return new Response('',{status:403});
    if(String(url).endsWith('/resources'))return Response.json({attributes:{current_state:'offline',resources:{}}});
    return Response.json({attributes:{name:'Protected server'}});
  };
  try{
    const info=await mcnodeOverview(valid);
    assert.equal(info.connected,true);
    assert.equal(info.pluginStatus,'unavailable');
    assert.deepEqual(info.plugins,[]);
  }finally{globalThis.fetch=before;}
});

test('MC-Node API blocks unsigned requests before contacting hosting provider',async()=>{
  const prev={...process.env};
  try{
    Object.assign(process.env,valid);
    const r=await overviewRoute({cookies:{get:()=>null}});
    assert.equal(r.status,401);
  }finally{
    for(const k of Object.keys(valid)){
      if(Object.hasOwn(prev,k))process.env[k]=prev[k];else delete process.env[k];
    }
  }
});

test('MC-Node API safely reports not configured, without requiring a connection',async()=>{
  const keys=['MCNODE_PANEL_URL','MCNODE_CLIENT_API_KEY','MCNODE_SERVER_ID','SESSION_SECRET'];
  const prev=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try{
    delete process.env.MCNODE_PANEL_URL;
    delete process.env.MCNODE_CLIENT_API_KEY;
    delete process.env.MCNODE_SERVER_ID;
    process.env.SESSION_SECRET='a'.repeat(64);
    const session=makeSession();
    const r=await overviewRoute({cookies:{get:key=>key===COOKIE?{value:session}:undefined}});
    assert.equal(r.status,200);
    assert.deepEqual(await r.json(),{configured:false,connected:false});
  }finally{
    for(const k of keys){if(prev[k]===undefined)delete process.env[k];else process.env[k]=prev[k];}
  }
});
