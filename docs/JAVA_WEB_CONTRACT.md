# Nexify — controle Java Cloud Bridge ↔ web-API

De Java-broncode staat **niet** in de openbare Next.js-repository. Met deze offline controle kun je na het uitpakken van het private Nexify Minecraft 2.0.1-broncodearchief controleren of de Java-agent dezelfde HTTP-routes en toegestane actietypen gebruikt als het webdashboard.

## Windows (PowerShell)

Download de aparte private broncodebundel en pak deze uit op je eigen pc. Ga in een terminal naar de bestaande webrepository en voer uit:

```powershell
node scripts/check-java-cloud-contract.mjs "C:\\NexifyJavaSource"
```

Deze controle leest Java- en JavaScript-tekstbestanden. Hij voert geen code uit de Minecraft-plugin uit, doet geen netwerkverzoek, maakt geen back-up en verandert geen bestanden.

De check inspecteert:

- `/api/agent/sync`, `/api/agent/ack`, `/api/agent/report`
- De twee toegelaten opdrachten `backup.now` en `diagnostics.capture`
- Idempotente backup-ID-opslag in `ControlApprovals.java`
- Uitgeschakelde HTTP-redirects en back-upverwerking via de databasewachtrij

**Grenzen:** dit is een statische contractcontrole; hij bewijst niet dat JSON-velden exact hetzelfde worden verwerkt, dat de Java-plugin daadwerkelijk compileert, dat Redis werkt, of dat Paper 26.3 op Java 25 start. De bestaande GitHub Actions-tests toetsen de contractchecker op gesimuleerde Java-bronbestanden. De echte private broncode moet lokaal worden gecontroleerd of via een veilige interne buildworkflow.

Wijzig bestaande werelden, Paper-installaties of Nexify SQLite-bestanden pas na externe herstelbare back-up en een succesvolle stagingtest. Deel geen API-sleutels in GitHub of de chat.

## Aanvulling: exacte aanvraag-ID's

De contractchecker controleert nu ook dat de private Java-agent het volledige UUID-patroon met vijf hexgroepen gebruikt (8-4-4-4-12), en niet alleen een willekeurige reeks van 36 hextekens en streepjes. De bijbehorende Java-broncodepatch heeft aparte broncode-regressietests. De originele 2.0.1-broncodebundel wordt niet stilzwijgend overschreven; bewaar het nieuwe patch-archief afzonderlijk en controleer de gewijzigde hashes in `PATCH_SHA256.json`.

Een geslaagde statische controle maakt van de broncode **nog geen nieuwe JAR** en bewijst geen succesvolle Paper/Java 25-runtime.
