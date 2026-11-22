import {randomUUID} from 'node:crypto';
import {requestAuthorized,trustedOrigin,json} from '../../../lib/security.js';
import {redis,keys} from '../../../lib/redis.js';
export const runtime='nodejs';
export async function GET(req){
  if(!requestAuthorized(req))return json({error:'Unauthorized'},401);
  try{
    const ids=await redis('LRANGE',keys.recent,0,19);const items=[];
    for(const id of ids||[]){const raw=await redis('GET',keys.request(id));if(raw)items.push(JSON.parse(raw));}
    return json({requests:items});
  }catch{return json({error:'Storage unavailable'},503);}
}
export async function POST(req){
  if(!requestAuthorized(req))return json({error:'Unauthorized'},401);
  if(!trustedOrigin(req))return json({error:'Invalid origin'},403);
  try{
    const text=await req.text();if(text.length>1000)return json({error:'Too large'},413);
    const body=JSON.parse(text);
    if(body.action!=='backup.now')return json({error:'Action not allowed'},400);
    if(Number(await redis('LLEN',keys.pending))>=10)return json({error:'Too many pending requests'},429);
    const id=randomUUID();const record={id,action:'backup.now',created_at:new Date().toISOString(),state:'pending'};
    await redis('SET',keys.request(id),JSON.stringify(record),'EX',2592000);
    await redis('LPUSH',keys.pending,id);
    await redis('LPUSH',keys.recent,id);await redis('LTRIM',keys.recent,0,49);
    return json({ok:true,request:record},201);
  }catch{return json({error:'Storage unavailable'},503);}
}
