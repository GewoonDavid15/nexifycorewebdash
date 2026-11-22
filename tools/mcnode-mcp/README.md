# Nexify MC-Node — Codex MCP (alleen-lezen)

De lokale Nexify MCP-server in `tools/mcnode-mcp/server.mjs` biedt vijf read-only tools aan Codex:
`get_server_status`, `list_plugins`, `list_backups`, `list_schedules` en `get_recent_activity`.

**Geen command execution, geen Minecraft-console, geen bestandsschrijfwerk, geen back-uprestore en geen serverstart/herstart.** De API-sleutel wordt uitsluitend als lokale environment variable gelezen; geen token in GitHub, een Codex-prompt of een website.

## Vereisten

- Een lokaal geïnstalleerde Codex CLI of Codex IDE-extensie op een vertrouwde Windows-pc, plus Node.js 20.9 of hoger.
- Een lokale kopie van de repository `GewoonDavid15/nexifycorewebdash`.
- Een **nieuwe** Pterodactyl **Client** API-key met alleen de noodzakelijke MC-Node-serverrechten (de eerder in de chat gedeelde sleutel moet eerst ingetrokken en vervangen worden).
- Een netwerkverbinding vanaf je eigen pc naar je MC-Node-gamepaneel.

## Instellen

1. Clone of download de GitHub-repository naar jouw eigen computer (bijvoorbeeld `C:\\Nexify\\nexifycorewebdash`).
2. Stel voor de **lokale Codex-sessie** de variabelen `MCNODE_PANEL_URL`, `MCNODE_CLIENT_API_KEY`, `MCNODE_SERVER_ID` in. Gebruik voor de eerste variabele de echte HTTPS-basis-URL van het MC-Node-gamepaneel. Vul de echte sleutel niet in de broncode in.
3. Open `%USERPROFILE%\\.codex\\config.toml` (Windows) of `~/.codex/config.toml` en voeg toe:

```toml
[mcp_servers.nexify_mcnode]
command = "node"
args = ["C:\\\\Nexify\\\\nexifycorewebdash\\\\tools\\\\mcnode-mcp\\\\server.mjs"]
env_vars = ["MCNODE_PANEL_URL", "MCNODE_CLIENT_API_KEY", "MCNODE_SERVER_ID"]
```

Pas het pad aan naar de locatie waar je de repository hebt gekloond. **Gebruik geen API-token in dit bestand.** De drie variabelen worden geërfd van het proces dat Codex start.

4. Start Codex vanuit een omgeving waarin de variabelen aanwezig zijn. Controleer met `codex mcp list` of de MCP-server zichtbaar is.
5. Vraag bijvoorbeeld: *“Controleer de RAM, CPU en back-upstatus van mijn MC-Node Minecraft-server.”*

## Testen

In de GitHub-repository:
```bash
npm test
```

De MCP-test controleert onder meer of alleen vijf veilige tools beschikbaar zijn, onbekende beheeracties worden geweigerd, en ontbrekende credentials fail-closed worden behandeld. De test gebruikt **geen live MC-Node-server**.

## Veiligheidsgrenzen

- Deze MCP-server heeft zelf geen aparte gebruikersauthenticatie: hij draait **lokaal**, alleen wanneer Codex de juiste processen mag starten. De securitygrens is de pc, je Codex-autorisatie, het MC-Node-account en de minimale Pterodactyl Client-rechten.
- De code luistert niet op een netwerkpoort en is geen openbaar MCP-endpoint.
- Hij houdt servermetingen kort in het geheugen (maximaal 30 seconden), om het MC-Node-paneel niet te overvragen.
- Hij gebruikt uitsluitend HTTPS GET-aanvragen via dezelfde `lib/mcnode.js` als het dashboard.
- Eventuele Pterodactyl Client API-rechten die je account méér heeft worden door deze code niet benut, maar beperk die rechten waar mogelijk.
- Deze koppeling werkt in principe met **Codex CLI/IDE lokaal**, maar is **niet automatisch beschikbaar in deze ChatGPT-conversatie of Codex Cloud**. Voor volledige ChatGPT-plugins met een eigen remote MCP-server gelden aparte plan-, OAuth- en beheertoegangseisen.
