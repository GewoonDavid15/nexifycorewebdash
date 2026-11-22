import {isAgent,json} from '../../../../lib/security.js';
import {redis,keys} from '../../../../lib/redis.js';
import {writeAudit} from '../../../../lib/audit.js';
import {isPendingFresh} from '../../../../lib/queue.js';
export const runtime='nodejs';
export async function POST(req){
  if(!isAgent(req))return json({error:'Unauthorized'},401);
  try{
    const text=await req.text();if(text.length>2048)return json({error:'Too large'},413);
    const {id,local_id}=JSON.parse(text);
    if(!/^[0-9a-f-]{36}$/.test(id)||!Number.isSafeInteger(local_id)||local_id<1)return json({error:'Invalid acknowledgement'},400);
    const raw=await redis('GET',keys.request(id));if(!raw)return json({error:'Not found'},404);
    const record=JSON.parse(raw);
    if(record.state==='pending'&&!isPendingFresh(record))return json({error:'Request expired'},409);
    if(record.state==='pending'){
      record.state='awaiting_console';record.local_id=local_id;record.acknowledged_at=new Date().toISOString();
      await redis('SET',keys.request(id),JSON.stringify(record),'EX',2592000);
      await redis('LREM',keys.pending,0,id);
      try{await writeAudit({action:record.action,state:'awaiting_console',source:'minecraft-agent',request_id:id});}catch{}
    }
    return json({ok:true});
  }catch{return json({error:'Cloud storage temporarily unavailable'},503);}
}
