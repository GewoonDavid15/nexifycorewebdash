# Nexify Enterprise — Cloud Protocol 2.0

Dit is het communicatiecontract tussen de experimentele **NexifyStaff 2.3.0** Minecraft-plugin en het Next.js-dashboard. Het gebruikt de **bestaande** Upstash/Vercel KV-database en vervangt de oude v1.9-bundel alleen na een gecontroleerde serverupdate.

## Vertrouwen en transport
- Uitgaand HTTPS vanuit de Java-plugin; Vercel hoeft geen MC-Node-webpoort te openen.
- Agentauthenticatie via `AGENT_SECRET` (server-side), gekoppeld aan `NEXIFY_CLOUD_AGENT_TOKEN` op MC-Node.
- Dashboardacties vereisen een geauthenticeerde sessie met wachtwoord + TOTP en een vertrouwde Origin.
- Redis-keynamespace: `nexify:cloud:main:v1:`; **geen nieuwe Redis-database**.

## Endpoint-overzicht

| Endpoint | Richting | Autorisatie | Functie |
| --- | --- | --- | --- |
| `POST /api/agent/sync` | Minecraft → Vercel | Agentsleutel | Status, heartbeat, optionele opdracht ophalen |
| `POST /api/agent/ack` | Minecraft → Vercel | Agentsleutel | Bevestig dat back-upaanvraag in lokale SQLite-goedkeuring staat |
| `POST /api/agent/report` | Minecraft → Vercel | Agentsleutel | Voltooi een read-only diagnostiekverzoek |
| `POST /api/requests` | Browser → Vercel | Beheerder + Origin | Maak uitsluitend `backup.now` of `diagnostics.capture` aan |
| `GET /api/requests` | Browser → Vercel | Beheerder | Toon aanvragen en eventuele veilige rapporten |
| `GET /api/status` | Browser → Vercel | Beheerder | Huidige Minecraft-heartbeat |
| `GET /api/history` | Browser → Vercel | Beheerder | Maximaal 288 periodieke prestatiemetingen |
| `GET /api/mcnode/overview` | Browser → Vercel | Beheerder | Read-only MC-Node hostingoverzicht |

## Vastgelegde actietypen
`backup.now`: alleen een **aanvraag**. De Minecraft-console moet uitvoering nog goedkeuren via `ncontrol approve <nummer>`. Geen automatische wereldwijzigingen vanuit het webdashboard.

`diagnostics.capture`: read-only verzoek. NexifyStaff 2.3.0 verzamelt geanonimiseerde performance- en moduledata en retourneert die via het agentreport-endpoint. Oudere plugins ondersteunen deze actie niet.

Alle andere actie-namen worden afgewezen. Beide toegelaten acties hebben een eigen Redis-cooldown van 60 seconden. Maximaal tien opdrachten mogen tegelijk op uitvoering wachten.

## Dataprivacy
Aanvullende heartbeatvelden zijn `uptime_seconds`, `max_players`, `java_major`, `nexify_security` en `nexify_crossplay`. Diagnose-rapporten gebruiken een strikte allowlist: numerieke prestatiemetingen, booleans, pluginversie. **Geen spelersnamen, UUID's, IP-adressen, bestandspaden, configuratie-inhoud, wereldbestanden of ruwe serverconsole.**

De prestatiehistorie slaat maximaal één punt per vijf minuten op, tot 288 punten; hierin staan alleen tijdstip, TPS, MSPT en spelerstelling. Het dashboard toont waarschuwingen alleen op basis van aanwezige metingen; het voert nooit zelf correcties uit.

## Niet inbegrepen
Er bestaat nog geen vanuit ChatGPT rechtstreeks toegankelijke MC-Node-connector. De **lokale Codex MCP** onder `tools/mcnode-mcp` heeft vijf veilige read-only tools en is apart te installeren op een vertrouwde computer. Meer bevoegdheden vereisen nieuwe connectorarchitectuur, aparte scopes, auditlog en gebruikersgoedkeuring.

## Releaseveiligheid
- Java 25-runtime op MC-Node blijft vereist voor Paper 26.3.
- De experimentele server-JAR behoudt de originele Paperclip en bundelt NexifyStaff 2.3.0 + Security + Crossplay.
- Bestaande plugin-JARs worden **niet automatisch overschreven**. De eigenaar moet vooraf een herstelbare externe back-up maken.
- Tests/CI tonen geen bevestiging van live Java 25-start of MC-Node Cloud Bridge-synchronisatie.


## Verfijningen voor NexifyStaff 2.4.0 (Minecraft 2.0.1)

De agent ondersteunt ook de numerieke velden `startup_high` en `startup_warnings`. Dit zijn **alleen aantallen** uit de lokale, read-only startupcontrole; geen paden, namen of inhoud. De velden ontbreken bij oudere plug-ins.

De webopdrachtwachtrij laat `backup.now` en `diagnostics.capture` maximaal **20 minuten** in de status `pending` staan. Verouderde aanvragen worden `expired`, verwijderd uit de actieve wachtrij en **nooit** alsnog naar de Java-agent verstuurd. De aanvraaggeschiedenis blijft leesbaar.

De webapp houdt een **beperkt operationeel logboek** bij van aangevraagde en afgeronde acties (`/api/audit`), uitsluitend voor ingelogde beheerders, zonder IP-adressen, spelersinformatie of secretwaarden. Het log is best-effort, maximaal 200 gebeurtenissen; bij het lezen wordt maximaal 30 dagen geschiedenis getoond. Dit is **geen** onveranderbaar juridisch auditregister.

Historische performancegegevens bevatten alleen tijdstip, TPS, MSPT en spelersaantal; maximaal 288 punten met een minimale interval van 5 minuten. `/api/history` toont alleen de laatste **24 uur** en weigert oude of toekomstgedateerde metingen; Redis vervalt na inactiviteit.

**Totaalstatus:** op de laatst gecontroleerde Vercel-productiebuild zijn **43 tests geslaagd**. De Java 2.0.1-bundel is alleen offline gebouwd en getest, niet met Java25 live op MC-Node gestart.
