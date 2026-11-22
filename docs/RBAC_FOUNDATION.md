# Nexify Enterprise 3.0 — RBAC en accounts: fase 1

**Status:** fundament gebouwd en met automatische tests gecontroleerd. **Niet actief voor productiegebruikers.** De bestaande eigenaar-login met wachtwoord, TOTP en ondertekende sessiecookie blijft ongewijzigd.

## Wat is geïmplementeerd?

| Bestand | Functie |
| --- | --- |
| `lib/rbac.js` | Vier rollen en een expliciete rechtenlijst. Onbekende acties en alle gevaarlijke serveracties worden standaard geweigerd |
| `lib/account-model.js` | Genormaliseerde gebruikersnamen, nieuw uitgenodigd accountmodel zonder wachtwoord, veilige publieksweergave, schorsing/rolwijziging met sessieversieverhoging |
| `lib/account-sessions.js` | Apart toekomstig sessiemodel: willekeurige 256-bit bearer-tokens, SHA256-tokenhash als Redis-sleutel, 6 uur TTL, controle op actuele rol/MFA/accountstatus, individuele sessie-intrekking |
| `lib/redis.js` | Nieuw, geïsoleerd Redis-sleutelpatroon `identity:session:<hash>`; gebruikt de **huidige** bestaande Redis-database |
| `app/api/system/roles/route.js` | Alleen voor ingelogde eigenaar: read-only voorbeeld van rollen en rechten, `enabled:false` |
| `app/ui.jsx` | In **Systeemcontrole** een niet-interactief overzicht van alle toekomstige rollen |
| `tests/rbac.test.mjs` | Tests voor permissies, accounts, schorsing, sessie-intrekking, tokengeheimhouding en afgeschermd rolvoorbeeld |

## Rechtenmatrix

| Recht | Viewer | Operator | Administrator | Eigenaar |
| --- | :---: | :---: | :---: | :---: |
| Dashboard/status lezen | Ja | Ja | Ja | Ja |
| Hosting/prestaties bekijken | Ja | Ja | Ja | Ja |
| Activiteit/systeemcontrole lezen | Ja | Ja | Ja | Ja |
| Diagnose aanvragen | Nee | Ja | Ja | Ja |
| Console-goedgekeurde back-up aanvragen | Nee | Ja | Ja | Ja |
| Staff bekijken/beheren | Nee | Nee | Ja | Ja |
| Accounts uitnodigen/schorsen | Nee | Nee | Ja | Ja |
| Accountrechten en instellingen beheren | Nee | Nee | Nee | Ja |

**Niet toegestaan voor alle rollen:** onbeperkte consolecommando's, schrijven naar willekeurige bestanden, server herinstalleren, werelden herstellen, serverpoweracties, back-ups verwijderen en secrets exporteren. Dit beleid geldt voor het toekomstige accountmodel. De bestaande eigenaar-login en de huidige API-endpoints werken voorlopig volgens hun oude, gescheiden autorisatieregels.

## Veiligheidsinvarianten

1. De bestaande eigenaar-sessie blijft geldig en wordt **niet** vervangen door de nieuwe identiteitstokens.
2. Een gedelegeerde administrator kan geen `owner` uitnodigen of zichzelf owner maken. Overdracht van eigenaarschap vereist later een afzonderlijke, beveiligde herstelprocedure.
3. Nieuwe accountrecords beginnen als `invited`, zonder wachtwoord of actieve sessie.
4. Een future login mag `issueAccountSession` alleen aanroepen **na** verificatie van zowel een eigen wachtwoord als een eigen TOTP-factor en vanuit **server-side vertrouwde accountrecords**. De functie zelf controleert vereiste verificatiebooleans en de actieve/MFA-ingestelde status.
5. Een sessie bevat geen rol die bij inloggen permanent wordt vertrouwd. Bij iedere toekomstige autorisatie moet `resolveAccountSession` het actuele account ophalen uit serveropslag en versie, status en rol opnieuw controleren.
6. Schorsing of rolwijziging verhoogt de `session_version`, zodat eerder uitgegeven tokens worden geweigerd. Persisterende accountversiewijzigingen moeten in de uiteindelijke database **atomair** gebeuren.
7. Redis bewaart alleen een hash van het sessietoken als sleutel, nooit het oorspronkelijke bearer-token.
8. Nieuwe toekomstige session-cookies moeten HttpOnly, Secure, SameSite=Strict en passend CSRF-beveiligd zijn. Bewaar ze niet in LocalStorage.
9. Onbekende acties worden geweigerd. Geen permissies uit een browserveld of een chatbotantwoord vertrouwen.
10. Sessies intrekken via Redis moet ook afwijzen wanneer Redis onbereikbaar is; nooit automatisch toelaten bij netwerkfouten.

## Wat nog niet is geactiveerd?

Er zijn **geen routes voor uitnodigen, registreren, rolwijziging, accountverwijdering of nieuwe gebruikerslogin**. Er is nog geen databaseopslag voor volledige accountrecords, eigen password/TOTP-enrollment, accountuitnodigingstokens, een migratie van de eigenaar-login of server-side autorisatie van nieuwe accounts op de bestaande dashboardroutes.

De read-only rollenpagina betekent dus **niet** dat accounts nu kunnen inloggen.

## Vereiste volgende fase, vóór productie

1. Ontwerp atomair opgeslagen accounts met unieke usernames en eigenaarsbescherming. Bouw een sterke, beperkte eigenaar-bootstrap zonder openbaar reset-endpoint.
2. Bouw wachtwoord- en TOTP-enrollment met versleutelde TOTP-opslag, recovery-procedure en uitnodigingstokens die eenmalig gebruikt kunnen worden.
3. Schakel de nieuwe sessievalidatie alleen achter een expliciete migratievlag in op een **stagingomgeving**; controleer alle API-routes op permissies, inclusief operationele schrijfaanvragen.
4. Test privileges, cross-account toegang, replay/CSRF, verlopen sessies, individuele sessie-intrekking, schorsing, rolwijzigingen en storing van Redis.
5. Test een volledige rollback voordat de eigenaar op productie overschakelt. Maak eerst een externe herstelbare backup van accounts/configuraties.
6. Voer geen productie-accountmigratie, owner-reset of automatische Minecraft-acties uit zonder expliciete toestemming.

## Configuratie

Er zijn voor deze voorbereidingsfase **geen nieuwe Environment Variables of betaalde diensten nodig**. Accountcreatie en nieuwe sessies worden niet door een productie-HTTP-route gestart. Geheimen die eerder in chats zijn gedeeld moeten door de eigenaar bij de uitgever worden ingetrokken en veilig vervangen.

Kijk ook bij `docs/SECURITY_READINESS.md`, `AGENTS.md` en GitHub Issue #3.
