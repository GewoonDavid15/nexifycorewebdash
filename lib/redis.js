// Vercel Functions are stateless. Upstash REST holds heartbeat and approval requests.
export async function redis(...parts) {
  const base=process.env.UPSTASH_REDIS_REST_URL;
  const token=process.env.UPSTASH_REDIS_REST_TOKEN;
  if(!base||!token||!base.startsWith('https://'))throw new Error('Redis not configured');
  const r=await fetch(base, {
    method:'POST', headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
    body: JSON.stringify(parts),cache:'no-store',signal:AbortSignal.timeout(6000)
  });
  if(!r.ok)throw new Error(`Redis HTTP ${r.status}`);
  const value=await r.json();
  if(value.error)throw new Error('Redis command failed');
  return value.result;
}
export const keys={status:'nexify:status',pending:'nexify:requests:pending',recent:'nexify:requests:recent',request:id=>`nexify:request:${id}`};
