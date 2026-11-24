// Explicit opt-in probe for a dedicated staging Upstash REST database.
// Uses isolated, expiring test keys. No Minecraft commands or production data.
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {CREATE_REQUEST_LUA} from '../lib/request-creation.js';
import {TRANSITION_REQUEST_LUA} from '../lib/request-transitions.js';
import {PRUNE_PENDING_LUA} from '../lib/queue.js';

const requestIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function secureEndpoint(value){
  let url;
  try{url=new URL(value);}catch{throw new Error('Invalid staging REST endpoint');}
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password||
    url.pathname!=='/'||url.search||url.hash||url.hostname==='localhost'||
    url.hostname.endsWith('.local'))throw new Error('Invalid staging REST endpoint');
  return url;
}
export async function verifyIsolatedCloudbridgeStaging({
  url,token,fetchFn=fetch,requestId=randomUUID(),productionUrls=[]
}={}){
  const staging=secureEndpoint(url);
  if(typeof token!=='string'||token.length<12)throw new Error('Missing staging credential');
  if(!requestIdPattern.test(requestId))throw new Error('Invalid test UUID');
  for(const production of productionUrls.filter(Boolean)){
    // Fail closed when staging points to the configured production database.
    if(secureEndpoint(production).origin===staging.origin)
      throw new Error('Staging URL matches production Redis');
  }
  const prefix='nexify:cloud:staging-probe:v2:'+requestId+':';
  const key={pending:prefix+'pending',cooldown:prefix+'cooldown',record:prefix+'record',
    recent:prefix+'recent'};
  const record={id:requestId,action:'diagnostics.capture',created_at:new Date().toISOString(),state:'pending'};
  const commands=[];
  async function execute(args){
    commands.push(args[0]);
    let response;
    try{
      response=await fetchFn(staging.toString(),{
        method:'POST',redirect:'error',cache:'no-store',
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify(args),signal:AbortSignal.timeout(6000)
      });
    }catch{throw new Error('Staging connection unavailable');}
    if(!response.ok)throw new Error('Staging Redis HTTP failure');
    let body;
    try{body=await response.json();}catch{throw new Error('Malformed staging Redis response');}
    if(!body||body.error||!Object.hasOwn(body,'result'))
      throw new Error('Staging Redis command rejected');
    return body.result;
  }
  // A test key can only be used with an unpredictable identifier and expires
  // after two minutes, even if a network fault interrupts cleanup.
  const created=await execute(['EVAL',CREATE_REQUEST_LUA,4,
    key.pending,key.cooldown,key.record,key.recent,requestId,
    JSON.stringify(record),10,60,120]);
  if(Number(created)!==1)throw new Error('Atomic staging creation failed');
  const duplicate=await execute(['EVAL',CREATE_REQUEST_LUA,4,
    key.pending,key.cooldown,key.record,key.recent,randomUUID(),
    JSON.stringify(record),10,60,120]);
  if(Number(duplicate)!==0)throw new Error('Staging cooldown validation failed');
  const raw=await execute(['GET',key.record]);
  if(raw!==JSON.stringify(record))throw new Error('Staging read mismatch');
  const after={...record,state:'completed',report:{tps:19.9},completed_at:new Date().toISOString()};
  const transitioned=await execute(['EVAL',TRANSITION_REQUEST_LUA,2,
    key.record,key.pending,raw,JSON.stringify(after),requestId,120]);
  if(Number(transitioned)!==1)throw new Error('Atomic staging transition failed');
  const stale=await execute(['EVAL',TRANSITION_REQUEST_LUA,2,
    key.record,key.pending,raw,JSON.stringify(after),requestId,120]);
  if(Number(stale)!==0)throw new Error('Staging stale-write rejection failed');
  if(Number(await execute(['LLEN',key.pending]))!==0)
    throw new Error('Staging pending queue was not cleared');
  // Exercise the actual cleanup script on an expired standalone request,
  // without accessing production key prefixes.
  const staleRecord={...record,created_at:new Date(Date.now()-21*60*1000).toISOString()};
  const serialized=JSON.stringify(staleRecord);
  await execute(['SET',key.record,serialized,'EX',120]);
  await execute(['LPUSH',key.pending,requestId]);
  const expired=JSON.stringify({...staleRecord,state:'expired',expired_at:new Date().toISOString()});
  const pruned=await execute(['EVAL',PRUNE_PENDING_LUA,2,
    key.record,key.pending,serialized,expired,requestId,120]);
  if(Number(pruned)!==1||Number(await execute(['LLEN',key.pending]))!==0)
    throw new Error('Atomic staging prune failed');
  const stored=await execute(['GET',key.record]);
  if(stored!==expired)throw new Error('Staging prune record mismatch');
  // All generated data has expiry. Clean up only exact isolated keys.
  // Any uncertain HTTP result is NOT blindly retried.
  await execute(['DEL',key.pending,key.cooldown,key.record,key.recent]);
  return {ok:true,checked:['atomic_create','cooldown','transition','stale_conflict','prune'],commands:commands.length};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.env.NEXIFY_STAGING_PROBE_CONFIRM!=='YES'){
    console.error('A separate staging Redis database and NEXIFY_STAGING_PROBE_CONFIRM=YES are required.');
    process.exitCode=2;
  }else{
    try{
      await verifyIsolatedCloudbridgeStaging({
        url:process.env.NEXIFY_STAGING_REDIS_REST_URL,
        token:process.env.NEXIFY_STAGING_REDIS_REST_TOKEN,
        productionUrls:[process.env.UPSTASH_REDIS_REST_URL,process.env.KV_REST_API_URL]
      });
      console.log('Cloud Bridge staging probe passed (isolated temporary keys).');
    }catch{
      console.error('Cloud Bridge staging probe failed. No secrets or upstream bodies are printed.');
      process.exitCode=1;
    }
  }
}
