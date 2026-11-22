import test from 'node:test';
import assert from 'node:assert/strict';
import {createInvitedAccount} from '../lib/account-model.js';
import {keys} from '../lib/redis.js';
import {
  ISSUE_INVITE_LUA,CONSUME_INVITE_LUA,
  issueInvitationToken,consumeInvitationToken,INVITATION_TTL_SECONDS
} from '../lib/account-invitations.js';

const now=Date.parse('2026-11-22T22:00:00Z');
const owner={id:'11111111-1111-4111-8111-111111111111',username:'nexify_owner',role:'owner',
  status:'active',session_version:4,mfa_enrolled:true};
const admin={id:'22222222-2222-4222-8222-222222222222',username:'nexify_admin',role:'administrator',
  status:'active',session_version:2,mfa_enrolled:true};

function mockRedis(){
  const db=new Map(),calls=[];
  const seed=record=>db.set(keys.identityAccount(record.id),JSON.stringify(record));
  const fn=async(command,...args)=>{
    calls.push([command,...args]);
    if(command==='GET')return db.get(args[0])??null;
    if(command==='EVAL'&&args[0]===ISSUE_INVITE_LUA){
      const [_script,numKeys,tokKey,accountKey,actorKey,targetKey,entry,hash,actorRaw,accountRaw,ttl]=args;
      assert.equal(numKeys,4);
      assert.equal(ttl,INVITATION_TTL_SECONDS);
      if(db.get(actorKey)!==actorRaw||db.get(targetKey)!==accountRaw)return -1;
      if(db.has(tokKey)||db.has(accountKey))return 0;
      db.set(tokKey,entry);db.set(accountKey,hash);return 1;
    }
    if(command==='EVAL'&&args[0]===CONSUME_INVITE_LUA){
      const [_script,numKeys,tokKey,accountKey,targetKey,hash,accountId,clock]=args;
      assert.equal(numKeys,3);
      const raw=db.get(tokKey);
      if(!raw||db.get(accountKey)!==hash)return null;
      const payload=JSON.parse(raw);
      if(payload.account_id!==accountId||payload.expires_at<=clock)return null;
      const targetRaw=db.get(targetKey);
      if(!targetRaw)return null;
      const target=JSON.parse(targetRaw);
      if(target.id!==accountId||target.status!=='invited'||target.role==='owner')return null;
      db.delete(tokKey);db.delete(accountKey);return accountId;
    }
    throw new Error('Unexpected Redis command '+command);
  };
  return {db,calls,seed,fn};
}

function invited(username,role='viewer'){
  return createInvitedAccount({username,role,createdBy:owner.id});
}

test('one-time invitation uses hashed token and can be consumed only once',async()=>{
  const store=mockRedis(),user=invited('invited_member');
  store.seed(owner);store.seed(user);
  const invitation=await issueInvitationToken({actor:owner,accountId:user.id,redisFn:store.fn,now});
  assert.equal(invitation.issued,true);
  assert.match(invitation.token,/^[A-Za-z0-9_-]{43}$/);
  assert.ok(!JSON.stringify([...store.db]).includes(invitation.token),'Never persist bearer token');
  assert.ok([...store.db.keys()].some(x=>x.includes('identity:invite:token:')));
  const claimed=await consumeInvitationToken({token:invitation.token,accountId:user.id,redisFn:store.fn,now:now+100});
  assert.deepEqual(claimed,{account_id:user.id});
  assert.equal(await consumeInvitationToken({token:invitation.token,accountId:user.id,redisFn:store.fn,now:now+101}),null);
});

test('concurrent issuance prevents two valid tokens for one account',async()=>{
  const store=mockRedis(),user=invited('only_once');
  store.seed(owner);store.seed(user);
  const jobs=await Promise.all([
    issueInvitationToken({actor:owner,accountId:user.id,redisFn:store.fn,now}),
    issueInvitationToken({actor:owner,accountId:user.id,redisFn:store.fn,now})
  ]);
  assert.equal(jobs.filter(x=>x.issued).length,1);
  assert.equal(jobs.filter(x=>!x.issued).length,1);
  assert.equal(jobs.find(x=>!x.issued).reason,'already_invited');
});

test('wrong user and expired token cannot claim invitation',async()=>{
  const store=mockRedis(),user=invited('expires_soon'),other=invited('other_person');
  store.seed(owner);store.seed(user);store.seed(other);
  const invite=await issueInvitationToken({actor:owner,accountId:user.id,redisFn:store.fn,now});
  assert.equal(await consumeInvitationToken({token:invite.token,accountId:other.id,redisFn:store.fn,now:now+100}),null);
  assert.equal(await consumeInvitationToken({token:invite.token,accountId:user.id,redisFn:store.fn,
    now:now+INVITATION_TTL_SECONDS*1000+1}),null);
  const inactive={...user,status:'suspended',session_version:1};
  store.seed(inactive);
  assert.equal(await consumeInvitationToken({token:invite.token,accountId:user.id,redisFn:store.fn,now:now+200}),null);
});

test('administrator cannot issue token for peer administrator',async()=>{
  const store=mockRedis(),peer=invited('third_admin','administrator');
  store.seed(admin);store.seed(peer);
  await assert.rejects(
    issueInvitationToken({actor:admin,accountId:peer.id,redisFn:store.fn,now}),
    /Not authorized/
  );
});

test('actor revocation during the Redis issuance transaction rejects invitation',async()=>{
  const store=mockRedis(),user=invited('late_request');
  store.seed(owner);store.seed(user);
  const race=async(command,...args)=>{
    if(command==='EVAL'&&args[0]===ISSUE_INVITE_LUA)
      store.seed({...owner,status:'suspended',session_version:5});
    return store.fn(command,...args);
  };
  await assert.rejects(
    issueInvitationToken({actor:owner,accountId:user.id,redisFn:race,now}),
    /Invitation reservation rejected/
  );
  assert.equal([...store.db.keys()].some(k=>k.includes('identity:invite:token:')),false);
});

test('malformed tokens are refused without accessing Redis',async()=>{
  const store=mockRedis(),user=invited('bad_request');
  for(const invalid of ['short',null,'a'.repeat(200)]){
    assert.equal(await consumeInvitationToken({token:invalid,accountId:user.id,redisFn:store.fn,now}),null);
  }
  assert.equal(store.calls.length,0);
});
