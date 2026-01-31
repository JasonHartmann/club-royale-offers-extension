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
