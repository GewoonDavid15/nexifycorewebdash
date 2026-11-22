# Nexify Enterprise — Systeemcontrole en accountveiligheid

De afgeschermde Systeemcontrole is beschikbaar via het vijfde tabblad van het Next.js-dashboard.

## Wat wordt gecontroleerd?
- Bestaande beveiligde dashboard-sessies: lengte/aanwezigheid van `SESSION_SECRET`, **nooit de waarde**.
- Wachtwoordinstelling: formaat van `DASHBOARD_PASSWORD_HASH`, niet de hash zelf.
- Tweestapsverificatie: aanwezigheid/validiteit van `DASHBOARD_TOTP_SECRET`, zonder de sleutel ooit terug te sturen.
- Cloud Bridge-tokenconfiguratie: `AGENT_SECRET` is aanwezig, **niet** of de Minecraft-JAR dezelfde sleutel heeft.
- Redis: bestaande `KV_REST_API_URL` en `KV_REST_API_TOKEN` (of ondersteunde Upstash-aliasnamen) zijn bruikbaar, plus een echte **PING** naar de bestaande database.
- Optionele MC-Node: de drie `MCNODE_*`-waarden vormen een geldige HTTPS Client API-configuratie. De live hostingverbinding wordt afzonderlijk door de bestaande hosting-API gecontroleerd.

De status is in te zien via het ingelogde dashboard of `GET /api/system/readiness`, waarvoor een geldige sessiecookie vereist is.

## Sessiegedrag
- De bestaande, ondertekende dashboardcookie is maximaal **zes uur** geldig.
- De Systeemcontrole toont het vervaltijdstip van de **huidige** cookie, niet de cookie zelf en niet de ondertekeningssleutel.
- `Uitloggen op dit apparaat` gebruikt de bestaande logout-route en verwijdert de cookie uit de huidige browser. Dit trekt **geen andere sessies** in; verwissel het dus niet met centraal sessiebeheer.
- Voor het onmiddellijk ongeldig maken van alle eerder uitgegeven cookies moet de eigenaar `SESSION_SECRET` veilig in Vercel roteren. Gebruik de beveiligde Vercel-instellingen, nooit GitHub of een chat.
- Oude, eerder gedeelde agent- en Pterodactyl-sleutels moeten eveneens worden vervangen bij hun uitgevende systemen, waarna de nieuwe waarden in de beveiligde hostinginstellingen komen.

## Hoe interpreteer je een status?
- **Ingesteld**: een configuratiewaarde heeft de vereiste vorm; niet automatisch live getest.
- **Ontbreekt / Ongeldig**: een noodzakelijke instelling ontbreekt, heeft het verkeerde formaat of een optionele koppeling is gedeeltelijk ingesteld.
- **Optioneel**: de MC-Node-koppeling ontbreekt volledig; de rest van de website kan nog steeds werken.
- **Redis bereikbaar**: een echte REST-PING is geslaagd. Dat is **geen** garantie dat er een Minecraft-heartbeat binnenkomt.
- **Cloud Bridge online**: alleen wanneer de bestaande statusroute een actuele serverheartbeat heeft bevestigd.

## Grenzen en vervolg
Het bestaande dashboard heeft **één** beheerderslogin met wachtwoord en 2FA. Echte multi-accountadministratie met individuele rollen, sessie-intrekking, veilige account-uitnodigingen, herstel van toegang, eigen 2FA per account en onveranderbare auditing zijn nog **niet** aanwezig.

Voor toekomstige rollen:
1. Ontwerp eerst een apart identity-schema en veilige migratie zonder de huidige eigenaar buiten te sluiten.
2. Voer autorisatie bij iedere server-side API-route uit; verborgen menu's zijn geen beveiliging.
3. Rolrechten voor `viewer`, `operator`, `administrator` en `owner` moeten expliciet worden afgebakend.
4. Houd MC-Node en Minecraft-bewerkingen op een minimale allowlist, met audit en afzonderlijke goedkeuring voor risicovolle acties.
5. Test op staging, inclusief uitloggen, verlopen en vervalste cookies, accounts zonder rechten, defecte Redis en terugrol.

## Ontwikkelaars
- `lib/readiness.js`: pure, privacyveilige configuratietests.
- `app/api/system/readiness/route.js`: sessiegeautoriseerde runtimecontrole en Redis-PING.
- `tests/readiness.test.mjs`: positieve/negatieve paden en tests tegen secretdoorlekken.
- `app/ui.jsx`: tabblad Systeemcontrole, beveiligingsstatus, sessievervaltijd en uitloggen.

Er is geen nieuwe betaalde database gemaakt of productieserverherinstallatie uitgevoerd.
