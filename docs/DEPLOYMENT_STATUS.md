# Deploymentcontrole — 22 november 2026

## Code en online status
- GitHub `main`: de RBAC-basis, toekomstige accountsessies, rollenvoorbeeld, tests en Codex-overdracht zijn opgeslagen in broncode.
- Laatst expliciet bevestigde Vercel-productiedeployment van de **rollenvoorbeeld-code**: commit `0bdce0a07fea15e12b1e83de2e68ee93e9490d8d`, state `READY`. Dit omvat de voorbeeld-API en het nieuwe Systeemcontrole-scherm, maar niet noodzakelijk alle latere CSS- en documentatiecommits.
- De automatische test/build op commit `73661035e62afd061b5bd04b2a88e2226a2826b0` had **59 geslaagde tests, 0 fouten**.
- De laatste GitHub-documentatiecommit en de daarbij behorende codewijzigingen zijn **nog niet opnieuw als geheel op productie geverifieerd**.

## Huidige blokkade
Een expliciete Vercel-productiedeployment van de nieuwste GitHub-commit werd geweigerd met HTTP `402 payment_required`: de gratis daglimiet `api-deployments-free-per-day` (meer dan 100) is bereikt. Het opgegeven retry-interval is ongeveer één dag. GitHub toont voor de nieuwste commit een mislukte Vercel-status met een upgradeverwijzing.

**Doe niets automatisch met het betaalplan.** Wacht tot de limiet opnieuw beschikbaar is of laat de eigenaar zelf besluiten over een eventuele upgrade. Controleer daarna vóór een nieuwe build opnieuw de juiste `main`-commit, het bestaande Vercel-project en de environment variables. Start geen nieuwe buildlus bij quota errors.

## Veilig vervolgen
1. Controleer in GitHub of het laatste `main`-commit inderdaad de bedoelde RBAC-bestanden bevat.
2. Nadat Vercel een nieuwe deployment toestaat: publiceer de **laatste** `main`-commit, voer `npm test` en Next.js build uit en bevestig `READY`.
3. Verifieer na inloggen `Systeemcontrole → Rollen & accountrechten`, inclusief de melding dat `enabled:false` en er nog geen echte gebruikersaccounts zijn.
4. Controleer dat bestaande eigenaar-wachtwoord/TOTP-inlog en Cloud Bridge niet veranderd zijn.
5. Voer de migratie naar echte nieuwe accounts uitsluitend via de afzonderlijke stagingprocedure in `docs/RBAC_FOUNDATION.md` uit, met back-up en rollback.

De echte MC-Node Minecraft-server is in deze ontwikkelronde niet veranderd.
