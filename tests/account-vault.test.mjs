import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {generateTotpSecret,sealTotpSecret,unsealTotpSecret} from '../lib/account-vault.js';

const one='11111111-1111-4111-8111-111111111111';
const two='22222222-2222-4222-8222-222222222222';
const env=()=>({NEXIFY_ACCOUNT_VAULT_KEY:randomBytes(32).toString('base64url')});

test('future TOTP provisioning uses cryptographically random Base32 secrets',()=>{
  const a=generateTotpSecret(),b=generateTotpSecret();
  assert.match(a,/^[A-Z2-7]{32}$/);
  assert.match(b,/^[A-Z2-7]{32}$/);
  assert.notEqual(a,b);
});

test('AES-256-GCM secret is encrypted, authenticated and bound to account ID',()=>{
  const config=env(),secret=generateTotpSecret();
  const oneSeal=sealTotpSecret({accountId:one,secret,env:config});
  const otherSeal=sealTotpSecret({accountId:one,secret,env:config});
  assert.notEqual(oneSeal,otherSeal,'Random IV must change ciphertext');
  assert.ok(oneSeal.startsWith('v1.'));
  assert.ok(!oneSeal.includes(secret));
  assert.equal(unsealTotpSecret({accountId:one,sealed:oneSeal,env:config}),secret);
  assert.throws(()=>unsealTotpSecret({accountId:two,sealed:oneSeal,env:config}),
    /Cannot unlock/,'Ciphertext must not be usable for a different account');
});

test('tampered ciphertext or authentication tag cannot be decrypted',()=>{
  const config=env(),secret=generateTotpSecret();
  const sealed=sealTotpSecret({accountId:one,secret,env:config});
  const p=sealed.split('.');
  const mutate=(v)=>v.slice(0,-1)+(v.endsWith('A')?'B':'A');
  assert.throws(()=>unsealTotpSecret({accountId:one,sealed:[p[0],p[1],mutate(p[2]),p[3]].join('.'),env:config}),/Cannot unlock/);
  assert.throws(()=>unsealTotpSecret({accountId:one,sealed:[p[0],p[1],p[2],mutate(p[3])].join('.'),env:config}),/Cannot unlock/);
  assert.throws(()=>unsealTotpSecret({accountId:one,sealed:'v2.'+p.slice(1).join('.'),env:config}),/Cannot unlock/);
});

test('the vault fails closed if its dedicated key is absent or rotated',()=>{
  const config=env(),sealed=sealTotpSecret({accountId:one,secret:generateTotpSecret(),env:config});
  assert.throws(()=>sealTotpSecret({accountId:one,secret:generateTotpSecret(),env:{}}),/vault not configured/);
  assert.throws(()=>unsealTotpSecret({accountId:one,sealed,env:env()}),/Cannot unlock/);
  assert.throws(()=>unsealTotpSecret({accountId:one,sealed,env:{}}),/vault not configured/);
});

test('invalid account IDs and short secrets are rejected before persistence',()=>{
  const config=env();
  assert.throws(()=>sealTotpSecret({accountId:'../../other',secret:generateTotpSecret(),env:config}),/Invalid account/);
  assert.throws(()=>sealTotpSecret({accountId:one,secret:'123456',env:config}),/Invalid authenticator secret/);
  assert.throws(()=>unsealTotpSecret({accountId:one,sealed:'invalid',env:config}),/Cannot unlock/);
});
