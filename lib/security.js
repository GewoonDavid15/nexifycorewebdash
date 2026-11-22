import {randomBytes,timingSafeEqual,createHmac,scryptSync} from 'node:crypto';
const COOKIE='nexify_cloud_session';
export {COOKIE};
export function same(a,b){
  if(typeof a!=='string'||typeof b!=='string')return false;
  const ah=createHmac('sha256','nexify-constant-time-compare').update(a).digest();
  const bh=createHmac('sha256','nexify-constant-time-compare').update(b).digest();
  return timingSafeEqual(ah,bh) && a.length===b.length;
}
export function isAgent(req){
  const given=req.headers.get('authorization');
  const secret=process.env.AGENT_SECRET;
  return Boolean(secret&&secret.length>=32&&given?.startsWith('Bearer ')&&same(given.slice(7),secret));
}
export function passwordHash(pass,salt=randomBytes(16).toString('hex')){
  return `scrypt$${salt}$${scryptSync(pass,Buffer.from(salt,'hex'),64).toString('hex')}`;
}
export function verifyPassword(pass,encoded){
  if(typeof pass!=='string'||pass.length<12||pass.length>256||typeof encoded!=='string')return false;
  const parts=encoded.split('$');
  if(parts.length!==3||parts[0]!=='scrypt'||!/^[a-f0-9]{32}$/.test(parts[1])||!/^[a-f0-9]{128}$/.test(parts[2]))return false;
  const actual=scryptSync(pass,Buffer.from(parts[1],'hex'),64);
  return timingSafeEqual(actual,Buffer.from(parts[2],'hex'));
}
function decodeBase32(str){
  const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0;const bytes=[];
  for(const ch of str.toUpperCase().replace(/=+$/,'')){
    const digit=abc.indexOf(ch);if(digit<0)throw new Error('Invalid Base32');
    value=(value<<5)|digit;bits+=5;
    if(bits>=8){bytes.push((value>>>(bits-=8))&255);value&=(1<<bits)-1;}
  }
  return Buffer.from(bytes);
}
export function validTotp(code,secret,now=Date.now()){
  if(!/^\d{6}$/.test(String(code))||!secret||!/^[A-Z2-7]{16,64}$/.test(secret))return null;
  const key=decodeBase32(secret);const current=Math.floor(now/30000);
  for(let offset=-1;offset<=1;offset++){
    const step=current+offset;
    const msg=Buffer.alloc(8);msg.writeBigUInt64BE(BigInt(step));
    const h=createHmac('sha1',key).update(msg).digest();const idx=h[h.length-1]&15;
    const n=(h.readUInt32BE(idx)&0x7fffffff)%1000000;
    if(same(String(n).padStart(6,'0'),String(code)))return step;
  }
  return null;
}
function sign(message){
  const secret=process.env.SESSION_SECRET;
  if(!secret||secret.length<32)throw new Error('Session secret not configured');
  return createHmac('sha256',secret).update(message).digest('hex');
}
export function makeSession(now=Date.now()){
  const exp=now+6*60*60*1000;
  const data=`v1.${exp}.${randomBytes(16).toString('hex')}`;
  return `${data}.${sign(data)}`;
}
export function isSession(value,now=Date.now()){
  if(typeof value!=='string'||value.length>250)return false;
  const parts=value.split('.');
  if(parts.length!==4||parts[0]!=='v1'||!/^[0-9]{13}$/.test(parts[1])||!/^[a-f0-9]{32}$/.test(parts[2])||!/^[a-f0-9]{64}$/.test(parts[3]))return false;
  const exp=Number(parts[1]);
  return exp>now&&exp<now+6*60*60*1000+60000&&same(parts[3],sign(parts.slice(0,3).join('.')));
}
export function requestAuthorized(req){return isSession(req.cookies.get(COOKIE)?.value);}
export function trustedOrigin(req){
  try {return new URL(req.headers.get('origin')).origin===new URL(req.url).origin;}
  catch{return false;}
}
export function json(data,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
