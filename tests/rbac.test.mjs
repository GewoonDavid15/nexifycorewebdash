import test from 'node:test';
import assert from 'node:assert/strict';
import {ROLE_ORDER,PERMISSIONS,ROLE_GRANTS,hasPermission,permissionsFor,mayChangeRole,rolesPreview} from '../lib/rbac.js';
import {normalizeUsername,validAccount,createInvitedAccount,publicAccount,suspendAccount,changeDelegatedRole} from '../lib/account-model.js';
import {issueAccountSession,resolveAccountSession,revokeAccountSession,ACCOUNT_SESSION_TTL_SECONDS} from '../lib/account-sessions.js';
import {keys} from '../lib/redis.js';
import {GET as rolesRoute} from '../app/api/system/roles/route.js';
import {COOKIE,makeSession} from '../lib/security.js';

const adminId='22222222-2222-4222-8222-222222222222';
const epoch=Date.parse('2026-11-22T20:00:00Z');
function account(role='viewer',extra={}){
  return {id:'11111111-1111-4111-8111-111111111111',username:'nexify_test',
    role,status:'active',session_version:0,mfa_enrolled:true,...extra};
}
function fakeStore(){
  const db=new Map(),calls=[];
  const run=async (cmd,key,...args)=>{
    calls.push([cmd,key,...args]);
    if(cmd==='SET'){
      if(args[3]==='NX'&&db.has(key))return null;
      db.set(key,args[0]);return 'OK';
    }
    if(cmd==='GET')return db.get(key)||null;
    if(cmd==='DEL'){const had=db.has(key);db.delete(key);return had?1:0;}
    throw new Error('Unexpected Redis command '+cmd);
  };
  return {db,calls,run};
}

test('roles have explicit permissions and unknown or dangerous operations always fail closed',()=>{
  assert.deepEqual(ROLE_ORDER,['viewer','operator','administrator','owner']);
  assert.ok(rolesPreview().length===4);
  assert.equal(hasPermission('viewer','dashboard.read'),true);
  assert.equal(hasPermission('viewer','backup.request'),false);
  assert.equal(hasPermission('operator','backup.request'),true);
  assert.equal(hasPermission('administrator','accounts.manage'),false);
  assert.equal(hasPermission('owner','accounts.manage'),true);
  for(const role of [...ROLE_ORDER,'unknown',null]){
    for(const action of ['console.execute','server.reinstall','files.write','world.restore','secrets.export']){
      assert.equal(hasPermission(role,action),false);
    }
  }
  for(const role of ROLE_ORDER)assert.ok(ROLE_GRANTS[role].every(p=>PERMISSIONS.includes(p)));
  const p=permissionsFor('viewer');p.push('accounts.manage');
  assert.equal(hasPermission('viewer','accounts.manage'),false);
});

test('role promotion denies owner changes, self-change and untrusted role strings',()=>{
  const args={actorRole:'owner',actorId:adminId,targetId:account().id,currentRole:'viewer',targetRole:'operator'};
  assert.equal(mayChangeRole(args),true);
  assert.equal(mayChangeRole({...args,actorRole:'administrator'}),false);
  assert.equal(mayChangeRole({...args,actorId:args.targetId}),false);
  assert.equal(mayChangeRole({...args,targetRole:'owner'}),false);
  assert.equal(mayChangeRole({...args,currentRole:'owner'}),false);
});

test('invitation records are normalized, have no password and cannot create owners',()=>{
  assert.equal(normalizeUsername('  Nexify_Test '),'nexify_test');
  assert.equal(normalizeUsername('a'),null);
  assert.equal(normalizeUsername('../hack'),null);
  const invited=createInvitedAccount({username:'  New_Staff ',role:'operator',createdBy:adminId});
  assert.equal(invited.username,'new_staff');
  assert.equal(invited.role,'operator');
  assert.equal(invited.status,'invited');
  assert.equal(validAccount(invited),true);
  assert.equal(validAccount({...invited,username:null}),false);
  assert.equal(Object.hasOwn(invited,'password'),false);
  assert.throws(()=>createInvitedAccount({username:'new_staff',role:'owner',createdBy:adminId}));
});

test('published account summaries never expose password hashes, MFA secrets or session versions',()=>{
  const a={...account(),password_hash:'PRIVATE',totp_secret:'PRIVATE',api_key:'PRIVATE'};
  const safe=publicAccount(a);
  assert.equal(safe.username,'nexify_test');
  assert.equal(JSON.stringify(safe).includes('PRIVATE'),false);
  assert.equal('session_version' in safe,false);
});

