#!/usr/bin/env node
// Read-only integrity check for the separately distributed experimental Minecraft release.
// This does NOT install, unzip, or execute any user-provided JAR/ZIP.
import {createReadStream} from 'node:fs';
import {stat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,basename,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

export const artifacts=Object.freeze({
  'Nexify-server-v2.0.1-StartupChecks-EXPERIMENTAL.jar':'2e9446d31d4c4f2ea27020e9581b7ace68a97e8d20d0a4b5d3df27b344c50403',
  'NexifyStaff-v2.4.0.jar':'ff8873c0a3ddddaa9c2976622e73c828ca85d7f154a325064e76eb8ba8181253',
  'NexifySecurity-v1.0.0.jar':'1e75e944f0ac6f4db587829e3a154436143d18d2d6e5910aad957acc29aff344',
  'NexifyCrossplay-v1.0.0.jar':'d9e9a509401f257f3b400aa9e2b2e90201dfd0affbbc87bdb739d7d94c2653f7',
  'Nexify-Minecraft-Enterprise-2.0.1-StartupChecks-source.zip':'7258b69f295997957b58aacc0caf0ea3df2f0b022edc779399ffa3812c5c440c'
});

export async function sha256File(path){
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(path))hash.update(chunk);
  return hash.digest('hex');
}

export async function verifyArtifacts(folder, manifest=artifacts){
  const root=await realpath(resolve(folder));
  const results=[];
  for(const [filename,expected] of Object.entries(manifest)){
    if(basename(filename)!==filename || filename==='.' || filename==='..' ||
      !/^[A-Za-z0-9._-]+$/.test(filename)||!/^[0-9a-f]{64}$/.test(expected))
      throw new Error('Ongeldige manifestvermelding');
    const candidate=join(root,filename);
    try{
      const resolved=await realpath(candidate);
      // Do not follow symlinks to files outside the intended release directory.
      if(!resolved.startsWith(root+sep))throw new Error('Bestand buiten de gekozen map');
      const info=await stat(resolved);
      if(!info.isFile())throw new Error('Geen normaal bestand');
      const actual=await sha256File(resolved);
      results.push({filename,ok:actual===expected,status:actual===expected?'correct':'hash_mismatch'});
    }catch(error){
      results.push({filename,ok:false,status:error?.code==='ENOENT'?'missing':'unreadable'});
    }
  }
  return {ok:results.every(item=>item.ok),results};
}

async function main(){
  const folder=process.argv[2];
  if(!folder || process.argv.length!==3){
    console.error('Gebruik: node scripts/verify-minecraft-artifacts.mjs <map-met-uitgepakte-releasebestanden>');
    process.exitCode=2;return;
  }
  try{
    const report=await verifyArtifacts(folder);
    for(const item of report.results)console.log((item.ok?'PASS':'FAIL')+' '+item.filename+' ('+item.status+')');
    console.log(report.ok?'Alle vijf hashes komen overeen. Dit bewijst geen runtimecompatibiliteit.':'Release is niet volledig of heeft gewijzigde bestanden.');
    if(!report.ok)process.exitCode=1;
  }catch(error){console.error('Controle mislukt: '+error.message);process.exitCode=2;}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
