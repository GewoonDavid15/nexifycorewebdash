# Codex-overdracht — Nexify Minecraft Enterprise

**Stand van zaken:** 22 november 2026. Dit document is een **samenvatting van eerdere afspraken**, niet de volledige ChatGPT-chat of een garantie dat alle functies live werken. Het is bedoeld om dezelfde technische context beschikbaar te maken voor Codex in een nieuwe taaksessie. Geen geheimen zijn opgenomen.

## 1. Wat de gebruiker wil
- Een eigen **Nexify Minecraft Enterprise**-omgeving beheren, ontwikkeld vanuit Next Solutions/Nexify.
- Een professionele Nederlandstalige webomgeving op Vercel, versiebeheer via GitHub, en een Minecraft-server op **MC-Node**.
- **Codex** gebruiken om de website verder te ontwikkelen **én** de gemaakte afspraken uit de eerdere ChatGPT-samenwerking behouden.
- De gebruiker wil AI expliciet taken laten uitvoeren **op verzoek**, dus niet alleen via knoppen in een dashboard. Het dashboard mag daarnaast zelf een beheeromgeving worden.
- Geen verplicht nieuw Redis-account/database of betaald abonnement: **één bestaande KV/Upstash Redis-database wordt gedeeld**, met geïsoleerde Nexify-sleutels.
- Zo min mogelijk tussentijdse handmatige testvragen; implementeer features samenhangend en test automatisch, maar vraag toestemming voor onomkeerbare live acties.
- Behoud bestaande werelden en plugins; **niet opnieuw installeren of overschrijven zonder akkoord**.

## 2. Huidige infrastructuur (eerder bevestigd)
| Onderdeel | Status / technische context |
| --- | --- |
| GitHub | `GewoonDavid15/nexifycorewebdash` (momenteel **publieke** repository) |
| Vercel | Project `nexifycorewebdash`, Next.js / Node.js |
| Website | `https://nexifycorewebdash.vercel.app` |
| Database | Reeds gekoppelde Vercel KV / Upstash Redis via `KV_REST_API_URL` en `KV_REST_API_TOKEN`; geen tweede database |
| Hosting | MC-Node met Pterodactyl Client API; configuratie alleen via Vercel env vars |
| Minecraft | Paper 26.3, Java 25, circa 8 GB RAM, 10–30 spelers, survival |
| Minecraft-serverbestand | Eigen bundel `Nexify-server-v1.9.0-CloudBridge-EXPERIMENTAL.jar`; **niet aanwezig in deze webrepository** |
| Ingebouwde pluginversies in die bundel | NexifyStaff v2.2.0, NexifySecurity v1.0.0, NexifyCrossplay v1.0.0 |
| Bedrock | Geyser/Floodgate apart te installeren; NexifyCrossplay diagnosticeert, maar is geen Geyser-vervanger |

Bij een eerdere live MC-Node-start op Java 25 laadden alle drie Nexify-plugins succesvol. In die log stond ook dat Cloud Bridge werd uitgeschakeld wegens een ontbrekend/ongeldig agent-token. Dit is geen bewijs dat Cloud Bridge inmiddels verbonden is. De lokale dashboard-HTTP-server was afzonderlijk uitgeschakeld; de cloudarchitectuur heeft geen inkomende Minecraft-webpoort nodig.

## 3. Werkende, in deze repository aanwezige software
- **Login:** `lib/security.js`, scrypt-wachtwoordhash, TOTP/2FA, ondertekende secure session cookie, login-rate-limits.
- **Cloud Bridge:** `/api/agent/sync` ontvangt geauthenticeerde statusmetingen van de Minecraft-plugin en retourneert hoogstens de ingeschakelde allowlist-actie `backup.now`; `/api/agent/ack` registreert een ontvangstbevestiging.
- **Serveroverzicht:** `/api/status` leest de heartbeat uit Redis. Het dashboard toont TPS, MSPT, spelersaantal, RAM, ping, Geyser/Floodgate-status en aangevraagde back-ups.
- **Backup-aanvraag:** `/api/requests` maakt een geauthenticeerde, beperkte aanvraag aan; de Minecraft-plugin vereist nog **echte console-goedkeuring** via `ncontrol approve <id>` voordat een lokale back-up gestart wordt.
- **Bestaande Redis:** `lib/redis.js` gebruikt `UPSTASH_REDIS_REST_*` of `KV_REST_API_*`. Alle projectkeys beginnen met `nexify:cloud:main:v1:`.
- **MC-Node read-only overzicht:** `lib/mcnode.js` gebruikt server-side `MCNODE_PANEL_URL`, `MCNODE_CLIENT_API_KEY` en `MCNODE_SERVER_ID`; alleen Pterodactyl GET-verzoeken voor info, resources en pluginbestandsnamen. `/api/mcnode/overview` vereist login.
- **Tests:** `npm test`; `npm run build` voert eerst tests uit. Laatst bevestigde Vercel-build: 22 tests geslaagd en productiebuild READY. Volledige live MC-Node API-bereikbaarheid is **nog niet bevestigd**.

