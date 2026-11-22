import {randomBytes} from 'node:crypto';
import {createInterface} from 'node:readline';
import {passwordHash} from '../lib/security.js';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(bytes){let out='',bits=0,value=0;for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-=5))&31];value&=(1<<bits)-1;}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out;}
const reader=createInterface({input:process.stdin,output:process.stdout});
console.log('Alleen lokaal uitvoeren. Deel deze geheimen nooit in GitHub, screenshots of chat.');
reader.question('Kies een sterk dashboardwachtwoord (minimaal 12 tekens): ',password=>{
  if(password.length<12){console.error('Wachtwoord te kort');process.exitCode=1;reader.close();return;}
  const totp=base32(randomBytes(20));
  console.log('\nStel de volgende waarden in onder Vercel Environment Variables:');
  console.log('AGENT_SECRET='+randomBytes(32).toString('hex'));
  console.log('SESSION_SECRET='+randomBytes(32).toString('hex'));
  console.log('DASHBOARD_PASSWORD_HASH='+passwordHash(password));
  console.log('DASHBOARD_TOTP_SECRET='+totp);
  console.log('\nVoeg deze TOTP-sleutel handmatig toe aan je authenticator-app.');
  console.log('Maak hem NOOIT openbaar en bewaar een veilige kopie.');
  reader.close();
});
