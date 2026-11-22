import {isAgent,json} from '../../../../lib/security.js';
import {sanitizeDiagnostics} from '../../../../lib/diagnostics.js';
import {writeAudit} from '../../../../lib/audit.js';
import {transitionRequest} from '../../../../lib/request-transitions.js';

export const runtime='nodejs';

export async function POST(req){
  if(!isAgent(req))return json({error:'Unauthorized'},401);
  try{
    const text=await req.text();
    if(text.length>4000)return json({error:'Report too large'},413);
    let body;
    try{body=JSON.parse(text);}catch{return json({error:'Invalid JSON'},400);}
    if(typeof body?.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(body.id))return json({error:'Invalid request id'},400);
    const report=sanitizeDiagnostics(body.report);
    if(!report)return json({error:'Invalid diagnostics report'},400);
    const result=await transitionRequest({id:body.id,action:'diagnostics.capture',finalState:'completed',report});
    if(result.outcome==='not_found')return json({error:'Unknown request'},404);
    if(result.outcome==='expired')return json({error:'Request expired'},409);
    if(result.outcome==='conflict')return json({error:'Invalid request state'},409);
    if(result.outcome==='updated'){
      try{await writeAudit({action:'diagnostics.capture',state:'completed',source:'minecraft-agent',request_id:body.id});}catch{}
    }
    return json({ok:true,already_completed:result.outcome==='already_completed'});
  }catch{return json({error:'Cloud storage temporarily unavailable'},503);}
}
