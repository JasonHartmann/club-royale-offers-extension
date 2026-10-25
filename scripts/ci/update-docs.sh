#!/usr/bin/env bash
# Idempotent: refresh release notes, README and (optionally) the website for VERSION.
# Usage: update-docs.sh VERSION [SITE_DIR] [--apply]   (without --apply only diffs are printed)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
v="${1:?version}"; site=""; apply=()
shift
for x in "$@"; do if [[ "$x" == --apply ]]; then apply=(--apply); else site="$x"; fi; done
python3 "$here/release_tools.py" notes "$v" "${apply[@]}"
if [[ ${#apply[@]} -eq 0 && ! -f "$here/../../store-listing/release-notes/$v.md" ]]; then
  echo "(dry run: notes for $v not written, so README/site diffs are skipped)"; exit 0
fi
python3 "$here/release_tools.py" docs "$v" ${site:+--site "$site"} "${apply[@]}"
