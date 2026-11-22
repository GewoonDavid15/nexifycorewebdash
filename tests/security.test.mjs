import test from 'node:test';
import assert from 'node:assert/strict';
import {passwordHash,verifyPassword,makeSession,isSession,validTotp,same} from '../lib/security.js';
import {createHmac} from 'node:crypto';
test('password hashing and mismatch',()=>{const h=passwordHash('a-strong-password-111');assert.ok(verifyPassword('a-strong-password-111',h));assert.ok(!verifyPassword('bad-password-222',h));});
test('session signature and expiry',()=>{process.env.SESSION_SECRET='example-test-secret-with-more-than-32-characters';const t=makeSession(1763000000000);assert.ok(isSession(t,1763000000001));assert.ok(!isSession(t,1763000000000+22000000));assert.ok(!isSession(t.slice(0,-1)+'a',1763000000001));});
test('constant compare',()=>{assert.ok(same('abc','abc'));assert.ok(!same('abc','ab'));});
test('TOTP known RFC6238 SHA1 vector at 59s',()=>{
 // RFC6238 8-digit value 94287082 -> last six digits 287082.
 const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 assert.equal(validTotp('287082',secret,59000),1);
 assert.equal(validTotp('000000',secret,59000),null);
});
