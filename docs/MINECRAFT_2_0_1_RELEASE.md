# Nexify Minecraft Enterprise — release 2.0.1 (EXPERIMENTAL)

**Uitgebracht als lokaal artefact op 22 november 2026; nog niet geïnstalleerd op MC-Node.**

Deze patch is gebouwd op de eerdere eigen Minecraft 2.0.0-broncode. De webapp blijft in dezelfde GitHub-repository. De volledige Java-broncode zit in het afzonderlijke downloadbare ZIP-archief; **niet** in deze publieke repository.

## Buildonderdelen

| Artefact | SHA256 |
| --- | --- |
| `Nexify-server-v2.0.1-StartupChecks-EXPERIMENTAL.jar` | `2e9446d31d4c4f2ea27020e9581b7ace68a97e8d20d0a4b5d3df27b344c50403` |
| `NexifyStaff-v2.4.0.jar` | `ff8873c0a3ddddaa9c2976622e73c828ca85d7f154a325064e76eb8ba8181253` |
| `NexifySecurity-v1.0.0.jar` | `1e75e944f0ac6f4db587829e3a154436143d18d2d6e5910aad957acc29aff344` |
| `NexifyCrossplay-v1.0.0.jar` | `d9e9a509401f257f3b400aa9e2b2e90201dfd0affbbc87bdb739d7d94c2653f7` |
| `Nexify-Minecraft-Enterprise-2.0.1-StartupChecks-source.zip` | `7258b69f295997957b58aacc0caf0ea3df2f0b022edc779399ffa3812c5c440c` |

Het gezamenlijke pakket heet `Nexify-Enterprise-2.0.1-EXPERIMENTAL-Release.zip` (circa 55,7 MB). Het bevat vijf artefacten, `SHA256SUMS.txt`, broncode, `check_release.py` en instructies. De controle kan op een vertrouwde Windows-pc met Python 3 worden uitgevoerd:

```powershell
python check_release.py Nexify-Enterprise-2.0.1-EXPERIMENTAL-Release.zip
```

De controle vergelijkt alle hashes, herkent ontbrekende of dubbele bestanden, controleert de NexifyStaff-versie en vergelijkt ingebouwde serverplugins met hun losse JARs. Dit programma installeert niets. Een bewust veranderde testbundel werd succesvol afgekeurd.

## Wat is toegevoegd in NexifyStaff 2.4.0?

- Eénmalige, **alleen-lezen** preflightcontrole bij het laden van de plugin.
- Meldt enkel **aantal kritieke installatiepunten** en **aantal waarschuwingen** in de Minecraft-console; geen automatische reparatie.
- Stuurt optioneel `startup_high` en `startup_warnings` als numerieke metingen over de bestaande outbound Cloud Bridge, zonder bestandsnamen, spelersgegevens of staffgegevens.
- Het webdashboard kan deze waarden tonen en een niet-destructieve waarschuwing geven. Oude plugins blijven ondersteund; ontbrekende waarden worden niet als nul gepresenteerd.
- De bestaande, afzonderlijk te bevestigen back-upflow en de read-only diagnose blijven behouden.

## Wat is getest?

- Java 21 offline-compileprocedure voor de eigen plugin; de bedoelde Paper 26.3 runtime blijft **Java 25**.
- 22 staffinstaller-regressiechecks geslaagd.
- 22 pluginbundel-regressiechecks geslaagd.
- 23 onderhouds- en rollback-integratiechecks geslaagd.
- Java-diagnostiekprivacytest geslaagd.
- Release-integriteitschecker: origineel **PASS**, aangepast testbestand **FAIL** (zoals bedoeld).

**Niet getest:** volledige Minecraft-serverstart met Java25 op live MC-Node, end-to-end Cloud Bridge met geroteerde tokens en externe herstelbare backups. Deze release is dus experimenteel.

## Aanbevolen veilige volgorde

1. Roteer alle eerder in een chat gedeelde Pterodactyl-, agent- en sessiegeheimen; plak nieuwe waarden alleen rechtstreeks in beveiligde instellingen.
2. Maak en controleer eerst een **externe** back-up van werelden, pluginconfiguraties en `nexify/database/nexify.db`.
3. Test de bundel op een aparte Java25 stagingserver. **Niet** MC-Node Reinstall gebruiken.
4. Controleer dubbel geladen Nexify-plugins. De installer vervangt bestaande `NexifyStaff.jar` niet stilzwijgend; voer eventuele upgrade offline en met checksums uit.
5. Verifieer via de echte serverconsole dat **NexifyStaff 2.4.0** draait. Controleer startupwaarschuwingen en `/nperf status`.
6. Verifieer heartbeat, privacyveilige diagnostiek, wachtrijverval en handmatige backupgoedkeuring.
7. Pas na succesvolle hersteltest en expliciete gebruikersgoedkeuring migreren naar de productieserver.

Meer informatie in `docs/CLOUD_PROTOCOL_V2.md`, `docs/ENTERPRISE_3_ROADMAP.md` en `AGENTS.md`.
