import {randomUUID} from 'node:crypto';
import {redis,keys} from './redis.js';

// Operational log, not a complete tamper-proof security audit. Do not store
// user IDs, IP addresses, credentials, console output or file contents.
const actions=new Set(['backup.now','diagnostics.capture']);
const states=new Set(['queued','awaiting_console','completed','expired','rejected']);
const sources=new Set(['dashboard','minecraft-agent']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function cleanAuditEntry(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  if(!actions.has(raw.action)||!states.has(raw.state)||!sources.has(raw.source))return null;
  if(!uuid.test(raw.request_id||''))return null;
  const at=typeof raw.at==='string'?Date.parse(raw.at):NaN;
  if(!Number.isFinite(at))return null;
  return {
    at:new Date(at).toISOString(),
    action:raw.action,
    state:raw.state,
    source:raw.source,
    request_id:raw.request_id
  };
}

export async function writeAudit(event,redisFn=redis){
  const item=cleanAuditEntry({...event,at:new Date().toISOString()});
  if(!item)throw new Error('Invalid audit event');
  await redisFn('LPUSH',keys.audit,JSON.stringify(item));
  await redisFn('LTRIM',keys.audit,0,199);
  await redisFn('EXPIRE',keys.audit,30*24*60*60);
  return item;
}

export async function readAudit(redisFn=redis){
  const rows=await redisFn('LRANGE',keys.audit,0,49)||[];
  const cutoff=Date.now()-30*24*60*60*1000;
  return rows.map(row=>{
    try{return cleanAuditEntry(JSON.parse(row));}catch{return null;}
  }).filter(item=>item&&Date.parse(item.at)>=cutoff&&Date.parse(item.at)<=Date.now()+60000);
}
