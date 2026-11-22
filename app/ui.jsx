"use client";
import {useEffect,useState,useCallback} from 'react';
function Metric({label,value,unit}){return <div className="metric"><div className="muted">{label}</div><strong>{value==null?'—':value}{value!=null&&unit?<small>{unit}</small>:null}</strong></div>}
function format(v,digits=1){return typeof v==='number' ? v.toFixed(digits) : null}
function storage(bytes){return typeof bytes==='number'? (bytes/1024/1024/1024).toFixed(2)+' GB':'—'}
function uptime(ms){if(typeof ms!=='number')return '—';const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000);return h+'u '+m+'m'}
export default function Dashboard({initialAuthorized}){
  const [authorized,setAuthorized]=useState(initialAuthorized);const [password,setPassword]=useState('');const [code,setCode]=useState('');
  const [error,setError]=useState('');const [loading,setLoading]=useState(false);const [status,setStatus]=useState(null);const [requests,setRequests]=useState([]);const [busy,setBusy]=useState(false);const [mcnode,setMcnode]=useState(null);
  const refresh=useCallback(async()=>{
    if(!authorized)return;
    try{
      const [s,r,n]=await Promise.all([fetch('/api/status',{cache:'no-store'}),fetch('/api/requests',{cache:'no-store'}),fetch('/api/mcnode/overview',{cache:'no-store'})]);
      if(s.status===401||r.status===401){setAuthorized(false);return;}
      if(!s.ok||!r.ok)throw new Error('De API is tijdelijk niet bereikbaar.');
      setStatus(await s.json());setRequests((await r.json()).requests||[]);setMcnode(await n.json().catch(()=>({configured:true,connected:false,error:'MC-Node API tijdelijk niet bereikbaar'})));setError('');
    }catch(e){setError(e.message)}
  },[authorized]);
  useEffect(()=>{refresh();if(!authorized)return;const t=setInterval(refresh,15000);return()=>clearInterval(t)},[authorized,refresh]);
  async function login(e){e.preventDefault();setLoading(true);setError('');try{
    const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password,code})});
    const d=await r.json();if(!r.ok)throw new Error(d.error||'Inloggen mislukt');
    setAuthorized(true);setPassword('');setCode('');
  }catch(e){setError(e.message)}finally{setLoading(false)}}
  async function logout(){await fetch('/api/auth/logout',{method:'POST'});setAuthorized(false);setStatus(null);setMcnode(null)}
  async function backup(){setBusy(true);try{
    const r=await fetch('/api/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'backup.now'})});
    const d=await r.json();if(!r.ok)throw new Error(d.error||'Aanvraag mislukt');await refresh();
  }catch(e){setError(e.message)}finally{setBusy(false)}}
  return <main className="shell">
    <header><div className="brand"><span className="mark">N</span><div><b>NEXIFY</b><span>Enterprise Control</span></div></div>{authorized&&<button className="ghost" onClick={logout}>Uitloggen</button>}</header>
    {!authorized?<section className="login"><div className="kicker">VEILIGE CLOUDTOEGANG</div><h1>Welkom bij Nexify.</h1><p>Log in met je beheerderswachtwoord en de code uit je authenticator-app.</p><form onSubmit={login}><label>Wachtwoord<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required /></label><label>2FA-code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={code} onChange={e=>setCode(e.target.value)} required /></label><button type="submit" disabled={loading}>{loading?'Bezig…':'Inloggen'}</button></form>{error&&<p className="err" role="alert">{error}</p>}</section>:
    <><section className="hero"><div><div className="kicker">MINECRAFT SERVERBEHEER</div><h1>Serveroverzicht</h1><p>Live gegevens vanuit de Nexify-plugin via een versleutelde uitgaande verbinding.</p></div><span className={'status '+(status?.online?'good':'bad')}>{status?.online?'● Verbonden':'● Offline of nog niet gekoppeld'}</span></section>
      <div className="metrics"><Metric label="TPS" value={format(status?.status?.tps,2)}/><Metric label="MSPT" value={format(status?.status?.mspt,2)} unit="ms"/><Metric label="Online spelers" value={status?.status?.players}/><Metric label="Gemiddelde ping" value={status?.status?.ping_ms} unit="ms"/><Metric label="Geheugen gebruikt" value={status?.status?.heap_used_mib} unit="MiB"/><Metric label="Geladen chunks" value={status?.status?.chunks}/></div>
      <div className="columns"><section className="panel"><h2>Integraties</h2><div className="line"><span>Geyser (Bedrock)</span><strong>{status?.status?.geyser?'Gedetecteerd':'Niet gedetecteerd'}</strong></div><div className="line"><span>Floodgate</span><strong>{status?.status?.floodgate?'Gedetecteerd':'Niet gedetecteerd'}</strong></div><div className="line"><span>NexifyStaff</span><strong>{status?.status?.plugin_version||'—'}</strong></div><div className="line"><span>Laatste synchronisatie</span><strong>{status?.status?.received_at?new Date(status.status.received_at).toLocaleTimeString('nl-NL'):'—'}</strong></div><p className="hint">Er worden geen spelersnamen, IP-adressen, UUID's of wereldbestanden verstuurd.</p></section>
      <section className="panel"><h2>Beheeracties</h2><p className="muted">Een back-up aanvragen kan vanuit de browser. Uitvoering vereist altijd je goedkeuring in de MC-Node-console.</p><button onClick={backup} disabled={busy||!status?.online}>{busy?'Aanvraag versturen…':'Back-up aanvragen'}</button><p className="hint">Bevestig daarna met <code>ncontrol approve &lt;id&gt;</code></p></section></div>
      <section className="panel mcnode"><div className="mcnode-heading"><div><div className="kicker">EXTRA BEHEERVERBINDING</div><h2>MC-Node hosting</h2></div><span className={'status '+(mcnode?.connected?'good':'bad')}>{mcnode?.connected?'● Verbonden':mcnode?.configured?'● Niet bereikbaar':'● Niet ingesteld'}</span></div>
      {!mcnode?.configured?<p className="muted">Koppel de MC-Node Client API via beveiligde Vercel-variabelen om serverstatus en plugins te bekijken. Je Minecraft-server blijft normaal werken.</p>:
       !mcnode.connected?<p className="muted">{mcnode.error||'Het paneel is nog niet bereikbaar. Controleer de URL, server-ID en API-rechten.'}</p>:
       <><div className="line"><span>Server</span><strong>{mcnode.name}</strong></div>
         <div className="line"><span>Status</span><strong>{mcnode.state}</strong></div>
         <div className="line"><span>CPU</span><strong>{format(mcnode.cpu,1)||'—'}%</strong></div>
         <div className="line"><span>RAM</span><strong>{storage(mcnode.memoryBytes)}</strong></div>
         <div className="line"><span>Schijfgebruik</span><strong>{storage(mcnode.diskBytes)}</strong></div>
         <div className="line"><span>Uptime</span><strong>{uptime(mcnode.uptimeMs)}</strong></div>
         <h3>Plugins {mcnode.pluginStatus==='available'?('('+mcnode.plugins.length+')'):''}</h3>
         {mcnode.pluginStatus!=='available'?<p className="muted">Pluginlijst niet beschikbaar. Controleer de API-rechten.</p>:
           mcnode.plugins.length?<ul className="plugins">{mcnode.plugins.map(p=><li key={p.name}>{p.name}</li>)}</ul>:
           <p className="muted">Geen .jar-bestanden in de pluginmap gevonden.</p>}
       </>}
      <p className="hint">Voorlopig alleen-lezen. Geen serverherstarts, consolecommando's of bestandswijzigingen via dit scherm.</p>
      </section>
      <section className="panel"><h2>Recente aanvragen</h2>{requests.length?<div className="reqs">{requests.map(x=><div className="line" key={x.id}><div><b>Back-up</b><small>{new Date(x.created_at).toLocaleString('nl-NL')}</small></div><div className="pill">{x.state==='pending'?'Nog niet opgehaald':x.state==='awaiting_console'?`Console-goedkeuring #${x.local_id}`:x.state}</div></div>)}</div>:<p className="muted">Er zijn nog geen aanvragen.</p>}</section>
      {error&&<p role="alert" className="err">{error}</p>}<footer>Cloud Bridge prototype · MC-Node API alleen-lezen · geen openbare webpoort of automatische herstelacties</footer>
    </>}
  </main>;
}
