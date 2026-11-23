#!/usr/bin/env node
// Offline contract check against the separately maintained PRIVATE Java source.
// Read-only: no web/network, no Minecraft server action and no Java execution.
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const javaPath='nexify-paper-v2.1/src/main/java/nl/nexify/staff';
const required=[
  {route:'/api/agent/sync',java:'request("/api/agent/sync"',web:'app/api/agent/sync/route.js'},
  {route:'/api/agent/ack',java:'request("/api/agent/ack"',web:'app/api/agent/ack/route.js'},
  {route:'/api/agent/report',java:'request("/api/agent/report"',web:'app/api/agent/report/route.js'}
];
const actions=[
  {name:'backup.now',code:'"backup.now".equals(type)'},
  {name:'diagnostics.capture',code:'"diagnostics.capture".equals(type)'}
];

export async function verifyCloudContract({javaRoot,webRoot=resolve('.'),reader=readFile}={}){
  if(typeof javaRoot!=='string'||!javaRoot.trim())throw new Error('Java source directory is required');
  const problems=[];
  async function load(path,tag){
    try{return await reader(path,'utf8');}
    catch{problems.push('Missing '+tag);return '';}
  }
  const bridge=await load(join(resolve(javaRoot),javaPath,'NexifyCloudBridge.java'),'Java Cloud Bridge');
  const approvals=await load(join(resolve(javaRoot),javaPath,'ControlApprovals.java'),'Java approval store');
  const queue=await load(join(resolve(webRoot),'lib/queue.js'),'Web queue');
  const requests=await load(join(resolve(webRoot),'app/api/requests/route.js'),'Web request API');
  for(const item of required){
    const web=await load(join(resolve(webRoot),item.web),'web '+item.route);
    if(!bridge.includes(item.java))problems.push('Java missing route '+item.route);
    if(!web.includes('export async function POST'))problems.push('Web missing POST '+item.route);
  }
  for(const action of actions){
    if(!bridge.includes(action.code))problems.push('Java missing action '+action.name);
    if(!requests.includes(action.name))problems.push('Web request allowlist missing '+action.name);
    if(!queue.includes(action.name))problems.push('Web queue allowlist missing '+action.name);
  }
  if(!approvals.includes('SELECT local_id FROM cloud_remote_requests WHERE remote_id=?'))
    problems.push('Java cloud backup deduplication not found');
  if(!bridge.includes('HttpClient.Redirect.NEVER'))
    problems.push('Java must refuse cloud HTTP redirects');
  if(!bridge.includes('databaseQueue.execute(()->accept(id))'))
    problems.push('Java backup handling must use its database queue');
  if(!bridge.includes('sendDiagnostics(id,data)'))
    problems.push('Java diagnosis report handling missing');
  return {ok:problems.length===0,problems,checked:{routes:required.map(x=>x.route),actions:actions.map(x=>x.name)}};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const javaRoot=process.argv[2];
  if(!javaRoot){
    console.error('Gebruik: node scripts/check-java-cloud-contract.mjs <uitgepakte-private-java-broncode>');
    process.exitCode=2;
  }else{
    const result=await verifyCloudContract({javaRoot});
    for(const issue of result.problems)console.error('FAIL '+issue);
    console.log(result.ok?'PASS: Java Cloud Bridge en web-API komen overeen.':'FAIL: Java/web contract wijkt af.');
    if(!result.ok)process.exitCode=1;
  }
}
