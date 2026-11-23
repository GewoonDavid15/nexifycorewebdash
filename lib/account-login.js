import {redis,keys} from './redis.js';
import {loadByUsername} from './account-store.js';
import {verifyPassword,validTotp} from './security.js';
import {unsealTotpSecret} from './account-vault.js';
import {issueAccountSession} from './account-sessions.js';
import {publicAccount} from './account-model.js';

/**
 * INTERNAL staging authentication primitive only.
 * Requires an external rate limiter, CSRF-safe cookie issuance and per-route
 * authorization before adding any production HTTP endpoint.
 */
export async function authenticateIndividual({
  username,password,code,now=Date.now(),redisFn=redis,env=process.env
}={}){
  if(typeof password!=='string'||password.length<12||password.length>256||
    !/^\d{6}$/.test(String(code))||!Number.isFinite(now)||now<0)return null;
  try{
    const account=await loadByUsername(username,redisFn);
    if(account?.status!=='active'||account.mfa_enrolled!==true||
      typeof account.password_hash!=='string'||
      typeof account.totp_ciphertext!=='string')return null;
    if(!verifyPassword(password,account.password_hash))return null;
    const secret=unsealTotpSecret({accountId:account.id,sealed:account.totp_ciphertext,env});
    const step=validTotp(code,secret,now);
    if(step===null)return null;
    // A code can authorize at most one future account session even if the
    // authenticator window accepts neighbouring 30-second intervals.
    const accepted=await redisFn('SET',keys.identityTotpStep(account.id,step),
      '1','EX',120,'NX');
    if(accepted!=='OK')return null;
    const session=await issueAccountSession({
      account,passwordVerified:true,totpVerified:true,redisFn,now
    });
    return {account:publicAccount(account),session};
  }catch{
    // Fail closed without disclosing username existence or MFA details.
    return null;
  }
}
