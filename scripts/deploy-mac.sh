#!/usr/bin/env bash
# Deploy Comp Royale to Chrome Web Store, Firefox AMO, iOS App Store and Mac App Store from a Mac.
# See docs/deploy-mac.md. Credentials come from .env.deploy (gitignored) or the login Keychain; never echoed.
set -euo pipefail
((BASH_VERSINFO[0] >= 4)) || { echo "ERROR: needs bash >= 4 (brew install bash)" >&2; exit 1; }

usage() {
  cat <<U
Usage: scripts/deploy-mac.sh [--dry-run] [--only chrome|firefox|ios|mac] [--skip-chrome] [--skip-firefox]
                             [--skip-ios] [--skip-mac] [--build-local] [--run-id ID] [--xcode-project PATH]
                             [--allow-dirty]
U
}

DRY_RUN=0; BUILD_LOCAL=0; RUN_ID=""; ALLOW_DIRTY=0
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
  if ! have_all CWS_CLIENT_ID CWS_CLIENT_SECRET CWS_REFRESH_TOKEN CWS_EXTENSION_ID; then
    [[ $DRY_RUN -eq 1 ]] && { log "CWS credentials not found; skipping read-only checks"; would "upload web.zip and publish to CWS" || true; return; }
    die "CWS credentials missing"
  fi
  local tok sv
  tok=$(curl -fsS https://oauth2.googleapis.com/token -d client_id="$CWS_CLIENT_ID" -d client_secret="$CWS_CLIENT_SECRET" \
        -d refresh_token="$CWS_REFRESH_TOKEN" -d grant_type=refresh_token | jq -r .access_token)
  local api="https://www.googleapis.com/chromewebstore/v1.1/items/$CWS_EXTENSION_ID"
  sv=$(curl -fsS -H "Authorization: Bearer $tok" "$api?projection=DRAFT" | jq -r '.crxVersion // "0"')
  log "CWS draft version $sv"
  bash scripts/ci/semver-gt.sh "$VERSION" "$sv" || die "$VERSION is not greater than CWS $sv"
  if would "PUT web.zip to CWS item $CWS_EXTENSION_ID, then POST publish"; then
    curl -fsS -X PUT -H "Authorization: Bearer $tok" -H "x-goog-api-version: 2" -T "$OUT/web.zip" \
      "https://www.googleapis.com/upload/chromewebstore/v1.1/items/$CWS_EXTENSION_ID" | jq '{uploadState,itemError}'
    curl -fsS -X POST -H "Authorization: Bearer $tok" -H "x-goog-api-version: 2" -H "Content-Length: 0" "$api/publish" | jq '{status,statusDetail}'
    curl -fsS -H "Authorization: Bearer $tok" "$api?projection=DRAFT" | jq '{crxVersion,uploadState}'
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
log "Done (dry-run=$DRY_RUN)"
