#!/usr/bin/env bash
# Checks manifest.json, package.json and (optionally) an Xcode pbxproj agree on the version.
# Usage: version-check.sh [path/to/project.pbxproj]   Prints the version on success.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
mv_=$(jq -r .version "$root/manifest.json")
pv=$(jq -r .version "$root/package.json")
[[ "$mv_" == "$pv" ]] || { echo "::error::manifest.json ($mv_) != package.json ($pv)" >&2; exit 1; }
if [[ $# -ge 1 && -n "$1" ]]; then
  mapfile -t xv < <(grep -oE 'MARKETING_VERSION = [^;]+' "$1" | awk '{print $3}' | tr -d '"' | sort -u)
  [[ ${#xv[@]} -eq 1 ]] || { echo "::error::Xcode targets disagree on MARKETING_VERSION: ${xv[*]:-none}" >&2; exit 1; }
  [[ "${xv[0]}" == "$mv_" ]] || { echo "::error::Xcode MARKETING_VERSION (${xv[0]}) != manifest ($mv_)" >&2; exit 1; }
  nb=$(grep -oE 'CURRENT_PROJECT_VERSION = [^;]+' "$1" | awk '{print $3}' | tr -d '"' | sort -u | wc -l)
  [[ "$nb" -eq 1 ]] || { echo "::error::Xcode targets disagree on CURRENT_PROJECT_VERSION" >&2; exit 1; }
fi
echo "$mv_"
