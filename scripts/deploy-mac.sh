#!/usr/bin/env bash
# Deploy Comp Royale to Chrome Web Store, Firefox AMO, iOS App Store and Mac App Store from a Mac.
# See docs/deploy-mac.md. Credentials come from .env.deploy (gitignored) or the login Keychain; never echoed.
set -euo pipefail
((BASH_VERSINFO[0] >= 4)) || { echo "ERROR: needs bash >= 4 (brew install bash)" >&2; exit 1; }

usage() {
  cat <<U
Usage: scripts/deploy-mac.sh [--dry-run] [--only chrome|firefox|ios|mac] [--skip-chrome] [--skip-firefox]
                             [--skip-ios] [--skip-mac] [--build-local] [--run-id ID] [--xcode-project PATH]
                             [--allow-dirty] [--skip-docs] [--skip-site] [--skip-listing] [--site-dir PATH]
U
}

DRY_RUN=0; BUILD_LOCAL=0; RUN_ID=""; ALLOW_DIRTY=0; SKIP_DOCS=0; SKIP_SITE=0; SKIP_LISTING=0
SITE_DIR="${SITE_DIR:-}"
XCODE_PROJECT="${XCODE_PROJECT:-}"
declare -A TGT=([chrome]=1 [firefox]=1 [ios]=1 [mac]=1)
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --only) shift; [[ "${1:-}" =~ ^(chrome|firefox|ios|mac)$ ]] || { usage; exit 2; }
            for k in "${!TGT[@]}"; do TGT[$k]=0; done; TGT[$1]=1 ;;
    --skip-chrome|--skip-firefox|--skip-ios|--skip-mac) TGT[${1#--skip-}]=0 ;;
    --build-local) BUILD_LOCAL=1 ;;
    --run-id) shift; RUN_ID="${1:?}" ;;
    --xcode-project) shift; XCODE_PROJECT="${1:?}" ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --skip-docs) SKIP_DOCS=1 ;;
    --skip-site) SKIP_SITE=1 ;;
    --skip-listing) SKIP_LISTING=1 ;;
    --site-dir) shift; SITE_DIR="${1:?}" ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac; shift
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
OUT="$ROOT/dist/deploy"; mkdir -p "$OUT"
log()  { printf '==> %s\n' "$*"; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
# run: execute, or in dry-run print what would run (pass a description, not secrets).
would() { if [[ $DRY_RUN -eq 1 ]]; then printf '[dry-run] would: %s\n' "$1"; return 1; fi; return 0; }

# ---- credentials: .env.deploy first, then Keychain (service "comp-royale-deploy", account = var name)
if [[ -f "$ROOT/.env.deploy" ]]; then
  git check-ignore -q .env.deploy || die ".env.deploy is not gitignored"
  set -a; # shellcheck disable=SC1091
  . "$ROOT/.env.deploy"; set +a
fi
cred() { # cred NAME -> exports NAME from Keychain if unset; silent
  local n="$1" v
  if [[ -z "${!n:-}" ]] && command -v security >/dev/null 2>&1; then
    v=$(security find-generic-password -s comp-royale-deploy -a "$n" -w 2>/dev/null || true)
    [[ -n "$v" ]] && export "$n=$v"
  fi
  [[ -n "${!n:-}" ]]
}
have_all() { local n; for n in "$@"; do cred "$n" || return 1; done; }

# ---- preflight
need=(jq node git)
[[ ${TGT[chrome]} -eq 1 || ${TGT[firefox]} -eq 1 ]] && [[ $BUILD_LOCAL -eq 0 ]] && need+=(gh)
[[ ${TGT[firefox]} -eq 1 ]] && need+=(web-ext)
[[ ${TGT[chrome]} -eq 1 ]] && need+=(curl zip)
[[ ${TGT[ios]} -eq 1 || ${TGT[mac]} -eq 1 ]] && need+=(xcodebuild xcrun)
for t in "${need[@]}"; do command -v "$t" >/dev/null 2>&1 || die "missing tool: $t"; done

if [[ $ALLOW_DIRTY -eq 0 && -n "$(git status --porcelain --untracked-files=no)" ]]; then
  if [[ $DRY_RUN -eq 1 ]]; then log "WARNING: git tree is dirty (would abort in a real run)"; else die "git tree is dirty"; fi
fi

PBX=""
if [[ ${TGT[ios]} -eq 1 || ${TGT[mac]} -eq 1 ]]; then
  [[ -n "$XCODE_PROJECT" && -d "$XCODE_PROJECT" ]] || die "set --xcode-project or XCODE_PROJECT to the Safari .xcodeproj"
  PBX="$XCODE_PROJECT/project.pbxproj"
fi
VERSION=$(bash scripts/ci/version-check.sh ${PBX:+"$PBX"}) || die "version mismatch"
log "Version $VERSION  targets: $(for k in chrome firefox ios mac; do [[ ${TGT[$k]} -eq 1 ]] && printf '%s ' "$k"; done) dry-run=$DRY_RUN"

# ---- web zip
EXT="$OUT/ext"
get_web_zip() {
  rm -rf "$EXT"; mkdir -p "$EXT"
  if [[ $BUILD_LOCAL -eq 1 ]]; then
    log "Building web bundle locally (npm ci && npm test, then copying files like package-extension.yml)"
    npm ci --silent && npm test --silent
    git ls-files -- '*.js' '*.css' '*.svg' '*.ico' 'images/*' manifest.json \
      | grep -vE '^(scripts|tests)/|(^|/)jest\.config\.js$|node_modules/' \
      | while read -r f; do mkdir -p "$EXT/$(dirname "$f")"; cp "$f" "$EXT/$f"; done
  else
    local id="$RUN_ID"
    if [[ -z "$id" ]]; then
      for r in $(gh run list --workflow package-extension.yml --branch main -L 20 --json databaseId -q '.[].databaseId'); do
        if gh api "repos/{owner}/{repo}/actions/runs/$r/artifacts" -q '.artifacts[]|select(.name=="club-royale-offers-extension" and .expired==false)|.id' | grep -q .; then id=$r; break; fi
      done
    fi
    [[ -n "$id" ]] || die "no package-extension run with the artifact; use --build-local"
    log "Downloading artifact from run $id"
    gh run download "$id" -n club-royale-offers-extension -D "$EXT"
  fi
  [[ "$(jq -r .version "$EXT/manifest.json")" == "$VERSION" ]] || die "artifact version differs from $VERSION"
  ! grep -q '"nativeMessaging"' "$EXT/manifest.json" || die "nativeMessaging in store manifest"
  rm -f "$OUT/web.zip"; (cd "$EXT" && zip -qr "$OUT/web.zip" .)
  log "Web zip: $OUT/web.zip"
}

deploy_chrome() {
  log "Chrome Web Store"
  if ! have_all CWS_CLIENT_ID CWS_CLIENT_SECRET CWS_REFRESH_TOKEN CWS_EXTENSION_ID CWS_PUBLISHER_ID; then
    [[ $DRY_RUN -eq 1 ]] && { log "CWS credentials not found; skipping read-only checks"; would "upload web.zip and publish to CWS" || true; return; }
    die "CWS credentials missing"
  fi
  local tok sv st i
  tok=$(curl -fsS https://oauth2.googleapis.com/token -d client_id="$CWS_CLIENT_ID" -d client_secret="$CWS_CLIENT_SECRET" \
        -d refresh_token="$CWS_REFRESH_TOKEN" -d grant_type=refresh_token | jq -r .access_token)
  # Chrome Web Store API v2 (v1.1 shut down Oct 15, 2026)
  local item="https://chromewebstore.googleapis.com/v2/publishers/$CWS_PUBLISHER_ID/items/$CWS_EXTENSION_ID"
  sv=$(curl -fsS -H "Authorization: Bearer $tok" "$item:fetchStatus" \
       | jq -r '[(.submittedItemRevisionStatus, .publishedItemRevisionStatus) | .distributionChannels[]?.crxVersion] | map(select(.)) | first // "0"')
  log "CWS store version $sv"
  bash scripts/ci/semver-gt.sh "$VERSION" "$sv" || die "$VERSION is not greater than CWS $sv"
  if would "POST web.zip to CWS v2 :upload for $CWS_EXTENSION_ID, then :publish"; then
    st=$(curl -fsS -X POST -H "Authorization: Bearer $tok" -T "$OUT/web.zip" \
         "https://chromewebstore.googleapis.com/upload/v2/publishers/$CWS_PUBLISHER_ID/items/$CWS_EXTENSION_ID:upload" | jq -r .uploadState)
    for i in $(seq 1 30); do
      [[ "$st" == SUCCEEDED ]] && break
      [[ "$st" == FAILED ]] && die "CWS upload failed"
      sleep 10; st=$(curl -fsS -H "Authorization: Bearer $tok" "$item:fetchStatus" | jq -r .lastAsyncUploadState)
      log "upload state $st ($i)"
    done
    [[ "$st" == SUCCEEDED ]] || die "CWS upload did not finish"
    curl -fsS -X POST -H "Authorization: Bearer $tok" -H "Content-Length: 0" "$item:publish" | jq '{state}'
  fi
}

deploy_firefox() {
  log "Firefox AMO"
  web-ext lint --source-dir "$EXT" --self-hosted=false >/dev/null && log "web-ext lint passed"
  if cred AMO_ADDON_ID; then
    local sv; sv=$(curl -fsS "https://addons.mozilla.org/api/v5/addons/addon/$AMO_ADDON_ID/" | jq -r '.current_version.version // "0"')
    log "AMO listed version $sv"; bash scripts/ci/semver-gt.sh "$VERSION" "$sv" || die "$VERSION is not greater than AMO $sv"
  fi
  if would "web-ext sign --channel listed (AMO_JWT_ISSUER/SECRET)"; then
    have_all AMO_JWT_ISSUER AMO_JWT_SECRET || die "AMO credentials missing"
    web-ext sign --source-dir "$EXT" --artifacts-dir "$OUT/amo" --channel listed \
      --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET" --approval-timeout 0
  fi
}

# ---- Apple (login Keychain + automatic signing; ASC API key authorises provisioning and upload)
asc_auth() {
  have_all ASC_KEY_ID ASC_ISSUER_ID || return 1
  ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8}"
  [[ -f "$ASC_KEY_PATH" ]]
}
scheme_for() { # scheme_for ios|mac
  local want="$1" s
  s=$(xcodebuild -project "$XCODE_PROJECT" -list -json | jq -r '.project.schemes[]' \
      | grep -i -E "$([[ $want == ios ]] && echo 'ios' || echo 'mac')" | head -1 || true)
  [[ -n "$s" ]] || die "no $want scheme found; set SCHEME_${want^^}"
  echo "$s"
}
deploy_apple() {
  local plat="$1" scheme dest arch exp auth=()
  local v="SCHEME_${plat^^}"; scheme="${!v:-$(scheme_for "$plat")}"
  dest=$([[ $plat == ios ]] && echo "generic/platform=iOS" || echo "generic/platform=macOS")
  arch="$OUT/$plat.xcarchive"; exp="$OUT/$plat-export"
  log "Apple $plat: scheme '$scheme'"
  if asc_auth; then auth=(-allowProvisioningUpdates -authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
  else log "ASC API key not found; using Xcode account for automatic signing"; auth=(-allowProvisioningUpdates); fi
  cat > "$OUT/ExportOptions-$plat.plist" <<X
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>${APPLE_TEAM_ID:-Z55MCJLG39}</string>
  <key>destination</key><string>export</string>
  <key>uploadSymbols</key><true/>
</dict></plist>
X
  # Archiving is local only, so it also runs in dry-run to prove signing works.
  xcodebuild archive -project "$XCODE_PROJECT" -scheme "$scheme" -configuration Release -destination "$dest" \
    -archivePath "$arch" "${auth[@]}" | tail -n 5
  rm -rf "$exp"
  xcodebuild -exportArchive -archivePath "$arch" -exportPath "$exp" -exportOptionsPlist "$OUT/ExportOptions-$plat.plist" "${auth[@]}" | tail -n 5
  local pkg; pkg=$(find "$exp" -maxdepth 1 \( -name '*.ipa' -o -name '*.pkg' \) | head -1)
  [[ -n "$pkg" ]] || die "no .ipa/.pkg exported for $plat"
  log "Exported $pkg"
  if would "xcrun altool --upload-app -f $(basename "$pkg") -t $([[ $plat == ios ]] && echo ios || echo macos)"; then
    asc_auth || die "ASC_KEY_ID/ASC_ISSUER_ID/.p8 required for upload"
    mkdir -p "$HOME/.appstoreconnect/private_keys"
    [[ -f "$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8" ]] || cp "$ASC_KEY_PATH" "$HOME/.appstoreconnect/private_keys/"
    xcrun altool --upload-app -f "$pkg" -t "$([[ $plat == ios ]] && echo ios || echo macos)" \
      --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
    log "Uploaded. Submit for review in App Store Connect once processing finishes."
  fi
}

if [[ ${TGT[chrome]} -eq 1 || ${TGT[firefox]} -eq 1 ]]; then get_web_zip; fi
[[ ${TGT[chrome]}  -eq 1 ]] && deploy_chrome
[[ ${TGT[firefox]} -eq 1 ]] && deploy_firefox
[[ ${TGT[ios]}     -eq 1 ]] && deploy_apple ios
[[ ${TGT[mac]}     -eq 1 ]] && deploy_apple mac
# ---- release notes, README, website, store listings (after the stores)
RT=(python3 scripts/ci/release_tools.py)
APPLY=(); [[ $DRY_RUN -eq 0 ]] && APPLY=(--apply)
if [[ $SKIP_DOCS -eq 0 || $SKIP_LISTING -eq 0 ]]; then
  if [[ ! -f "store-listing/release-notes/$VERSION.md" ]]; then
    log "Drafting release notes for $VERSION (house style; needs wordsmithing)"
    "${RT[@]}" notes "$VERSION" "${APPLY[@]}"
    [[ $DRY_RUN -eq 1 ]] || die "edit store-listing/release-notes/$VERSION.md, commit it, and rerun"
  fi
  if [[ -f "store-listing/release-notes/$VERSION.md" ]]; then
    "${RT[@]}" check "$VERSION" || { [[ $DRY_RUN -eq 1 ]] && log "WARNING: notes fail the style check (would abort)"; [[ $DRY_RUN -eq 1 ]] || exit 1; }
    python3 scripts/ci/listing_lint.py --strict || { [[ $DRY_RUN -eq 1 ]] || die "listing lint errors"; }
  fi
fi
if [[ $SKIP_DOCS -eq 0 && -f "store-listing/release-notes/$VERSION.md" ]]; then
  log "README + GitHub release notes"
  "${RT[@]}" docs "$VERSION" "${APPLY[@]}"
  if would "commit README/listing on docs/release-$VERSION, push it, open a PR to main, and set the release/$VERSION notes"; then
    if ! git diff --quiet -- README.md docs/store-listing.cleaned.md; then
      git switch -c "docs/release-$VERSION"
      git add README.md docs/store-listing.cleaned.md
      git commit -m "docs: README for v$VERSION"
      git push -u origin "docs/release-$VERSION"
      gh pr create --base main --title "docs: v$VERSION README" --body "From scripts/deploy-mac.sh"
      git switch -
    fi
    "${RT[@]}" github "$VERSION" > "$OUT/gh-notes.md"
    if gh release view "release/$VERSION" >/dev/null 2>&1; then
      gh release edit "release/$VERSION" --notes-file "$OUT/gh-notes.md"
    else
      gh release create "release/$VERSION" --title "v$VERSION" --notes-file "$OUT/gh-notes.md"
    fi
  fi
fi
if [[ $SKIP_SITE -eq 0 && -f "store-listing/release-notes/$VERSION.md" ]]; then
  SITE_DIR="${SITE_DIR:-$ROOT/../comproyale-site}"
  if [[ ! -d "$SITE_DIR/.git" ]]; then log "TODO: website repo not found at $SITE_DIR (--site-dir); skipped"
  else
    log "Website ($SITE_DIR)"
    [[ -z "$(git -C "$SITE_DIR" status --porcelain --untracked-files=no)" ]] || { [[ $DRY_RUN -eq 1 ]] || die "website tree is dirty"; }
    "${RT[@]}" docs "$VERSION" --site "$SITE_DIR" --site-only "${APPLY[@]}"
    if would "commit index.html in $SITE_DIR and push its default branch"; then
      if ! git -C "$SITE_DIR" diff --quiet; then
        git -C "$SITE_DIR" commit -am "Release v$VERSION"
        git -C "$SITE_DIR" push origin HEAD
      fi
    fi
  fi
fi
if [[ $SKIP_LISTING -eq 0 && -f "store-listing/release-notes/$VERSION.md" ]]; then
  log "Store listings"
  "${RT[@]}" listing "$VERSION" --out "$OUT/listing"
  log "Chrome/Edge have no listing API: paste $OUT/listing/chrome-description.txt in the dashboard"
  if [[ ${TGT[firefox]} -eq 1 ]]; then cred AMO_JWT_ISSUER || true; cred AMO_JWT_SECRET || true; cred AMO_ADDON_ID || true
    "${RT[@]}" amo "$VERSION" "${APPLY[@]}" || { [[ $DRY_RUN -eq 1 ]] || exit 1; }; fi
  for p in ios mac; do
    [[ ${TGT[$p]} -eq 1 ]] || continue
    cred ASC_KEY_ID || true; cred ASC_ISSUER_ID || true
    "${RT[@]}" asc "$VERSION" --platform "$([[ $p == ios ]] && echo IOS || echo MAC_OS)" "${APPLY[@]}" || { [[ $DRY_RUN -eq 1 ]] || exit 1; }
  done
fi
log "Done (dry-run=$DRY_RUN)"
