import {execFileSync} from 'node:child_process';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {CREATE_ACCOUNT_LUA,UPDATE_ACCOUNT_LUA} from '../lib/account-store.js';
import {ISSUE_INVITE_LUA,CONSUME_INVITE_LUA,INVITATION_TTL_SECONDS} from '../lib/account-invitations.js';
import {ACTIVATE_ACCOUNT_LUA} from '../lib/account-activation.js';

// CI-only integration against a throwaway local Redis service on localhost.
// No connection string, provider token or external host is accepted.
const host='127.0.0.1',port='6379';
const prefix='nexify:ephemeral-ci:'+randomUUID()+':';
const used=new Set();
const key=name=>{const value=prefix+name;used.add(value);return value;};
function cli(...args){
  try{
    return execFileSync('redis-cli',['-h',host,'-p',port,'--raw',...args.map(String)],{
      encoding:'utf8',timeout:3000,stdio:['ignore','pipe','pipe']
    }).trim();
  }catch(e){
    throw new Error('Local Redis verification failed ('+(e.status??'connection')+').');
  }
}
function expectCommand(name,...args){
  const v=cli(name,...args);
  if(v.startsWith('ERR ')||v.startsWith('(error)'))throw new Error('Redis rejected '+name+': '+v.slice(0,110));
  return v;
}
function evalScript(script,keys,args){
  const value=expectCommand('EVAL',script,String(keys.length),...keys,...args.map(String));
  return value;
}
const actorKey=key('actor'),accountKey=key('account'),nameKey=key('username');
const indexKey=key('index'),inviteKey=key('invite'),inviteIndexKey=key('invite-index');
const id='22222222-2222-4222-8222-222222222222';
const actor={
  id:'11111111-1111-4111-8111-111111111111',
  username:'owner',role:'owner',status:'active',mfa_enrolled:true,session_version:2
};
const account={
  id,username:'new_member',role:'viewer',status:'invited',mfa_enrolled:false,session_version:0
};
const actorRaw=JSON.stringify(actor),accountRaw=JSON.stringify(account);
const hashedToken=createHash('sha256').update(randomBytes(32)).digest('hex');
const now=Date.now(),expiresAt=now+INVITATION_TTL_SECONDS*1000;
const invitationRaw=JSON.stringify({account_id:id,expires_at:expiresAt,role:'viewer',session_version:0});
try{
  assert.equal(expectCommand('PING'),'PONG','Redis service must be available');
  assert.equal(expectCommand('SET',actorKey,actorRaw),'OK');
  assert.equal(evalScript(CREATE_ACCOUNT_LUA,
    [accountKey,nameKey,indexKey,actorKey],
    [accountRaw,id,Math.floor(now/60000),actorRaw]),'1');
  assert.equal(expectCommand('GET',accountKey),accountRaw);
  assert.equal(expectCommand('GET',nameKey),id);
  assert.equal(evalScript(CREATE_ACCOUNT_LUA,
    [accountKey,nameKey,indexKey,actorKey],
    [accountRaw,id,Math.floor(now/60000),actorRaw]),'0','Duplicate username denied');
  assert.equal(evalScript(ISSUE_INVITE_LUA,
    [inviteKey,inviteIndexKey,actorKey,accountKey],
    [invitationRaw,hashedToken,actorRaw,accountRaw,INVITATION_TTL_SECONDS]),'1');
  assert.equal(evalScript(ISSUE_INVITE_LUA,
    [inviteKey,inviteIndexKey,actorKey,accountKey],
    [invitationRaw,hashedToken,actorRaw,accountRaw,INVITATION_TTL_SECONDS]),'0','Double invitation refused');
  const activated={...account,status:'active',mfa_enrolled:true,session_version:1,
    password_hash:'scrypt$test-hash',totp_ciphertext:'v1.test-ciphertext'};
  const activeRaw=JSON.stringify(activated);
  assert.equal(evalScript(ACTIVATE_ACCOUNT_LUA,
    [inviteKey,inviteIndexKey,accountKey],
    [hashedToken,id,now+3000,accountRaw,activeRaw]),'1','Atomic activation succeeded');
  assert.equal(expectCommand('GET',accountKey),activeRaw);
  assert.equal(expectCommand('EXISTS',inviteKey),'0','Token deleted with activation');
  assert.equal(expectCommand('EXISTS',inviteIndexKey),'0','Account invitation index deleted');
  assert.equal(evalScript(ACTIVATE_ACCOUNT_LUA,
    [inviteKey,inviteIndexKey,accountKey],
    [hashedToken,id,now+3000,accountRaw,activeRaw]),'0','Replay denied');
  const next={...activated,role:'operator',session_version:2};
  const nextRaw=JSON.stringify(next);
  assert.equal(evalScript(UPDATE_ACCOUNT_LUA,
    [accountKey,actorKey],[activeRaw,nextRaw,actorRaw]),'1');
  assert.equal(evalScript(UPDATE_ACCOUNT_LUA,
    [accountKey,actorKey],[activeRaw,JSON.stringify({...next,session_version:3}),actorRaw]),'0',
    'Stale update rejected');
  assert.equal(expectCommand('GET',accountKey),nextRaw);
  const revocationRaw=JSON.stringify({...actor,status:'suspended',session_version:3});
  assert.equal(expectCommand('SET',actorKey,revocationRaw),'OK');
  assert.equal(evalScript(UPDATE_ACCOUNT_LUA,
    [accountKey,actorKey],[nextRaw,JSON.stringify({...next,role:'administrator',session_version:3}),actorRaw]),'-2',
    'Revoked actor cannot change a role');
  const secondToken=key('unused-invite'),secondIndex=key('unused-invite-index');
  assert.equal(expectCommand('SET',secondToken,invitationRaw),'OK');
  assert.equal(expectCommand('SET',secondIndex,hashedToken),'OK');
  const consumed=evalScript(CONSUME_INVITE_LUA,
    [secondToken,secondIndex,accountKey],[hashedToken,id,now+4000]);
  assert.equal(consumed,'','Activated account cannot consume another invite');
  assert.equal(expectCommand('EXISTS',secondToken),'1');
  process.stdout.write('Nexify Redis Lua: atomic account creation, invitation, activation, update, revocation and replay checks PASSED.\n');
}finally{
  if(used.size)expectCommand('DEL',...[...used]);
}
