/**
 * Nexify Enterprise — role policy for the future multi-account login.
 *
 * Staged foundation only: the current single-owner authentication remains
 * unchanged. The authorization table is NEVER derived from browser input.
 */
export const ROLE_ORDER=Object.freeze(['viewer','operator','administrator','owner']);

export const PERMISSIONS=Object.freeze([
  'dashboard.read',
  'hosting.read',
  'performance.read',
  'operations.read',
  'system.read',
  'diagnostics.request',
  'backup.request',
  'staff.read',
  'staff.manage',
  'accounts.invite',
  'accounts.suspend',
  'accounts.manage',
  'settings.manage'
]);

const allowed={
  viewer:['dashboard.read','hosting.read','performance.read','operations.read','system.read'],
  operator:['dashboard.read','hosting.read','performance.read','operations.read','system.read',
    'diagnostics.request','backup.request'],
  administrator:['dashboard.read','hosting.read','performance.read','operations.read','system.read',
    'diagnostics.request','backup.request','staff.read','staff.manage','accounts.invite','accounts.suspend'],
  owner:[...PERMISSIONS]
};
const grants=Object.fromEntries(ROLE_ORDER.map(role=>[role,Object.freeze([...allowed[role]])]));
export const ROLE_GRANTS=Object.freeze(grants);

// Not exposed in a web/AI connector, including to the owner role.
export const UNSUPPORTED_ACTIONS=Object.freeze([
  'console.execute','files.write','server.power','server.reinstall','world.restore','backup.delete','secrets.export'
]);

export const ROLE_DESCRIPTIONS=Object.freeze({
  viewer:'Kan de status en rapportages bekijken, maar niets aanvragen of aanpassen.',
  operator:'Kan daarnaast een diagnose of console-goedgekeurde back-up aanvragen.',
  administrator:'Kan later ook staff beheren en accounts uitnodigen, zonder eigenaarsrechten.',
  owner:'Beheert toegangsrechten en instellingen; kritieke serveracties blijven apart beveiligd.'
});

export function knownRole(role){return typeof role==='string'&&Object.hasOwn(grants,role);}
export function hasPermission(role,action){
  return knownRole(role)&&typeof action==='string'&&PERMISSIONS.includes(action)&&grants[role].includes(action);
}
export function permissionsFor(role){
  return knownRole(role)?[...grants[role]]:[];
}

/**
 * Future account changes require a current owner, target != actor, and
 * a delegated role below owner. Owner transfers require a separate
 * supervised, out-of-band recovery flow.
 */
export function mayChangeRole({actorRole,actorId,targetId,targetRole,currentRole}={}){
  return actorRole==='owner'&&typeof actorId==='string'&&actorId.length>0&&
    typeof targetId==='string'&&targetId.length>0&&actorId!==targetId&&
    ['viewer','operator','administrator'].includes(targetRole)&&
    ['viewer','operator','administrator'].includes(currentRole);
}
export function rolesPreview(){
  return ROLE_ORDER.map((role,index)=>({
    key:role,label:role==='viewer'?'Viewer':role==='operator'?'Operator':role==='administrator'?'Administrator':'Eigenaar',
    description:ROLE_DESCRIPTIONS[role],
    permissions:permissionsFor(role),
    level:index
  }));
}
