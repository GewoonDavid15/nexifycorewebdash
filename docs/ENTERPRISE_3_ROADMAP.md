# Nexify Enterprise 3.0 — uitvoerbare roadmap

Status op 22 november 2026. Dit is een planning voor het volledige platform, geen claim dat alle functies al af zijn. Codex: lees `AGENTS.md`, `docs/CODEX_HANDOFF.md` en `docs/CLOUD_PROTOCOL_V2.md` voor aanvang.

| Onderdeel | Huidige status | Volgende acceptatiecontrole |
| --- | --- | --- |
| Next.js/Vercel-dashboard | **Werkend gebouwd** | Test op ingelogde production deployment |
| Bestaande Redis-integratie | **Ingericht** | Verifieer live opslag/retentie zonder een tweede database |
| Auth: scrypt + 2FA + sessie | **Gebouwd/getest** | User-flow en secretrotatie controleren |
| Minecraft-heartbeat | **Protocol aanwezig** | Echte MC-Node Java25 heartbeat bevestigen |
| TPS/MSPT/spelers/hostingoverzicht | **Gebouwd/getest** | Live Pterodactyl API-permissies checken |
| Historische prestaties | **Gebouwd** | 24 uur sampling/retentie in productie meten |
| Uitlegbare gezondheidssignalen | **Gebouwd** | Waarschuwing op echte metingen testen |
| Cloud back-upaanvraag | **Bestaand, veilig beperkt** | Console-goedkeuringspad en herstelbare backup toetsen |
| Read-only diagnose op aanvraag | **Web 2.0 + JAR 2.0 lokaal gebouwd** | NexifyStaff 2.3 laden en end-to-end testen |
| Lokale read-only Codex MCP | **Broncode + tests** | Codex CLI/IDE op eigen pc koppelen |
| Complete Java broncode op GitHub | **Nog niet geïmporteerd** | Plaats aparte Minecraft 2.0 source ZIP in private Java-repo |
| Staffportaal met individuele accounts/RBAC | **In de JAR lokaal; cloud nog niet compleet** | Identitymodel, webadmin, tests en toegangsisolatie |
| Externe herstelbare back-ups | **Niet bewezen** | Opslag buiten MC-Node + restore op staging |
| Algemene serverconsole met writes | **Bewust niet gebouwd** | Alleen beperkte, geautoriseerde tools met audit en goedkeuring |
| Complete AI-verbinding vanuit ChatGPT | **Niet gekoppeld** | Beschikbare plugin/MCP-toegang, OAuth en least-privilege testen |
| Staging/testserver voor Minecraft | **Nog niet ingericht** | Java25 startup, migraties, mods/plugincompatibiliteit toetsen |
| Updatekanalen en rollback | **Bestaande JAR heeft offline functies** | Releases voorzien van handtekening, checksums en recoverable backup |
| Spelerportaal, tickets, bezwaar/rapportages | **Gepland** | Datamodel, privacy, rollen en opt-in workflow |
| Discord-meldingen en storingsalerts | **Gepland** | Niet-spammende notificaties, secrets in provider-vault, opt-in |

## Fase 1 — Veilige basis en migratie
- Behoud huidige Paper-JAR, volledige werelddata, plugins en `nexify/database/nexify.db`.
- Trek eerder in chats gedeelde API- en agentsleutels in en maak nieuwe zonder ooit waardes in GitHub of chat te plakken.
- Zet een staging-server op, maak verifieerbare externe backups en test behoud van world/data.
- Bevestig Pterodactyl Client API URL/rechten en echte Cloud Bridge heartbeat.
- Test NexifyStaff 2.3 lokaal en op staging; pas daarna eventueel de experimentele 2.0-bundel toe.

## Fase 2 — Gedeelde identiteit en beheerrechten
- Webaccounts voor beheerders en staff, eigen 2FA, sessierevocatie, streng RBAC, notificaties bij kritieke accountwijzigingen.
- Rollen afstemmen op bestaande NexifyStaff SQLite; geen onbeperkte owner-promoties via dashboard.
- Staffhistorie, dienstregistratie, sanctienotities en gecontroleerde rapportages met privacyretentie.
- Audit per wijziging met server-ID, actor, gebeurtenistype en uitkomst; geen secretwaarden.

## Fase 3 — Server Operations
- Pluginmanager met versie-inventarisatie en compatibiliteitscheck; updates eerst als voorstel.
- Staging configplanner met diffs, validatie en rollback; niet direct aan wereldbestanden schrijven.
- Back-upmatrix: wereld, plugins, configs en SQLite. Externe opslag met integriteitscheck en apart getest herstel.
- Crashanalyse, prestatiehistorie, alerts, aparte herstelprocedures en onderhoudsmeldingen.

## Fase 4 — AI-op-verzoek
- Start lokaal met read-only Codex MCP tools.
- Schrijf architectuur voor remote MCP/ChatGPT onder echte OAuth en planbeperkingen; geef Vercel-token niet aan een model of browser.
- Breid alleen uit met vooraf gedefinieerde toolnamen, scope per role, rate-limits, audit en concrete confirmaties.
- Geen open shell/console, willekeurige bestandswijzigingen, herinstallatie of world-restore door een algemene AI-actie.

## Fase 5 — Spelersfuncties
- Optioneel spelersportaal, tickets, meldingen en moderatiearchief.
- Ondersteun Geyser/Floodgate als afzonderlijke plugins, met respect voor Bedrock-poorten.
- Rapporteer statistieken in geaggregeerde vorm en geef spelers privacy-informatie.

## Definitie van 'af'
Een feature is pas klaar na vier afzonderlijke bewijsstappen: (1) code gereviewd, (2) automatische tests geslaagd, (3) staging/live deployment goed, (4) echte MC-Node/Minecraft werking en herstelpad gevalideerd. Gebruik deze statuswoorden ook in eindrapportages.