## 4. Actuele beveiligings- en bevoegdheidsgrenzen
- De gebruiker heeft eerder secrets, waaronder een MC-Node Client API-key, in de chat gedeeld. Neem **nooit** originele of vervangende waarden over in code, docs, issues, PR's of prompts. **Rotatie is dringend aan te raden.**
- Het feit dat de MC-Node-key server-side op Vercel is ingesteld, geeft Codex of ChatGPT **niet** automatisch tooltoegang tot MC-Node. Een aparte, expliciet door de gebruiker geautoriseerde connector/MCP-tool is vereist voor werkelijke serveracties vanuit een AI-gesprek.
- Behoud het huidige alleen-lezen MC-Node-profiel totdat expliciete functies met rollen/rechten, auditlogging en bevestigingsstappen zijn ontworpen en getest.
- Geen onbeperkte consolecommando's, arbitraire bestandsschrijfoperaties of massale acties; werk met een nauwe allowlist en waar nodig afzonderlijke approval per actie.
- Gebruik geen Pterodactyl Application/API Admin-token. De bestaande Client API-sleutel kan reeds brede rechten hebben: beperk waar mogelijk via account- of gebruikersrechten.
- Externe, **blijvende backups buiten de MC-Node-servermap** zijn noodzakelijk: lokaal opgeslagen snapshots kunnen verdwijnen na MC-Node Reinstall.
- Deel de `AGENT_SECRET` veilig via hostingconfiguratie; nooit in de browser, publieke GitHub-code of onbeschermde logs.

## 5. Grootste openstaande punten / prioriteitsvolgorde
1. **Integratiediagnose:** verifieer na door de gebruiker geautoriseerde setup de MC-Node Client API-status en de juiste paneel-URL. Toon onderscheid tussen niet geconfigureerd, token ongeldig, geen rechten en hosting onbereikbaar, zonder secrets te loggen.
2. **Minecraft ↔ Cloud Bridge:** bevestig dat Vercel en Minecraft dezelfde **geroteerde** agentsleutel gebruiken; verifieer heartbeat, offline/online-status en backup-goedkeuringspad end-to-end. Geen live backups starten zonder toestemming.
3. **AI-op-verzoek architectuur:** ontwerp een aparte geautoriseerde MCP-server/connector met expliciete, nauw begrensde tools zoals `get_server_status`, `get_recent_logs`, `list_plugins`, `request_backup`. Begin read-only. Voeg write-acties pas toe met least privilege, auditlog en concrete gebruikersgoedkeuring.
4. **Dashboard uitbreiden:** duidelijke status, logs, staffrollen, sanctiehistorie, performance, backups en beheerfuncties; koppel nooit een ongefilterde serverconsole aan een publieke API.
5. **Externe backup/restore:** bied betrouwbaar herstel na MC-Node Reinstall; test restore alleen op een veilige testomgeving en bewaar bestaande werelden.
6. **Minecraft JAR-source onderscheiden:** vraag alleen om de zelfstandige Minecraft-projectbroncode wanneer echt nodig; bouw niet willekeurig Paper-engine- of pluginfunctionaliteit na in de Next.js-repo.
7. **Bedrock:** Geyser/Floodgate via ondersteunde MC-Node-installer; controleer aparte Bedrock-poort, geen misleidende claim dat NexifyCrossplay al Bedrock enabled.
8. **Onderhoud:** CI tests, security review, observability, resourceverbruik, revisie/rollback, duidelijke NL-gebruikersdocumentatie.

## 6. Aanpak voor Codex
- Begin iedere taak met `AGENTS.md` en deze overdracht. Inspecteer de echte repositorycode en bevestig eventuele afwijkingen; ga niet alleen op een oude samenvatting af.
- Start met `npm test` en zo nodig `npm run build`. Maak kleine samenhangende wijzigingen en voeg regressietests toe.
- Maak onderscheid tussen **code geschreven**, **tests geslaagd**, **Vercel deployed** en **MC-Node live getest**.
- Beheer wijzigingen liefst via een GitHub pull request zodat de gebruiker live effecten kan beoordelen.
- Stuur geen geheime waarden in de Codex-taakprompt. De environment variables horen in de instellingen van Vercel of een daartoe geschikte geheime opslag.

