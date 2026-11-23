import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {verifyCloudContract} from '../scripts/check-java-cloud-contract.mjs';

const javaPath='nexify-paper-v2.1/src/main/java/nl/nexify/staff';
const files={
  [javaPath+'/NexifyCloudBridge.java']:`
    HttpClient.Redirect.NEVER;
    request("/api/agent/sync", "{}");
    request("/api/agent/ack", "{}");
    request("/api/agent/report", "{}");
    "backup.now".equals(type);
    "diagnostics.capture".equals(type);
    databaseQueue.execute(()->accept(id));
    sendDiagnostics(id,data);
  `,
  [javaPath+'/ControlApprovals.java']:'SELECT local_id FROM cloud_remote_requests WHERE remote_id=?',
  'app/api/agent/sync/route.js':'export async function POST(req) {}',
  'app/api/agent/ack/route.js':'export async function POST(req) {}',
  'app/api/agent/report/route.js':'export async function POST(req) {}',
  'app/api/requests/route.js':"['backup.now','diagnostics.capture']",
  'lib/queue.js':"new Set(['backup.now','diagnostics.capture'])"
};
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'nexify-cloud-contract-'));
  for(const [path,content] of Object.entries(files)){
    const dest=join(root,path);await mkdir(dirname(dest),{recursive:true});
    await writeFile(dest,content);
  }
  return root;
}
test('valid Java/web contract passes without server or network access',async()=>{
  const root=await fixture();
  try{
    const result=await verifyCloudContract({javaRoot:root,webRoot:root});
    assert.equal(result.ok,true,JSON.stringify(result.problems));
    assert.equal(result.checked.routes.length,3);
    assert.equal(result.checked.actions.length,2);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('Java action drift is rejected before a plugin release',async()=>{
  const root=await fixture();
  try{
    const path=join(root,javaPath,'NexifyCloudBridge.java');
    await writeFile(path,files[javaPath+'/NexifyCloudBridge.java'].replace('"diagnostics.capture".equals(type)','"unsafe.command".equals(type)'));
    const result=await verifyCloudContract({javaRoot:root,webRoot:root});
    assert.equal(result.ok,false);
    assert.ok(result.problems.some(p=>p.includes('diagnostics.capture')));
  }finally{await rm(root,{recursive:true,force:true});}
});
test('missing private source fails closed, never pretending compatibility',async()=>{
  const root=await fixture();
  try{
    const result=await verifyCloudContract({javaRoot:join(root,'missing'),webRoot:root});
    assert.equal(result.ok,false);
    assert.ok(result.problems.some(p=>p.includes('Java Cloud Bridge')));
  }finally{await rm(root,{recursive:true,force:true});}
});
