#!/usr/bin/env bash
# Export the macOS signing identity for the Club Royale Safari CI build.
#
# Run this ON A MAC whose login keychain holds the "Mac Development"
# certificate (team Z55MCJLG39) — i.e. the Mac you develop on. It exports the
# cert + private key as a .p12, base64-encodes it, and prints exactly what to
# bring back to Violet. Violet stores them as two GitHub secrets
# (SAFARI_MAC_DEV_CERT_B64 / SAFARI_MAC_DEV_CERT_PASSWORD); the CI workflow
# already imports them into a throwaway keychain before xcodebuild.
#
# No other setup is needed on this Mac.
set -uo pipefail

OUT_DIR="${OUT_DIR:-$HOME/Desktop/safari-signing}"
PW="${PW:-safari-ci-2026}"
KEYCHAIN="${KEYCHAIN:-$HOME/Library/Keychains/login.keychain-db}"

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

echo "==> Keychain : $KEYCHAIN"
echo "==> Output   : $OUT_DIR/mac-identities.p12"
echo "==> Password : $PW"
echo ""

# -t identities exports every certificate that has a private key (this includes
# the "Mac Development" identity the build needs). May prompt for your login
# password to unlock the keychain — that's expected.
if security export -t identities -k "$KEYCHAIN" -f pkcs12 -o mac-identities.p12 -P "$PW"; then
  base64 -i mac-identities.p12 | tr -d '\n' > mac-identities.p12.b64
  echo ""
  echo "============================================================"
  echo " Done. Bring these two things back to Violet:"
  echo ""
  echo "   password : $PW"
  echo "   base64   : $OUT_DIR/mac-identities.p12.b64  ($(wc -c < mac-identities.p12.b64) bytes)"
  echo ""
  echo " Copy the base64 to your clipboard with:"
  echo "   pbcopy < $OUT_DIR/mac-identities.p12.b64"
  echo "============================================================"
  exit 0
fi

echo ""
echo "Command-line export failed (or was cancelled). Use Keychain Access instead:"
echo "  1. Spotlight > 'Keychain Access'."
echo "  2. Left sidebar: 'login' keychain, then 'My Certificates'."
echo "  3. Find 'Mac Development' (team Z55MCJLG39). Expand the triangle —"
echo "     it must have a private key (a key icon) underneath."
echo "  4. Right-click 'Mac Development' > Export... > save as:"
echo "       $OUT_DIR/mac-identities.p12"
echo "     Password: $PW"
echo "  5. In Terminal run:"
echo "       base64 -i $OUT_DIR/mac-identities.p12 | tr -d '\\n' > $OUT_DIR/mac-identities.p12.b64"
echo "       pbcopy < $OUT_DIR/mac-identities.p12.b64"
echo "  Then bring the password + base64 back to Violet."
exit 1