## 7. Eerste opdracht om in Codex te plakken

> Lees AGENTS.md en docs/CODEX_HANDOFF.md. Neem dit bestaande Nexify Enterprise-dashboard over. Inspecteer en test de huidige Next.js-app en API. Verifieer dat de MC-Node-integratie alleen-lezen is, dat bestaande Redis KV keys ongewijzigd blijven, en dat secrets nergens uitlekken. Doe eerst een veiligheids- en compatibiliteitsreview, maak daarna een concreet implementatieplan voor een geautoriseerde AI-op-verzoek-MC-Node-connector (MCP) en de uitbreidingen van het dashboard. Bouw alleen de veilige read-only basis met tests. Doe geen destructieve live acties of productiecredentiaalrotatie zonder expliciet verzoek. Geef je resultaat en openstaande stappen in normaal Nederlands.


## Bijgewerkt na Control Center 0.2

Op 22 november 2026 is de Next.js-webomgeving in dezelfde repository grondig vernieuwd. De tabbladen zijn **Overzicht**, **MC-Node hosting**, **Back-ups & taken** en **Activiteit**. De interface bevat een grafiek met **echte** TPS-metingen, MC-Node RAM- en schijfmeters, een doorzoekbare pluginlijst, alleen-lezen back-up- en schedulemetadata, activiteitsgebeurtenissen en diagnose die zonder secrets kan worden gekopieerd. Maak niet de fout deze browserfuncties voor een live Minecraft- of ChatGPT-toolverbinding te houden.

De bestaande Cloud Bridge-back-upaanvraag heeft een browserbevestiging én een Redis-cooldown van 60 seconden. Echte uitvoering blijft achter handmatige Minecraft-console-goedkeuring. Bij een extern opslagprobleem kunnen aanvragen mislukken; wijs de gebruiker daarop, voer geen ongecontroleerde herhalingen uit.

De website gebruikt vastgepinde Next.js 16.4.6 en React 19.2.9, extra security headers, robots noindex en geüpdatete Git-ignore-regels. De laatst geverifieerde Vercel-build van deze code passeerde 22 tests en meldde READY; online MC-Node API-bereikbaarheid en de Minecraft heartbeat zijn **niet** extern bevestigd.

**Nieuwe prioriteiten voor Codex:** behoud alle vier tabbladen; verbeter backenddiagnoses, rolgebaseerde toegang en observability zonder originele secrets te zien of op te slaan. Ontwerp een afzonderlijke connector voor ChatGPT-op-verzoek. Voeg nooit een willekeurige console-, schrijf-, reinstall- of restorefunctie toe zonder expliciete autorisatie en sterke beperkingen.


## Aanvulling: beveiliging, accountbeheer en systeemcontrole

Een nieuw afgeschermd dashboardtabblad **Systeemcontrole** bevat een read-only readiness-API (`/api/system/readiness`). Alleen na een geldige ondertekende sessie worden configuratiestatussen, een Redis-PING en het vervaltijdstip van de huidige sessie getoond, zonder geheime waarden. Het tabblad bevat een uitlogknop voor dit apparaat.

Dit is **nog geen multi-account accountmanager**. De bestaande owner-login is bewust ongewijzigd; voor individuele staffaccounts en RBAC hoort een migratieplan met geteste sessie-intrekking, server-side permission checks en rollback. Zie GitHub Issue #3 en `docs/SECURITY_READINESS.md`.


## Huidige ontwikkelfase: RBAC en accountbasis
De webrepository heeft nu een rolmodel (`lib/rbac.js`), veilige accountrecords (`lib/account-model.js`), experimentele, intrekbare individuele sessies (`lib/account-sessions.js`) en een read-only voorbeeld-API `/api/system/roles`. Het dashboard laat dit in **Systeemcontrole** zien.

**Essentieel:** de eigenlijke webaccountregistratie en -login zijn niet aangesloten. De bestaande eigenaar-login blijft volledig leidend. Codex mag deze niet verwijderen of stilzwijgend migreren. Alle nieuwe routes moeten echte server-side autorisatie en afzonderlijke MFA hebben; geen onbeperkte serverconsole of bestandsschrijffuncties.

Zie `docs/RBAC_FOUNDATION.md` en Issue #3 voor de vereiste server-side accountopslag, rolchecks, atomiciteit en staging-rollback. De RBAC-basis werd met **59 geautomatiseerde tests** geverifieerd.
