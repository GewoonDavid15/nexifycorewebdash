import {isAgent,json} from '../../../../lib/security.js';
import {redis,keys} from '../../../../lib/redis.js';
export const runtime='nodejs';
export async function POST(req){
  if(!isAgent(req))return json({error:'Unauthorized'},401);
  try{
    const text=await req.text();if(text.length>6000)return json({error:'Too large'},413);
    const incoming=JSON.parse(text);
    if(incoming.server_id!=='main' || typeof incoming.plugin_version!=='string' || incoming.plugin_version.length>40)return json({error:'Invalid server'},400);
    const numeric=['tps','mspt','heap_used_mib','heap_max_mib','players','ping_ms','chunks','cpu_pct'];
    const safe={server_id:'main',plugin_version:incoming.plugin_version,received_at:new Date().toISOString()};
    for(const key of numeric){const value=incoming[key];safe[key]=typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<1e9?value:null;}
    safe.geyser=incoming.geyser===true;safe.floodgate=incoming.floodgate===true;
    await redis('SET',keys.status,JSON.stringify(safe),'EX',150);
    const ids=await redis('LRANGE',keys.pending,0,4);
    for(const id of ids||[]){
      const raw=await redis('GET',keys.request(id));if(!raw)continue;
      const record=JSON.parse(raw);
      if(record.state==='pending'&&record.action==='backup.now')return json({ok:true,request:{id,action:'backup.now'}});
    }
    return json({ok:true,request:null});
  }catch{return json({error:'Cloud storage temporarily unavailable'},503);}
}
