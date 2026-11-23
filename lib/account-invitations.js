import {randomBytes,createHash} from 'node:crypto';
import {keys,redis} from './redis.js';
import {loadAccount} from './account-store.js';
import {validAccount} from './account-model.js';
import {hasPermission} from './rbac.js';

// Internal-only one-time invitations. Not reachable through an HTTP route.
// Their bearer tokens are NEVER stored in Redis or included in audit logs.
export const INVITATION_TTL_SECONDS=48*60*60;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const digest=token=>createHash('sha256').update(token,'utf8').digest('hex');

export const ISSUE_INVITE_LUA=[
  "if redis.call('GET',KEYS[3]) ~= ARGV[3] then return -1 end",
  "if redis.call('GET',KEYS[4]) ~= ARGV[4] then return -1 end",
  "if redis.call('EXISTS',KEYS[1]) ~= 0 or redis.call('EXISTS',KEYS[2]) ~= 0 then return 0 end",
  "redis.call('SET',KEYS[1],ARGV[1],'EX',tonumber(ARGV[5]))",
  "redis.call('SET',KEYS[2],ARGV[2],'EX',tonumber(ARGV[5]))",
  "return 1"
].join('\n');

export const CONSUME_INVITE_LUA=[
  "local raw=redis.call('GET',KEYS[1])",
  "if not raw or redis.call('GET',KEYS[2]) ~= ARGV[1] then return false end",
  "local invite=cjson.decode(raw)",
  "if invite.account_id ~= ARGV[2] or tonumber(invite.expires_at) <= tonumber(ARGV[3]) then return false end",
  "local accountRaw=redis.call('GET',KEYS[3])",
  "if not accountRaw then return false end",
  "local account=cjson.decode(accountRaw)",
  "if account.id ~= ARGV[2] or account.status ~= 'invited' or account.role == 'owner' then return false end",
  "if account.role ~= invite.role or tonumber(account.session_version) ~= tonumber(invite.session_version) then return false end",
  "redis.call('DEL',KEYS[1])",
  "redis.call('DEL',KEYS[2])",
  "return invite.account_id"
].join('\n');

/**
 * Existing, trusted administrator account must already have been authenticated.
 * Owner/administrator access is validated again atomically in Redis.
 */
export async function issueInvitationToken({actor,accountId,redisFn=redis,now=Date.now()}={}){
  if(!validAccount(actor)||actor.status!=='active'||actor.mfa_enrolled!==true||
    !hasPermission(actor.role,'accounts.invite')||typeof accountId!=='string'||!UUID.test(accountId)||
    !Number.isFinite(now)||now<0)throw new Error('Not authorized');
  const persistedActor=await loadAccount(actor.id,redisFn);
  if(!persistedActor||persistedActor.role!==actor.role||
    persistedActor.session_version!==actor.session_version||persistedActor.status!=='active'||
    persistedActor.mfa_enrolled!==true)
    throw new Error('Not authorized');
  const account=await loadAccount(accountId,redisFn);
  if(!account||account.status!=='invited'||account.role==='owner')
    throw new Error('Account cannot be invited');
  if(actor.role==='administrator'&&!['viewer','operator'].includes(account.role))
    throw new Error('Not authorized');
  if(account.id===actor.id)throw new Error('Not authorized');
  const token=randomBytes(32).toString('base64url');
  const hash=digest(token);
  const expires=now+INVITATION_TTL_SECONDS*1000;
  const entry=JSON.stringify({account_id:accountId,expires_at:expires,role:account.role,session_version:account.session_version});
  const value=await redisFn('EVAL',ISSUE_INVITE_LUA,4,
    keys.identityInviteToken(hash),keys.identityInviteAccount(accountId),
    keys.identityAccount(actor.id),keys.identityAccount(accountId),
    entry,hash,JSON.stringify(persistedActor),JSON.stringify(account),INVITATION_TTL_SECONDS);
  if(Number(value)!==1){
    if(Number(value)===0)return {issued:false,reason:'already_invited'};
    throw new Error('Invitation reservation rejected');
  }
  return {issued:true,token,expires_at:new Date(expires).toISOString()};
}

/**
 * One-time claim: consume the token atomically. Does not activate accounts.
 * Future enrollment must first validate password/MFA setup and then combine
 * token claim + activation into a single transaction, not use this alone.
 */
export async function consumeInvitationToken({token,accountId,redisFn=redis,now=Date.now()}={}){
  if(typeof token!=='string'||!TOKEN.test(token)||
    typeof accountId!=='string'||!UUID.test(accountId)||!Number.isFinite(now))
    return null;
  const hash=digest(token);
  try{
    const result=await redisFn('EVAL',CONSUME_INVITE_LUA,3,
      keys.identityInviteToken(hash),keys.identityInviteAccount(accountId),keys.identityAccount(accountId),
      hash,accountId,Math.floor(now));
    return result===accountId?{account_id:accountId}:null;
  }catch{return null;}
}
