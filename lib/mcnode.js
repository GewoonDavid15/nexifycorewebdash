import {isIP} from 'node:net';

/**
 * MC-Node Client API adapter. The API credential is read only on the server,
 * and never returned to callers. No browser-supplied paths or URLs are used.
 */
export class McnodeError extends Error {
  constructor(code) { super(code); this.name='McnodeError'; this.code=code; }
}
export function panelConfig(env=process.env) {
  const raw=env.MCNODE_PANEL_URL;
  const key=env.MCNODE_CLIENT_API_KEY;
  const id=env.MCNODE_SERVER_ID;
  if(!raw||!key||!id)throw new McnodeError('not_configured');
  let url;
  try {url=new URL(raw);} catch {throw new McnodeError('invalid_config');}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||
     url.pathname!=='/'||url.search||url.hash||host==='localhost'||
     host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||
     isIP(host)||!host.includes('.')||!/^[a-z0-9.-]+$/.test(host)) {
    throw new McnodeError('invalid_config');
  }
  if(!/^ptlc_[A-Za-z0-9]{16,256}$/.test(key)||!/^[A-Za-z0-9_-]{4,64}$/.test(id)) {
    throw new McnodeError('invalid_config');
  }
  return {origin:url.origin,key,id};
}
function classifyHttp(status) {
  if(status===401)return 'invalid_key';
  if(status===403)return 'insufficient_permissions';
  if(status===404)return 'server_not_found';
  if(status===429)return 'rate_limited';
  return 'panel_unavailable';
}
export async function clientGet(config,route) {
  // route must be authored by this module; never accept a user-supplied path.
  const target=config.origin+'/api/client/servers/'+encodeURIComponent(config.id)+route;
  let response;
  try {
    response=await fetch(target,{
      method:'GET', redirect:'error', cache:'no-store',
      headers:{Authorization:'Bearer '+config.key,Accept:'Application/vnd.pterodactyl.v1+json'},
      signal:AbortSignal.timeout(7000)
    });
  } catch (err) {
    throw new McnodeError(err?.name==='TimeoutError'?'timeout':'panel_unavailable');
  }
  if(!response.ok)throw new McnodeError(classifyHttp(response.status));
  try {return await response.json();}
  catch {throw new McnodeError('invalid_panel_response');}
}
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const bounded=(value,max=120)=>typeof value==='string'?value.slice(0,max):'';
const date=value=>typeof value==='string'&&!Number.isNaN(Date.parse(value))?new Date(value).toISOString():null;
const readData=result=>Array.isArray(result?.data)?result.data:[];
function permissionStatus(error) {
  if(error?.code==='insufficient_permissions')return 'forbidden';
  if(error?.code==='server_not_found')return 'not_found';
  if(error?.code==='rate_limited')return 'rate_limited';
  return 'unavailable';
}
const percent=(used,total)=>total&&used!==null?Math.round(Math.min(999,used/total*1000))/10:null;

export async function mcnodeOverview(env=process.env) {
  const config=panelConfig(env);
  const [server,usage]=await Promise.all([
    clientGet(config,''),clientGet(config,'/resources')
  ]);
  const info=server?.attributes||{};
  const state=usage?.attributes||{};
  const metrics=state.resources||{};
  const limits=info.limits||{};
  const memoryBytes=finite(metrics.memory_bytes);
  const diskBytes=finite(metrics.disk_bytes);
  const memoryLimitMiB=finite(limits.memory);
  const diskLimitMiB=finite(limits.disk);

  // Optional endpoints do not make server status unavailable if a permission
  // is missing or a hosting feature isn't enabled.
  const routes=[
    '/files/list?directory=%2Fplugins',
    '/backups',
    '/schedules',
    '/activity'
  ];
  const results=await Promise.allSettled(routes.map(route=>clientGet(config,route)));
  const status=results.map(r=>r.status==='fulfilled'?'available':permissionStatus(r.reason));
  const files=results[0].status==='fulfilled'?readData(results[0].value):[];
  const plugins=files.map(x=>x?.attributes||{}).filter(x=>x.is_file===true&&
    typeof x.name==='string'&&/^[A-Za-z0-9_.() -]{1,130}\.jar$/i.test(x.name))
    .slice(0,75).map(x=>({name:x.name,size:finite(x.size)}));

  const rawBackups=results[1].status==='fulfilled'?readData(results[1].value):[];
  const backups=rawBackups.slice(0,12).map(x=>{
    const b=x?.attributes||{};
    return {name:bounded(b.name,100)||'Back-up',size:finite(b.bytes),
      createdAt:date(b.created_at),completedAt:date(b.completed_at),
      successful:b.is_successful===true?true:b.is_successful===false?false:null,
      locked:b.is_locked===true};
  });
  const rawSchedules=results[2].status==='fulfilled'?readData(results[2].value):[];
  const schedules=rawSchedules.slice(0,15).map(x=>{
    const s=x?.attributes||{};
    return {name:bounded(s.name,90)||'Taak',active:s.is_active===true,
      nextRunAt:date(s.next_run_at),lastRunAt:date(s.last_run_at)};
  });
  const rawActivity=results[3].status==='fulfilled'?readData(results[3].value):[];
  const activity=rawActivity.slice(0,12).map(x=>{
    const a=x?.attributes||{};
    const event=typeof a.event==='string'&&/^[a-z0-9:._-]{1,70}$/i.test(a.event)
      ?a.event:'server:event';
    return {event,createdAt:date(a.timestamp||a.created_at)};
  });
  return {
    configured:true,connected:true,name:bounded(info.name,100)||'MC-Node',
    state:['running','starting','stopping','offline'].includes(state.current_state)
      ?state.current_state:'unknown',
    cpu:finite(metrics.cpu_absolute),memoryBytes,diskBytes,uptimeMs:finite(metrics.uptime),
    memoryLimitMiB,diskLimitMiB,cpuLimitPct:finite(limits.cpu),
    memoryPercent:percent(memoryBytes,memoryLimitMiB&&memoryLimitMiB*1048576),
    diskPercent:percent(diskBytes,diskLimitMiB&&diskLimitMiB*1048576),
    pluginStatus:status[0],plugins,
    backupStatus:status[1],backups,backupCount:finite(results[1].status==='fulfilled'?results[1].value?.meta?.pagination?.total:null),
    scheduleStatus:status[2],schedules,
    activityStatus:status[3],activity,
    checkedAt:new Date().toISOString()
  };
}
