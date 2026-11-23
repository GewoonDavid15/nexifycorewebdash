import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CREATE_ACCOUNT_LUA,UPDATE_ACCOUNT_LUA,
  loadAccount,loadByUsername,listPublicAccounts,
  reserveInvitation,suspendDelegatedAccount,changeStoredRole
} from '../lib/account-store.js';
import {keys} from '../lib/redis.js';

const ownerId='11111111-1111-4111-8111-111111111111';
const adminId='22222222-2222-4222-8222-222222222222';
const now=Date.parse('2026-11-22T22:00:00Z');
const actor=(id,username,role)=>({
  id,username,role,status:'active',session_version:2,mfa_enrolled:true,
  created_at:new Date(now).toISOString()
});
const owner=actor(ownerId,'nexify_owner','owner');
const admin=actor(adminId,'nexify_admin','administrator');

function memory(){
  const db=new Map(),scores=new Map(),calls=[];
  async function redisFn(command,...args){
    calls.push([command,...args]);
    if(command==='GET')return db.get(args[0])??null;
    if(command==='ZRANGE'){
      const [key,from,to]=args;
      return [...(scores.get(key)||[])].sort((a,b)=>a[1]-b[1])
        .slice(from,to+1).map(x=>x[0]);
    }
    if(command==='EVAL'){
      const [script,count,...values]=args;
      if(script===CREATE_ACCOUNT_LUA){
        assert.equal(count,4);
        const [recordKey,nameKey,indexKey,actorKey,value,id,score,expectedActor]=values;
        if(db.get(actorKey)!==expectedActor)return -1;
        if(db.has(recordKey)||db.has(nameKey))return 0;
        db.set(recordKey,value);db.set(nameKey,id);
        scores.set(indexKey,[...(scores.get(indexKey)||[]),[id,Number(score)]]);
        return 1;
      }
      if(script===UPDATE_ACCOUNT_LUA){
        assert.equal(count,2);
        const [recordKey,actorKey,oldValue,newValue,expectedActor]=values;
        if(db.get(actorKey)!==expectedActor)return -2;
        if(db.get(recordKey)!==oldValue)return 0;
        const old=JSON.parse(oldValue),current=JSON.parse(newValue);
        if(old.id!==current.id||old.username!==current.username||
          old.role==='owner'||current.role==='owner'||
          current.session_version<=old.session_version)return -1;
        db.set(recordKey,newValue);return 1;
      }
      throw new Error('Unrecognized script');
    }
    throw new Error('Unexpected Redis operation '+command);
  }
  function seed(account){
    db.set(keys.identityAccount(account.id),JSON.stringify(account));
    db.set(keys.identityUsername(account.username),account.id);
    scores.set(keys.identityAccounts,[...(scores.get(keys.identityAccounts)||[]),[account.id,0]]);
  }
  return {db,scores,calls,redisFn,seed};
}

test('atomic invitation reserves normalized username only once',async()=>{
  const store=memory();store.seed(owner);
  const [a,b]=await Promise.all([
    reserveInvitation({actor:owner,username:'Staff_Test',role:'operator',redisFn:store.redisFn,now}),
    reserveInvitation({actor:owner,username:' staff_test ',role:'viewer',redisFn:store.redisFn,now})
  ]);
  const accepted=[a,b].filter(x=>x.created);
  const blocked=[a,b].filter(x=>!x.created);
  assert.equal(accepted.length,1);
  assert.equal(blocked.length,1);
  assert.equal(blocked[0].reason,'username_or_id_in_use');
  const stored=await loadByUsername('STAFF_TEST',store.redisFn);
  assert.equal(stored.username,'staff_test');
  assert.equal(stored.status,'invited');
  assert.equal('password_hash' in stored,false);
  assert.equal(stored.role,accepted[0].account.role);
});

test('untrusted forged owner roles cannot issue invitations',async()=>{
  const store=memory();store.seed(admin);
  const forged={...admin,role:'owner'};
  await assert.rejects(
    reserveInvitation({actor:forged,username:'fake_staff',role:'operator',redisFn:store.redisFn,now}),
    /Stale or untrusted/
  );
  assert.equal(await loadByUsername('fake_staff',store.redisFn),null);
});

test('administrator may only invite viewer/operator; owner can invite administrator',async()=>{
  const store=memory();store.seed(admin);store.seed(owner);
  await assert.rejects(reserveInvitation({actor:admin,username:'other_admin',role:'administrator',redisFn:store.redisFn,now}),/Cannot invite/);
  await assert.rejects(reserveInvitation({actor:owner,username:'new_owner',role:'owner',redisFn:store.redisFn,now}),/Cannot invite/);
  const result=await reserveInvitation({actor:owner,username:'new_admin',role:'administrator',redisFn:store.redisFn,now});
  assert.equal(result.created,true);
  assert.equal((await loadAccount(result.account.id,store.redisFn)).role,'administrator');
});

