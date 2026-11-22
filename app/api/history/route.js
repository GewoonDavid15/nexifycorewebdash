import {requestAuthorized,json} from '../../../lib/security.js';
import {redis,keys} from '../../../lib/redis.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req) {
  if(!requestAuthorized(req))return json({error:'Unauthorized'},401);
  try{
    const rows=await redis('LRANGE',keys.history,0,287);
    const points=[];
    const now=Date.now();
    const lower=now-24*60*60*1000;
    const upper=now+60*1000;
    for(const item of rows||[]){
      try{
        const raw=JSON.parse(item);
        const stamp=typeof raw.at==='string'?Date.parse(raw.at):NaN;
        if(!Number.isFinite(stamp)||stamp<lower||stamp>upper)continue;
        const n=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<1e9?v:null;
        points.push({at:raw.at,tps:n(raw.tps),mspt:n(raw.mspt),players:n(raw.players)});
      }catch{}
    }
    points.reverse();
    return json({points,retention:'at most 288 points, sampled every 5 minutes'});
  }catch{return json({error:'History temporarily unavailable'},503);}
}
