// Nexify Cloud data is kept in its own Redis key namespace.
// Vercel KV (Upstash) integrations expose KV_* variables; manual Upstash setups
// commonly expose UPSTASH_* variables. Both work with the SAME database.
export function redisConfiguration(env = process.env) {
  const base = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  let url;
  try { url = new URL(base); } catch { throw new Error('Redis REST URL not configured'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) {
    throw new Error('Redis REST URL must use HTTPS');
  }
  if (typeof token !== 'string' || token.length < 12) {
    throw new Error('Redis REST token not configured');
  }
  return {base: url.toString(), token};
}
export class RedisError extends Error {
  constructor(code) {
    super(code);
    this.name='RedisError';
    this.code=code;
  }
}
function classifyRedisHttp(status) {
  if(status===401||status===403)return 'authorization_failed';
  if(status===429)return 'rate_limited';
  if(status>=500)return 'provider_unavailable';
  return 'command_failed';
}
// Never retry a mutating command after a timeout: it may have completed on the
// server even when the HTTP response was lost. Do not expose provider response
// bodies, URLs, keys or tokens through exceptions.
export async function redis(...parts) {
  let config;
  try {config=redisConfiguration();}catch{throw new RedisError('not_configured');}
  let response;
  try {
    response=await fetch(config.base,{
      method:'POST',
      headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},
      body:JSON.stringify(parts),cache:'no-store',redirect:'error',
      signal:AbortSignal.timeout(6000)
    });
  }catch(error){
    throw new RedisError(error?.name==='TimeoutError'?'timeout':'connection_failed');
  }
  if(!response.ok)throw new RedisError(classifyRedisHttp(response.status));
  let value;
  try{value=await response.json();}catch{throw new RedisError('invalid_response');}
  if(!value||typeof value!=='object'||!Object.hasOwn(value,'result')||
    value.error)throw new RedisError(value?.error?'command_failed':'invalid_response');
  return value.result;
}
// All keys are isolated from any other apps that share this Upstash database.
const prefix='nexify:cloud:main:v1:';
export const keys={
  status:prefix+'status',
  pending:prefix+'requests:pending',
  recent:prefix+'requests:recent',
  request:id=>prefix+'request:'+id,
  login:ip=>prefix+'login:'+ip,
  totpUsed:step=>prefix+'totp:used:'+step,
  backupCooldown:prefix+'requests:backup-cooldown',
  diagnosticsCooldown:prefix+'requests:diagnostics-cooldown',
  history:prefix+'status:history',
  historyGate:prefix+'status:history-sample-gate',
  audit:prefix+'operations:audit',
  accountSession:digest=>prefix+'identity:session:'+digest,
  identityAccount:id=>prefix+'identity:account:'+id,
  identityUsername:name=>prefix+'identity:username:'+name,
  identityAccounts:prefix+'identity:accounts:index',
  identityInviteToken:digest=>prefix+'identity:invite:token:'+digest,
  identityInviteAccount:id=>prefix+'identity:invite:account:'+id,
  identityTotpStep:(id,step)=>prefix+'identity:totp:used:'+id+':'+step
};
