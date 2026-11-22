# Nexify Cloud Dashboard — GitHub + Vercel

Dit project is de **eerste functionele Cloud Bridge-prototype** voor Nexify Minecraft Enterprise v1.9.0. Je kunt het als normale GitHub-repository naar Vercel deployen.

## Wat werkt

- HTTPS-ontvangst van uitsluitend beperkte, geanonimiseerde Minecraft-prestatiemetingen.
- Een beveiligd dashboard met wachtwoord, TOTP/2FA, beveiligde sessiecookies en inlogbeperking.
- Live serverstatus via periodieke synchronisatie (geen inkomende webpoort op MC-Node nodig).
- Een **back-up aanvragen**-actie. De Minecraft-plugin slaat de aanvraag idempotent op in SQLite. Alleen de **echte MC-Node-console** kan met `ncontrol approve <nummer>` de back-up daadwerkelijk starten.
- Opslag van heartbeat en aanvragen in Upstash Redis; geen afhankelijkheid van tijdelijke Vercel-bestanden.
- Tests met `npm test`.

De webversie is een **prototype** en géén volledige vervanger van alle eerdere lokale Control Center-functies. Staffaccounts, wereldherstel, bestandsdownloads en algemene commando-uitvoering zijn bewust niet over het internet aangesloten.

## Benodigdheden

- GitHub-repository voor deze map.
- Vercel-project (Next.js). Vercel maakt automatisch een HTTPS-webadres.
- Je bestaande Vercel KV/Upstash Redis-database met REST API. Er is geen tweede database nodig.
- Node.js 20.9 of hoger om lokaal de geheime waarden te genereren.
- Nexify v1.9.0 Cloud Bridge-plugin op MC-Node, naast Paper 26.3 en Java 25.

## Installatie van het webdashboard

1. Pak deze map uit, maak een **privé GitHub-repository** en upload alleen de code. Upload geen `.env`, tokens, database of backups.
2. Installeer lokaal: `npm install`.
3. Maak je geheimen lokaal: `npm run generate-secrets`. Kies een lang, uniek wachtwoord. Dit toont waarden voor `AGENT_SECRET`, `SESSION_SECRET`, `DASHBOARD_PASSWORD_HASH` en `DASHBOARD_TOTP_SECRET`. **Plak ze nooit in GitHub of in een chat.**
4. Voeg de `DASHBOARD_TOTP_SECRET` als handmatige TOTP-sleutel toe aan je authenticator-app (6 cijfers, 30 seconden).
5. Hergebruik de bestaande Vercel KV-integratie. De app gebruikt automatisch `KV_REST_API_URL` en `KV_REST_API_TOKEN`; handmatige `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` blijven ook mogelijk.
6. Ga naar Vercel → Add New Project → Import GitHub-repository → Framework Next.js.
7. Controleer in Vercel → Settings → Environment Variables dat de vier dashboardgeheimen en de bestaande Vercel KV-variabelen beschikbaar zijn voor Production. Deel nooit een token in GitHub of een chat.
8. Deploy het project. Je ontvangt een adres als `https://jouw-nexify.vercel.app`.
9. Vul **dezelfde `AGENT_SECRET`** op MC-Node in via een environment variable, of bij gebrek aan die mogelijkheid privé in de Nexify-pluginconfiguratie (zie de hoofdhandleiding).
10. Open je Vercel-URL en log in met het gekozen wachtwoord en een actuele 2FA-code.

**Let op:** als je een Vercel preview-URL gebruikt, moet die bereikbaar zijn voor de MC-Node-plugin. Een Deployment Protection-login kan de agent blokkeren. Voor een stabiel eindadres gebruik je de production-domain.

## Veiligheidsmodel

- Dashboard-API's eisen een geldige, HMAC-ondertekende, `HttpOnly` + `Secure` sessiecookie.
- Inloggen vereist een scrypt-wachtwoordhash en TOTP; codes worden tijdelijk tegen hergebruik beschermd.
- Server-agent gebruikt een afzonderlijke, willekeurige `AGENT_SECRET` in de `Authorization`-header.
- De Minecraft-agent gebruikt uitsluitend uitgaande HTTPS; geen RCON, geen remote shell, geen direct wereldherstel.
- De webactie `backup.now` blijft een *voorstel*. Het lokale SQLite-register houdt een externe aanvraag-ID vast zodat opnieuw ophalen niet steeds een nieuwe aanvraag maakt.
- Het dashboard slaat **geen spelersnamen, UUID's, IP-adressen, wachtwoorden, tokens of wereldbestanden** op.
- Vercel Functions zijn stateless. Redis is noodzakelijk voor het bewaren van status en aanvragen. Dit is **geen externe wereldback-upopslag**.

