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
