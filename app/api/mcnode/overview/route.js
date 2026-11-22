import {requestAuthorized,json} from '../../../../lib/security.js';
import {mcnodeOverview,McnodeError} from '../../../../lib/mcnode.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';

const labels={
  not_configured:'Koppeling niet ingesteld',
  invalid_config:'Controleer de paneel-URL, API-sleutel en server-ID in Vercel',
  invalid_key:'De MC-Node API-sleutel wordt niet geaccepteerd. Maak een nieuwe Client API-sleutel',
  insufficient_permissions:'De MC-Node API-sleutel heeft onvoldoende rechten voor serverstatus',
  server_not_found:'De server-ID hoort niet bij dit MC-Node-account',
  rate_limited:'Te veel MC-Node API-verzoeken. Probeer het later opnieuw',
  timeout:'MC-Node reageerde niet op tijd',
  invalid_panel_response:'MC-Node gaf een onbekend API-antwoord',
  panel_unavailable:'MC-Node API tijdelijk onbereikbaar'
};
export async function GET(req){
  if(!requestAuthorized(req))return json({error:'Unauthorized'},401);
  if(!process.env.MCNODE_PANEL_URL||!process.env.MCNODE_CLIENT_API_KEY||!process.env.MCNODE_SERVER_ID) {
    return json({configured:false,connected:false,code:'not_configured'});
  }
  try {
    const info=await mcnodeOverview();
    return json(info);
  } catch(error) {
    const code=error instanceof McnodeError?error.code:'panel_unavailable';
    return json({configured:true,connected:false,code,
      error:labels[code]||labels.panel_unavailable},502);
  }
}