## Serverstatus

De server synchroniseert standaard elke 30 seconden. Na 2 minuten zonder nieuwe heartbeat toont de website de server als offline. De centrale Redis-status vervalt na 150 seconden. Lag en ping worden niet beïnvloed door een extra webpoort; een nul-ping-garantie bestaat niet.

## Lokaal testen

`npm test` test authenticatie en de API-synchronisatie met een gesimuleerde Redis-server. De productiebuild wordt bij elke GitHub-deployment op Vercel getest via `npm run build` (eerst `npm test`, daarna `next build`).

## Bestaande gratis Redis-database hergebruiken

Nexify heeft **geen tweede database** nodig. De code gebruikt rechtstreeks `KV_REST_API_URL` en `KV_REST_API_TOKEN` die Vercel bij een bestaande Upstash/KV-integratie beschikbaar maakt. Als deze ontbreken, werken de bestaande handmatige `UPSTASH_REDIS_REST_URL` en `UPSTASH_REDIS_REST_TOKEN` ook. Nexify slaat gegevens op met het voorvoegsel `nexify:cloud:main:v1:` zodat de keys van andere projecten niet worden overschreven. Wel deelt de app de gebruikslimieten van dezelfde database.

De code hoort in GitHub; databasegeheimen blijven uitsluitend in Vercel Environment Variables. Na een nieuwe deployment moet de MC-Node Cloud Bridge dezelfde agent-secret gebruiken als de server-side Vercel-configuratie. De broncode is een prototype; houd de Minecraft-server eerst beschermd en maak back-ups.

## MC-Node-paneel (optionele alleen-lezen koppeling)

Dit project bevat een nieuwe `/api/mcnode/overview`-route om het Pterodactyl-clientpaneel uit te lezen. De route is alleen toegankelijk na dashboardlogin (wachtwoord + 2FA). De MC-Node-api-key gaat nooit naar de browser en wordt niet in Redis opgeslagen.

Maak **geen tweede Redis-database**, deze koppeling gebruikt gewoon de bestaande dashboardconfiguratie.

Zet via **Vercel → nexifycorewebdash → Settings → Environment Variables** de volgende **drie beveiligde productievariabelen**. Voeg de echte sleutel uitsluitend in de Vercel-interface toe, nooit in GitHub, een chat of een broncodebestand:

| Naam | Wat erin moet |
| --- | --- |
| `MCNODE_PANEL_URL` | Het eigenlijke HTTPS-adres van je MC-Node-gamepaneel, zonder extra pad (bijv. `https://panel.voorbeeld.nl`) |
| `MCNODE_CLIENT_API_KEY` | Een nieuwe **Pterodactyl Client API**-sleutel (begint met `ptlc_`). Gebruik geen Application/Admin API-key |
| `MCNODE_SERVER_ID` | De Pterodactyl-serveridentifier van de gewenste server (bijv. `abcd1234`), **niet** het IP-adres of poortnummer |

De sleutel maak je aan binnen MC-Node → gamepaneel → accountprofiel → API Credentials. Indien mogelijk gebruik je een speciaal account met alleen de benodigde serverrechten. Gebruik in Vercel het type **Encrypted/Sensitive** en target **Production**. Voer daarna een nieuwe Vercel-deployment uit.

Dit overzicht toont de servernaam, aan/uit-status, CPU-, RAM- en schijfgebruik, uptime en beschikbare plugin-JAR-bestandsnamen. De pluginlijst kan ontbreken als de sleutel geen toegang tot bestanden heeft. De server-, resource- en file-list-aanroepen zijn allemaal **GET** (alleen lezen).

**Deze website geeft ChatGPT niet automatisch toegang tot het MC-Node-paneel.** Voor acties op verzoek vanuit een chat is daarnaast een ondersteunde, door jou gekoppelde tool/connector of een browser-workflow met jouw toestemming nodig. Voeg geen openbare write-endpoints, remote shell of onbeperkte console-opdrachten toe. Acties als server herstarten en bestanden aanpassen vragen afzonderlijke autorisatie en controles.

