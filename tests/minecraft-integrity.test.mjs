import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyArtifacts,artifacts} from '../scripts/verify-minecraft-artifacts.mjs';

test('release manifest specifies five known versioned artifacts and valid SHA-256 values',()=>{
  assert.equal(Object.keys(artifacts).length,5);
  for(const [filename,hash] of Object.entries(artifacts)){
    assert.match(filename,/^(Nexify[-A-Za-z0-9.]+)\.(jar|zip)$/);
    assert.match(hash,/^[a-f0-9]{64}$/);
  }
});

test('integrity validation recognizes matches, modifications and missing files',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'nexify-release-'));
  const name='example.jar',content='known test fixture';
  const expected=createHash('sha256').update(content).digest('hex');
  try{
    await writeFile(join(folder,name),content);
    assert.equal((await verifyArtifacts(folder,{[name]:expected})).ok,true);
    await writeFile(join(folder,name),'tampered');
    const altered=await verifyArtifacts(folder,{[name]:expected});
    assert.equal(altered.ok,false);
    assert.equal(altered.results[0].status,'hash_mismatch');
    const missing=await verifyArtifacts(folder,{'missing.jar':expected});
    assert.equal(missing.results[0].status,'missing');
  }finally{await rm(folder,{recursive:true,force:true});}
});

test('manifest rejects traversal and invalid expected hashes',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'nexify-release-'));
  try{
    await assert.rejects(verifyArtifacts(folder,{'../outside.jar':'a'.repeat(64)}));
    await assert.rejects(verifyArtifacts(folder,{'good.jar':'not-a-hash'}));
  }finally{await rm(folder,{recursive:true,force:true});}
});
