import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes,createHash} from 'node:crypto';
import {createInvitedAccount} from '../lib/account-model.js';
import {issueInvitationToken,ISSUE_INVITE_LUA,INVITATION_TTL_SECONDS} from '../lib/account-invitations.js';
import {activateInvitedAccount,ACTIVATE_ACCOUNT_LUA,strongPassword} from '../lib/account-activation.js';
import {authenticateIndividual} from '../lib/account-login.js';
import {resolveAccountSession} from '../lib/account-sessions.js';
import {loadAccount} from '../lib/account-store.js';
import {keys} from '../lib/redis.js';

const NOW=Date.parse('2026-11-22T22:00:00.000Z');
const secret='JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const pass='A-new-long-unique-passphrase-2026!';
const owner={id:'11111111-1111-4111-8111-111111111111',
  username:'nexify_owner',role:'owner',status:'active',mfa_enrolled:true,session_version:0};
const env={NEXIFY_ACCOUNT_VAULT_KEY:randomBytes(32).toString('base64url')};

function totpCode(base32,now=NOW){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bytes=[];
  let b=0,bits=0;
  for(const char of base32){
    b=(b<<5)|alphabet.indexOf(char);bits+=5;
    if(bits>=8){bits-=8;bytes.push((b>>bits)&255);b&=(1<<bits)-1;}
  }
  const counter=Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now/30000)));
  const digest=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();
  const pos=digest[digest.length-1]&15;
  return String((digest.readUInt32BE(pos)&0x7fffffff)%1000000).padStart(6,'0');
}

function memory(){
  const db=new Map(),calls=[];
  const fn=async (command,...args)=>{
    calls.push([command,...args]);
    if(command==='GET')return db.get(args[0])??null;
    if(command==='SET'){
      const [key,value,ttlFlag,ttl,onceFlag]=args;
      if(ttlFlag!=='EX'||onceFlag!=='NX')throw Error('Unexpected SET parameters');
      if(db.has(key))return null;
      db.set(key,value);
      return 'OK';
    }
    if(command==='EVAL'&&args[0]===ISSUE_INVITE_LUA){
      const [,count,tokKey,idxKey,actorKey,accountKey,entry,hash,actorRaw,accountRaw,ttl]=args;
      assert.equal(count,4);assert.equal(ttl,INVITATION_TTL_SECONDS);
      if(db.get(actorKey)!==actorRaw||db.get(accountKey)!==accountRaw)return -1;
      if(db.has(tokKey)||db.has(idxKey))return 0;
      db.set(tokKey,entry);db.set(idxKey,hash);
      return 1;
    }
    if(command==='EVAL'&&args[0]===ACTIVATE_ACCOUNT_LUA){
      const [,count,tokKey,idxKey,accountKey,hash,id,now,oldRaw,nextRaw]=args;
      assert.equal(count,3);
      const inviteRaw=db.get(tokKey),stored=db.get(accountKey);
      if(!inviteRaw||db.get(idxKey)!==hash)return 0;
      const invite=JSON.parse(inviteRaw);
      if(invite.account_id!==id||invite.expires_at<=now)return 0;
      if(stored!==oldRaw)return 0;
      const account=JSON.parse(stored),next=JSON.parse(nextRaw);
      if(account.id!==id||account.role!==invite.role||account.status!=='invited')return 0;
      if(account.session_version!==invite.session_version||account.password_hash||account.totp_ciphertext||account.mfa_enrolled)return 0;
      if(next.id!==id||next.username!==account.username||next.role!==account.role||
        next.status!=='active'||next.mfa_enrolled!==true||
        next.session_version!==account.session_version+1||
        typeof next.password_hash!=='string'||typeof next.totp_ciphertext!=='string')return 0;
      db.set(accountKey,nextRaw);db.delete(tokKey);db.delete(idxKey);
      return 1;
    }
    throw Error('Unexpected Redis operation '+command);
  };
  const seed=a=>{
    db.set(keys.identityAccount(a.id),JSON.stringify(a));
    db.set(keys.identityUsername(a.username),a.id);
  };
  return {db,calls,fn,seed};
}
async function inviteFixture(){
  const mem=memory(),account=createInvitedAccount({
    username:'new_staff',role:'operator',createdBy:owner.id
  });
  mem.seed(owner);mem.seed(account);
  const issued=await issueInvitationToken({actor:owner,accountId:account.id,
    redisFn:mem.fn,now:NOW});
  assert.equal(issued.issued,true);
  return {mem,account,token:issued.token};
}
const activate=({mem,account,token},other={})=>activateInvitedAccount({
  token,accountId:account.id,password:pass,totpSecret:secret,
  totpCode:totpCode(secret),redisFn:mem.fn,env,now:NOW+1000,...other
});

test('long passwords are required before expensive KDF or Redis calls',()=>{
  for(const password of [null,'abc','short-123456','a'.repeat(129),
    ' a sufficiently long passphrase','valid\nlong\npassphrase']){
    assert.equal(strongPassword(password),false);
  }
  assert.equal(strongPassword(pass),true);
});

