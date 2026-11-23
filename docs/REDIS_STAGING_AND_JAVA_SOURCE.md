# Nexify Enterprise — REST-storingen, staging en Java-broncode (23 november 2026)

## Redis-adapter: betrouwbaarheid

`lib/redis.js` maakt onderscheid tussen ontbrekende configuratie, HTTP-authenticatie, limieten, onbereikbare provider, timeout, slechte JSON en geweigerde commands. De code logt geen externe URL, response body of API-token. Schrijfacties met onbekende uitkomst worden **niet automatisch herhaald** na een timeout. De API-gebruiker ontvangt voorlopig dezelfde neutrale HTTP 503; detailcodes zijn uitsluitend intern voor verdere diagnose.

## Upstash-compatibiliteit

Volgens de officiële Upstash REST-documentatie accepteert het endpoint JSON-arrays met Redis commands in exacte argumentvolgorde. Daardoor volgt `['EVAL', script, numberOfKeys, ...keys, ...args]` het gedocumenteerde Redis command-formaat. `tests/redis-rest-resilience.test.mjs` controleert deze requestvorming en simuleert foutsituaties.

**Let op:** dit bewijst niet dat de echte, al bestaande productiedatabase EVAL-rechten heeft, de vereiste providerinstellingen accepteert of bereikbaar is.

Voor een echte providerspecifieke test bevat `scripts/probe-staging-upstash.mjs` een afzonderlijke handmatig te starten controle. Die gebruikt uitsluitend:

- `NEXIFY_STAGING_REDIS_REST_URL`
- `NEXIFY_STAGING_REDIS_REST_TOKEN`
- `NEXIFY_STAGING_PROBE_CONFIRM=YES`

Het script weigert impliciete productievariabelen. Het maakt slechts één tijdelijk genamespaced testrecord (TTL 120 seconden) en verwijdert alleen datzelfde record indien de inhoud overeenkomt. Geen scan, flush, wereldwijziging of bulkbewerking. Gebruik deze controle **alleen op een afzonderlijke stagingdatabase** en nooit met productiecredentials.

## Java-broncode

Het oorspronkelijke projectarchief `Nexify-Minecraft-Enterprise-2.0.1-StartupChecks-source.zip` uit de eerdere ChatGPT-sessie is teruggevonden en met checksum gecontroleerd:

`7258b69f295997957b58aacc0caf0ea3df2f0b022edc779399ffa3812c5c440c`

Een afzonderlijke **private GitHub-repository** is gewenst voor deze Java-code, met NexifyStaff, NexifySecurity, NexifyCrossplay en de Paperclip-wrapper. De webrepository blijft exclusief voor Next.js. Plaats geen originele Paper-JAR of bestaande werelden in GitHub.

De repo-klare Java-sourcebundel bevat een extra veiligheidswrapper, broncodecontroles, een onafhankelijke CI-workflow en manifest-hashes. Er is **geen nieuwe GitHub-repository aangemaakt**, aangezien de aangesloten GitHub-tool alleen bestaande repositories kan bewerken.

## Java-build en installatie

De scripts vereisen de originele Paper 26.3 build 257 JAR als lokale input en javac 21 voor de bestaande compilation-hack; de uiteindelijke server heeft Java 25 nodig. De wrapper voorkomt stilzwijgend overschrijven en schrijft de inputhash en uitgaande JAR-hashes naar `build-manifest.json`. Nog geen bit-voor-bit reproduceerbare build claim: outputdatums en compilerbuild zijn niet volledig genormaliseerd.

De oude experimentele JAR is in deze ronde **niet** vervangen of opnieuw gebouwd. Zonder het originele Paper-artefact en een veilige Java 25-stagingomgeving kan dat niet verantwoord bevestigd worden.

## Vereist voor merge/productie

1. GitHub CI op de **laatste** commit geslaagd (tests, tijdelijke Redis 7, Next.js-build, secretscan).
2. Handmatige Upstash REST-stagingtest en negatieve fouttests met uitsluitend stagingcredentials.
3. Java-source importeren in een nieuwe private repo; echte Paper 26.3 inputchecksum vastleggen, build uitvoeren en checksum vergelijken.
4. Stagingserver met Java 25 + volledige externe back-up van wereld, plugins en SQLite.
5. Expliciete goedkeuring voordat een oude productie-JAR of plugin wordt vervangen.

De huidige MC-Node-host, werelden, plugins en Vercel-productie zijn ongewijzigd.
