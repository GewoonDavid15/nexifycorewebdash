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


## Offline Java-buildcontrole — 23 november 2026

De gepatchte Java-broncode is lokaal met OpenJDK/javac **21.0.12.1** gecompileerd. Hiervoor zijn uitsluitend de Paper API-bibliotheken uit de eerdere experimentele Nexify-serverbundel gebruikt als compile-time dependencies. Het resultaat was een **controlebuild** van NexifyStaff 2.4.0:

- NexifyCloudBridge.class aanwezig; class-versie 65 (Java 21)
- plugin.yml aanwezig met versie 2.4.0
- 39 ZIP/JAR-entries; integriteitscontrole geslaagd
- SHA-256 van de controlebuild: 1f33d11169e4a58bf3d5cd8bb71d39956eed1f48bd6e2825df8453320ede0bed

Dit bewijst alleen dat de aangepaste Java-plugin compileert tegen de beschikbare API-klassen. Het is **geen** herbouw van Paper 26.3, geen originele Paperclip-release en geen geslaagde Minecraft/Java 25-stagingtest. De controle-JAR is bewust niet toegevoegd aan deze publieke GitHub-repository.

De afzonderlijke private broncode-ZIP is uitgebreid met een verbeterde buildwrapper: bouwen in een tijdelijke map, vier JAR's controleren, manifest genereren en pas daarna de volledige release atomisch naar een **nieuwe** uitvoermap verplaatsen. Tien Python-broncode-/buildwrappertests zijn geslaagd. Het script weigert de eigen Nexify-wrapper als vervanging voor een originele Paperclip-JAR.

De echte nieuwe serverbundel kan pas worden uitgebracht met de originele Paper 26.3 build 257 input en een geslaagde Java 25-stagingtest. Installeer de controlebuild niet op MC-Node.
