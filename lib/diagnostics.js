// A fixed allowlist prevents agent reports from disclosing player identities,
// world names, IP addresses, filesystem paths or secret configuration.
const numericKeys=[
  'uptime_seconds','max_players','java_major','tps','mspt',
  'heap_used_mib','heap_max_mib','players','ping_ms','chunks','cpu_pct'
];
const booleanKeys=['geyser','floodgate','nexify_security','nexify_crossplay'];

export function sanitizeDiagnostics(value) {
  if(!value || typeof value!=='object' || Array.isArray(value))return null;
  const safe={};
  for(const key of numericKeys) {
    const v=value[key];
    if(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<1e9)safe[key]=v;
  }
  for(const key of booleanKeys)if(typeof value[key]==='boolean')safe[key]=value[key];
  if(typeof value.plugin_version==='string'&&/^[A-Za-z0-9._-]{1,30}$/.test(value.plugin_version))
    safe.plugin_version=value.plugin_version;
  return Object.keys(safe).length?safe:null;
}
