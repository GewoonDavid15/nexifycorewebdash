import {requestAuthorized,json} from '../../../../lib/security.js';
import {mcnodeOverview} from '../../../../lib/mcnode.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req){
  if(!requestAuthorized(req))return json({error:'Unauthorized'},401);
  if(!process.env.MCNODE_PANEL_URL||!process.env.MCNODE_CLIENT_API_KEY||!process.env.MCNODE_SERVER_ID)
    return json({configured:false,connected:false});
  try {
    const info=await mcnodeOverview();
    return json({configured:true,...info});
  } catch {
    return json({configured:true,connected:false,error:'MC-Node API onbereikbaar of niet toegestaan'},502);
  }
}
