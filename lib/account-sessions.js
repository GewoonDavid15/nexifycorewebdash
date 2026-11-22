import {createHash,randomBytes} from 'node:crypto';
import {redis,keys} from './redis.js';
import {validAccount} from './account-model.js';
import {hasPermission} from './rbac.js';

/**
 * Staged Nexify account-session store, NOT wired to the production login.
 * Every token is a 256-bit bearer secret. Redis only stores a SHA-256 digest
 * in the key; sessions are revoked immediately by deleting the key.
 */
export const ACCOUNT_SESSION_TTL_SECONDS=6*60*60;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
function tokenDigest(token){
  return createHash('sha256').update(token,'utf8').digest('hex');
}
function accountActive(account){
  return validAccount(account)&&account.status==='active'&&account.mfa_enrolled===true;
}

export async function issueAccountSession({
  account,passwordVerified,totpVerified,redisFn=redis,now=Date.now()
}={}){
  if(!accountActive(account)||passwordVerified!==true||totpVerified!==true)
    throw new Error('Account authentication required');
  if(!Number.isFinite(now)||now<0)throw new Error('Invalid session time');
  const token=randomBytes(32).toString('base64url');
  const digest=tokenDigest(token);
  const entry={
    account_id:account.id,
    session_version:account.session_version,
    created_at:Math.floor(now),
    expires_at:Math.floor(now)+ACCOUNT_SESSION_TTL_SECONDS*1000
  };
  const result=await redisFn('SET',keys.accountSession(digest),
    JSON.stringify(entry),'EX',ACCOUNT_SESSION_TTL_SECONDS,'NX');
  if(result!=='OK')throw new Error('Could not create account session');
  return {token,expires_at:new Date(entry.expires_at).toISOString()};
}

/**
 * Current account state MUST be loaded from trusted server-side storage,
 * never from the cookie or a client-provided role.
 */
export async function resolveAccountSession({
  token,loadAccount,redisFn=redis,now=Date.now()
}={}){
  if(typeof token!=='string'||!TOKEN.test(token)||
    typeof loadAccount!=='function'||!Number.isFinite(now))return null;
  const digest=tokenDigest(token);
  let raw;
  try{raw=await redisFn('GET',keys.accountSession(digest));}
  catch{return null;}
  if(!raw)return null;
  let entry;
  try{entry=JSON.parse(raw);}catch{return null;}
  const valid=entry&&typeof entry.account_id==='string'&&
    Number.isSafeInteger(entry.session_version)&&entry.session_version>=0&&
    Number.isFinite(entry.expires_at)&&entry.expires_at>now&&
    Number.isFinite(entry.created_at)&&entry.created_at<=now&&
    entry.expires_at-entry.created_at<=ACCOUNT_SESSION_TTL_SECONDS*1000;
  if(!valid)return null;
  let account;
  try{account=await loadAccount(entry.account_id);}
  catch{return null;}
  if(!accountActive(account)||account.id!==entry.account_id||
    account.session_version!==entry.session_version)return null;
  return {account_id:account.id,role:account.role,expires_at:entry.expires_at,
    can:permission=>hasPermission(account.role,permission)};
}

export async function revokeAccountSession(token,redisFn=redis){
  if(typeof token!=='string'||!TOKEN.test(token))return false;
  const count=await redisFn('DEL',keys.accountSession(tokenDigest(token)));
  return Number(count)>0;
}
