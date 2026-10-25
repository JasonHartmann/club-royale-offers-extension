# Store deploy via GitHub Actions (setup)

New, manual-only workflows. They do not change `package-extension.yml` and do not run on push or tag.

| Workflow | File | Status |
|---|---|---|
| Chrome Web Store + Firefox AMO | `.github/workflows/store-deploy-web.yml` | Ready. Dry run by default |
| iOS / macOS App Store | `.github/workflows/store-deploy-apple.yml` | **Paused stub**: unsigned compile check only. Use `scripts/deploy-mac.sh` ([docs/deploy-mac.md](deploy-mac.md)) |

## How a run works
1. Actions > "Store deploy (Chrome Web Store + Firefox AMO)" > Run workflow.
2. `build_run_id` blank = latest `package-extension.yml` run on `main` that still has the `club-royale-offers-extension` artifact. The zip is reused as-is, not rebuilt.
3. `submit` = false (default): checks that the manifest and package versions match, that the artifact version matches, that nativeMessaging is absent, and runs `web-ext lint`. If credentials are visible, it also does read-only GETs to confirm our version is newer than the store's. Nothing is uploaded.
4. `submit` = true: jobs use the `store-production` environment, so they wait for a required reviewer. Then CWS uploads and publishes (submits for review), and AMO runs `web-ext sign --channel listed`. Item status is read back afterwards.

## GitHub environments (Settings > Environments)
- `store-production`: add yourself as a **Required reviewer**, limit deployment branches to `main`, and store the secrets below **here** (environment secrets).
- `store-dry-run`: no protection. GitHub creates it on first use. If you also want the read-only store version checks in dry runs, add the CWS secrets here too (optional).

