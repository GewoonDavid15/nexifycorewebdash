#!/usr/bin/env node
/**
 * Nexify Enterprise — minimal local stdio MCP server.
 *
 * Read-only, no network listener, no shell, no power controls, no writes.
 * The existing Pterodactyl Client API credentials are inherited from the
 * local process environment and are never sent in MCP responses.
 */
import readline from 'node:readline';
import {mcnodeOverview} from '../../lib/mcnode.js';

const TOOLS=[
  {name:'get_server_status',description:'Lees de actuele MC-Node hostingstatus, CPU, RAM, schijfgebruik en uptime zonder wijzigingen.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'list_plugins',description:'Toon uitsluitend plugin-JAR bestandsnamen en bestandsgroottes; geen bestandsinhoud.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'list_backups',description:'Lees de metadata van maximaal twaalf MC-Node-back-ups; geen download- of restore-actie.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'list_schedules',description:'Lees bestaande geplande taken; geen taken aanmaken, wijzigen of uitvoeren.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'get_recent_activity',description:'Lees veilige recente MC-Node-gebeurtenistypen zonder persoonlijke metadata.',inputSchema:{type:'object',properties:{},additionalProperties:false}}
];
const METHODS=new Set(TOOLS.map(t=>t.name));
let cache=null;
let timestamp=0;
let inFlight=null;

async function snapshot() {
  if(cache && Date.now()-timestamp<30000)return cache;
  if(inFlight)return inFlight;
  inFlight=mcnodeOverview().then(data=>{cache=data;timestamp=Date.now();return data;})
    .finally(()=>{inFlight=null;});
  return inFlight;
}

export function selectData(tool,all) {
  const base={connected:all.connected===true,name:all.name,state:all.state,checkedAt:all.checkedAt};
  switch(tool) {
    case 'get_server_status':return {...base,cpu:all.cpu,cpuLimitPct:all.cpuLimitPct,
      memoryBytes:all.memoryBytes,memoryLimitMiB:all.memoryLimitMiB,memoryPercent:all.memoryPercent,
      diskBytes:all.diskBytes,diskLimitMiB:all.diskLimitMiB,diskPercent:all.diskPercent,uptimeMs:all.uptimeMs};
    case 'list_plugins':return {...base,status:all.pluginStatus,plugins:all.plugins||[]};
    case 'list_backups':return {...base,status:all.backupStatus,count:all.backupCount,backups:all.backups||[]};
    case 'list_schedules':return {...base,status:all.scheduleStatus,schedules:all.schedules||[]};
    case 'get_recent_activity':return {...base,status:all.activityStatus,activity:all.activity||[]};
    default:throw new Error('Tool not allowed');
  }
}

function result(id,data){return {jsonrpc:'2.0',id,result:data};}
function error(id,code,message){return {jsonrpc:'2.0',id,error:{code,message}};}
function toolResponse(value,isError=false){
  return {content:[{type:'text',text:JSON.stringify(value)}],isError};
}
async function handle(msg){
  if(!msg||msg.jsonrpc!=='2.0'||typeof msg.method!=='string')return error(msg?.id??null,-32600,'Invalid request');
  const id=msg.id;
  if(msg.method.startsWith('notifications/'))return null;
  if(id===undefined)return null;
  if(msg.method==='initialize') {
    const requested=msg.params?.protocolVersion;
    const protocolVersion=['2024-11-05','2025-03-26','2025-06-18','2025-11-25','2026-07-28'].includes(requested)?requested:'2025-11-25';
    return result(id,{protocolVersion,capabilities:{tools:{}},serverInfo:{name:'nexify-mcnode-readonly',version:'1.0.0'}});
  }
  if(msg.method==='ping')return result(id,{});
  if(msg.method==='tools/list')return result(id,{tools:TOOLS});
  if(msg.method==='resources/list')return result(id,{resources:[]});
  if(msg.method==='prompts/list')return result(id,{prompts:[]});
  if(msg.method==='tools/call') {
    const name=msg.params?.name, args=msg.params?.arguments;
    if(!METHODS.has(name))return result(id,toolResponse({error:'Unknown or disallowed tool'},true));
    if(args!==undefined&&(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).length))
      return result(id,toolResponse({error:'This read-only tool accepts no arguments'},true));
    try {
      const data=selectData(name,await snapshot());
      return result(id,toolResponse(data));
    }catch {
      return result(id,toolResponse({error:'MC-Node not available or insufficient API rights; check local configuration.'},true));
    }
  }
  return error(id,-32601,'Method not found');
}

const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of rl){
  if(line.length>100000){process.stdout.write(JSON.stringify(error(null,-32600,'Request too large'))+'\n');continue;}
  let answer;
  try{answer=await handle(JSON.parse(line));}
  catch{answer=error(null,-32700,'Parse error');}
  if(answer!==null&&answer!==undefined)process.stdout.write(JSON.stringify(answer)+'\n');
}
