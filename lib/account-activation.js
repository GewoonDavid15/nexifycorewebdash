import {redis,keys} from './redis.js';
import {passwordHash,validTotp} from './security.js';
import {sealTotpSecret} from './account-vault.js';
import {loadAccount} from './account-store.js';
import {publicAccount,validAccount} from './account-model.js';
import {createHash} from 'node:crypto';

// The entire token claim AND account activation is a single Redis operation.
// There is no "consume token, then separately activate" failure window.
export const ACTIVATE_ACCOUNT_LUA=[
  "local raw=redis.call('GET',KEYS[1])",
  "if not raw or redis.call('GET',KEYS[2]) ~= ARGV[1] then return 0 end",
  "local invite=cjson.decode(raw)",
  "if invite.account_id ~= ARGV[2] or tonumber(invite.expires_at) <= tonumber(ARGV[3]) then return 0 end",
  "local old=redis.call('GET',KEYS[3])",
  "if not old or old ~= ARGV[4] then return 0 end",
  "local account=cjson.decode(old)",
  "local updated=cjson.decode(ARGV[5])",
  "if account.id ~= ARGV[2] or account.role ~= invite.role or account.status ~= 'invited' then return 0 end",
  "if tonumber(account.session_version) ~= tonumber(invite.session_version) then return 0 end",
  "if account.password_hash ~= nil or account.totp_ciphertext ~= nil or account.mfa_enrolled == true then return 0 end",
  "if updated.id ~= account.id or updated.username ~= account.username or updated.role ~= account.role then return 0 end",
  "if updated.status ~= 'active' or updated.mfa_enrolled ~= true then return 0 end",
  "if tonumber(updated.session_version) ~= tonumber(account.session_version)+1 then return 0 end",
  "if type(updated.password_hash) ~= 'string' or type(updated.totp_ciphertext) ~= 'string' then return 0 end",
  "redis.call('SET',KEYS[3],ARGV[5])",
  "redis.call('DEL',KEYS[1],KEYS[2])",
  "return 1"
].join('\n');

const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const digest=token=>createHash('sha256').update(token).digest('hex');

export function strongPassword(value){
  return typeof value==='string'&&value.length>=14&&value.length<=128&&
    value.trim()===value&&!/[\x00-\x1f\x7f]/.test(value)&&
    Buffer.byteLength(value,'utf8')<=256;
}

/**
 * Staging library only. The owner-controlled invitation is mandatory.
 * Do not create HTTP routes until rate limits, CSRF, TOTP enrollment,
 * safe cookie issuance and rollback have been reviewed.
 */
export async function activateInvitedAccount({
  token,accountId,password,totpSecret,totpCode,redisFn=redis,env=process.env,now=Date.now()
}={}){
  if(typeof token!=='string'||!TOKEN.test(token)||typeof accountId!=='string'||
    !UUID.test(accountId)||!strongPassword(password)||!Number.isFinite(now)||now<0)
    return {activated:false};
  if(validTotp(totpCode,totpSecret,now)===null)return {activated:false};
  const account=await loadAccount(accountId,redisFn);
  if(!validAccount(account)||account.status!=='invited'||account.role==='owner'||
    account.mfa_enrolled!==false||account.password_hash||account.totp_ciphertext)
    return {activated:false};
  const hash=digest(token);
  const oldRaw=await redisFn('GET',keys.identityAccount(accountId));
  // Use the exact Redis original bytes for the compare-and-set. Loading a
  // stale account copy must never overwrite concurrent role/suspension edits.
  let old;
  try{old=JSON.parse(oldRaw);}catch{return {activated:false};}
  if(!validAccount(old)||old.id!==account.id||
    old.status!=='invited'||old.mfa_enrolled!==false||
    old.role!==account.role||old.session_version!==account.session_version||
    old.password_hash||old.totp_ciphertext||oldRaw!==JSON.stringify(account))return {activated:false};
  // Fail CLOSED if vault key is missing or invalid; invitation remains valid.
  const encrypted=sealTotpSecret({accountId,secret:totpSecret,env});
  const next={...old,status:'active',mfa_enrolled:true,
    session_version:old.session_version+1,
    password_hash:passwordHash(password),totp_ciphertext:encrypted,
    activated_at:new Date(now).toISOString()};
  const accepted=await redisFn('EVAL',ACTIVATE_ACCOUNT_LUA,3,
    keys.identityInviteToken(hash),keys.identityInviteAccount(accountId),
    keys.identityAccount(accountId),hash,accountId,Math.floor(now),
    oldRaw,JSON.stringify(next));
  return Number(accepted)===1?
    {activated:true,account:publicAccount(next)}:{activated:false};
}
