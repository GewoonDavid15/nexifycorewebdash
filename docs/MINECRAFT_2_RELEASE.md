# Nexify Minecraft Enterprise 2.0.0 — Java-release

Deze pagina hoort bij de Minecraft-broncode en de experimentele JAR-bestanden die apart beschikbaar zijn gemaakt in de ChatGPT-werkruimte. **De volledige Java-broncode staat nog niet in deze GitHub-repository.** Het webdashboard en de Codex read-only tools staan wel op GitHub. Importeer de volledige broncode indien gewenst in een aparte, private Java-repository.

## Releasenummers
- Minecraft-serverbundel: **2.0.0 EXPERIMENTAL**
- NexifyStaff: **2.3.0**
- NexifySecurity: **1.0.0**
- NexifyCrossplay: **1.0.0**
- Paper-runtimebasis: bestaande Paper 26.3; Java 25 vereist bij serverstart.
- Dashboard: Next.js + Vercel; zie `docs/CLOUD_PROTOCOL_V2.md`.

## SHA256 (controleer voordat je iets installeert)
- `Nexify-server-v2.0.0-CloudDiagnostics-EXPERIMENTAL.jar`:
  `0102276197deacc920a997b141be4d094bb74fdd388a5aaadbd2d53e1339ad87`
- `NexifyStaff-v2.3.0-CloudDiagnostics.jar`:
  `6b69740b84765059e8d08ac305d3e5d0cc35612439f0aec63b95c47fb1bca1b0`
- `Nexify-Minecraft-Enterprise-2.0.0-EXPERIMENTAL-source.zip`:
  `1ecfe2b0a0293800c9f1d7834cf5970feaaaf3d912a0c35e59987ab745f02790`

## Nieuw aan de Java-kant
- Nieuwe metrics: `uptime_seconds`, `max_players`, `java_major`, `nexify_security`, `nexify_crossplay`.
- De NexifyStaff-plugin verwerkt **alleen** `diagnostics.capture` en de al bestaande `backup.now` over HTTPS.
- `NexifyCloudDiagnostics` maakt een immutable, allowlisted rapport van numerieke metingen en enkele booleans. Dit is expres niet hetzelfde als een remote-console.
- Bestaande JSON-privacyvoorwaarden, staff-SQLite-rechten en console-goedkeuringen blijven behouden.

## Bevestigde offline tests
- Staffinstaller: **22** regressiechecks geslaagd.
- Pluginbundelinstallatie: **22** checks geslaagd.
- Onderhoud/rollback: **23** checks geslaagd.
- Standalone diagnostiekprivacytest geslaagd.
- Alle drie plugin-JARs zijn aanwezig in de gebundelde server-JAR.
- Java-compilatie succesvol met de bestaande Java21-compileprocedure. Runtime Java25-start is nog niet bevestigd.

## Veilige migratie
1. Roteer de eerder gedeelde agent- en Pterodactyl API-sleutels zonder waarden in chat/GitHub op te nemen.
2. Zorg voor een **herstelbare, externe back-up** van alle werelden, pluginbestanden, SQLite en configs.
3. Behoud de huidige werkende Minecraft-JAR en test de nieuwe bundel eerst op een aparte testserver.
4. De auto-installer vervangt bewust geen bestaande `plugins/NexifyStaff.jar`. Gebruik een gecontroleerde, offline pluginupdate.
5. Verifieer dat de Minecraft-console NexifyStaff **2.3.0** meldt voordat je `diagnostics.capture` vanuit het dashboard aanroept.
6. Test heartbeat, foutafhandeling en één diagnostiekverzoek op staging; verifieer geen onbedoelde wereldwijzigingen.
7. Voer op productie **geen** MC-Node Reinstall of world-restore uit voor deze release.

## Wat nog openstaat
Geen complete accountmanager in de cloud, geen externe restore-oplossing, geen live Java25-MC-Node-run, geen generiek Codex-hersteltool en geen directe ChatGPT-MC-Node-connector. Zie `docs/ENTERPRISE_3_ROADMAP.md`.
