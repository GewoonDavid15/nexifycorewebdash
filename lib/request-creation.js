import {randomUUID} from 'node:crypto';
import {redis,keys} from './redis.js';
import {REQUEST_RECORD_TTL_SECONDS} from './queue.js';

const actions=new Set(['backup.now','diagnostics.capture']);
const MAX_PENDING=10;
const COOLDOWN_SECONDS=60;

// One Redis transaction covers the capacity check, per-action cooldown,
// record creation, and both indexes. A rejected request writes nothing.
export const CREATE_REQUEST_LUA=[
  "if redis.call('LLEN',KEYS[1]) >= tonumber(ARGV[3]) then return -1 end",
  "if redis.call('EXISTS',KEYS[2]) ~= 0 then return 0 end",
  "if redis.call('EXISTS',KEYS[3]) ~= 0 then return -2 end",
  "redis.call('SET',KEYS[2],'1','EX',tonumber(ARGV[4]))",
  "redis.call('SET',KEYS[3],ARGV[2],'EX',tonumber(ARGV[5]))",
  "redis.call('LPUSH',KEYS[1],ARGV[1])",
  "redis.call('LPUSH',KEYS[4],ARGV[1])",
  "redis.call('LTRIM',KEYS[4],0,49)",
  "return 1"
].join('\n');

export async function createRequest({action,redisFn=redis,id=randomUUID(),now=Date.now()}={}){
  if(!actions.has(action))throw new Error('Action not allowed');
  if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))
    throw new Error('Invalid request ID');
  if(!Number.isFinite(now)||now<0)throw new Error('Invalid timestamp');
  const record={id,action,created_at:new Date(now).toISOString(),state:'pending'};
  const cooldown=action==='backup.now'?keys.backupCooldown:keys.diagnosticsCooldown;
  const outcome=Number(await redisFn('EVAL',CREATE_REQUEST_LUA,4,
    keys.pending,cooldown,keys.request(id),keys.recent,
    id,JSON.stringify(record),MAX_PENDING,COOLDOWN_SECONDS,REQUEST_RECORD_TTL_SECONDS));
  if(outcome===1)return {outcome:'created',record};
  if(outcome===0)return {outcome:'cooldown'};
  if(outcome===-1)return {outcome:'queue_full'};
  if(outcome===-2)return {outcome:'id_collision'};
  throw new Error('Unexpected Redis request result');
}
