// Manual and non-destructive REST EVAL check against a SEPARATE staging database.
// Does NOT read production KV/UPSTASH variables. No automatic retry on uncertain writes.
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export async function runStagingProbe({url,token,fetchFn=fetch,requestId=randomUUID()}={}){
  let endpoint;
  try{endpoint=new URL(url);}catch{throw new Error('Missing staging REST URL');}
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||
     endpoint.search||endpoint.hash||endpoint.pathname!=='/'||
     endpoint.hostname.endsWith('.local')||endpoint.hostname==='localhost')
    throw new Error('Invalid staging URL');
  if(typeof token!=='string'||token.length<12)throw new Error('Missing staging credential');
  if(!/^[a-f0-9-]{36}$/.test(requestId))throw new Error('Invalid request ID');
  const key='nexify:cloud:staging-probe:v1:'+requestId;
  async function execute(command){
    let response;
    try{
      response=await fetchFn(endpoint.toString(),{
        method:'POST',redirect:'error',cache:'no-store',
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify(command),signal:AbortSignal.timeout(6000)
      });
    }catch{throw new Error('Staging network unavailable');}
    if(!response.ok)throw new Error('Staging HTTP failure');
    let body;
    try{body=await response.json();}catch{throw new Error('Invalid staging REST response');}
    if(!body||body.error||!Object.hasOwn(body,'result'))throw new Error('Staging Redis command rejected');
    return body.result;
  }
  const created=await execute(['EVAL',"return redis.call('SET',KEYS[1],ARGV[1],'EX',120,'NX')",1,key,requestId]);
  if(created!=='OK')throw new Error('Staging probe key already exists');
  const observed=await execute(['GET',key]);
  if(observed!==requestId)throw new Error('Staging value mismatch');
  // Delete only our own ephemeral key, and only when its exact value matches.
  const cleared=await execute(['EVAL',"if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",1,key,requestId]);
  if(Number(cleared)!==1)throw new Error('Staging probe cleanup failed');
  return {ok:true,checked:'REST EVAL + GET + isolated cleanup'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.env.NEXIFY_STAGING_PROBE_CONFIRM!=='YES'){
    console.error('Set NEXIFY_STAGING_PROBE_CONFIRM=YES and staging-only REST credentials first.');
    process.exitCode=2;
  }else{
    try{
      await runStagingProbe({
        url:process.env.NEXIFY_STAGING_REDIS_REST_URL,
        token:process.env.NEXIFY_STAGING_REDIS_REST_TOKEN
      });
      console.log('Staging REST EVAL probe PASS (isolated temporary key only).');
    }catch{
      console.error('Staging REST EVAL probe FAILED. No credential or provider response is shown.');
      process.exitCode=1;
    }
  }
}
