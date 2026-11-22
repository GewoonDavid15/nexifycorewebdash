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
export async function redis(...parts) {
  const {base, token}=redisConfiguration();
  const r=await fetch(base, {
    method:'POST', headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
    body: JSON.stringify(parts),cache:'no-store',signal:AbortSignal.timeout(6000)
  });
  if(!r.ok)throw new Error('Redis HTTP '+r.status);
  const value=await r.json();
  if(value.error)throw new Error('Redis command failed');
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
  backupCooldown:prefix+'requests:backup-cooldown'
};
