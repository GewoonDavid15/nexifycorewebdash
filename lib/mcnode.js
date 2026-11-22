import {isIP} from 'node:net';

// Credentials stay on Vercel. No panel URL, user token or server identifier
// is accepted from a browser request.
export function panelConfig(env=process.env) {
  const raw=env.MCNODE_PANEL_URL;
  const key=env.MCNODE_CLIENT_API_KEY;
  const id=env.MCNODE_SERVER_ID;
  if(!raw||!key||!id)throw new Error('MC-Node not configured');
  let url;
  try { url=new URL(raw); } catch {throw new Error('Invalid MC-Node panel URL');}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash||
     host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||isIP(host)||
     !/^[a-z0-9.-]+$/.test(host)||!host.includes('.')) {
    throw new Error('MC-Node panel must be a public HTTPS domain');
  }
  if(!/^ptlc_[A-Za-z0-9]{16,256}$/.test(key))throw new Error('Invalid client API key');
  if(!/^[a-zA-Z0-9_-]{4,64}$/.test(id))throw new Error('Invalid server identifier');
  return {origin:url.origin, key, id};
}

async function clientGet(config,route) {
  const url=config.origin+'/api/client/servers/'+encodeURIComponent(config.id)+route;
  const response=await fetch(url,{
    method:'GET',cache:'no-store',
    headers:{Authorization:'Bearer '+config.key,Accept:'Application/vnd.pterodactyl.v1+json'},
    signal:AbortSignal.timeout(7000)
  });
  if(!response.ok)throw new Error('MC-Node API request failed');
  return response.json();
}

function finiteNumber(value) {
  const number=Number(value);
  return Number.isFinite(number)&&number>=0?number:null;
}

export async function mcnodeOverview(env=process.env) {
  const config=panelConfig(env);
  const server=await clientGet(config,'');
  const usage=await clientGet(config,'/resources');
  const serverInfo=server?.attributes||{};
  const state=usage?.attributes||{};
  let plugins=[],pluginStatus='unknown';
  try {
    const list=await clientGet(config,'/files/list?directory=%2Fplugins');
    plugins=(Array.isArray(list?.data)?list.data:[])
      .map(item=>item?.attributes||{})
      .filter(item=>item.is_file===true&&typeof item.name==='string'&&/^[a-zA-Z0-9_.() -]{1,130}\.jar$/i.test(item.name))
      .slice(0,75).map(item=>({name:item.name,size:finiteNumber(item.size)}));
    pluginStatus='available';
  } catch {pluginStatus='unavailable';}
  const metrics=state.resources||{};
  return {
    connected:true,
    name:typeof serverInfo.name==='string'?serverInfo.name.slice(0,100):'MC-Node',
    state:['running','starting','stopping','offline'].includes(state.current_state)?state.current_state:'unknown',
    cpu:finiteNumber(metrics.cpu_absolute),
    memoryBytes:finiteNumber(metrics.memory_bytes),
    diskBytes:finiteNumber(metrics.disk_bytes),
    uptimeMs:finiteNumber(metrics.uptime),
    players:null,
    pluginStatus,plugins,
    checkedAt:new Date().toISOString()
  };
}
