import {redis,keys} from './redis.js';

export const MAX_PENDING_AGE_MS=20*60*1000;
export const REQUEST_RECORD_TTL_SECONDS=30*24*60*60;

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const allowedActions=new Set(['backup.now','diagnostics.capture']);
const cleanDate=now=>new Date(now).toISOString();

// The queue and acknowledgement endpoints share the same expiry policy.
// A small forward clock tolerance preserves the existing queue behavior.
export function isPendingFresh(record,now=Date.now()){
  if(!record||record.state!=='pending')return false;
  const created=Date.parse(record.created_at);
  return Number.isFinite(created)&&created<=now+5*60*1000&&now-created<=MAX_PENDING_AGE_MS;
}

/**
 * Remove stale or malformed entries so that a stopped Minecraft agent cannot
 * block the command queue indefinitely. Never execute or retry a request here.
 * The history record remains readable, marked 'expired'.
 */
export async function prunePending(redisFn=redis,now=Date.now()){
  const ids=await redisFn('LRANGE',keys.pending,0,49)||[];
  const live=[];
  let removed=0;
  for(const id of ids){
    if(typeof id!=='string')continue;
    if(!uuid.test(id)){
      await redisFn('LREM',keys.pending,0,id);removed++;
      continue;
    }
    const raw=await redisFn('GET',keys.request(id));
    let record;
    try{record=raw?JSON.parse(raw):null;}catch{record=null;}
    if(!record||record.id!==id||record.state!=='pending'||!allowedActions.has(record.action)){
      await redisFn('LREM',keys.pending,0,id);removed++;
      continue;
    }
    if(!isPendingFresh(record,now)){
      await redisFn('SET',keys.request(id),
        JSON.stringify({...record,state:'expired',expired_at:cleanDate(now)}),
        'EX',REQUEST_RECORD_TTL_SECONDS);
      await redisFn('LREM',keys.pending,0,id);removed++;
      continue;
    }
    live.push({id,action:record.action,created_at:record.created_at});
  }
  return {live,removed};
}