test('valid invitation and proven TOTP activate an account atomically',async()=>{
  const fixture=await inviteFixture();
  const result=await activate(fixture);
  assert.equal(result.activated,true);
  assert.equal(result.account.status,'active');
  assert.equal(result.account.role,'operator');
  assert.equal(result.account.mfa_enrolled,true);
  assert.equal(JSON.stringify(result).includes(pass),false);
  assert.equal(JSON.stringify(result).includes(secret),false);
  const a=await loadAccount(fixture.account.id,fixture.mem.fn);
  assert.equal(a.session_version,1);
  assert.match(a.password_hash,/^scrypt\$/);
  assert.ok(a.totp_ciphertext.startsWith('v1.'));
  assert.equal(JSON.stringify([...fixture.mem.db.values()]).includes(pass),false);
  assert.equal(JSON.stringify([...fixture.mem.db.values()]).includes(secret),false);
  assert.equal(await activate(fixture),null?.activated??false);
});

test('wrong MFA, weak password or expired invitation cannot activate account',async()=>{
  const fixture=await inviteFixture();
  assert.equal((await activate(fixture,{totpCode:'000000'})).activated,false);
  assert.equal((await activate(fixture,{password:'weak'})).activated,false);
  assert.equal((await activate(fixture,{now:NOW+INVITATION_TTL_SECONDS*1000+2000,
    totpCode:totpCode(secret,NOW+INVITATION_TTL_SECONDS*1000+2000)})).activated,false);
  assert.equal((await loadAccount(fixture.account.id,fixture.mem.fn)).status,'invited');
});

test('a missing encryption key refuses activation without consuming the invitation',async()=>{
  const fixture=await inviteFixture();
  await assert.rejects(activate(fixture,{env:{}}),/vault not configured/);
  assert.equal((await loadAccount(fixture.account.id,fixture.mem.fn)).status,'invited');
  assert.equal((await activate(fixture)).activated,true);
});

test('concurrent enrollment allows one active account and exactly one used token',async()=>{
  const fixture=await inviteFixture();
  const [a,b]=await Promise.all([activate(fixture),activate(fixture)]);
  assert.deepEqual([a.activated,b.activated].sort(),[false,true]);
  assert.equal((await loadAccount(fixture.account.id,fixture.mem.fn)).status,'active');
});

test('role or session version changes invalidate enrollment before activation',async()=>{
  const fixture=await inviteFixture();
  fixture.mem.seed({...fixture.account,role:'administrator',session_version:1});
  assert.equal((await activate(fixture)).activated,false);
  assert.equal((await loadAccount(fixture.account.id,fixture.mem.fn)).status,'invited');
});

test('individual password + MFA login issues revocable session with replay guard',async()=>{
  const fixture=await inviteFixture();
  assert.equal((await activate(fixture)).activated,true);
  const login=()=>authenticateIndividual({username:' NEW_STAFF ',password:pass,
    code:totpCode(secret),now:NOW+3000,env,redisFn:fixture.mem.fn});
  const first=await login();
  assert.equal(first.account.role,'operator');
  assert.equal(first.account.status,'active');
  assert.equal(first.session.token.length,43);
  assert.equal(JSON.stringify([...fixture.mem.db]).includes(first.session.token),false);
  assert.equal(await login(),null);
  const actor=await resolveAccountSession({token:first.session.token,
    loadAccount:id=>loadAccount(id,fixture.mem.fn),redisFn:fixture.mem.fn,now:NOW+5000});
  assert.equal(actor.can('backup.request'),true);
  assert.equal(actor.can('accounts.manage'),false);
});

test('invalid password and MFA code never issue a session',async()=>{
  const fixture=await inviteFixture();
  assert.equal((await activate(fixture)).activated,true);
  const opts={username:'new_staff',now:NOW+5000,env,redisFn:fixture.mem.fn};
  assert.equal(await authenticateIndividual({...opts,password:'incorrect-long-thing',
    code:totpCode(secret)}),null);
  assert.equal(await authenticateIndividual({...opts,password:pass,code:'123'}),null);
  assert.equal(await authenticateIndividual({...opts,password:pass,code:'000000'}),null);
  const res=await authenticateIndividual({...opts,password:pass,code:totpCode(secret)});
  assert.ok(res?.session?.token);
});

test('suspended accounts and wrong vault keys cannot authenticate',async()=>{
  const fixture=await inviteFixture();
  await activate(fixture);
  const active=await loadAccount(fixture.account.id,fixture.mem.fn);
  fixture.mem.seed({...active,status:'suspended',session_version:active.session_version+1});
  const opts={username:'new_staff',password:pass,code:totpCode(secret),
    now:NOW+4000,env,redisFn:fixture.mem.fn};
  assert.equal(await authenticateIndividual(opts),null);
  fixture.mem.seed(active);
  assert.equal(await authenticateIndividual({...opts,env:{
    NEXIFY_ACCOUNT_VAULT_KEY:randomBytes(32).toString('base64url')
  }}),null);
});