Er is **geen nieuwe Minecraft-JAR nodig** voor het Pterodactyl-overzicht: deze leest de MC-Node Client API rechtstreeks vanuit Vercel. De bestaande Cloud Bridge blijft apart verantwoordelijk voor Minecraft-prestaties en back-upaanvragen. Het overzicht is voorlopig experimenteel en niet met een echte MC-Node-account getest.


## Nexify Enterprise Control Center 0.2 — november 2026

Het dashboard is vernieuwd met vier onderdelen:

- **Overzicht:** TPS, MSPT, spelers, Minecraft-geheugen, ping, chunks, een TPS-grafiek op basis van echte sessiemetingen en status van Cloud Bridge/Geyser/Floodgate.
- **MC-Node hosting:** resourcegebruik, serverstatus, uptime, RAM- en schijflimieten, pluginlijst en zoekveld. De Client API wordt uitsluitend vanuit de server-side Vercel-functie benaderd.
- **Back-ups & taken:** bestaande hostingback-ups en schedules alleen-lezen, daarnaast een beperkt Cloud Bridge-back-upverzoek met expliciete bevestiging en console-goedkeuring. Twee back-upverzoeken binnen 60 seconden worden afgewezen met een Redis-cooldown.
- **Activiteit:** hostinggebeurtenissen zonder gevoelige metadata, status van optionele API-rechten, en een knop om een **veilige diagnose zonder secrets** te kopiëren.

**Teststatus bij deze update:** 30 geautomatiseerde tests geslaagd en Next.js-productiebuild op Vercel READY. Dat bevestigt het bouwen en de mocks, niet dat Minecraft momenteel een live heartbeat verstuurt of MC-Node werkelijk bereikbaar is. Test dit vanuit het ingelogde dashboard.

### Beveiligings- en onderhoudsverbeteringen

- Next.js **16.4.6** en React / React DOM **19.2.9** vastgezet; deze versies bevatten actuele beveiligingsupdates.
- Extra browserheaders voor framebescherming, no-sniff, HSTS en basis-CSP.
- Dashboard geeft zoekmachines de instructie niet te indexeren.
- `.gitignore` sluit lokale `.env`-bestanden, certificaten en buildoutput uit.
- Externe Google Fonts-aanvraag weggehaald uit de privébeheeromgeving.
- Een willekeurig falende sessietest is hersteld zodat CI betrouwbaarder is.

**Let op:** het dashboard kan geen server verwijderen, bestanden aanpassen, consolecommando's uitvoeren of back-ups herstellen. Daarvoor is een afzonderlijke geautoriseerde connector nodig met expliciete toestemming en auditlog. Houd de Pterodactyl Client API-sleutel server-side. Roteer eerder gedeelde inlog- en API-secrets zonder ze in GitHub of een chat te plaatsen. Een geslaagde Vercel-deployment is niet automatisch bewijs van een werkende ChatGPT↔MC-Node-koppeling.


## Nexify Enterprise — Cloud Protocol 2.0 (uitbreiding)

De volgende webfuncties zijn toegevoegd:

- **Op aanvraag diagnostiek** via de strikte actielijst `diagnostics.capture`, verwerkt door NexifyStaff **2.3.0** op Minecraft. Rapportages bevatten uitsluitend allowlisted anonieme prestatiewaarden. Ze worden met agentsleutel ingediend bij `/api/agent/report` en zichtbaar in **Activiteit**.
- **Historische prestatiegrafiek** via `/api/history`: maximaal één anoniem datapunt per vijf minuten en maximaal 288 punten, opgeslagen in je **bestaande** Redis-database.
- **Gezondheidswaarschuwingen** voor lage TPS, hoge MSPT en bijna vol geheugen/opslag, zonder automatische serveringrepen.
- **Lokale Codex MCP-koppeling** (`tools/mcnode-mcp`) met vijf read-only MC-Node-tools; dit is een apart te installeren hulpmiddel voor Codex CLI/IDE en geeft ChatGPT niet automatisch toegang.
- Extra regressietests voor agentauthenticatie, diagnoseprivacy, back-upcooldown, MCP-toolvergunningen, gezondheid en historische gegevens.