test('suspension and role changes invalidate all existing session versions',()=>{
  const original=account('viewer',{session_version:5});
  const promoted=changeDelegatedRole(original,'operator');
  assert.equal(promoted.role,'operator');assert.equal(promoted.session_version,6);
  assert.equal(original.session_version,5);
  const suspended=suspendAccount(promoted);
  assert.equal(suspended.status,'suspended');assert.equal(suspended.session_version,7);
  assert.throws(()=>suspendAccount(account('owner')));
  assert.throws(()=>changeDelegatedRole(account('owner'),'viewer'));
});

test('account session records only a digest, and validates current account permissions',async()=>{
  const a=account(),store=fakeStore();
  const signed=await issueAccountSession({account:a,passwordVerified:true,totpVerified:true,redisFn:store.run,now:epoch});
  assert.match(signed.token,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(signed.token.length,43);
  const [key]=store.db.keys();
  assert.ok(key.startsWith('nexify:cloud:main:v1:identity:session:'));
  assert.ok(!key.includes(signed.token));
  assert.equal(JSON.stringify([...store.db.values()]).includes(signed.token),false);
  assert.ok(store.calls.some(call=>call[0]==='SET'&&call[3]==='EX'&&call[4]===ACCOUNT_SESSION_TTL_SECONDS&&call[5]==='NX'));
  const actor=await resolveAccountSession({token:signed.token,loadAccount:async()=>a,redisFn:store.run,now:epoch+100});
  assert.equal(actor.account_id,a.id);
  assert.equal(actor.can('dashboard.read'),true);
  assert.equal(actor.can('backup.request'),false);
  assert.equal(actor.can('console.execute'),false);
  assert.equal(actor.role,'viewer');
});

test('account sessions require verified password and TOTP and enrolled active accounts',async()=>{
  const store=fakeStore();
  for(const data of [
    {account:account(),passwordVerified:false,totpVerified:true},
    {account:account(),passwordVerified:true,totpVerified:false},
    {account:account('viewer',{mfa_enrolled:false}),passwordVerified:true,totpVerified:true},
    {account:account('viewer',{status:'suspended'}),passwordVerified:true,totpVerified:true}
  ])await assert.rejects(issueAccountSession({...data,redisFn:store.run,now:epoch}),/Account authentication required/);
  assert.equal(store.db.size,0);
});

test('role changes, suspension and session revocation take effect immediately on lookup',async()=>{
  const a=account(),store=fakeStore();
  const {token}=await issueAccountSession({account:a,passwordVerified:true,totpVerified:true,redisFn:store.run,now:epoch});
  const loadAccount=async()=>a;
  assert.ok(await resolveAccountSession({token,loadAccount,redisFn:store.run,now:epoch+100}));
  const promoted=changeDelegatedRole(a,'operator');
  assert.equal(await resolveAccountSession({token,loadAccount:async()=>promoted,redisFn:store.run,now:epoch+100}),null);
  assert.equal(await resolveAccountSession({token,loadAccount:async()=>suspendAccount(a),redisFn:store.run,now:epoch+100}),null);
  assert.equal(await resolveAccountSession({token,loadAccount,redisFn:store.run,now:epoch+ACCOUNT_SESSION_TTL_SECONDS*1000+1}),null);
  assert.equal(await revokeAccountSession(token,store.run),true);
  assert.equal(await revokeAccountSession(token,store.run),false);
  assert.equal(await resolveAccountSession({token,loadAccount,redisFn:store.run,now:epoch+100}),null);
});

test('invalid tokens and missing account lookup are rejected without reading storage',async()=>{
  const store=fakeStore();
  for(const token of ['test','',null,'a'.repeat(100)]){
    assert.equal(await resolveAccountSession({token,loadAccount:async()=>account(),redisFn:store.run,now:epoch}),null);
    assert.equal(await revokeAccountSession(token,store.run),false);
  }
  assert.equal(store.calls.length,0);
});

test('role preview API is protected and does not provision real accounts',async()=>{
  const anonymous=await rolesRoute({cookies:new Map()});
  assert.equal(anonymous.status,401);
  const previous=process.env.SESSION_SECRET;
  process.env.SESSION_SECRET='unit-test-session-secret-longer-than-thirty-two';
  try {
    const authorized=await rolesRoute({cookies:new Map([[COOKIE,{value:makeSession()}]])});
    assert.equal(authorized.status,200);
    const data=await authorized.json();
    assert.equal(data.mode,'preview');
    assert.equal(data.enabled,false);
    assert.equal(data.legacy_login_preserved,true);
    assert.equal(data.roles.length,4);
    assert.ok(data.unsupported_actions.includes('server.reinstall'));
  } finally {
    if(previous===undefined)delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET=previous;
  }
});
