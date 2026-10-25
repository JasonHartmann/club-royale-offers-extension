# deploy-mac.sh: deploy all four stores from your MacBook

```
scripts/deploy-mac.sh --dry-run --xcode-project ~/src/club-royale-safari/"Comp Royale Offers.xcodeproj"
scripts/deploy-mac.sh --only chrome --dry-run
scripts/deploy-mac.sh --skip-ios --skip-mac            # real: CWS + AMO
scripts/deploy-mac.sh --only mac --xcode-project ...   # real: Mac App Store pkg upload
```
Options: `--dry-run`, `--only chrome|firefox|ios|mac`, `--skip-chrome|--skip-firefox|--skip-ios|--skip-mac`, `--build-local` (build the web bundle with `npm ci && npm test` instead of downloading the CI artifact), `--run-id ID`, `--xcode-project PATH` (or `XCODE_PROJECT`), `--allow-dirty`, `--skip-docs` (README + GitHub release), `--skip-site`, `--skip-listing` (AMO and App Store listing PATCH calls, plus paste files), `--site-dir PATH` (default `../comproyale-site`). You can override schemes with `SCHEME_IOS` and `SCHEME_MAC`.

Dry run: preflight checks, version checks, the artifact download, `web-ext lint`, and a local Xcode archive + export (this proves signing works) all run. Store GETs run only if credentials are found. Every upload and submit only prints `[dry-run] would: ...`.

## Install
`brew install bash jq node gh` and `npm i -g web-ext`, plus Xcode signed into your Apple ID (Settings > Accounts). macOS ships bash 3.2, and the script needs bash 4+ from Homebrew. Run `gh auth login` once.

## Credentials
The script reads `.env.deploy` in the repo root (it's gitignored and the script refuses to run if it isn't). Anything missing there is looked up in the login Keychain under service `comp-royale-deploy`, with the variable name as the account. Values are never printed.
```
# .env.deploy
CWS_CLIENT_ID=...
CWS_CLIENT_SECRET=...
CWS_REFRESH_TOKEN=...
CWS_EXTENSION_ID=...
CWS_PUBLISHER_ID=...
AMO_JWT_ISSUER=...
AMO_JWT_SECRET=...
AMO_ADDON_ID=...
ASC_KEY_ID=...
ASC_ISSUER_ID=...
# ASC_KEY_PATH=~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8   (default)
# APPLE_TEAM_ID=Z55MCJLG39                                          (default)
```
To use the Keychain instead: `security add-generic-password -s comp-royale-deploy -a CWS_REFRESH_TOKEN -w` (it prompts for the value, so the value never goes in shell history).

See [ci-store-deploy.md](ci-store-deploy.md) for what each credential is and where to get it. Apple specifics:
- Signing uses your **login Keychain with automatic signing** (`-allowProvisioningUpdates`). If the ASC key is present, Xcode uses it to create or refresh certificates and profiles. Otherwise it uses your Xcode account.
- The ASC API key needs the **App Manager** role (or Admin). Your account needs to be able to create Apple Distribution and Mac Installer Distribution certificates (Admin or Account Holder), or those certificates must already be in your Keychain.
- Export uses method `app-store-connect`. iOS produces an .ipa and macOS a .pkg, and both are uploaded with `xcrun altool --upload-app`. Mac App Store builds don't need notarization. After processing finishes, submit for review in App Store Connect.

## Docs, website and listings (after the store uploads)
1. If `store-listing/release-notes/X.Y.Z.md` is missing, a draft is generated from git log. A real run stops so you can reword the draft in your style ([release-notes-style.md](release-notes-style.md)) and commit it.
2. `release_tools.py check` and `listing_lint.py --strict` must pass.
3. README: commits to `docs/release-X.Y.Z`, pushes, and opens a PR. GitHub release: creates or edits `release/X.Y.Z`.
4. Website: updates `index.html` (title, hero badge, What's New, version history), then commits and pushes in `--site-dir`. Refuses to run if that tree is dirty.
5. Listings: writes paste files to `dist/deploy/listing/`. Sends PATCH requests to AMO and to App Store Connect (`whatsNew` and `description`, which needs the app version to exist in App Store Connect). Chrome is paste-only.
`--dry-run` shows every diff and changes nothing.
