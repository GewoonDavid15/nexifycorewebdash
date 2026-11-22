import {randomUUID} from 'node:crypto';
import {knownRole} from './rbac.js';

const USERNAME=/^[a-z][a-z0-9_-]{2,31}$/;
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function normalizeUsername(input){
  const normalized=typeof input==='string'?input.trim().toLowerCase():'';
  return USERNAME.test(normalized)?normalized:null;
}

export function validAccount(value){
  return Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&
    typeof value.id==='string'&&ID.test(value.id)&&
    normalizeUsername(value.username)===value.username&&
    knownRole(value.role)&&
    ['invited','active','suspended'].includes(value.status)&&
    Number.isSafeInteger(value.session_version)&&value.session_version>=0);
}

export function createInvitedAccount({username,role='viewer',createdBy}={}){
  const name=normalizeUsername(username);
  // Owner cannot be provisioned by a normal web invitation.
  if(!name||!['viewer','operator','administrator'].includes(role)||
     typeof createdBy!=='string'||!ID.test(createdBy))
    throw new Error('Invalid account invitation');
  return {
    id:randomUUID(),username:name,role,status:'invited',
    session_version:0,created_at:new Date().toISOString(),
    created_by:createdBy,mfa_enrolled:false
  };
}

export function publicAccount(value){
  if(!validAccount(value))return null;
  return {id:value.id,username:value.username,role:value.role,status:value.status,
    mfa_enrolled:value.mfa_enrolled===true,created_at:
      typeof value.created_at==='string'?value.created_at:null};
}

export function suspendAccount(account){
  if(!validAccount(account)||account.role==='owner')throw new Error('Cannot suspend owner');
  return {...account,status:'suspended',session_version:account.session_version+1};
}

/**
 * Roles cannot change silently and existing sessions are invalidated.
 * The caller must separately verify the actor via a live owner session.
 */
export function changeDelegatedRole(account,targetRole){
  if(!validAccount(account)||account.role==='owner'||
    !['viewer','operator','administrator'].includes(targetRole))
    throw new Error('Role change not allowed');
  if(account.role===targetRole)return {...account};
  return {...account,role:targetRole,session_version:account.session_version+1};
}
