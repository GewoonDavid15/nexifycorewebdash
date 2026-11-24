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

// Expected-value CAS ensures that pruning cannot overwrite a freshly
// acknowledged/finished request or accidentally remove its new queue state.
export const PRUNE_PENDING_LUA=[
  "-- NEXIFY_PRUNE_PENDING_V1",
  "local current=redis.call('GET',KEYS[1])",
  "if (current or '') ~= ARGV[1] then return 0 end",
  "if ARGV[2] ~= '' then",
  "  if not current then return 0 end",
  "  redis.call('SET',KEYS[1],ARGV[2],'EX',tonumber(ARGV[4]))",
  "end",
  "redis.call('LREM',KEYS[2],0,ARGV[3])",
  "return 1"
].join(String.fromCharCode(10));

/**
 * Prune a bounded batch using compare-and-set. All updates go through a Redis
 * Lua transaction so a concurrent agent acknowledgement is never lost.
 */
export async function prunePending(redisFn=redis,now=Date.now()){
  const ids=await redisFn('LRANGE',keys.pending,0,49)||[];
  const live=[];
  let removed=0;
  for(const id of ids){
    if(typeof id!=='string')continue;
    const validId=uuid.test(id);
    let raw=null,record=null;
    if(validId){
      raw=await redisFn('GET',keys.request(id));
      try{record=raw?JSON.parse(raw):null;}catch{record=null;}
    }
    const validRecord=validId&&record&&record.id===id&&
      record.state==='pending'&&allowedActions.has(record.action);
    if(validRecord&&isPendingFresh(record,now)){
      live.push({id,action:record.action,created_at:record.created_at});
      continue;
    }
    const expired=validRecord&&!isPendingFresh(record,now);
    const next=expired?JSON.stringify({...record,state:'expired',expired_at:cleanDate(now)}):'';
    if(!validId){
      // No corresponding request key can be trusted for malformed list entries.
      removed+=Number(await redisFn('LREM',keys.pending,0,id))>0?1:0;
      continue;
    }
    const result=await redisFn('EVAL',PRUNE_PENDING_LUA,2,keys.request(id),
      keys.pending,raw??'',next,id,REQUEST_RECORD_TTL_SECONDS);
    if(Number(result)===1)removed++;
    // CAS conflicts are revisited on the next poll; do not execute the request
    // from a stale read.
  }
  return {live,removed};
}
