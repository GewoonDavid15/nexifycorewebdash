import {requestAuthorized,json} from '../../../../lib/security.js';
import {rolesPreview,PERMISSIONS,UNSUPPORTED_ACTIONS} from '../../../../lib/rbac.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';

// This is an administrator-only PREVIEW. Account invitations and login
// migration deliberately have no exposed production endpoints yet.
export async function GET(req) {
  if(!requestAuthorized(req))return json({error:'Unauthorized'},401);
  return json({
    mode:'preview',
    enabled:false,
    legacy_login_preserved:true,
    roles:rolesPreview(),
    available_permissions:[...PERMISSIONS],
    unsupported_actions:[...UNSUPPORTED_ACTIONS],
    note:'Dit rollenmodel is voorbereid maar nog niet actief. Er zijn geen nieuwe gebruikersaccounts aangemaakt.'
  });
}
