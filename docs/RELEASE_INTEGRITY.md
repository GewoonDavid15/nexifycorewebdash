# Nexify Minecraft 2.0.1 — bestanden veilig controleren

De experimentele Java 25-release is **niet** in deze webrepository aanwezig. Dit commando helpt uitsluitend bij het controleren van vijf eerder gedocumenteerde SHA-256-controlesommen. Het verandert geen Minecraft-installatie, start geen JAR op en pakt geen ZIP uit.

## Gebruik op Windows

1. Zet de vijf losse releasebestanden in één map, bijvoorbeeld `C:\\NexifyRelease`. Neem de juiste originele bestanden uit het eerder gemaakte releasepakket. Pak voor deze controle desnoods het pakket lokaal uit.
2. Open een terminal in een checkout van deze GitHub-repository.
3. Voer uit:

```powershell
node scripts/verify-minecraft-artifacts.mjs "C:\\NexifyRelease"
```

Het resultaat is **PASS** als alle vijf bestanden en de SHA-256-checksums overeenkomen. Er volgt **FAIL** bij een ontbrekend of veranderd bestand. Het script doet geen netwerkverzoeken en gebruikt geen secrets. Laat bij een FAIL alles ongemoeid en controleer de juiste originele bestanden.

Deze controle is aanvullend op de eerder gedocumenteerde `check_release.py` uit het release-ZIP; die oorspronkelijke checker onderzoekt ook de bundelinhoud. Het nieuwe Node-script verifieert alleen bytes van de vijf losse artefacten. Een correcte hash bewijst niet dat het bestand goed werkt op Paper 26.3 / Java 25.

## Nog nodig voor een live update

De volledige Java-broncode in een aparte **private** repository, een reproduceerbare build, een externe herstelbare back-up van werelden en SQLite, stagingcontrole op Java 25 en expliciete goedkeuring voordat MC-Node verandert. Plaats geen wachtwoorden of agentsleutels in broncode of GitHub-issues.
