# Dress Kid

Dress Kid is een kleine webapp waarmee kinderen (vanaf ongeveer 4 jaar) zelf hun outfit voor de dag kiezen. Ouders vullen een virtuele kleerkast met foto's van de kleding van hun kind. Het kind kiest daarna uit wat er beschikbaar is.

Status: de app is in ontwikkeling. De basisstructuur staat er; de schermen en functies worden stap voor stap gebouwd.

## Functies

- **Kinderomgeving** (`/#/`): het kind kiest per categorie (shirt, broek, jurk, trui, sokken, schoenen, jas, extraatje) een kledingstuk uit de kast.
- **Ouderomgeving** (`/#/ouder`): beheer van de kast, achter een eenvoudige ouderpoort.
- **Foto's**: van elk kledingstuk wordt een verkleinde foto opgeslagen.
- **Past niet bij**: je kunt aangeven welke kledingstukken niet samen gedragen worden. Dit geldt in beide richtingen.
- **Seizoen**: kleding is gemarkeerd als zomer, winter of altijd. Het seizoen dat de ouder instelt, bepaalt wat het kind ziet.
- **In de was**: een kledingstuk kan tijdelijk op niet-beschikbaar worden gezet, zonder het te verwijderen.
- **Back-up**: de hele kast (inclusief foto's) kan geëxporteerd en weer geïmporteerd worden als één bestand.
- **Offline en installeerbaar**: als PWA werkt de app zonder internet en kan hij op het startscherm van telefoon of tablet worden gezet.

## Privacy

Alle gegevens blijven op het apparaat. De app heeft geen server en stuurt niets naar het internet. De kast staat in de opslag van de browser (IndexedDB).

Let op: als je de browsergegevens van de site wist, is de kast weg. Maak daarom regelmatig een back-up via de ouderomgeving.

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
├── domain/   gedeelde domeintypes (kledingstuk, categorie, seizoen, outfit, instellingen)
├── storage/  opslaglaag (contract WardrobeStore, IndexedDB, back-up export/import)
├── kid/      kinderomgeving (route /)
├── parent/   ouderomgeving (route /ouder)
├── shared/   gedeelde componenten en hulpfuncties (nog niet aangemaakt)
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

Let op: `index.html`, `sw.js` en `manifest.webmanifest` moeten niet gecachet worden, zodat updates van de app direct aankomen. De deploy-workflow zet dat automatisch. Handmatig kun je het zo doen:

```bash
for f in index.html sw.js manifest.webmanifest; do
  az storage blob update --account-name "$ACCOUNT" --auth-mode login \
    --container-name '$web' --name "$f" --content-cache-control "no-cache"
done
```

## Automatisch deployen met GitHub Actions

De workflow `.github/workflows/ci-deploy.yml` doet bij elke pull request en elke push naar `main` de controles (lint, typecheck, tests, build). Bij een push naar `main` wordt daarna gedeployed naar Azure Storage. De deploy gebruikt OIDC, dus er staat geen wachtwoord of sleutel in GitHub.

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
