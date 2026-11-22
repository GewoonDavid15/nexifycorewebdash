"use client";
import {useEffect,useState,useCallback,useMemo} from 'react';
import {analyzeHealth} from '../lib/health.js';

const TABS=[{id:'overview',label:'Overzicht',icon:'◫'},{id:'hosting',label:'MC-Node hosting',icon:'▣'},{id:'backups',label:'Back-ups & taken',icon:'▤'},{id:'activity',label:'Activiteit',icon:'◷'}];
const num=(v,places=0)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('nl-NL',{maximumFractionDigits:places,minimumFractionDigits:places}):'—';
const bytes=(v)=>typeof v==='number'&&Number.isFinite(v)?(v/1073741824).toLocaleString('nl-NL',{maximumFractionDigits:2})+' GB':'—';
const uptime=(v)=>typeof v==='number'&&v>=0?Math.floor(v/3600000)+'u '+Math.floor(v%3600000/60000)+'m':'—';
const dt=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('nl-NL',{dateStyle:'short',timeStyle:'short'});};
const time=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',second:'2-digit'});};
const labelForState=s=>({running:'Online',starting:'Start op',stopping:'Sluit af',offline:'Offline',unknown:'Onbekend'})[s]||'Onbekend';
const permissionLabel=s=>({available:'Beschikbaar',forbidden:'Geen rechten',unavailable:'Niet beschikbaar',not_found:'Niet gevonden',rate_limited:'Tijdelijk beperkt'})[s]||'Niet gecontroleerd';
function Icon({name,size=20}){
  const shared={width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true};
  const paths={
    server:<><rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h7M11 17h7"/></>,
    shield:<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    refresh:<><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a8 8 0 0 1 13-2l1.5 1M4 16l1.5 1A8 8 0 0 0 19 14"/></>,
    bolt:<><path d="m13 2-9 12h7l-1 8 10-12h-7z"/></>,
    chart:<><path d="M3 3v18h18"/><path d="m7 16 4-5 4 2 4-7"/></>,
    users:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    memory:<><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3"/></>,
    harddrive:<><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 14h.01M10 14h.01"/></>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    puzzle:<><path d="M20 13v7h-7v-4a2 2 0 0 0-4 0v4H4v-7h4a2 2 0 0 0 0-4H4V4h7v4a2 2 0 0 0 4 0V4h5v7h-4a2 2 0 0 0 0 4h4"/></>,
    archive:<><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/></>,
    list:<><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></>,
    link:<><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12.2 19"/></>,
    check:<path d="m5 12 4 4L19 6"/>,
    alert:<><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 17h.01"/></>,
    search:<><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
    chevron:<path d="m9 18 6-6-6-6"/>,
    copy:<><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>
  };
  return <svg {...shared}>{paths[name]||paths.server}</svg>;
}
function Status({good,children,muted=false}){return <span className={'status-chip '+(muted?'neutral':good?'ok':'down')}><span className="status-dot"/>{children}</span>}
function Metric({icon,label,value,unit,description,accent=false}){return <div className="metric"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon name={icon} size={19}/></span></div><div className="metric-value">{value==null?'—':value}{value!=null&&unit?<small>{unit}</small>:null}</div><div className={'metric-foot '+(accent?'good-text':'')}>{description||'Actuele meting'}</div></div>}
function Section({title,subtitle,children,action}){return <section className="panel"><div className="panel-heading"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>{children}</section>}
function Field({name,value,alert=false}){return <div className="detail-row"><span>{name}</span><strong className={alert?'warn-text':''}>{value==null?'—':value}</strong></div>}
function Bar({value,label}){return <div className="usage"><div className="usage-caption"><span>{label}</span><strong>{typeof value==='number'?num(value,1)+'%':'—'}</strong></div><div className="usage-track"><span className={typeof value==='number'&&value>=90?'critical':typeof value==='number'&&value>=75?'warning':''} style={{width:typeof value==='number'?Math.max(0,Math.min(100,value))+'%':'0%'}}/></div></div>}
function Chart({history}){if(!history?.length)return <div className="chart-empty">De grafiek verschijnt zodra nieuwe echte metingen binnenkomen.</div>;
  const points=history.map((h,i)=>{const x=history.length===1?0:i*100/(history.length-1);const y=100-Math.max(0,Math.min(20,h.tps??0))*5;return x+','+y;}).join(' ');
  return <div className="chart-wrap"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="TPS tijdens deze dashboardsessie"><path d="M0 25H100M0 50H100M0 75H100" stroke="currentColor" strokeOpacity=".12" strokeWidth=".6"/><polyline points={points} fill="none" stroke="#6ea6ff" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/></svg><div className="chart-axis"><span>Oudste meting</span><span>{history.length} metingen</span><span>Nu</span></div></div>}
