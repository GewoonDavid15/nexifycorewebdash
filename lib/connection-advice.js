// Read-only troubleshooting hints. Never expose environment values or credentials.
export function connectionAdvice({readiness=null,status=null,mcnode=null,cloudError='',hostError=''}={}) {
  const checks=Array.isArray(readiness?.checks)?readiness.checks:[];
  const state=Object.fromEntries(checks.map(c=>[c.id,c.status]));
  const issues=[];
  const add=(id,title,detail)=>issues.push({id,title,detail});
  if(state.redis==='missing'||readiness?.redis_connection==='not_configured') {
    add('redis-config','Redis ontbreekt','Controleer KV_REST_API_URL en KV_REST_API_TOKEN in Vercel. Gebruik de bestaande database.');
  } else if(readiness?.redis_connection==='unavailable'||cloudError) {
    add('redis-down','Cloud-opslag niet bereikbaar','Controleer de bestaande Upstash-verbinding en Vercel-functielogs; wijzig geen sleutels zonder een herstelplan.');
  }
  if(state.agent==='missing')add('agent-secret','Agentsleutel ontbreekt','Stel AGENT_SECRET in Vercel in. Gebruik dezelfde geheime waarde op MC-Node, maar publiceer deze nergens.');
  if(mcnode?.configured===false||state.mcnode==='optional') {
    add('mcnode-setup','MC-Node-overzicht niet ingesteld','Controleer MCNODE_PANEL_URL, MCNODE_CLIENT_API_KEY (Client API) en MCNODE_SERVER_ID in Vercel.');
  } else if(mcnode?.configured===true&&mcnode.connected===false) {
    const known={
      invalid_key:'Maak een nieuwe Pterodactyl Client API-sleutel en vervang die alleen in Vercel.',
      insufficient_permissions:'Controleer of de Client API-sleutel de serverstatus mag lezen.',
      server_not_found:'Controleer of MCNODE_SERVER_ID de juiste serveridentifier is.',
      invalid_config:'Controleer de HTTPS-paneel-URL en Client API-gegevens in Vercel.',
      timeout:'Controleer of het gamepaneel bereikbaar is; probeer later opnieuw.',
      rate_limited:'Wacht tot de API-limiet verstreken is en controleer opnieuw.'
    };
    add('mcnode-api','MC-Node API-verbinding mislukt',known[mcnode.code]||hostError||'Controleer de hostingverbinding en Vercel-functielogs.');
  }
  const live=status?.online===true&&!!status?.status;
  const gameState=mcnode?.connected===true?mcnode.state:null;
  if(gameState==='offline'||gameState==='stopping') {
    add('paper-offline','Minecraft-server is offline','Controleer eerst de MC-Node-console en Java-startflags. De Nexify-bootstrapper moet met een kleine heap starten; Paper krijgt zijn eigen geheugeninstelling.');
  } else if(gameState==='starting') {
    add('paper-starting','Minecraft-server start nog op','Controleer de MC-Node-console op download-, EULA- of startfouten; wacht op een bevestigde Paper-start.');
  }
  if(!live&&state.agent!=='missing'&&gameState!=='offline'&&gameState!=='stopping'&&gameState!=='starting') {
    add('heartbeat-missing','Geen actuele Minecraft-heartbeat','Zorg dat Paper en NexifyStaff draaien. Zet cloud-bridge.enabled aan in plugins/NexifyStaff/config.yml; gebruik je Vercel-HTTPS-domein, server-id main en dezelfde agentsleutel als Vercel. Herstart daarna Minecraft.');
  }
  if(live&&gameState==='running'&&issues.length===0) {
    add('connected','Verbindingen actief','Minecraft verstuurt een actuele heartbeat en de MC-Node Client API meldt dat de server draait.');
  }
  return issues;
}
