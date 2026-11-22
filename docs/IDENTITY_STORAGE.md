# Nexify Identity Storage — fase 2 (staging)

Deze branch bouwt **alleen de server-side opslaglaag** voor toekomstige accounts. Er is **geen nieuwe webregistratie, accountlogin, accountwijzigingsroute, mailuitnodiging of productie-accountmigratie**. De bestaande eigenaar-login met TOTP wordt volledig behouden.

## Datamodel en bestaande infrastructuur

De bestaande Upstash/Vercel KV-database wordt hergebruikt, met uitsluitend de Nexify-prefix `nexify:cloud:main:v1:`.

| Redis-sleutel | Betekenis |
| --- | --- |
| `identity:account:<uuid>` | Gevalideerde interne accountrecord, voorlopig zonder wachtwoord of TOTP-geheim |
| `identity:username:<genormaliseerde_naam>` | Unieke index van gebruikersnaam naar UUID |
| `identity:accounts:index` | Gesorteerde lijst van account-UUID's voor gepagineerde beheerlijsten |
| `identity:session:<sha256>` | Tijdelijke hashed-token-sessies uit fase 1; niet gekoppeld aan de bestaande login |

Er is geen tweede betaalde Redis-database, geen nieuwe Vercel-secret en er is niets geschreven naar de echte database tijdens deze implementatie.

## Accountmodule

`lib/account-store.js` implementeert:

- `reserveInvitation()`: reserveert een gebruikersnaam (hoofdletterongevoelig en getrimd) en een uitnodigingsrecord. **Nog geen uitnodigingslink**.
- `loadAccount()` / `loadByUsername()`: validatie van accountrecords en kruiscontrole van de username-index.
- `listPublicAccounts()`: gepagineerde veilige accountweergaven, zonder wachtwoordhash of MFA-sleutel.
- `changeStoredRole()`: uitsluitend eigenaar kan een gedelegeerde rol wijzigen; nooit eigenaar aanmaken of overnemen.
- `suspendDelegatedAccount()`: account schorsen en de sessieversie verhogen.

### Autorisatie en concurrentieveiligheid

Elke wijziging controleert eerst de **actuele, server-side opgeslagen** actorstatus, rol en `session_version`. Daarna controleert hetzelfde Redis-Lua-script opnieuw of die actor **tijdens** de bewerking nog dezelfde is.

- In de `CREATE_ACCOUNT_LUA` wordt gebruiker-ID, unieke username-index en accountindex in één Redis-operatie gereserveerd. Bij dubbele naam wordt niets aangemaakt.
- In `UPDATE_ACCOUNT_LUA` wordt de exacte oude JSON-waarde vergeleken met de huidige opslag (**compare-and-set**). Tegelijk uitgevoerde aanpassingen kunnen elkaar daardoor niet stilzwijgend overschrijven.
- Verandert de actor tijdens de bewerking, dan weigert het script de wijziging.
- Verandering van rol of schorsing verhoogt de sessieversie, waardoor bestaande toekomstige accountsessies ongeldig worden bij de volgende controle.
- Een administrator kan geen administrator of owner schorsen en kan geen eigenaarsrechten uitdelen.
- Beveiligingsrelevante mutaties zijn **niet** als HTTP-endpoints blootgesteld.

**Security boundary:** deze module mag uitsluitend worden aangeroepen door een toekomstig, server-side authenticatielaag die al een geldige accountsessie en actuele actor identiteit heeft vastgesteld. Een door de browser ingevulde `actor` is niet genoeg om een wijziging te autoriseren. De interne opslagcontrole is een extra maatregel, niet een vervanging voor HTTP-authenticatie, CSRF-bescherming en audit.

## Tests

`tests/account-store.test.mjs` bevat een deterministische Redis-geheugensimulatie en tests voor dubbele usernames, gelijktijdige rolwijzigingen, ID/naamvalidatie, ongeldige actorrollen, ownerbescherming, veilige accountlijsten en verlies van autorisatie tijdens een wijziging.

De tests controleren de beoogde `EVAL`-parameters en het gedrag van de opslag-API. **Ze vervangen geen staging-integratietest tegen een echte Upstash-instance**, vooral niet voor het Lua/REST-protocol en eventuele Redis-foutscenario's.

## Nodig voor de volgende fase

1. Individueel accountenrollment met sterke wachtwoorden en eigen TOTP, MFA-geheimen altijd versleuteld met een aparte server-side sleutel.
2. Eenmalige, kort geldige uitnodigingstokens; uitgegeven en geactiveerd via vertrouwde HTTPS-routes met rate limits.
3. Een veilige owner-bootstrap en owner-fallback zonder publiek reset-endpoint.
4. Centraal rol- en rechtenbeleid op **alle** bestaande Next.js-API-routes, niet alleen op de UI.
5. Auditlog voor uitnodigingen, intrekking, rolwijziging en sessierevocatie zonder gevoelige inhoud.
6. Stagingtest van de migratie en rollback voordat de bestaande login wordt omgezet.
7. Live Cloud Bridge en MC-Node-beheer blijven buiten deze migratie; geen directe file- of console-acties.

Zie ook `docs/RBAC_FOUNDATION.md` en GitHub Issue #3.


## Aanvulling: veilige persoonlijke 2FA-opslag

De branch bevat `lib/account-vault.js`, maar geen actieve accountenrollment-API.

