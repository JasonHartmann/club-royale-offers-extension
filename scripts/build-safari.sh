#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

APP_NAME="${APP_NAME:-Club Royale Offers}"
BUNDLE_ID="${BUNDLE_ID:-com.percex.club-royale-offers}"
PROJECT_LOCATION="${PROJECT_LOCATION:-$EXTENSION_ROOT/safari-build}"
DERIVED_DATA="${DERIVED_DATA:-$PROJECT_LOCATION/DerivedData}"
CONFIGURATION="${CONFIGURATION:-Release}"
SCHEME="${SCHEME:-${APP_NAME} (macOS)}"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-$PROJECT_LOCATION/artifacts}"

if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "Error: safari-web-extension-converter not found. Install Xcode and the command line tools." >&2
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "Error: xcodebuild not found. Install Xcode and the command line tools." >&2
  exit 1
fi

mkdir -p "$PROJECT_LOCATION" "$ARTIFACTS_DIR"

xcrun safari-web-extension-converter "$EXTENSION_ROOT" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --project-location "$PROJECT_LOCATION" \
  --force

PROJECT_PATH="$PROJECT_LOCATION/$APP_NAME.xcodeproj"
if [ ! -d "$PROJECT_PATH" ]; then
  echo "Error: expected Xcode project at $PROJECT_PATH" >&2
  exit 1
fi

xcodebuild \
  -project "$PROJECT_PATH" \
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

if [ "${BUILD_IOS:-0}" = "1" ]; then
  IOS_SCHEME="${IOS_SCHEME:-${APP_NAME} (iOS)}"
  xcodebuild \
    -project "$PROJECT_PATH" \
    -scheme "$IOS_SCHEME" \
    -configuration "$CONFIGURATION" \
    -derivedDataPath "$DERIVED_DATA" \
    -destination "generic/platform=iOS" \
    build
  echo "Built iOS scheme: $IOS_SCHEME"
fi
