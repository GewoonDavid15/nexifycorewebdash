import {requestAuthorized,trustedOrigin,json} from '../../../lib/security.js';
import {redis,keys} from '../../../lib/redis.js';
import {prunePending} from '../../../lib/queue.js';
import {writeAudit} from '../../../lib/audit.js';
import {createRequest} from '../../../lib/request-creation.js';
export const runtime='nodejs';
export async function GET(req){
  if(!requestAuthorized(req))return json({error:'Unauthorized'},401);
  try{
    await prunePending();
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
    let body;
    try{body=JSON.parse(text);}catch{return json({error:'Invalid JSON'},400);}
    if(!body||typeof body!=='object'||Array.isArray(body)||
      !['backup.now','diagnostics.capture'].includes(body.action))
      return json({error:'Action not allowed'},400);
    await prunePending();
    const result=await createRequest({action:body.action});
    if(result.outcome==='queue_full')return json({error:'Too many pending requests'},429);
    if(result.outcome==='cooldown')return json({error:'Wacht 60 seconden voordat je opnieuw deze actie aanvraagt'},429);
    if(result.outcome!=='created')return json({error:'Request unavailable'},503);
    const {record}=result;
    try{await writeAudit({action:record.action,state:'queued',source:'dashboard',request_id:id});}
    catch{/* Audit storage is best-effort; the request itself succeeded. */}
    return json({ok:true,request:record},201);
  }catch{return json({error:'Storage unavailable'},503);}
}
