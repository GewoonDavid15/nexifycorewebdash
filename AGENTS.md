# AGENTS.md — Nexify Enterprise Dashboard

## Purpose
This is the **Nexify Enterprise** Next.js dashboard for a Minecraft server on MC-Node. It combines:
1. An outbound, authenticated Nexify Cloud Bridge status/backup-request agent.
2. A read-only Pterodactyl **Client API** integration for MC-Node.
3. One existing Vercel KV/Upstash Redis database with namespaced Nexify keys.

Read `docs/CODEX_HANDOFF.md` before making significant changes. The repository contains the **web dashboard**, not the full custom Minecraft server JAR or Paper plugin source.

## Work style
- Communicate with the user in clear, natural Dutch. Explain what changed and what remains untested.
- Keep current Nexify branding and the existing dashboard functional. Favor professional, readable design.
- For substantial requests, implement, run tests, and report results rather than repeatedly stopping for trivial confirmations.
- Ask for explicit approval before **destructive or security-sensitive actions** on a live game server (world replacement, reinstall, deletion, mass player sanctions, changing permission ownership).
- Do not claim direct access to MC-Node or live working sync until real access and checks confirm it.
- Preserve and extend tests for every new API action, especially auth and Pterodactyl calls.

## Important code paths
- `app/ui.jsx`, `app/styles.css`: dashboard UI.
- `lib/security.js`: session/password/TOTP verification and agent auth.
- `lib/redis.js`: REST Redis adapter and key namespace.
- `lib/mcnode.js`: read-only MC-Node Client API wrapper.
- `app/api/mcnode/overview/route.js`: logged-in, read-only hosting overview.
- `app/api/agent/sync/route.js`, `app/api/agent/ack/route.js`: Minecraft outbound Cloud Bridge endpoints.
- `app/api/requests/route.js`: authenticated, allowlisted backup request queue.
- `tests/*.test.mjs`: Node test runner. Run `npm test` and `npm run build` before proposing deployment.

## Security/non-negotiable
- NEVER commit credentials or reveal API keys, TOTP secrets, session secrets, Redis tokens, or hashes in code, issues, logs, screenshots, test fixtures, or documentation. Use environment variable **names only**.
- Some secrets were previously pasted into a chat: treat them as exposed; advise rotation before expanding MC-Node API privileges.
- Vercel env keys currently include `MCNODE_PANEL_URL`, `MCNODE_CLIENT_API_KEY`, `MCNODE_SERVER_ID`, plus `AGENT_SECRET`, `SESSION_SECRET`, `DASHBOARD_PASSWORD_HASH`, `DASHBOARD_TOTP_SECRET`, `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Never copy their values into the repo.
- The MC-Node Pterodactyl **Client API** key must remain server-side. Never use the higher-privilege Pterodactyl Application/Admin API key.
- Never expose generic shell, arbitrary console execution, arbitrary path writes, or unprotected server power actions over the internet.
- Validate authorization and server identity on every route. Use specific allowlisted actions, audit logging, rate limiting, and user confirmation for mutations; protect against CSRF and SSRF.
- Continue using the **existing** Redis database. Keep Nexify records under `nexify:cloud:main:v1:`. Do not create a paid resource or erase unrelated Redis keys.
- MC-Node Reinstall may destroy all local files/worlds. External recoverable backups and explicit approval are required before any risky migration.
- Do not assume Vercel functions are a persistent background worker, and do not weaken HTTPS/cookie/TOTP controls to make a feature work.

## Deployment and verification
- GitHub repository: `GewoonDavid15/nexifycorewebdash`; Vercel project: `nexifycorewebdash`.
- Production dashboard: `https://nexifycorewebdash.vercel.app`.
- Latest confirmed web build at handoff ran **18 tests, 0 failures**. This does **not** prove that live MC-Node API access or Cloud Bridge sync works.
- Preserve automatic GitHub → Vercel deployment; review tests, build logs and live status before reporting success.
- Prefer small, reviewable commits/PRs. Never mutate live server state or rotate real credentials merely because a code test passed.

## Next work
Follow priorities in `docs/CODEX_HANDOFF.md` and the user's next explicit request.
