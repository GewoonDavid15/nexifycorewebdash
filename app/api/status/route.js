import {requestAuthorized,json} from '../../../lib/security.js';
import {redis,keys} from '../../../lib/redis.js';
export const runtime='nodejs';
export async function GET(req){
  if(!requestAuthorized(req))return json({error:'Unauthorized'},401);
  try{
    const raw=await redis('GET',keys.status);
    const status=raw?JSON.parse(raw):null;
    const age=status?Date.now()-Date.parse(status.received_at):NaN;
    const online=Number.isFinite(age)&&age>=0&&age<120000;
    return json({online,status:online?status:null});
  }catch{return json({error:'Storage unavailable'},503);}
}
