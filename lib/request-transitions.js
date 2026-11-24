import {redis,keys} from './redis.js';
import {isPendingFresh,REQUEST_RECORD_TTL_SECONDS} from './queue.js';

// Compare-and-set keeps the record transition AND pending-list removal atomic.
// The script never creates a new request, never executes a command and does not
// permit a concurrent stale reader to overwrite a newer record.
export const TRANSITION_REQUEST_LUA=[
  "local current=redis.call('GET',KEYS[1])",
  "if not current then return -1 end",
  "if current ~= ARGV[1] then return 0 end",
  "redis.call('SET',KEYS[1],ARGV[2],'EX',tonumber(ARGV[4]))",
  "redis.call('LREM',KEYS[2],0,ARGV[3])",
  "return 1"
].join('\n');

export async function transitionRequest({id,action,finalState,localId,report,redisFn=redis,now=Date.now()}={}){
  if(!['backup.now','diagnostics.capture'].includes(action)||
    !['awaiting_console','completed'].includes(finalState)||
    (action==='backup.now')!==(finalState==='awaiting_console'))
    throw new Error('Invalid transition');
  const raw=await redisFn('GET',keys.request(id));
  if(!raw)return {outcome:'not_found'};
  let record;
  try{record=JSON.parse(raw);}catch{return {outcome:'conflict'};}
  if(record.id!==id||record.action!==action)return {outcome:'conflict'};
  if(finalState==='completed'&&record.state==='completed')return {outcome:'already_completed'};
  if(finalState==='awaiting_console'&&record.state==='awaiting_console'){
    return {outcome:record.local_id===localId?'already_acknowledged':'conflict'};
  }
  if(record.state!=='pending')return {outcome:'conflict'};
  if(!isPendingFresh(record,now))return {outcome:'expired'};
  const updated={...record,state:finalState};
  if(finalState==='awaiting_console'){
    if(!Number.isSafeInteger(localId)||localId<1)throw new Error('Invalid local ID');
    updated.local_id=localId;
    updated.acknowledged_at=new Date(now).toISOString();
  }else{
    if(!report||typeof report!=='object'||Array.isArray(report))
      throw new Error('Invalid report');
    updated.report=report;
    updated.completed_at=new Date(now).toISOString();
  }
  const result=await redisFn('EVAL',TRANSITION_REQUEST_LUA,2,
    keys.request(id),keys.pending,raw,JSON.stringify(updated),id,REQUEST_RECORD_TTL_SECONDS);
  return {outcome:Number(result)===1?'updated':Number(result)===-1?'not_found':'conflict'};
}
