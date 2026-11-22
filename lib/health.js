// Deterministic, read-only health analysis. Never performs automatic server actions.
export function analyzeHealth(telemetry,hosting) {
  const alerts=[];
  const online=telemetry?.online===true;
  const metrics=telemetry?.status||{};
  const add=(level,title,detail)=>alerts.push({level,title,detail});
  if(!online)add('warning','Cloud Bridge niet actueel','Er is geen recente Minecraft-heartbeat. Controleer de plugin en het agent-token.');
  if(online&&typeof metrics.tps==='number'&&metrics.tps<18)add('warning','TPS onder de 18','Onderzoek entities, chunks en zware plugintaken voordat je instellingen verandert.');
  if(online&&typeof metrics.mspt==='number'&&metrics.mspt>50)add('warning','MSPT boven de 50','De server verwerkt ticks langzamer dan gepland; controleer de performancegeschiedenis.');
  if(online&&typeof metrics.heap_used_mib==='number'&&typeof metrics.heap_max_mib==='number'&&metrics.heap_max_mib>0&&metrics.heap_used_mib/metrics.heap_max_mib>=0.9)add('warning','Minecraft-heap bijna vol','Controleer geheugenpieken, plugins en de gekozen Java-instellingen.');
  if(online&&typeof metrics.startup_high==='number'&&metrics.startup_high>0)add('warning','Kritieke Nexify-opstartcontrole','De Minecraft-plugin meldt kritieke lokale installatieafwijkingen. Bekijk de serverconsole en controleer de installatie; herstel niets automatisch.');
  else if(online&&typeof metrics.startup_warnings==='number'&&metrics.startup_warnings>0)add('info','Nexify-opstartwaarschuwingen','De Minecraft-plugin meldt installatiepunten om te controleren. Gebruik de lokale onderhoudscontrole.');
  if(hosting?.connected===true) {
    if(hosting.state==='offline')add('warning','MC-Node-server offline','De hosting-API meldt dat Minecraft niet draait.');
    if(typeof hosting.memoryPercent==='number'&&hosting.memoryPercent>=90)add('warning','Hosting-RAM boven 90%','Controleer de RAM-limieten en het serverproces.');
    if(typeof hosting.diskPercent==='number'&&hosting.diskPercent>=90)add('warning','Schijfruimte bijna vol','Controleer back-ups en opslag; verwijder niet automatisch bestanden.');
  }
  if(hosting?.configured===true&&hosting?.connected===false)add('info','Hosting-API niet bereikbaar','Controleer de MC-Node-koppeling en bevoegdheden.');
  return alerts.slice(0,8);
}
