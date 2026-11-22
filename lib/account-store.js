import {redis,keys} from './redis.js';
import {
  normalizeUsername,validAccount,createInvitedAccount,publicAccount,
  suspendAccount,changeDelegatedRole
} from './account-model.js';
import {hasPermission,mayChangeRole} from './rbac.js';

/**
 * Stage-only account repository. All mutations use atomic Lua operations in
 * the EXISTING Upstash database. No HTTP write routes are exposed.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MINUTE=60*1000;
const accountKey=id=>keys.identityAccount(id);
const usernameKey=username=>keys.identityUsername(username);

// Both the account ID and normalized username are reserved atomically.
export const CREATE_ACCOUNT_LUA=[
  "if redis.call('EXISTS',KEYS[1]) ~= 0 or redis.call('EXISTS',KEYS[2]) ~= 0 then return 0 end",
  "redis.call('SET',KEYS[1],ARGV[1])",
  "redis.call('SET',KEYS[2],ARGV[2])",
  "redis.call('ZADD',KEYS[3],tonumber(ARGV[3]),ARGV[2])",
  "return 1"
].join('\n');

// Compare against the exact original JSON to avoid lost updates.
export const UPDATE_ACCOUNT_LUA=[
  "local current=redis.call('GET',KEYS[1])",
  "if not current or current ~= ARGV[1] then return 0 end",
  "local old=cjson.decode(current)",
  "local new=cjson.decode(ARGV[2])",
  "if old.id ~= new.id or old.username ~= new.username or old.role == 'owner' or new.role == 'owner' then return -1 end",
  "if tonumber(new.session_version) <= tonumber(old.session_version) then return -1 end",
  "redis.call('SET',KEYS[1],ARGV[2])",
  "return 1"
].join('\n');

function activeActor(actor,permission){
  return validAccount(actor)&&actor.status==='active'&&actor.mfa_enrolled===true&&
    hasPermission(actor.role,permission);
}
async function requireStoredActor(actor,permission,redisFn){
  if(!activeActor(actor,permission))throw new Error('Not authorized');
  const persisted=await loadAccount(actor.id,redisFn);
  if(!persisted||persisted.status!=='active'||persisted.mfa_enrolled!==true||
    persisted.role!==actor.role||persisted.session_version!==actor.session_version)
    throw new Error('Stale or untrusted administrator');
  return persisted;
}
function parseAccount(raw){
  if(typeof raw!=='string'||raw.length>16000)return null;
  try{
    const value=JSON.parse(raw);
    return validAccount(value)?value:null;
  }catch{return null;}
}
function checkId(value){
  return typeof value==='string'&&UUID.test(value);
}

export async function loadAccount(id,redisFn=redis){
  if(!checkId(id))return null;
  const raw=await redisFn('GET',accountKey(id));
  const parsed=parseAccount(raw);
  return parsed&&parsed.id===id?parsed:null;
}
export async function loadByUsername(username,redisFn=redis){
  const normalized=normalizeUsername(username);
  if(!normalized)return null;
  const id=await redisFn('GET',usernameKey(normalized));
  if(!checkId(id))return null;
  const account=await loadAccount(id,redisFn);
  return account?.username===normalized?account:null;
}
export async function listPublicAccounts({redisFn=redis,offset=0,limit=30}={}){
  if(!Number.isSafeInteger(offset)||offset<0||
    !Number.isSafeInteger(limit)||limit<1||limit>50)throw new Error('Invalid pagination');
  const ids=await redisFn('ZRANGE',keys.identityAccounts,offset,offset+limit-1);
  if(!Array.isArray(ids))throw new Error('Invalid account index');
  const result=[];
  for(const id of ids){
    const record=await loadAccount(id,redisFn);
    const safe=publicAccount(record);
    if(safe)result.push(safe);
  }
  return result;
}

/** Actor MUST come from trusted server-side authentication, never req.body. */
export async function reserveInvitation({actor,username,role='viewer',redisFn=redis,now=Date.now()}={}){
  await requireStoredActor(actor,'accounts.invite',redisFn);
  // Delegated administrators cannot grant peer or owner roles.
  if(!['viewer','operator'].includes(role)&&
    !(actor.role==='owner'&&role==='administrator'))throw new Error('Cannot invite that role');
  if(!Number.isFinite(now)||now<0)throw new Error('Invalid time');
  const account=createInvitedAccount({username,role,createdBy:actor.id});
  account.created_at=new Date(now).toISOString();
  const stored=await redisFn('EVAL',CREATE_ACCOUNT_LUA,3,
    accountKey(account.id),usernameKey(account.username),keys.identityAccounts,
    JSON.stringify(account),account.id,Math.floor(now/MINUTE));
  if(Number(stored)!==1){
    if(Number(stored)===0)return {created:false,reason:'username_or_id_in_use'};
    throw new Error('Could not reserve account');
  }
  return {created:true,account:publicAccount(account)};
}

async function updateDelegatedAccount({actor,id,redisFn=redis,transform,permission}={}){
  if(!checkId(id)||!actor||actor.id===id)throw new Error('Not authorized');
  await requireStoredActor(actor,permission,redisFn);
  const oldRaw=await redisFn('GET',accountKey(id));
  const previous=parseAccount(oldRaw);
  if(!previous||previous.id!==id||previous.role==='owner')
    throw new Error('Account cannot be changed');
  if(actor.role==='administrator'&&
    !['viewer','operator'].includes(previous.role))
    throw new Error('Cannot change peer administrator');
  const next=transform(previous);
  if(!validAccount(next)||next.username!==previous.username||
    next.id!==previous.id||next.role==='owner')
    throw new Error('Invalid account change');
  if(next.session_version===previous.session_version)
    return {updated:false,account:publicAccount(previous)};
  const accepted=await redisFn('EVAL',UPDATE_ACCOUNT_LUA,1,
    accountKey(id),oldRaw,JSON.stringify(next));
  if(Number(accepted)!==1)throw new Error('Account modified concurrently; retry safely');
  return {updated:true,account:publicAccount(next)};
}

export async function suspendDelegatedAccount({actor,id,redisFn=redis}={}){
  return updateDelegatedAccount({actor,id,redisFn,permission:'accounts.suspend',
    transform:suspendAccount});
}
export async function changeStoredRole({actor,id,targetRole,redisFn=redis}={}){
  await requireStoredActor(actor,'accounts.manage',redisFn);
  return updateDelegatedAccount({actor,id,redisFn,permission:'accounts.manage',
    transform:record=>{
      if(!mayChangeRole({actorRole:actor.role,actorId:actor.id,
        targetId:record.id,targetRole,currentRole:record.role}))
        throw new Error('Role change not allowed');
      return changeDelegatedRole(record,targetRole);
    }});
}
