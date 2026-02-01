#!/usr/bin/env bash
set -euo pipefail

XCODE_PROJECT_PATH="${XCODE_PROJECT_PATH:-}"
if [ -z "$XCODE_PROJECT_PATH" ]; then
  echo "Error: XCODE_PROJECT_PATH is required (path to .xcodeproj)." >&2
  exit 1
fi

APP_NAME="${APP_NAME:-Club Royale Offers}"
SCHEME="${SCHEME:-${APP_NAME} (macOS)}"
CONFIGURATION="${CONFIGURATION:-Release}"
DERIVED_DATA="${DERIVED_DATA:-$(mktemp -d 2>/dev/null || mktemp -d -t safari-build)}"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-$(pwd)/safari-build/artifacts}"

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "Error: xcodebuild not found. Install Xcode and the command line tools." >&2
  exit 1
fi

mkdir -p "$ARTIFACTS_DIR"

if ! xcodebuild -project "$XCODE_PROJECT_PATH" -scheme "$SCHEME" -list >/dev/null 2>&1; then
  SCHEME=$(/usr/bin/python3 - <<'PY'
import json
import subprocess
import sys

project_path = sys.argv[1]
result = subprocess.run(
    ["xcodebuild", "-project", project_path, "-list", "-json"],
    check=False,
    capture_output=True,
    text=True,
)
if result.returncode != 0:
    sys.exit(result.returncode)

data = json.loads(result.stdout)
schemes = data.get("project", {}).get("schemes", [])
if not schemes:
    sys.exit(1)

preferred = None
for scheme in schemes:
    if "macos" in scheme.lower():
        preferred = scheme
        break

print(preferred or schemes[0])
PY
"$XCODE_PROJECT_PATH")

  if [ -z "$SCHEME" ]; then
    echo "Error: No scheme found in project $XCODE_PROJECT_PATH" >&2
    exit 1
  fi

  echo "Using detected scheme: $SCHEME"
fi

xcodebuild \
  -project "$XCODE_PROJECT_PATH" \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -derivedDataPath "$DERIVED_DATA" \
  build

APP_PATH="$DERIVED_DATA/Build/Products/$CONFIGURATION/$APP_NAME.app"
if [ ! -d "$APP_PATH" ]; then
  echo "Error: build output not found at $APP_PATH" >&2
  exit 1
fi

SAFE_APP_NAME="${APP_NAME// /-}"
ZIP_PATH="$ARTIFACTS_DIR/${SAFE_APP_NAME}-macos.zip"
ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$ZIP_PATH"

echo "Created macOS app zip: $ZIP_PATH"

EXTENSION_APPEX="$APP_PATH/Contents/PlugIns/$APP_NAME Extension.appex"
if [ -d "$EXTENSION_APPEX" ]; then
  APPEX_ZIP="$ARTIFACTS_DIR/${SAFE_APP_NAME}-extension.appex.zip"
  ditto -c -k --sequesterRsrc --keepParent "$EXTENSION_APPEX" "$APPEX_ZIP"
  echo "Created extension zip: $APPEX_ZIP"
fi
