import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSession,COOKIE} from '../lib/security.js';
import {POST as sync} from '../app/api/agent/sync/route.js';
import {POST as ack} from '../app/api/agent/ack/route.js';
import {GET as status} from '../app/api/status/route.js';
import {GET as list,POST as create} from '../app/api/requests/route.js';

process.env.AGENT_SECRET='a'.repeat(64);
process.env.SESSION_SECRET='b'.repeat(64);
process.env.UPSTASH_REDIS_REST_URL='https://fake-upstash.example';
process.env.UPSTASH_REDIS_REST_TOKEN='local-tests-only-token';

const memory=new Map(), lists=new Map();
const original=globalThis.fetch;
globalThis.fetch=async (_url,opts)=>{
  const [cmd,...args]=JSON.parse(opts.body);let result;
  switch(cmd){
    case 'SET':{
      const [key,val,...flags]=args;
      if(flags.includes('NX')&&memory.has(key)){result=null;break;}
      memory.set(key,val);result='OK';break;
    }
    case 'GET':result=memory.get(args[0])??null;break;
    case 'DEL':result=memory.delete(args[0])?1:0;break;
    case 'LRANGE':{
      const a=lists.get(args[0])||[];result=a.slice(args[1],args[2]+1);break;
    }
    case 'LLEN':result=(lists.get(args[0])||[]).length;break;
    case 'LPUSH':lists.set(args[0],[args[1],...(lists.get(args[0])||[])]);result=lists.get(args[0]).length;break;
    case 'LTRIM':lists.set(args[0],(lists.get(args[0])||[]).slice(args[1],args[2]+1));result='OK';break;
    case 'LREM':lists.set(args[0],(lists.get(args[0])||[]).filter(v=>v!==args[2]));result=1;break;
    default:throw new Error('Unexpected redis command '+cmd);
  }
  return Response.json({result});
};
const origin='https://my-nexify.vercel.app';
const auth=()=>({cookies:new Map([[COOKIE, {value:makeSession()}]])});
function request(path,method,body,headers={}){return new Request(origin+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...headers},body:JSON.stringify(body)});}

test('agent rejects wrong secret',async()=>{
  const r=await sync(request('/api/agent/sync','POST',{server_id:'main',plugin_version:'2.2.0'}));assert.equal(r.status,401);
});
test('telemetry sync stores status; viewer must be signed in',async()=>{
  let r=await sync(request('/api/agent/sync','POST',{server_id:'main',plugin_version:'2.2.0',tps:20,mspt:17,players:3}, {'Authorization':'Bearer '+process.env.AGENT_SECRET}));
  assert.equal(r.status,200);
  r=await status({cookies:new Map()});assert.equal(r.status,401);
  r=await status(auth());const payload=await r.json();assert.equal(payload.status.tps,20);assert.equal(payload.status.players,3);assert.equal(payload.online,true);
});
test('dashboard creates safe request, agent receives and acknowledges it',async()=>{
  const user=auth();Object.assign(user,{url:origin+'/api/requests',headers:new Headers({origin}),text:async()=>JSON.stringify({action:'backup.now'})});
  let r=await create(user);assert.equal(r.status,201);
  const added=(await r.json()).request;
  const duplicate=await create(user);assert.equal(duplicate.status,429);
  r=await sync(request('/api/agent/sync','POST',{server_id:'main',plugin_version:'2.2.0',tps:20},{'Authorization':'Bearer '+process.env.AGENT_SECRET}));
  assert.equal((await r.json()).request.id,added.id);
  r=await ack(request('/api/agent/ack','POST',{id:added.id,local_id:42},{'Authorization':'Bearer '+process.env.AGENT_SECRET}));assert.equal(r.status,200);
  r=await list(auth());const rows=(await r.json()).requests;assert.equal(rows[0].state,'awaiting_console');assert.equal(rows[0].local_id,42);
  r=await sync(request('/api/agent/sync','POST',{server_id:'main',plugin_version:'2.2.0'}, {'Authorization':'Bearer '+process.env.AGENT_SECRET}));
  assert.equal((await r.json()).request,null);
});
test('arbitrary browser commands are rejected',async()=>{
  const user=auth();Object.assign(user,{url:origin+'/api/requests',headers:new Headers({origin}),text:async()=>JSON.stringify({action:'console.exec',value:'stop'})});
  const r=await create(user);assert.equal(r.status,400);
});
process.on('exit',()=>{globalThis.fetch=original});
