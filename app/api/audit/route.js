import {requestAuthorized,json} from '../../../lib/security.js';
import {readAudit} from '../../../lib/audit.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

// Single authorized admin can view sanitized operational metadata.
export async function GET(req){
  if(!requestAuthorized(req))return json({error:'Unauthorized'},401);
  try{
    const events=await readAudit();
    return json({events,limit:50,retention_days:30});
  }catch{return json({error:'Operational history is temporarily unavailable'},503);}
}