export default function Dashboard({initialAuthorized}){
  const [authorized,setAuthorized]=useState(initialAuthorized),[password,setPassword]=useState(''),[code,setCode]=useState('');
  const [tab,setTab]=useState('overview'),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const [status,setStatus]=useState(null),[requests,setRequests]=useState([]),[mcnode,setMcnode]=useState(null),[audit,setAudit]=useState([]);
  const [refreshing,setRefreshing]=useState(false),[lastRefresh,setLastRefresh]=useState(null),[busy,setBusy]=useState(false);
  const [confirmBackup,setConfirmBackup]=useState(false),[pluginQuery,setPluginQuery]=useState(''),[history,setHistory]=useState([]);
  const [notice,setNotice]=useState(''),[hostError,setHostError]=useState(''),[cloudError,setCloudError]=useState('');
  const refresh=useCallback(async()=>{
    if(!authorized)return;
    setRefreshing(true);
    try{
      const [s,r,n,h,a]=await Promise.allSettled([
        fetch('/api/status',{cache:'no-store'}),
        fetch('/api/requests',{cache:'no-store'}),
        fetch('/api/mcnode/overview',{cache:'no-store'}),
        fetch('/api/history',{cache:'no-store'}),
        fetch('/api/audit',{cache:'no-store'})
      ]);
      const responses=[s,r,n,h,a].filter(x=>x.status==='fulfilled').map(x=>x.value);
      if(responses.some(x=>x.status===401)){
        setAuthorized(false);setStatus(null);setMcnode(null);setRequests([]);setAudit([]);return;
      }
      if(s.status==='fulfilled'&&s.value.ok){
        const data=await s.value.json();setStatus(data);setCloudError('');
        if(data?.online&&data.status?.received_at){
          setHistory(prev=>prev[prev.length-1]?.at===data.status.received_at?prev:[...prev,{at:data.status.received_at,tps:data.status.tps,mspt:data.status.mspt}].slice(-36));
        }
      }else setCloudError('De Cloud Bridge-opslag is momenteel niet bereikbaar.');
      if(r.status==='fulfilled'&&r.value.ok){
        const data=await r.value.json();setRequests(Array.isArray(data?.requests)?data.requests:[]);
      }
      if(a.status==='fulfilled'&&a.value.ok){
        const data=await a.value.json();setAudit(Array.isArray(data?.events)?data.events:[]);
      }
      if(h.status==='fulfilled'&&h.value.ok){
        const data=await h.value.json();
        if(Array.isArray(data.points)&&data.points.length)setHistory(data.points.slice(-288));
      }
      if(n.status==='fulfilled'){
        const data=await n.value.json().catch(()=>({configured:true,connected:false,code:'invalid_panel_response'}));
        setMcnode(data);setHostError(!n.value.ok?data.error||'MC-Node reageert momenteel niet.':'');
      }else setHostError('Het hostingpaneel kon niet worden gecontroleerd.');
      setLastRefresh(new Date());
    }catch{setError('Het verversen is mislukt. Probeer het opnieuw.');}
    finally{setRefreshing(false)}
  },[authorized]);
  useEffect(()=>{
    if(!authorized)return;
    refresh();
    const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh()},45000);
    return()=>clearInterval(timer);
  },[authorized,refresh]);
  async function login(e){
    e.preventDefault();setLoading(true);setError('');
    try{
      const res=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password,code})});
      const data=await res.json();if(!res.ok)throw new Error(data.error||'Inloggen is mislukt.');
      setAuthorized(true);setPassword('');setCode('');
    }catch(err){setError(err.message)}finally{setLoading(false)}
  }
  async function logout(){
    try{await fetch('/api/auth/logout',{method:'POST'})}finally{setAuthorized(false);setStatus(null);setMcnode(null);setRequests([]);setAudit([]);setHistory([]);setTab('overview')}
  }
  async function requestBackup(){
    setBusy(true);setConfirmBackup(false);setNotice('');setError('');
    try{
      const res=await fetch('/api/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'backup.now'})});
      const data=await res.json();if(!res.ok)throw new Error(data.error||'Back-upaanvraag mislukt');
      setNotice('Aanvraag aangemaakt. De Minecraft-console moet deze nog goedkeuren.');await refresh();
      setTab('backups');
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  async function requestDiagnostics(){
    setBusy(true);setNotice('');setError('');
    try{
      const res=await fetch('/api/requests',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'diagnostics.capture'})
      });
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Diagnoseaanvraag mislukt');
      setNotice('Diagnoseaanvraag verstuurd. De Minecraft-plugin verwerkt deze bij de volgende synchronisatie.');
      await refresh();setTab('activity');
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  async function copyDiagnostics(){
    const safe={
      generated_at:new Date().toISOString(),
      cloud_bridge:{
        connected:status?.online===true,
        last_heartbeat:status?.status?.received_at||null,
        plugin_version:status?.status?.plugin_version||null
      },
      mcnode:{
        configured:mcnode?.configured===true,
        connected:mcnode?.connected===true,
        error_code:mcnode?.code||null,
        server_state:mcnode?.state||null,
        plugin_access:mcnode?.pluginStatus||null,
        backups_access:mcnode?.backupStatus||null,
        schedules_access:mcnode?.scheduleStatus||null,
        activity_access:mcnode?.activityStatus||null
      },
      dashboard:{last_refresh:lastRefresh?.toISOString()||null}
    };
    try{
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(JSON.stringify(safe,null,2));
      setError('');setNotice('Veilige diagnose gekopieerd. Er staan geen API-sleutels of privébestanden in.');
    }catch{setError('Kopiëren is niet beschikbaar in deze browser.');}
  }
  const live=Boolean(status?.online&&status?.status);
  const game=status?.status||{};
  const [agentMajor,agentMinor]=String(game.plugin_version||'0.0').split('.').map(Number);
  const supportsDiagnostics=live&&agentMajor*100+agentMinor>=203;
  const lastDiagnostic=requests.find(x=>x.action==='diagnostics.capture'&&x.state==='completed'&&x.report);
  const pendingDiagnostic=requests.some(x=>x.action==='diagnostics.capture'&&x.state==='pending');
  const panelOnline=mcnode?.connected===true;
  const panelState=mcnode?.state||'unknown';
  const filteredPlugins=useMemo(()=>((mcnode?.plugins||[]).filter(x=>x?.name?.toLowerCase().includes(pluginQuery.trim().toLowerCase()))),[mcnode?.plugins,pluginQuery]);
  const health=live?((game.tps??20)<17?'Prestatie controleren':(game.mspt??0)>45?'Hoge tickbelasting':'Normale prestaties'):'Geen recente spelgegevens';
  const panelReady=mcnode?.configured===true;
  const healthAlerts=useMemo(()=>analyzeHealth(status,mcnode),[status,mcnode]);
  const onlineCount=game.players;
  const warnCount=[cloudError,hostError,!(panelReady),!(live)].filter(Boolean).length;
  return <div className="app-root">
    <div className="top-glow" aria-hidden="true"/>
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-icon"><Icon name="shield" size={23}/></span><div><b>NEXIFY<span className="brand-accent">.</span></b><small>MINECRAFT ENTERPRISE</small></div></div>
        {authorized?<div className="topbar-actions"><span className="topbar-secure"><Icon name="shield" size={15}/> Beveiligde sessie</span><button className="btn btn-quiet" onClick={logout}>Uitloggen</button></div>:<span className="topbar-secure"><Icon name="shield" size={15}/> Beveiligd beheer</span>}
      </header>
      {!authorized?
      <main className="login-layout">
        <div className="login-aside"><div className="eyebrow">NEXIFY CLOUD PLATFORM</div><h1>Jouw server.<br/><span>Alles in beeld.</span></h1><p>Een centrale beheeromgeving voor Minecraft-prestaties, MC-Node, back-ups en beveiliging.</p><div className="login-features"><div><Icon name="chart"/> Realtime prestatiedata</div><div><Icon name="shield"/> Wachtwoord + 2FA</div><div><Icon name="server"/> MC-Node hostingintegratie</div></div></div>
        <section className="login-box"><div className="eyebrow">BEHEERDERSPORTAAL</div><h2>Inloggen</h2><p>Gebruik het ingestelde wachtwoord en je actuele authenticatorcode.</p><form onSubmit={login}><label>Wachtwoord<input autoComplete="current-password" type="password" minLength={12} value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Vul je wachtwoord in"/></label><label>2FA-code<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} required placeholder="6 cijfers"/></label><button className="btn btn-primary" type="submit" disabled={loading}>{loading?'Aanmelden…':'Veilig inloggen'} <Icon name="chevron" size={17}/></button></form>{error&&<p className="notice error" role="alert">{error}</p>}<div className="login-help">Jouw wachtwoord is niet hetzelfde als de ingestelde wachtwoordhash in Vercel.</div></section>
      </main>:
      <div className="workspace">
        <div className="workspace-heading"><div><div className="eyebrow">NEXIFY CONTROL CENTER <span className="separator-dot">●</span> V2</div><h1>Serverbeheer</h1><p>Overzicht van je Minecraft-server en MC-Node-hosting.</p></div><div className="heading-actions"><div className="checked-at">Laatst gecontroleerd <strong>{lastRefresh?time(lastRefresh):'Nog niet'}</strong></div><button className="btn btn-primary" disabled={refreshing} onClick={refresh}><Icon name="refresh" size={17}/>{refreshing?'Controleren…':'Vernieuwen'}</button></div></div>
        <div className="connection-strip">
          <div className="connection-item"><Icon name="bolt" size={19}/><span>Cloud Bridge</span><Status good={live}>{live?'Verbonden':'Niet verbonden'}</Status></div>
          <div className="connection-item"><Icon name="server" size={19}/><span>MC-Node</span><Status good={panelOnline} muted={!panelReady}>{panelOnline?'Verbonden':!panelReady?'Niet ingesteld':'Niet bereikbaar'}</Status></div>
          <div className="connection-item"><Icon name="shield" size={19}/><span>Toegangsmodus</span><Status muted>Alleen-lezen</Status></div>
          <div className="connection-item strip-last"><Icon name="alert" size={18}/><span>{warnCount?'Controleer meldingen':'Geen opvallende meldingen'}</span></div>
        </div>
        <nav className="tabs" role="tablist" aria-label="Dashboardonderdelen">
          {TABS.map(item=><button key={item.id} role="tab" aria-selected={tab===item.id} className={'tab '+(tab===item.id?'selected':'')} onClick={()=>setTab(item.id)}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}
        </nav>
        <main className="dash-content">
          {notice&&<div className="notice success" role="status"><Icon name="check" size={18}/><span>{notice}</span><button aria-label="Melding sluiten" onClick={()=>setNotice('')}>×</button></div>}
          {error&&<div className="notice error" role="alert"><Icon name="alert" size={18}/>{error}<button aria-label="Melding sluiten" onClick={()=>setError('')}>×</button></div>}
          {tab==='overview'&&<>
            <div className="section-intro"><div><h2>Live-overzicht</h2><p>Echte metingen, bijgewerkt via je Minecraft-plugin.</p></div><Status good={live}>{live?'Live':'Geen recente heartbeat'}</Status></div>
            <div className="metrics-grid">
              <Metric icon="chart" label="Server TPS" value={live?num(game.tps,2):null} description={health} accent={live&&(game.tps??0)>=19}/>
              <Metric icon="bolt" label="MSPT" value={live?num(game.mspt,1):null} unit="ms" description="Tijd per server-tick"/>
              <Metric icon="users" label="Online spelers" value={live?num(onlineCount):null} description="Spelers op dit moment"/>
              <Metric icon="clock" label="Gemiddelde ping" value={live?num(game.ping_ms):null} unit="ms" description="Netwerkvertraging"/>
              <Metric icon="memory" label="Minecraft-geheugen" value={live?num(game.heap_used_mib):null} unit="MiB" description={live?('Maximaal '+num(game.heap_max_mib)+' MiB'):'Geen recente gegevens'}/>
              <Metric icon="server" label="Geladen chunks" value={live?num(game.chunks):null} description="Actieve wereldchunks"/>
              <Metric icon="clock" label="Plugin-uptime" value={live?uptime(game.uptime_seconds*1000):null} description="Tijd sinds NexifyStaff start"/>
              <Metric icon="users" label="Spelerslimiet" value={live?num(game.max_players):null} description="Maximale capaciteit"/>
            </div>
            <Section title="Gezondheid & aandachtspunten" subtitle="Automatische, uitlegbare waarschuwingen zonder zelfstandig ingrijpen.">
              {healthAlerts.length?<div className="alert-list">{healthAlerts.map((item,i)=><div className="health-alert" key={i}><Icon name="alert" size={18}/><div><strong>{item.title}</strong><p>{item.detail}</p></div></div>)}</div>:
                <p className="muted">Geen prestatieafwijkingen gevonden in de beschikbare metingen. Dit is geen volledige serverveiligheidscontrole.</p>}
            </Section>
            <div className="two-column">
              <Section title="Serverprestaties" subtitle="Anonieme TPS-metingen met maximaal 24 uur geschiedenis."><Chart history={history}/><div className="panel-note"><Icon name="clock" size={16}/> Laatste Minecraft-synchronisatie: {live?dt(game.received_at):'geen recente gegevens'}</div></Section>
              <Section title="Integraties" subtitle="Beschikbaarheid van onderdelen in je huidige opstelling."><Field name="NexifyStaff" value={live?game.plugin_version:'—'}/><Field name="NexifySecurity" value={!live?'Niet gecontroleerd':game.nexify_security?'Actief':'Niet gedetecteerd'}/><Field name="NexifyCrossplay" value={!live?'Niet gecontroleerd':game.nexify_crossplay?'Actief':'Niet gedetecteerd'}/><Field name="Opstartcontroles: kritisch" value={live&&typeof game.startup_high==='number'?num(game.startup_high):'Niet gemeten'}/><Field name="Opstartcontroles: waarschuwingen" value={live&&typeof game.startup_warnings==='number'?num(game.startup_warnings):'Niet gemeten'}/><Field name="Geyser / Bedrock" value={!live?'Niet gecontroleerd':game.geyser?'Gedetecteerd':'Niet gedetecteerd'}/><Field name="Floodgate" value={!live?'Niet gecontroleerd':game.floodgate?'Gedetecteerd':'Niet gedetecteerd'}/><Field name="Hostingstatus" value={panelOnline?labelForState(panelState):'Niet beschikbaar'}/><div className="panel-note"><Icon name="shield" size={16}/> Geen spelersnamen of wereldbestanden in de Cloud Bridge.</div></Section>
            </div>
            <Section title="Snelle acties" subtitle="Alle acties blijven beperkt en vereisen waar nodig goedkeuring in de Minecraft-console."><div className="action-grid"><div className="action-tile"><div className="action-icon"><Icon name="archive"/></div><div><h3>Back-up aanvragen</h3><p>Maak een aanvraag aan. Uitvoeren gebeurt pas na console-goedkeuring.</p></div><button className="btn btn-secondary" onClick={()=>setConfirmBackup(true)} disabled={!live||busy}>Aanvragen</button></div><div className="action-tile"><div className="action-icon"><Icon name="server"/></div><div><h3>Hosting bekijken</h3><p>Bekijk MC-Node-prestaties en je huidige plugins.</p></div><button className="btn btn-secondary" onClick={()=>setTab('hosting')}>Bekijken</button></div><div className="action-tile"><div className="action-icon"><Icon name="chart"/></div><div><h3>Serverdiagnose</h3><p>Vraag een veilig rapport op vanaf NexifyStaff 2.3.0.</p></div><button className="btn btn-secondary" onClick={requestDiagnostics} disabled={!supportsDiagnostics||busy}>Aanvragen</button></div></div></Section>
          </>}
          {tab==='hosting'&&<>
            <div className="section-intro"><div><h2>MC-Node hosting</h2><p>Servergegevens rechtstreeks uit de Pterodactyl Client API.</p></div><Status good={panelOnline} muted={!panelReady}>{panelOnline?'API bereikbaar':!panelReady?'Niet ingesteld':'Verbinding controleren'}</Status></div>
            {!panelOnline?<Section title="Verbindingsdiagnose" subtitle="De website blijft werken, ook als de hosting-API niet bereikbaar is."><div className="diagnostic"><Icon name="alert" size={24}/><div><h3>{!panelReady?'MC-Node-koppeling nog niet geconfigureerd':'Hostingpaneel geeft geen gegevens terug'}</h3><p>{mcnode?.error||hostError||'Controleer de veilige Vercel-instellingen en de API-rechten.'}</p><p className="hint">De verbinding gebruikt uitsluitend Vercel Environment Variables. Geen API-sleutel plakken in de browser.</p></div></div></Section>:<>
              <div className="hosting-grid">
                <Metric icon="server" label="Serverstatus" value={labelForState(panelState)} description={mcnode.name}/>
                <Metric icon="bolt" label="CPU-gebruik" value={num(mcnode.cpu,1)} unit="%" description={mcnode.cpuLimitPct?('Limiet '+num(mcnode.cpuLimitPct)+'%'):'Geen limiet opgegeven'}/>
                <Metric icon="clock" label="Uptime" value={uptime(mcnode.uptimeMs)} description="Sinds de laatste start"/>
              </div>
              <div className="two-column">
                <Section title="Geheugen" subtitle="Actueel RAM-verbruik bij MC-Node."><div className="large-meter">{bytes(mcnode.memoryBytes)}</div><Bar value={mcnode.memoryPercent} label="Gebruik van beschikbare RAM"/><p className="hint">Maximaal: {typeof mcnode.memoryLimitMiB==='number'?num(mcnode.memoryLimitMiB)+' MiB':'Niet bekend'}</p></Section>
                <Section title="Schijfruimte" subtitle="Opslag op je hostingserver."><div className="large-meter">{bytes(mcnode.diskBytes)}</div><Bar value={mcnode.diskPercent} label="Gebruik van beschikbare schijf"/><p className="hint">Maximaal: {typeof mcnode.diskLimitMiB==='number'?num(mcnode.diskLimitMiB)+' MiB':'Niet bekend'}</p></Section>
              </div>
              <Section title="Geïnstalleerde plugins" subtitle="Alleen .jar-bestandsnamen uit de plugins-map."><div className="plugin-header"><Status good={mcnode.pluginStatus==='available'} muted={mcnode.pluginStatus!=='available'}>{permissionLabel(mcnode.pluginStatus)}</Status><label className="search-box"><Icon name="search" size={17}/><input aria-label="Zoek plugins" placeholder="Zoek een plugin…" value={pluginQuery} onChange={e=>setPluginQuery(e.target.value)}/></label></div>{mcnode.pluginStatus!=='available'?<p className="muted">De pluginlijst is niet toegankelijk. Controleer de bestandsrechten van je MC-Node API-sleutel.</p>:filteredPlugins.length?<div className="plugin-list">{filteredPlugins.map(p=><div className="plugin-row" key={p.name}><Icon name="puzzle" size={17}/><span>{p.name}</span><small>{typeof p.size==='number'?(p.size/1048576).toFixed(2)+' MB':'—'}</small></div>)}</div>:<p className="muted">Geen overeenkomende plugins gevonden.</p>}</Section>
            </>}
          </>}
          {tab==='backups'&&<>
            <div className="section-intro"><div><h2>Back-ups & planning</h2><p>Back-upaanvragen en bestaande hostingback-ups op één plek.</p></div><button className="btn btn-primary" disabled={!live||busy} onClick={()=>setConfirmBackup(true)}><Icon name="archive" size={17}/>Back-up aanvragen</button></div>
            <div className="two-column">
              <Section title="Hostingback-ups" subtitle="Alleen metadata, geen herstel of verwijdering."><div className="panel-note"><Icon name="shield" size={16}/> Back-ups op dezelfde hosting zijn niet altijd veilig bij herinstallatie. Gebruik ook externe opslag.</div>{mcnode?.backupStatus!=='available'?<p className="muted">Hostingback-ups: {permissionLabel(mcnode?.backupStatus)}.</p>:mcnode?.backups?.length?<div className="record-list">{mcnode.backups.map((b,i)=><div className="record" key={i}><span className="record-icon"><Icon name="archive" size={18}/></span><div className="record-copy"><strong>{b.name}</strong><small>{dt(b.createdAt)} · {bytes(b.size)}</small></div><Status good={b.successful===true} muted={b.successful===null}>{b.successful===true?'Voltooid':b.successful===false?'Niet gelukt':'Bezig'}</Status></div>)}</div>:<p className="muted">Geen hostingback-ups gevonden.</p>}</Section>
              <Section title="Geplande taken" subtitle="Planning zoals opgeslagen in MC-Node.">{mcnode?.scheduleStatus!=='available'?<p className="muted">Planning: {permissionLabel(mcnode?.scheduleStatus)}.</p>:mcnode?.schedules?.length?<div className="record-list">{mcnode.schedules.map((s,i)=><div className="record" key={i}><span className="record-icon"><Icon name="clock" size={18}/></span><div className="record-copy"><strong>{s.name}</strong><small>Volgende: {dt(s.nextRunAt)}</small></div><Status good={s.active} muted={!s.active}>{s.active?'Actief':'Inactief'}</Status></div>)}</div>:<p className="muted">Er zijn geen geplande taken gevonden.</p>}</Section>
            </div>
            <Section title="Cloud Bridge-aanvragen" subtitle="Aanvragen via dit dashboard; de echte serverconsole beslist over uitvoering.">{requests.length?<div className="record-list">{requests.map(x=><div className="record" key={x.id}><span className="record-icon"><Icon name="archive" size={18}/></span><div className="record-copy"><strong>{x.action==='diagnostics.capture'?'Diagnoseaanvraag':'Back-upaanvraag'}</strong><small>{dt(x.created_at)}</small></div><span className="small-pill">{x.state==='pending'?'Wacht op server':x.state==='awaiting_console'?'Console-goedkeuring #'+x.local_id:x.state==='expired'?'Verlopen':x.state==='completed'?'Voltooid':x.state||'Onbekend'}</span></div>)}</div>:<p className="muted">Nog geen aanvragen via het dashboard.</p>}<div className="panel-note"><Icon name="alert" size={16}/> Bij console-goedkeuring gebruik je <code>ncontrol approve &lt;nummer&gt;</code>.</div></Section>
          </>}
          {tab==='activity'&&<>
            <div className="section-intro"><div><h2>Activiteit & controles</h2><p>Inzichten in de hostingactiviteit en betrouwbaarheid van de koppelingen.</p></div><button className="btn btn-secondary" onClick={copyDiagnostics}><Icon name="copy" size={16}/> Kopieer diagnose</button></div>
            <Section title="Minecraft-diagnose op aanvraag" subtitle="Lees prestatie- en modulediagnostiek uit NexifyStaff 2.3 of nieuwer. Er worden geen spelersidentiteiten of serverbestanden verstuurd.">
              <div className="action-tile"><div className="action-icon"><Icon name="chart"/></div><div><h3>Veilige diagnostiek</h3><p>{supportsDiagnostics?'De nieuwe agent ondersteunt dit rapport.':live?'Installeer eerst NexifyStaff 2.3.0.':'Wacht op een actuele Cloud Bridge-synchronisatie.'}</p></div><button className="btn btn-secondary" disabled={!supportsDiagnostics||busy||pendingDiagnostic} onClick={requestDiagnostics}>{pendingDiagnostic?'In behandeling':busy?'Bezig…':'Diagnose aanvragen'}</button></div>
              {lastDiagnostic?<div className="diagnostic-fields"><Field name="Rapport gemaakt" value={dt(lastDiagnostic.completed_at)}/><Field name="Agentversie" value={lastDiagnostic.report.plugin_version||'—'}/><Field name="TPS" value={num(lastDiagnostic.report.tps,2)}/><Field name="MSPT" value={num(lastDiagnostic.report.mspt,1)+' ms'}/><Field name="Java-versie" value={num(lastDiagnostic.report.java_major)}/><Field name="Kritieke opstartcontroles" value={num(lastDiagnostic.report.startup_high)}/><Field name="Opstartwaarschuwingen" value={num(lastDiagnostic.report.startup_warnings)}/><Field name="Plugin-uptime" value={uptime(lastDiagnostic.report.uptime_seconds*1000)}/><Field name="NexifySecurity" value={lastDiagnostic.report.nexify_security?'Actief':'Niet actief'}/><Field name="NexifyCrossplay" value={lastDiagnostic.report.nexify_crossplay?'Actief':'Niet actief'}/></div>:<p className="muted">Nog geen voltooid diagnoserapport ontvangen.</p>}
            </Section>
            <Section title="Beheeractiviteiten" subtitle="Aanvragen en resultaten. Geen IP-adressen, wachtwoorden of spelersgegevens.">
              {audit.length?<div className="record-list">{audit.slice(0,25).map((item,i)=><div className="record" key={item.request_id+item.state+i}><span className="record-icon"><Icon name="list" size={18}/></span><div className="record-copy"><strong>{item.action==='backup.now'?'Back-up':'Diagnose'} · {item.state==='queued'?'Aangevraagd':item.state==='awaiting_console'?'Wacht op console':item.state==='completed'?'Afgerond':item.state==='expired'?'Verlopen':item.state==='rejected'?'Afgewezen':item.state}</strong><small>{dt(item.at)} · {item.source==='dashboard'?'Dashboard':'Minecraft-agent'}</small></div></div>)}</div>:
                <p className="muted">Er zijn nog geen beheeractiviteiten vastgelegd. Nieuwe aanvragen worden hier getoond.</p>}
              <p className="hint">Dit is een beperkt operationeel logboek, geen onveranderbaar juridisch auditregister. Bewaartermijn maximaal 30 dagen.</p>
            </Section>
            <div className="two-column">
              <Section title="Recente hostingactiviteit" subtitle="Gebeurtenistypen zonder gevoelige metadata.">{mcnode?.activityStatus!=='available'?<p className="muted">Activiteitslog: {permissionLabel(mcnode?.activityStatus)}.</p>:mcnode?.activity?.length?<div className="record-list">{mcnode.activity.map((a,i)=><div className="record" key={i}><span className="record-icon"><Icon name="list" size={18}/></span><div className="record-copy"><strong>{a.event}</strong><small>{dt(a.createdAt)}</small></div></div>)}</div>:<p className="muted">Nog geen hostingactiviteit gevonden.</p>}</Section>
              <Section title="Verbindingscontrole" subtitle="Wat het dashboard daadwerkelijk kan bevestigen."><Field name="Minecraft heartbeat" value={live?'Actueel':'Geen recente gegevens'}/><Field name="MC-Node API" value={panelOnline?'Bereikbaar':mcnode?.error||'Niet bereikbaar'}/><Field name="Pluginlijst" value={permissionLabel(mcnode?.pluginStatus)}/><Field name="Back-upoverzicht" value={permissionLabel(mcnode?.backupStatus)}/><Field name="Takenoverzicht" value={permissionLabel(mcnode?.scheduleStatus)}/><Field name="Activiteitslog" value={permissionLabel(mcnode?.activityStatus)}/><div className="panel-note"><Icon name="shield" size={16}/> Status alleen gebaseerd op echte API-antwoorden. Geen automatische consoleacties of bestandsschrijvingen.</div></Section>
            </div>
          </>}
          {cloudError&&<div className="notice warning" role="status"><Icon name="alert" size={18}/>{cloudError}</div>}
        </main>
        <footer className="app-footer"><span>Nexify Enterprise · Cloud Control</span><span><Icon name="shield" size={14}/> API-toegang beveiligd · Hosting alleen-lezen</span></footer>
      </div>}
    </div>
    {confirmBackup&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setConfirmBackup(false)}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="backup-title"><div className="modal-icon"><Icon name="archive" size={26}/></div><h2 id="backup-title">Back-up aanvragen?</h2><p>Deze actie maakt alleen een aanvraag aan. De Minecraft-server start pas een back-up nadat je die handmatig goedkeurt in de MC-Node-console.</p><div className="modal-actions"><button className="btn btn-quiet" onClick={()=>setConfirmBackup(false)}>Annuleren</button><button className="btn btn-primary" disabled={busy} onClick={requestBackup}>Aanvraag versturen</button></div></div></div>}
  </div>;
}
