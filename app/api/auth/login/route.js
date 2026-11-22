import {validTotp,verifyPassword,makeSession,COOKIE,trustedOrigin,json} from '../../../../lib/security.js';
import {redis,keys} from '../../../../lib/redis.js';
export const runtime='nodejs';
export async function POST(req){
  if(!trustedOrigin(req))return json({error:'Invalid origin'},403);
  try{
    const ip=(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,60);
    const key=keys.login(ip.replace(/[^a-zA-Z0-9:.]/g,'_'));
    const count=Number(await redis('INCR',key));if(count===1)await redis('EXPIRE',key,300);
    if(count>8)return json({error:'Too many attempts; try again later'},429);
    const text=await req.text();if(text.length>2000)return json({error:'Too large'},413);
    const data=JSON.parse(text);
    const hash=process.env.DASHBOARD_PASSWORD_HASH;
    const secret=process.env.DASHBOARD_TOTP_SECRET;
    if(!hash||!secret)return json({error:'Login is not configured'},503);
    if(!verifyPassword(data.password,hash))return json({error:'Wrong login'},401);
    const step=validTotp(data.code,secret);
    if(step===null)return json({error:'Wrong login'},401);
    const oneTime=await redis('SET',keys.totpUsed(step),'1','EX',120,'NX');
    if(oneTime!=='OK')return json({error:'Code already used'},401);
    await redis('DEL',key);
    const res=json({ok:true});
    res.headers.append('Set-Cookie',`${COOKIE}=${makeSession()}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=21600`);
    return res;
  }catch{return json({error:'Login temporarily unavailable'},503);}
}
