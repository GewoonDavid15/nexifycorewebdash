import {COOKIE,trustedOrigin,json} from '../../../../lib/security.js';
export async function POST(req){
  if(!trustedOrigin(req))return json({error:'Invalid origin'},403);
  const r=json({ok:true});r.headers.set('Set-Cookie',`${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);return r;
}
