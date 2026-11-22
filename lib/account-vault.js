import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';

// Future per-user MFA storage. Nothing is activated on the production login.
// Requires a separate server-side vault key; NEVER reuse SESSION_SECRET.
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BASE32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const MFA=/^[A-Z2-7]{16,64}$/;
const B64=/^[A-Za-z0-9_-]+$/;

function vaultKey(env){
  const encoded=env?.NEXIFY_ACCOUNT_VAULT_KEY;
  if(typeof encoded!=='string'||encoded.length!==43||!B64.test(encoded))
    throw new Error('Account vault not configured');
  const key=Buffer.from(encoded,'base64url');
  if(key.length!==32||key.toString('base64url')!==encoded)
    throw new Error('Account vault not configured');
  return key;
}
function identity(id){
  if(typeof id!=='string'||!ID.test(id))throw new Error('Invalid account');
  return Buffer.from('nexify:mfa:v1:'+id);
}

export function generateTotpSecret(){
  const bytes=randomBytes(20);
  let bits=0,buffer=0,out='';
  for(const byte of bytes){
    buffer=(buffer<<8)|byte;bits+=8;
    while(bits>=5){bits-=5;out+=BASE32[(buffer>>bits)&31];buffer&=(1<<bits)-1;}
  }
  if(bits)out+=BASE32[(buffer<<(5-bits))&31];
  return out;
}

export function sealTotpSecret({accountId,secret,env=process.env}={}){
  const aad=identity(accountId),key=vaultKey(env);
  if(typeof secret!=='string'||!MFA.test(secret))
    throw new Error('Invalid authenticator secret');
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(aad);
  const ciphertext=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return ['v1',iv.toString('base64url'),tag.toString('base64url'),ciphertext.toString('base64url')].join('.');
}

export function unsealTotpSecret({accountId,sealed,env=process.env}={}){
  const aad=identity(accountId),key=vaultKey(env);
  if(typeof sealed!=='string'||sealed.length>250)
    throw new Error('Cannot unlock authenticator secret');
  const chunks=sealed.split('.');
  if(chunks.length!==4||chunks[0]!=='v1'||chunks.slice(1).some(x=>!B64.test(x)))
    throw new Error('Cannot unlock authenticator secret');
  const [iv,tag,ciphertext]=chunks.slice(1).map(x=>Buffer.from(x,'base64url'));
  if(iv.length!==12||tag.length!==16||ciphertext.length<10||ciphertext.length>64)
    throw new Error('Cannot unlock authenticator secret');
  try{
    const decipher=createDecipheriv('aes-256-gcm',key,iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    const plain=Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8');
    if(!MFA.test(plain))throw new Error('Invalid secret');
    return plain;
  }catch{
    throw new Error('Cannot unlock authenticator secret');
  }
}
