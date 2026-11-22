import {panelConfig} from './mcnode.js';
import {redisConfiguration} from './redis.js';

// Server-side configuration assessment. Never include raw environment values.
// This reports CONFIGURATION only, not proof that external systems are online.
export function systemReadiness(env=process.env) {
  const checks=[];
  const check=(id,label,group,status,detail)=>checks.push({id,label,group,status,detail});
  const session=typeof env.SESSION_SECRET==='string'&&env.SESSION_SECRET.length>=32;
  check('session','Dashboard-sessies','security',session?'ready':'missing',
    session?'Ondertekening van sessies ingesteld.':'SESSION_SECRET ontbreekt of is te kort.');
  const password=typeof env.DASHBOARD_PASSWORD_HASH==='string'&&
    /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(env.DASHBOARD_PASSWORD_HASH);
  check('password','Wachtwoordbeveiliging','security',password?'ready':'missing',
    password?'Scrypt-wachtwoordhash ingesteld.':'DASHBOARD_PASSWORD_HASH ontbreekt of heeft een onjuist formaat.');
  const totp=typeof env.DASHBOARD_TOTP_SECRET==='string'&&/^[A-Z2-7]{16,64}$/.test(env.DASHBOARD_TOTP_SECRET);
  check('totp','Tweestapsverificatie','security',totp?'ready':'missing',
    totp?'Authenticator-sleutel ingesteld.':'DASHBOARD_TOTP_SECRET ontbreekt of heeft een onjuist formaat.');
  const agent=typeof env.AGENT_SECRET==='string'&&env.AGENT_SECRET.length>=32;
  check('agent','Cloud Bridge-authenticatie','minecraft',agent?'ready':'missing',
    agent?'Agentsleutel op Vercel aanwezig; overeenkomst met MC-Node is nog niet geverifieerd.':
      'AGENT_SECRET ontbreekt of is te kort.');
  let redisOk=false;
  try{redisConfiguration(env);redisOk=true;}catch{}
  check('redis','Bestaande Redis-database','data',redisOk?'ready':'missing',
    redisOk?'REST-configuratie aanwezig; bereikbaarheid wordt apart getest.':
      'Bestaande KV_REST_API_URL en KV_REST_API_TOKEN zijn niet correct ingesteld.');
  const panelVars=['MCNODE_PANEL_URL','MCNODE_CLIENT_API_KEY','MCNODE_SERVER_ID'];
  const panelCount=panelVars.filter(key=>typeof env[key]==='string'&&env[key].length>0).length;
  let panelStatus='optional';
  if(panelCount){
    try{panelConfig(env);panelStatus='ready';}catch{panelStatus='invalid';}
  }
  check('mcnode','MC-Node Client API','hosting',panelStatus,
    panelStatus==='ready'?'Configuratie geldig; werkelijke API-verbinding wordt afzonderlijk getest.':
    panelStatus==='optional'?'Optioneel: voeg drie MCNODE-variabelen toe om hosting te koppelen.':
    'Paneel-URL, Client API-key en server-ID ontbreken deels of zijn niet geldig.');
  return {
    checks,
    summary:{
      ready:checks.filter(x=>x.status==='ready').length,
      missing:checks.filter(x=>x.status==='missing').length,
      invalid:checks.filter(x=>x.status==='invalid').length,
      optional:checks.filter(x=>x.status==='optional').length
    }
  };
}
