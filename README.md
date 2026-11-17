# Dress Kid

Dress Kid is een kleine webapp waarmee kinderen (vanaf ongeveer 4 jaar) zelf hun outfit voor de dag kiezen. Ouders vullen een virtuele kleerkast met foto's van de kleding van hun kind. Het kind kiest daarna uit wat er beschikbaar is.

## Functies

- **Kinderomgeving** (`/#/`): het kind kiest per categorie (shirt, broek of rok, jurk, trui of vest, sokken, schoenen, jas, extraatje) een kledingstuk uit de kast. Een jurk kan niet samen met shirt en broek gekozen worden. De gekozen outfit wordt per dag onthouden; "Opnieuw beginnen" kan met een knop ongedaan gemaakt worden.
- **Ouderomgeving** (`/#/ouder`): beheer van de kast, achter een eenvoudig ouderslot (een vermenigvuldigsom).
- **Toevoegen**: kleding toevoegen met de camera of uit de galerij, ook meerdere foto's tegelijk. Van elk kledingstuk wordt een verkleinde foto (JPEG, maximaal 800 px) opgeslagen. Achteraf kun je de foto, naam, soort en seizoen aanpassen of het kledingstuk verwijderen.
- **Past niet bij**: je kunt aangeven welke kledingstukken niet samen gedragen worden. Dit geldt in beide richtingen.
- **Seizoen**: kleding is gemarkeerd als zomer, winter of altijd. Het seizoen dat de ouder instelt, bepaalt wat het kind ziet.
- **In de was**: een kledingstuk kan tijdelijk op niet-beschikbaar worden gezet, zonder het te verwijderen.
- **Back-up**: de hele kast (inclusief foto's) kan geëxporteerd en weer geïmporteerd worden als één JSON-bestand. Op apparaten die dat ondersteunen verschijnt het deelmenu (handig op iPhone en iPad), anders wordt het bestand gedownload. Het terugzetten weigert bestanden groter dan 200 MB en foto's groter dan 10 MB.
- **Offline en installeerbaar**: als PWA werkt de app zonder internet en kan hij op het startscherm van telefoon of tablet worden gezet.

## Privacy en bewaren van gegevens

- Alle gegevens blijven op het apparaat. De app heeft geen server en stuurt niets naar het internet. De kast staat in de opslag van de browser (IndexedDB). Elk apparaat heeft dus zijn eigen kast: er is geen synchronisatie. Wil je dezelfde kast op een tweede apparaat, gebruik dan een back-up.
- De browser mag opgeslagen gegevens van een site opruimen als het apparaat vol raakt, tenzij de site "persistente opslag" heeft. De app vraagt hier bij het openen van de ouderomgeving en na het toevoegen van kleding om, maar de browser beslist. Zet de app daarom op het beginscherm (dat vergroot de kans op bescherming, vooral op iOS) en maak regelmatig een back-up. In het tabblad Back-up zie je of de opslag beschermd is en hoeveel ruimte de kast ongeveer gebruikt.
- Wis je de browsergegevens van de site, of raak je het apparaat kwijt, dan is de kast weg als er geen back-up is.
- Het ouderslot is **geen echte beveiliging**. Het houdt alleen een jong kind uit de beheeromgeving; wie kan rekenen of de code leest, komt er gewoon in. Het slot gaat weer dicht zodra je via de link terug naar de kinderomgeving gaat of de ouderpagina verlaat, en na 5 minuten zonder activiteit of met een verborgen pagina. Opnieuw laden binnen die tijd houdt de ouderomgeving open.

## Lokaal ontwikkelen

Vereist: Node.js 22.

```bash
npm ci             # installeren
npm run dev        # ontwikkelserver op http://localhost:5173
npm run build      # typecheck + productiebuild naar dist/
npm run preview    # bekijk de productiebuild lokaal
npm run lint       # ESLint
npm run typecheck  # TypeScript zonder build
npm test           # tests (Vitest)
```

De camera en het installeren als app werken alleen in een beveiligde context: HTTPS of `localhost`. Testen op een telefoon via een IP-adres op het lokale netwerk werkt dus niet zonder HTTPS. Gebruik dan de Azure-URL (zie hieronder).

## Projectstructuur

```
src/
├── domain/   domeintypes en pure logica (compat: wat past bij elkaar, outfit-regels; image: foto's verkleinen)
├── storage/  opslaglaag (contract WardrobeStore, IndexedDB, back-up export/import, persistente opslag)
├── kid/      kinderomgeving (route /)
├── parent/   ouderomgeving (route /ouder): kast, toevoegen, kledingstuk, seizoen, back-up, ouderslot
├── shared/   gedeelde React-hooks (useWardrobe, usePhotoUrl)
├── styles/   globale stijlen
└── test/     testconfiguratie
```

De app gebruikt `HashRouter`, dus alle routes staan na een `#`: `/#/` en `/#/ouder`. Daardoor werkt hosting als statische site zonder serverconfiguratie.

## Hosting op Azure Storage

De app wordt als statische website gehost op Azure Storage. Het eindpunt is altijd HTTPS, wat nodig is voor de camera en het installeren als PWA.

Vereisten: de [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli), een Azure-abonnement en `az login`.

Stel de variabelen eenmalig in:

```bash
RG=rg-dress-kid
LOCATION=westeurope
ACCOUNT=<unieke-naam>    # 3-24 tekens, alleen kleine letters en cijfers
```

### 1. Opslagaccount aanmaken

```bash
az group create --name "$RG" --location "$LOCATION"

az storage account create \
  --name "$ACCOUNT" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --min-tls-version TLS1_2
```

### 2. Statische website inschakelen

```bash
az storage blob service-properties update \
  --account-name "$ACCOUNT" \
  --auth-mode login \
  --static-website \
  --index-document index.html \
  --404-document index.html
```

Hiermee wordt de container `$web` aangemaakt. Het adres van de site vind je met:

```bash
az storage account show --name "$ACCOUNT" --resource-group "$RG" \
  --query "primaryEndpoints.web" -o tsv
```

De `--404-document index.html` zorgt dat de app ook bij een onbekend pad wordt geladen.

### 3. Build uploaden

Je eigen account heeft een data-rol nodig om met `--auth-mode login` te uploaden:

```bash
ME=$(az ad signed-in-user show --query id -o tsv)
SCOPE=$(az storage account show --name "$ACCOUNT" --resource-group "$RG" --query id -o tsv)
az role assignment create --assignee "$ME" --role "Storage Blob Data Contributor" --scope "$SCOPE"
```

Bouw en upload daarna (wacht even tot de rol actief is als de upload meteen faalt):

```bash
npm ci
npm run build
az storage blob upload-batch --account-name "$ACCOUNT" --auth-mode login \
  -d '$web' -s dist --overwrite
```

Let op: `index.html`, `sw.js`, `registerSW.js` en `manifest.webmanifest` moeten niet gecachet worden, zodat updates van de app direct aankomen. De deploy-workflow uploadt eerst alle andere bestanden en daarna deze vier (met `no-cache`, `index.html` als laatste). Handmatig kun je ze zo een `no-cache`-header geven:

```bash
for f in index.html sw.js registerSW.js manifest.webmanifest; do
  az storage blob update --account-name "$ACCOUNT" --auth-mode login \
    --container-name '$web' --name "$f" --content-cache-control "no-cache"
done
```

## Automatisch deployen met GitHub Actions

De workflow `.github/workflows/ci-deploy.yml` doet bij elke pull request en elke push naar `main` de controles (lint, typecheck, tests, build). Bij een push naar `main` wordt daarna gedeployed naar Azure Storage en naar GitHub Pages. De deploys gebruiken OIDC, dus er staat geen wachtwoord of sleutel in GitHub.

### GitHub Pages

De job `pages` publiceert dezelfde build op <https://webstarvenlo.github.io/dress-kid/>. Door de relatieve paden (`base: './'`) en `HashRouter` werkt de app daar zonder aanpassingen, inclusief camera en installeren als app (Pages is altijd HTTPS).

Eenmalig instellen: zet in de repository onder **Settings → Pages → Build and deployment** de bron op **GitHub Actions**. Opnieuw deployen zonder nieuwe commit kan via **Actions → CI en deploy → Run workflow** (op `main`).

### Eenmalige Azure-configuratie

Maak een app-registratie aan met een federated credential voor deze repository:

```bash
GH_REPO=WebStarVenlo/dress-kid

APP_ID=$(az ad app create --display-name "github-dress-kid" --query appId -o tsv)
APP_OBJ_ID=$(az ad app show --id "$APP_ID" --query id -o tsv)
az ad sp create --id "$APP_ID"

az ad app federated-credential create --id "$APP_OBJ_ID" --parameters '{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:'"$GH_REPO"':ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'

SCOPE=$(az storage account show --name "$ACCOUNT" --resource-group "$RG" --query id -o tsv)
az role assignment create --assignee "$APP_ID" \
  --role "Storage Blob Data Contributor" --scope "$SCOPE"
```

De `subject` moet exact overeenkomen met de workflow: de deploy-job draait op `refs/heads/main` en gebruikt geen GitHub-`environment`.

### Instellingen in GitHub

Ga naar **Settings → Secrets and variables → Actions**.

Secrets (tab *Secrets*):

| Naam | Waarde |
| --- | --- |
| `AZURE_CLIENT_ID` | `$APP_ID` (de appId van de app-registratie) |
| `AZURE_TENANT_ID` | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | `az account show --query id -o tsv` |

Variable (tab *Variables*):

| Naam | Waarde |
| --- | --- |
| `AZURE_STORAGE_ACCOUNT` | de naam van het opslagaccount, bijv. `$ACCOUNT` |

Zolang de variable `AZURE_STORAGE_ACCOUNT` niet is ingesteld, slaat de workflow de deploy-stap over. De controles draaien dan wel.
