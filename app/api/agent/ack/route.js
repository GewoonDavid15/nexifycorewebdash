import {isAgent,json} from '../../../../lib/security.js';
import {writeAudit} from '../../../../lib/audit.js';
import {transitionRequest} from '../../../../lib/request-transitions.js';
export const runtime='nodejs';
export async function POST(req){
  if(!isAgent(req))return json({error:'Unauthorized'},401);
  try{
    const text=await req.text();if(text.length>2048)return json({error:'Too large'},413);
    let body;
    try{body=JSON.parse(text);}catch{return json({error:'Invalid JSON'},400);}
    const {id,local_id}=body&&typeof body==='object'?body:{};
    if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)||
      !Number.isSafeInteger(local_id)||local_id<1)return json({error:'Invalid acknowledgement'},400);
    const result=await transitionRequest({id,action:'backup.now',finalState:'awaiting_console',localId:local_id});
    if(result.outcome==='not_found')return json({error:'Not found'},404);
    if(result.outcome==='expired')return json({error:'Request expired'},409);
    if(result.outcome==='conflict')return json({error:'Request state changed'},409);
    if(result.outcome==='updated'){
      try{await writeAudit({action:'backup.now',state:'awaiting_console',source:'minecraft-agent',request_id:id});}catch{}
    }
    return json({ok:true,already_acknowledged:result.outcome==='already_acknowledged'});
  }catch{return json({error:'Cloud storage temporarily unavailable'},503);}
}
