import {isAgent,json} from '../../../../lib/security.js';
import {redis,keys} from '../../../../lib/redis.js';
import {sanitizeDiagnostics} from '../../../../lib/diagnostics.js';

export const runtime='nodejs';

export async function POST(req) {
  if(!isAgent(req))return json({error:'Unauthorized'},401);
  try {
    const text=await req.text();
    if(text.length>4000)return json({error:'Report too large'},413);
    const body=JSON.parse(text);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(body?.id||''))return json({error:'Invalid request id'},400);
    const report=sanitizeDiagnostics(body.report);
    if(!report)return json({error:'Invalid diagnostics report'},400);
    const raw=await redis('GET',keys.request(body.id));
    if(!raw)return json({error:'Unknown request'},404);
    const record=JSON.parse(raw);
    if(record.action!=='diagnostics.capture')return json({error:'Action mismatch'},409);
    if(record.state==='completed')return json({ok:true,already_completed:true});
    if(record.state!=='pending')return json({error:'Invalid request state'},409);
    const updated={...record,state:'completed',completed_at:new Date().toISOString(),report};
    await redis('SET',keys.request(body.id),JSON.stringify(updated),'EX',2592000);
    await redis('LREM',keys.pending,0,body.id);
    return json({ok:true});
  } catch {
    return json({error:'Cloud storage temporarily unavailable'},503);
  }
}