- `generateTotpSecret()` maakt per toekomstig account een willekeurig 160-bit Base32-authenticatorgeheim.
- `sealTotpSecret()` versleutelt dit met **AES-256-GCM** en een eigen, willekeurige nonce. De account-UUID is opgenomen als geauthenticeerde context (AAD), zodat een geheim niet bruikbaar is voor een andere gebruiker.
- `unsealTotpSecret()` weigert gewijzigde gegevens, verkeerde account-ID's en sleutels die niet overeenkomen.
- Deze code vraagt later om een aparte server-side variabele **`NEXIFY_ACCOUNT_VAULT_KEY`** met precies 32 willekeurige bytes, gecodeerd als Base64url zonder padding. Er is **nu niets aan Vercel toegevoegd**, want het actieve loginproces gebruikt deze sleutel nog niet.
- Roteer die sleutel later alleen met een expliciet plan om de bestaande MFA-geheimen opnieuw te versleutelen, anders kunnen accounts buitengesloten worden.
- Bewaar de onversleutelde eenmalige enrollmentwaarde niet in Redis, logs, GitHub of chat. Voor de uiteindelijke enrollment-route zijn CSRF, een korte verificatieperiode, TOTP-codecontrole en gebruikersbevestiging nodig.

De module wordt offline getest in `tests/account-vault.test.mjs` met willekeurige, tijdelijke testsleutels. Dit bewijst nog geen volledige 2FA-login voor een echt gebruikersaccount.


## Eenmalige uitnodigingstokens

`lib/account-invitations.js` bereidt het uitgeven en eenmalig claimen van accountuitnodigingen voor:

- Elke uitnodiging krijgt een willekeurige 256-bit bearer-token en verloopt uiterlijk na 48 uur.
- Redis bewaart **alleen de SHA256-hash van het token** als sleutel, nooit de oorspronkelijke tokenwaarde.
- Een Redis-Lua-transactie koppelt precies één geldige uitnodiging aan een account en verifieert dat de uitvoerende beheerder **op dat moment** nog geautoriseerd is.
- Een tweede transactie kan een token maar **één keer** claimen. Tokens voor een ander account, verlopen uitnodigingen en geschorste accounts worden geweigerd.
- Er wordt **nog geen account geactiveerd**: `consumeInvitationToken` claimt alleen de uitnodiging. Voor toekomstige productie-enrollment moeten de tokenclaim, persoonlijke wachtwoordinstelling en MFA-verificatie transactioneel worden samengebracht. Anders zou een mislukte enrollment een geldig token onnodig kunnen opmaken.
- Er is geen e-mail-, Discord-, website- of ChatGPT-route gemaakt die uitnodigingstokens verstuurt of gebruikt. Een beveiligde online enrollmentflow vereist nog nieuwe, geteste endpoints, rate limits, CSRF-beveiliging en heldere gebruikersbevestiging.

Deze regels zijn met mocks getest in `tests/account-invitations.test.mjs`. Ze bewijzen niet dat de Lua-scripts al op een echte Upstash-database zijn uitgevoerd.

## Fase 3 — veilige accountactivatie en individuele login (prototype)

De interne module `lib/account-activation.js` activeert uitgenodigde accounts alleen nadat het systeem **alle** controles heeft uitgevoerd:

1. Een nog geldig, eenmalig uitnodigingstoken moet bij het juiste account horen.
2. Een persoonlijk wachtwoord van 14–128 tekens moet voldoen aan de invoercontroles en wordt gehasht met het bestaande scrypt-formaat.
3. Een geldige zescijferige authenticatorcode moet overeenkomen met het gekozen TOTP-geheim.
4. Het TOTP-geheim wordt met de aparte `NEXIFY_ACCOUNT_VAULT_KEY` en AES-256-GCM versleuteld.
5. Eén Redis-Lua-transactie controleert token, vervaltijd, accountstatus, rol en sessieversie, schrijft pas daarna de actieve accountrecord en vernietigt in dezelfde transactie de uitnodiging.

Bij een ongeldige of verlopen code, een ontbrekende vaultkey of een tussentijdse accountwijziging blijft het account uitgenodigd of geschorst. Er wordt nooit eerst een uitnodiging verwijderd om daarna met een andere API-call te activeren.

De module `lib/account-login.js` bevat de toekomstige controle van gebruikersnaam, scrypt-wachtwoord en de per-account ontsleutelde TOTP-code. Na een geslaagde combinatie kan het bestaande geïsoleerde account-sessiesysteem een token uitgeven. Redis `SET ... NX EX` voorkomt hergebruik van dezelfde 30-seconden TOTP-code voor een tweede accountsessie.

**Er zijn nog steeds geen HTTP-endpoints voor registratie, accountactivatie of deze login.** Dit is alleen een server-side prototype dat met gemockte Redis-transacties wordt getest. Voor een publieke activering ontbreken nog webformulier, individuele uitnodigingsdistributie, server-side rate limiting, CSRF/cookiebeleid, accountoverzicht, logging en gecontroleerde eigenaar-bootstrap.

### Aanvullende acceptatiechecks

- Tests: `tests/account-enrollment.test.mjs` (geldige en ongeldige enrollment, expiratie, concurrerende activatie, versies, inloggen, wachtwoorden, TOTP-hergebruik en sessierechten).
- Redis-scripts moeten op een **afzonderlijke** stagingomgeving met echte Upstash `EVAL` worden getest vóór activatie.
- De vaultkey is nog **niet** op Vercel toegevoegd en er zijn **geen** wachtwoorden of TOTP-geheimen naar live Redis geschreven.
- De huidige eigenaar-login en alle bestaande MC-Node-integraties blijven ongewijzigd. De Pull Request blijft concept totdat staging, recovery en autorisatie van alle dashboardroutes aantoonbaar getest zijn.
