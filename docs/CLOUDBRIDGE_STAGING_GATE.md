# Cloud Bridge staging-eindcontrole

## Status

PR #11 gebruikt tijdelijke Redis 7 voor alle echte Lua-scripts en controleert nu ook de Upstash REST JSON-commandindeling, inclusief de stagingprobe. Een geslaagde CI-run betekent **niet** dat jouw echte Upstash-host al getest is.

## Handmatig testen met een afzonderlijke Upstash-database

Gebruik uitsluitend een **aparte stagingdatabase** en eigen stagingcredentials. De nieuwe probe draait niet automatisch en heeft geen toegang tot Minecraft. Stel in een lokale terminal de volgende variabelen in, zonder de waarden te publiceren:

- `NEXIFY_STAGING_REDIS_REST_URL`: URL van de aparte stagingdatabase
- `NEXIFY_STAGING_REDIS_REST_TOKEN`: stagingtoken
- `NEXIFY_STAGING_PROBE_CONFIRM=YES`: expliciete toestemming voor de test

Start daarna:

```bash
node scripts/probe-cloudbridge-staging.mjs
```

Deze probe controleert rechtstreeks de Lua-scripts die worden gebruikt voor het aanmaken, de cooldown, een veilige statusovergang, de weigering van een verouderde overgang en het opschonen van een vervallen opdracht. Hij gebruikt uitsluitend sleutels met `nexify:cloud:staging-probe:v2:<uuid>:` en laat het productienamespace `nexify:cloud:main:v1:` ongemoeid. Alle nieuwe records krijgen een tijdelijke TTL en de probe verwijdert zijn eigen testsleutels na succesvolle afronding.

De probe weigert een staging-URL die overeenkomt met de geconfigureerde productie-URL uit `UPSTASH_REDIS_REST_URL` of `KV_REST_API_URL`. **Dit is niet voldoende om een verkeerd ingevuld productieaccount te herkennen als die productievariabelen ontbreken.** Controleer daarom zelf vooraf in Upstash dat URL én token daadwerkelijk bij een afzonderlijke stagingdatabase horen.

Bij een verbindingsfout wordt er niet automatisch opnieuw geschreven en worden tokens, upstreamresponsen en gevoelige aanvraagwaarden niet getoond. Een afgebroken proef kan uitsluitend tijdelijke stagingtestsleutels laten staan, die uiteindelijk vervallen.

## Go/no-go voor productie

Een merge van PR #11 wijzigt de Cloud Bridge API en daarmee het productiegedrag. Daarom zijn vereist:

1. Laatste PR-CI volledig groen (account-Redis, Cloud Bridge Redis, tests, Next.js-build, secretscan).
2. Handmatige probe uitgevoerd met afzonderlijke Upstash-stagingcredentials.
3. Review van back-up/diagnoseflows en bevestiging dat de bestaande Java-agent de nieuwe foutreacties begrijpt.
4. Herstelplan voor Vercel, inclusief vorige productie-deployment.
5. Expliciete beoordeling vóór samenvoegen.

Geen MC-Node-wijzigingen, geen wereldoverschrijvingen en geen automatische Paper/JAR-deployments.
