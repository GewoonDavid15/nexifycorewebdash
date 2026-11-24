# Nexify Cloud Bridge — atomische opdrachtverwerking

Dit is de **testbranch** voor een veiligere Redis-wachtrij. Het betreft uitsluitend de webapp; er wordt niets rechtstreeks geïnstalleerd op Minecraft of MC-Node.

## Aanmaken van aanvragen

`lib/request-creation.js` gebruikt één Redis `EVAL`-transactie voor:

1. Maximaal 10 gelijktijdig wachtende opdrachten.
2. Een afzonderlijke cooldown van 60 seconden voor `backup.now` en `diagnostics.capture`.
3. Het aanmaken van het aanvraagrecord met TTL.
4. Het toevoegen van de ID aan de actieve en recente index, waarbij de recente index op maximaal 50 wordt gehouden.

Bij een volle wachtrij, actieve cooldown of onwaarschijnlijke ID-botsing verandert het script **niets**. Er zijn geen extra betaalde Redis-resources nodig. Het systeem gebruikt de bestaande `nexify:cloud:main:v1:`-sleutels.

## Afronden van aanvragen

`lib/request-transitions.js` vergelijkt de oude opgeslagen JSON en zet daarna in dezelfde Redis Lua-transactie de status om en verwijdert de aanvraag uit de actieve index. Verlopen opdrachten, afwijkende acties en verschillende concurrente bevestigingen worden geweigerd. Een succesvolle diagnostiekmelding kan idempotent opnieuw worden ontvangen.

Een back-upaanvraag betekent nog steeds **niet** dat de Java-agent de back-up uitvoert: die wacht op console-goedkeuring.

## Bewijs en beperkingen

- Unit-tests simuleren concurrentie en foutpaden.
- GitHub Actions gebruikt daarnaast tijdelijk `redis:7` met een CLI op `127.0.0.1`; de tests sturen geen productiecredentials naar die container.
- Nog te testen: provider-specifieke Upstash REST `EVAL`-compatibiliteit in een gescheiden stagingomgeving, foutscenario's, en de volledige Java-agent-flow.
- Het opschonen van de wachtrij (`prunePending`) en Redis-onderbrekingen verdienen een aparte transactionele review. Een succesvolle CI-run is **geen** bewijs van live MC-Node-integratie.
- Bestaande owner-login, role-preview, individuele accounts in een andere PR en wereldbestanden blijven ongewijzigd.

**Niet automatisch samenvoegen of deployen.** Eerst CI, review, testback-ups en een stagingcontrole. Draai nooit MC-Node Reinstall als onderdeel van deze tests.
