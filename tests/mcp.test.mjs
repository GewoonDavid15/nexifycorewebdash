import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('local Codex MCP server exposes only five read-only tools',()=>{
  const requests=[
    {jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}},
    {jsonrpc:'2.0',id:2,method:'tools/list'},
    {jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'power.restart',arguments:{}}},
    {jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'get_server_status',arguments:{}}},
  ].map(JSON.stringify).join('\n')+'\n';
  const p=spawnSync(process.execPath,['tools/mcnode-mcp/server.mjs'],{
    cwd:process.cwd(),input:requests,encoding:'utf8',
    env:{...process.env,MCNODE_CLIENT_API_KEY:'',MCNODE_PANEL_URL:'',MCNODE_SERVER_ID:''},
    timeout:10000
  });
  assert.equal(p.status,0,p.stderr);
  const lines=p.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(lines.length,4);
  assert.equal(lines[0].result.serverInfo.name,'nexify-mcnode-readonly');
  assert.equal(lines[1].result.tools.length,5);
  assert.deepEqual(lines[1].result.tools.map(t=>t.name),[
    'get_server_status','list_plugins','list_backups','list_schedules','get_recent_activity'
  ]);
  assert.ok(lines[1].result.tools.every(x=>x.description.includes('geen')||x.description.includes('Lees')||x.description.includes('Toon')));
  assert.equal(lines[2].result.isError,true);
  assert.equal(lines[3].result.isError,true);
  assert.equal(p.stdout.includes('ptlc_'),false);
});