Documenten:
- `docs/CLOUD_PROTOCOL_V2.md`: exacte allowlist en API-contract.
- `docs/MINECRAFT_2_RELEASE.md`: experimentele Minecraft-JAR, checksums en veilige stagingupdate.
- `docs/ENTERPRISE_3_ROADMAP.md`: omvangrijke roadmap en heldere status per onderdeel.
- `tools/mcnode-mcp/README.md`: Codex MCP lokaal installeren zonder API-sleutels in git.

**Status:** de laatste gecontroleerde Vercel-builds hadden 30 geslaagde tests. De volledige Minecraft 2.0-broncode is apart als ZIP gebouwd en staat nog niet in deze webrepository; de live MC-Node Java25-server is niet aangepast. De remote diagnosefunctie kan pas antwoorden wanneer NexifyStaff 2.3.0 daadwerkelijk draait en de geroteerde Cloud Bridge-sleutel klopt. Er is geen betaalde Redis-database toegevoegd.


## Nexify Minecraft 2.0.1 en verdere beheeruitbreidingen

De webapp is bijgewerkt voor de nieuwe **NexifyStaff 2.4.0**-diagnostiek: naast TPS/MSPT kan de plugin na een veilige lokale opstartcontrole alleen de aantallen `startup_high` en `startup_warnings` doorgeven. Het dashboard toont bij problemen een waarschuwing, zonder serveracties uit te voeren.

In deze versie vervallen niet-opgepakte Cloud Bridge-opdrachten na **20 minuten** (ze blijven met status `expired` zichtbaar), is er een privé **Beheeractiviteiten**-overzicht, worden oude prestatiegegevens gefilterd na **24 uur** en auditregels na **30 dagen**, en zijn er extra tests. Voor Codex zijn er read-only MCP-tools en een GitHub Actions PR-/handmatige CI-workflow.

De experimentele Minecraft 2.0.1-release en checksums staan beschreven in `docs/MINECRAFT_2_0_1_RELEASE.md`; de volledige Java-broncode zit nog apart in het ChatGPT-releasearchief, **niet** in deze publieke GitHub-webrepository. Installatie op een MC-Node-productieserver is **niet uitgevoerd**.

Laatst geverifieerde Vercel-build: **43 tests geslaagd, 0 fouten, deployment READY**. De Minecraft Java25-test op MC-Node, werkelijke hosting-API-bereikbaarheid en volledige ChatGPT-connector zijn nog niet geverifieerd.


## Systeemcontrole — beveiligde configuratiecheck

Nieuw dashboardtabblad **Systeemcontrole** met een sessieafgeschermde API op `/api/system/readiness`. Controleert of scrypt-login, TOTP, de dashboard-sessiesleutel, Cloud Bridge, de bestaande Redis-database en optionele MC-Node-koppeling correct zijn ingesteld. De Redis-verbinding wordt met een echte PING getest; het statusoverzicht toont uitsluitend veilige labels en booleans, **nooit geheime waarden**. De gebruiker ziet het vervaltijdstip van de huidige sessie en kan op het eigen apparaat uitloggen.

**Belangrijk:** `Ingesteld` betekent niet automatisch live verbonden met de Minecraft-JAR. Er bestaan nog geen individuele webaccounts of uitgebreide rollenrechten. Lees `docs/SECURITY_READINESS.md` en de bijbehorende nieuwe GitHub Issue #3 voor de veilige migratieaanpak.


## Enterprise 3.0 — voorbereiding multi-account en rollen
Het dashboard bevat nu onder **Systeemcontrole** een read-only rollenoverzicht: Viewer, Operator, Administrator en Eigenaar. De toekomstige autorisaties zijn vastgelegd in `lib/rbac.js`; onbekende of gevaarlijke serveracties worden geweigerd.

Er is ook een afzonderlijk **niet-geactiveerd** accountmodel en sessiesysteem voorbereid: individuele tokenintrekking, SHA256-gehashte Redis-sleutels, zes uur maximale sessieduur en blokkering na accountschorsing of rolwijziging. Dit verandert niets aan je bestaande inlogscherm of Minecraft-server en creëert geen gebruikersaccounts.

**Nog niet klaar:** echte accountregistratie, persoonlijke 2FA, gebruikersbeheer, server-side RBAC op alle bestaande API-routes en de veilige owner-migratie. Zie `docs/RBAC_FOUNDATION.md` en GitHub Issue #3. Nieuwe geheimen zijn niet nodig en er wordt geen tweede Redis-database aangemaakt.
