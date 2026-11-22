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

`npm test` test authenticatie en de API-synchronisatie met een gesimuleerde Redis-server. De uiteindelijke `next build` en Vercel-deployment moeten nog met echte geïnstalleerde Next.js-dependencies worden getest.

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