## Secrets and variables
| Name | Kind | What it is | Where to get it |
|---|---|---|---|
| `CWS_CLIENT_ID` | secret | Google OAuth client ID (Desktop app type) | Google Cloud Console > APIs & Services > Credentials. First enable "Chrome Web Store API" |
| `CWS_CLIENT_SECRET` | secret | Secret for that OAuth client | Same place |
| `CWS_REFRESH_TOKEN` | secret | Refresh token for the Google account that owns the CWS item, with scope `https://www.googleapis.com/auth/chromewebstore` | One-time OAuth consent (OAuth Playground, using your own client) |
| `CWS_PUBLISHER_ID` | variable | Publisher ID, needed by the Chrome Web Store **API v2** (v1.1 was shut down Oct 15, 2026) | CWS Developer Dashboard > Publisher > Settings |
| `CWS_EXTENSION_ID` | variable | The 32-character item ID | CWS Developer Dashboard URL for the item |
| `AMO_JWT_ISSUER` | secret | AMO API key ("JWT issuer") | https://addons.mozilla.org/developers/addon/api/key/ |
| `AMO_JWT_SECRET` | secret | AMO API secret ("JWT secret") | Same page |
| `AMO_ADDON_ID` | variable | Add-on GUID from `browser_specific_settings.gecko.id` in manifest.json, or the slug | manifest.json / AMO dashboard |
| `SITE_REPO` | variable | `JasonHartmann/comproyale-site`. Leave it empty to skip the website step | - |
| `SITE_REPO_TOKEN` | secret | Fine-grained PAT with **Contents: Read and write** on comproyale-site only (it's private) | GitHub > Settings > Developer settings > Fine-grained tokens |
| `SAFARI_XCODE_REPO`, `SAFARI_XCODE_REF`, `SAFARI_XCODE_TOKEN` | existing | Already used by package-extension.yml | Unchanged |

### Apple (reserved for when CI signing resumes; not used by any job yet)
Plan: put the p12 files in a temporary keychain on the runner, install the profiles, sign manually, and delete the keychain in `always()`.
| Name | What it is |
|---|---|
| `APPLE_DIST_CERT_P12_BASE64` | base64 of the Apple Distribution cert + private key (.p12) |
| `APPLE_INSTALLER_CERT_P12_BASE64` | base64 of the Mac Installer Distribution cert (.p12), used to sign the MAS .pkg |
| `APPLE_CERT_P12_PASSWORD` | export password for those p12 files |
| `KEYCHAIN_PASSWORD` | any random string, for the temporary runner keychain |
| `PROFILE_IOS_APP_BASE64` | App Store profile, iOS, `com.percex.Club-Royale-and-Blue-Chip-Offers` |
| `PROFILE_IOS_EXT_BASE64` | App Store profile, iOS, `com.percex.Club-Royale-and-Blue-Chip-Offers.Extension` |
| `PROFILE_MAC_APP_BASE64` | Mac App Store profile, `com.percex.Club-Royale-and-Blue-Chip-Offers` |
| `PROFILE_MAC_EXT_BASE64` | Mac App Store profile, `com.percex.Club-Royale-and-Blue-Chip-Offers.Extension` |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` | App Store Connect API key (Users and Access > Integrations), with **App Manager** role (or Admin), used for upload. `ASC_KEY_P8` is the .p8 contents |
Team ID: `Z55MCJLG39`, taken from the project. Roles: the Account Holder or an Admin must create the Apple Distribution and Mac Installer Distribution certificates. Profiles come from developer.apple.com > Profiles.

Note: the Xcode project uses **one bundle ID per role for both platforms** (iOS and macOS app share an ID, and so do the two extensions). That needs four profiles: an iOS and a macOS profile for each of the two IDs.

## Why the current safari-package job fails
`error: No signing certificate "Mac Development" found`. The project uses `CODE_SIGN_STYLE = Automatic` with team Z55MCJLG39 and a Debug-style build. The GitHub macOS runner has no certificates or Apple account, so automatic signing can't find a development identity. The fix is to build unsigned (as the stub does) or import certificates (the paused plan). This branch does not modify that job.

## Release notes, README, website and store listings
- **Sources:**
  - `docs/store-listing.md`: Jason's verbatim listing. Never rewritten.
  - `docs/store-listing.cleaned.md`: written by `scripts/ci/listing_lint.py`, and the only copy the pipeline uses.
  - `store-listing/release-notes/X.Y.Z.md`: one file per version.
  - The style rules are in [release-notes-style.md](release-notes-style.md).
- **Dry run** (`docs-preview` job): drafts notes for a new version, shows the README and website diffs, runs the style check and the listing consistency pass, shows the AMO listing diff (read-only), and uploads the paste files as the `store-listing-paste-files` artifact.
- **submit=true** (`post-deploy` job): runs only after the store jobs succeed, and requires committed notes that pass `check` plus a clean `listing_lint --strict`. It then:
  1. Updates the README and opens a **PR to main** on `docs/release-X.Y.Z`. *Choice for Jason:* a direct push to main is a 3-line change, but a PR was picked so there are no surprise pushes.
  2. Creates or edits the GitHub release `release/X.Y.Z` (title `vX.Y.Z`). The `release/` tag prefix is the existing convention; most tools expect `vX.Y.Z`, so a later switch is noted, not made.
  3. Sends PATCH requests to AMO for the description and the version's release notes.
  4. Pushes the updated `index.html` to the website's default branch.

### Store listing API support (checked Oct 25, 2026)
| Store | Description | Release notes | Pipeline |
|---|---|---|---|
| Chrome Web Store | No API. v2 only has upload, publish, fetchStatus, cancelSubmission and setPublishedDeployPercentage ([reference](https://developer.chrome.com/docs/webstore/api/reference/rest)). Listing edits are dashboard-only ([docs](https://developer.chrome.com/docs/webstore/update)) | No field exists | Paste file `chrome-description.txt` plus a manual step |
| Firefox AMO | `PATCH /api/v5/addons/addon/{id}/` with `description` ([docs](https://mozilla.github.io/addons-server/topics/api/addons.html)) | `PATCH .../versions/v{X.Y.Z}/` with `release_notes` | Automated (submit=true) |
| App Store Connect | `PATCH /v1/appStoreVersionLocalizations/{id}` with `description`, only while the version is editable ([docs](https://developer.apple.com/documentation/appstoreconnectapi/app-store-version-localizations)) | Same call, `whatsNew` | `deploy-mac.sh` (CI Apple is paused) |
| Edge | Not targeted: no Edge listing or ID in the repo. The Edge Add-ons API uploads and publishes packages but doesn't edit listing text | - | Paste file if added |
