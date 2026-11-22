import {requestAuthorized,json} from '../../../../lib/security.js';
import {systemReadiness} from '../../../../lib/readiness.js';
import {redis} from '../../../../lib/redis.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req) {
  if(!requestAuthorized(req))return json({error:'Unauthorized'},401);
  const status=systemReadiness();
  const configured=status.checks.find(x=>x.id==='redis')?.status==='ready';
  let redisLive='not_configured';
  if(configured) {
    try{
      const response=await redis('PING');
      redisLive=response==='PONG'?'connected':'unexpected_response';
    }catch{redisLive='unavailable';}
  }
  const checks=status.checks.map(x=>x.id==='redis'?{
    ...x,
    live:redisLive,
    detail:redisLive==='connected'?'Bestaande Redis-database bereikbaar; geen tweede database nodig.':
      redisLive==='unavailable'?'REST-configuratie aanwezig, maar Redis reageert niet. Controleer de bestaande koppeling.':
      x.detail
  }:x);
  return json({
    generated_at:new Date().toISOString(),
    mode:'read_only',
    checks,
    summary:status.summary,
    redis_connection:redisLive,
    note:'Configuratiecontroles zijn geen bewijs van een werkende Minecraft- of MC-Node-verbinding.'
  });
}
