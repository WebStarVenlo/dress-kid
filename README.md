# Dress Kid

Dress Kid is a small web app that lets children (from about age 4) pick their own outfit for the day. Parents fill a virtual wardrobe with photos of their child's clothes. The child then chooses from what is available.

> Note: the UI text is currently Dutch. The labels quoted below are given in English for readability; see [Internationalization](#internationalization).

## Features

- **Kid area** (`/#/`): the child picks one item per category (shirt, trousers or skirt, dress, sweater or cardigan, socks, shoes, coat, extra) from the wardrobe. A dress cannot be combined with a shirt and trousers. The chosen outfit is remembered per day; "Start over" can be undone with a button.
- **Parent area** (`/#/parent`): manage the wardrobe, behind a simple parent lock (a multiplication sum).
- **Adding items**: add clothing with the camera or from the gallery, including several photos at once. A resized photo (JPEG, max 800 px) is stored for each item. Afterwards you can change the photo, name, type and season, or delete the item.
- **Photos from a webshop**: see [Adding photos from a webshop](#adding-photos-from-a-webshop).
- **Does not go with**: you can mark which items are not worn together. This applies in both directions.
- **Season**: items are marked as summer, winter or always. The season the parent sets determines what the child sees.
- **In the wash**: an item can be temporarily marked as unavailable without deleting it. Clothes worn on a previous day go into the wash automatically (per category, configurable under Settings → Was), and can optionally return by themselves after 1–7 days. The **Wasmand** tab lists everything in the wash (tap one to take it out, or "Alles uit de was"), and "Selecteren" in the wardrobe puts several items in or out of the wash at once.
- **Backup**: the whole wardrobe (including photos) can be exported and imported again as a single JSON file. On devices that support it, the share sheet appears (handy on iPhone and iPad); otherwise the file is downloaded. Restoring rejects files larger than 200 MB and photos larger than 10 MB.
- **Offline and installable**: as a PWA the app works without internet and can be added to the home screen of a phone or tablet.

## Demo backup

`demo/dress-kid-backup-demo.json` is a ready-made backup with two children (Anna, size 110, and Tom, size 68), about 30 clothes each with generated placeholder photos, a few items in the wash and two past outfits per child. To try it, open the parent area, go to the **Backup** tab and restore this file (this replaces the current wardrobe).

Regenerate it with `node scripts/generate-demo-backup.mjs` (optionally `--now=2026-11-21T10:00:00Z` or `--out=path`). The wash times and outfit dates are relative to the moment of generation, so regenerate shortly before a demo to keep the Wasmand filled (items return automatically after 2 days).

## Adding photos from a webshop

You can also add a product photo from a webshop to the wardrobe. In **Add clothing**, first choose what it is, then use the "From webshop" block:

- **Paste**: copy the photo in the webshop (right-click or long-press → Copy image) and paste it with Ctrl+V or the "Paste photo" button (if the browser supports it).
- **Drag**: drag the photo or an image link from the webshop onto the drop area.
- **Image link**: paste the link to the image itself (Copy image address) into the "Paste image link" field and choose "Fetch". If that fails, the webshop usually does not allow fetching; save the photo and choose it from the gallery instead.

**iPhone and iPad.** In Safari, long-press the product photo → **Copy**, then tap **Paste photo** in Dress Kid (and then "Paste"). If that fails, take a screenshot of the webshop page, choose it via **Choose from gallery** and crop it.

**Cropping.** If you add a single photo (from any source), you can first crop it: drag the frame or the corners and choose **Crop**, or **Whole photo** to use it as it is. With multiple photos at once, this step is skipped; you can always crop later via **Crop** on the item in the wardrobe. The "From webshop" card shows the steps for your device; the other devices are listed under "Other devices".

**Android: Share → Dress Kid.** If the app is installed (added to the home screen via Chrome), Dress Kid appears in the share sheet. In the webshop, long-press the product photo (or choose a photo from the gallery) and choose **Share → Dress Kid**. The app opens the parent area; after the parent lock, the add screen is ready with the photo (up to 10 photos of 10 MB each). Choose what it is, and the photo is added. If you only share a page (a link without a photo), the link ends up in the link field; this only works if it is a link to the image itself. On iPhone and iPad this share feature does not exist for web apps; use paste or the gallery there.

## Privacy and data storage

- All data stays on the device. The app has no server and sends nothing to the internet. Only if you paste an image link (or share one) and press "Fetch" does the app retrieve that single image from the site of that link; nothing else is fetched or sent. Shared photos are only temporarily staged on the device until you process them in the add screen. The wardrobe is kept in the browser's storage (IndexedDB). Each device therefore has its own wardrobe: there is no synchronization. If you want the same wardrobe on a second device, use a backup.
- The browser may clear a site's stored data when the device runs low on space, unless the site has "persistent storage". The app asks for this when opening the parent area and after adding clothing, but the browser decides. So put the app on the home screen (this increases the chance of protection, especially on iOS) and make regular backups. The Backup tab shows whether storage is protected and roughly how much space the wardrobe uses.
- If you clear the browser data for the site, or lose the device, the wardrobe is gone unless you have a backup.
- The parent lock is **not real security**. It only keeps a young child out of the management area; anyone who can do arithmetic or read the code gets in. The lock closes again as soon as you go back to the kid area via the link or leave the parent page, and after 5 minutes without activity or when the page is hidden. Reloading within that time keeps the parent area open.

## Local development

Requires: Node.js 22.

```bash
npm ci             # install
npm run dev        # development server on http://localhost:5173
npm run build      # typecheck + production build to dist/
npm run preview    # view the production build locally
npm run lint       # ESLint
npm run typecheck  # TypeScript without build
npm test           # tests (Vitest)
```

The camera and installing the app as an app only work in a secure context: HTTPS or `localhost`. Testing on a phone via an IP address on the local network therefore does not work without HTTPS. In that case use the Azure URL (see below).

## Internationalization

The app uses [i18next](https://www.i18next.com/) with [react-i18next](https://react.i18next.com/).

- Locale files live in `src/i18n/locales/<lng>/<namespace>.json`. The namespaces are `common`, `kid`, `parent`, `settings` and `errors`.
- **Dutch (`nl`) is the only and default language** for now. `src/i18n/index.ts` initializes i18next; `src/i18n/resources.ts` registers the namespaces.
- In React components: `const { t } = useTranslation('kid')` and then `t('header.title')`. Interpolation uses `{{name}}`, plurals use the `_one` / `_other` suffixes with `count`, and markup goes through `<Trans>`.
- Outside React, use `import { t } from '../i18n'` with an explicit namespace.
- Errors thrown by the domain and storage layers are `AppError(code)`, where `code` is a key in `errors.json`. Show them with `translateError(err)` instead of `err.message`.
- Keys are type-checked, so a key that is missing from the JSON makes `npm run typecheck` fail.
- Stored data (IndexedDB names, keys, backup field names, enum values such as `top` or `summer`) is never translated.

**To add a language** (for example English):

1. Copy `src/i18n/locales/nl/` to `src/i18n/locales/en/` and translate the values (keep the keys and placeholders such as `{{name}}` unchanged).
2. Register the new namespaces for `en` in `src/i18n/resources.ts`.
3. There is no language picker in the app yet. Set `lng` in `src/i18n/index.ts`, or call `i18next.changeLanguage('en')`. Note that `src/i18n/i18next.d.ts` types the keys from the `nl` resources, so `nl` stays the reference for key names.
4. `lang` in `index.html` and the PWA manifest must follow the chosen language; see below.

**Not yet localized.** The PWA manifest (name, description, share target text in `vite.config.ts`) and the `<title>` and `lang` in `index.html` are still Dutch-only. The manifest is generated at build time and is not handled by i18next, so these must be localized per language separately later (for example one manifest per locale).

## Project structure

```
src/
├── domain/   domain types and pure logic (compat: what goes together, outfit rules; image: resizing photos)
├── storage/  storage layer (WardrobeStore contract, IndexedDB, backup export/import, persistent storage)
├── kid/      kid area (route /)
├── parent/   parent area (route /parent): wardrobe, adding, item, season, backup, parent lock
├── shared/   shared React hooks (useWardrobe, usePhotoUrl)
├── styles/   global styles
└── test/     test configuration
```

The app uses `HashRouter`, so all routes come after a `#`: `/#/` and `/#/parent`. This means it can be hosted as a static site without server configuration.

## Hosting on Azure Storage

The app is hosted as a static website on Azure Storage. The endpoint is always HTTPS, which is required for the camera and installing as a PWA.

Requirements: the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli), an Azure subscription and `az login`.

Set the variables once:

```bash
RG=rg-dress-kid
LOCATION=westeurope
ACCOUNT=<unique-name>    # 3-24 characters, lowercase letters and digits only
```

### 1. Create the storage account

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

### 2. Enable the static website

```bash
az storage blob service-properties update \
  --account-name "$ACCOUNT" \
  --auth-mode login \
  --static-website \
  --index-document index.html \
  --404-document index.html
```

This creates the container `$web`. You can find the site address with:

```bash
az storage account show --name "$ACCOUNT" --resource-group "$RG" \
  --query "primaryEndpoints.web" -o tsv
```

`--404-document index.html` ensures the app also loads for an unknown path.

### 3. Upload the build

Your own account needs a data role to upload with `--auth-mode login`:

```bash
ME=$(az ad signed-in-user show --query id -o tsv)
SCOPE=$(az storage account show --name "$ACCOUNT" --resource-group "$RG" --query id -o tsv)
az role assignment create --assignee "$ME" --role "Storage Blob Data Contributor" --scope "$SCOPE"
```

Then build and upload (wait a moment for the role to become active if the upload fails immediately):

```bash
npm ci
npm run build
az storage blob upload-batch --account-name "$ACCOUNT" --auth-mode login \
  -d '$web' -s dist --overwrite
```

Note: `index.html`, `sw.js`, `share-target-sw.js`, `registerSW.js` and `manifest.webmanifest` must not be cached, so app updates arrive immediately. The deploy workflow uploads all other files first and then these five (with `no-cache`, `index.html` last). Manually, you can give them a `no-cache` header like this:

```bash
for f in index.html sw.js share-target-sw.js registerSW.js manifest.webmanifest; do
  az storage blob update --account-name "$ACCOUNT" --auth-mode login \
    --container-name '$web' --name "$f" --content-cache-control "no-cache"
done
```

## Automatic deployment with GitHub Actions

The workflow `.github/workflows/ci-deploy.yml` runs the checks (lint, typecheck, tests, build) on every pull request and every push to `main`. On a push to `main`, it then deploys to Azure Storage and to GitHub Pages. The deploys use OIDC, so no password or key is stored in GitHub.

### GitHub Pages

The `pages` job publishes the same build to <https://webstarvenlo.github.io/dress-kid/>. Thanks to the relative paths (`base: './'`) and `HashRouter`, the app works there without changes, including the camera and installing as an app (Pages is always HTTPS).

One-time setup: in the repository, go to **Settings → Pages → Build and deployment** and set the source to **GitHub Actions**. To deploy again without a new commit, use **Actions → CI and deploy → Run workflow** (on `main`).

### One-time Azure configuration

Create an app registration with a federated credential for this repository:

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

The `subject` must match the workflow exactly: the deploy job runs on `refs/heads/main` and does not use a GitHub `environment`.

### Settings in GitHub

Go to **Settings → Secrets and variables → Actions**.

Secrets (tab *Secrets*):

| Name | Value |
| --- | --- |
| `AZURE_CLIENT_ID` | `$APP_ID` (the appId of the app registration) |
| `AZURE_TENANT_ID` | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | `az account show --query id -o tsv` |

Variable (tab *Variables*):

| Name | Value |
| --- | --- |
| `AZURE_STORAGE_ACCOUNT` | the name of the storage account, e.g. `$ACCOUNT` |

As long as the variable `AZURE_STORAGE_ACCOUNT` is not set, the workflow skips the deploy step. The checks still run.