test('role change increments session version, and concurrent edits cannot overwrite another edit',async()=>{
  const store=memory();store.seed(owner);
  const invitation=await reserveInvitation({actor:owner,username:'first_staff',redisFn:store.redisFn,now});
  const record=await loadAccount(invitation.account.id,store.redisFn);
  assert.equal(record.session_version,0);
  const runs=await Promise.allSettled([
    changeStoredRole({actor:owner,id:record.id,targetRole:'operator',redisFn:store.redisFn}),
    changeStoredRole({actor:owner,id:record.id,targetRole:'administrator',redisFn:store.redisFn})
  ]);
  assert.equal(runs.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(runs.filter(x=>x.status==='rejected').length,1);
  const updated=await loadAccount(record.id,store.redisFn);
  assert.equal(updated.session_version,1);
  assert.ok(['operator','administrator'].includes(updated.role));
});

test('suspension invalidates session versions and never suspends owner',async()=>{
  const store=memory();store.seed(owner);
  const invited=await reserveInvitation({actor:owner,username:'test_member',redisFn:store.redisFn,now});
  const response=await suspendDelegatedAccount({actor:owner,id:invited.account.id,redisFn:store.redisFn});
  assert.equal(response.updated,true);
  assert.equal(response.account.status,'suspended');
  const after=await loadAccount(invited.account.id,store.redisFn);
  assert.equal(after.session_version,1);
  await assert.rejects(suspendDelegatedAccount({actor:owner,id:owner.id,redisFn:store.redisFn}),/Not authorized/);
});

test('administrator cannot suspend peer administrator or change roles',async()=>{
  const store=memory();store.seed(admin);store.seed(owner);
  const peer=await reserveInvitation({actor:owner,username:'other_admin',role:'administrator',redisFn:store.redisFn,now});
  await assert.rejects(suspendDelegatedAccount({actor:admin,id:peer.account.id,redisFn:store.redisFn}),/Cannot change peer/);
  await assert.rejects(changeStoredRole({actor:admin,id:peer.account.id,targetRole:'operator',redisFn:store.redisFn}),/Not authorized/);
});

test('owner cannot escalate an invited user to owner, nor reassign own role',async()=>{
  const store=memory();store.seed(owner);
  const newUser=await reserveInvitation({actor:owner,username:'new_operator',redisFn:store.redisFn,now});
  await assert.rejects(changeStoredRole({actor:owner,id:newUser.account.id,targetRole:'owner',redisFn:store.redisFn}),/Role change not allowed/);
  await assert.rejects(changeStoredRole({actor:owner,id:owner.id,targetRole:'viewer',redisFn:store.redisFn}),/Not authorized/);
});

test('account listing is bounded and emits no credential fields',async()=>{
  const store=memory();store.seed(owner);
  const a=await reserveInvitation({actor:owner,username:'third_member',redisFn:store.redisFn,now});
  store.db.set(keys.identityAccount(a.account.id),JSON.stringify({
    ...(await loadAccount(a.account.id,store.redisFn)),
    totp_secret:'NEVER_SEND',password_hash:'NEVER_SEND'
  }));
  const result=await listPublicAccounts({redisFn:store.redisFn,limit:10});
  assert.equal(result.length,2);
  assert.equal(JSON.stringify(result).includes('NEVER_SEND'),false);
  assert.equal(result.find(x=>x.username==='third_member').role,'viewer');
  await assert.rejects(listPublicAccounts({redisFn:store.redisFn,limit:100}),/Invalid pagination/);
});

test('invalid IDs, malformed storage and username mismatches fail closed',async()=>{
  const store=memory();store.seed(owner);
  assert.equal(await loadAccount('../random',store.redisFn),null);
  assert.equal(await loadByUsername('ab',store.redisFn),null);
  store.db.set(keys.identityUsername('not_found'),'33333333-3333-4333-8333-333333333333');
  assert.equal(await loadByUsername('not_found',store.redisFn),null);
  await assert.rejects(reserveInvitation({actor:{...owner,status:'suspended'},username:'no_access',redisFn:store.redisFn,now}),/Not authorized/);
});

test('actor suspension during an invitation prevents the atomic write',async()=>{
  const store=memory();store.seed(admin);
  const wrapped=async(cmd,...args)=>{
    if(cmd==='EVAL'&&args[0]===CREATE_ACCOUNT_LUA){
      store.db.set(keys.identityAccount(admin.id),JSON.stringify({...admin,status:'suspended',session_version:admin.session_version+1}));
    }
    return store.redisFn(cmd,...args);
  };
  await assert.rejects(
    reserveInvitation({actor:admin,username:'too_late',role:'viewer',redisFn:wrapped,now}),
    /Could not reserve account/
  );
  assert.equal(await loadByUsername('too_late',store.redisFn),null);
});

test('revoking the actor mid-change prevents privilege edits',async()=>{
  const store=memory();store.seed(owner);
  const ticket=await reserveInvitation({actor:owner,username:'target_to_change',redisFn:store.redisFn,now});
  const wrapped=async(cmd,...args)=>{
    if(cmd==='EVAL'&&args[0]===UPDATE_ACCOUNT_LUA){
      store.db.set(keys.identityAccount(owner.id),JSON.stringify({...owner,status:'suspended',session_version:owner.session_version+1}));
    }
    return store.redisFn(cmd,...args);
  };
  await assert.rejects(
    changeStoredRole({actor:owner,id:ticket.account.id,targetRole:'operator',redisFn:wrapped}),
    /Account modified concurrently/
  );
  assert.equal((await loadAccount(ticket.account.id,store.redisFn)).role,'viewer');
});
