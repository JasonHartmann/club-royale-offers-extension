#!/usr/bin/env bash
# Exit 0 if $1 > $2 (dotted numeric versions), else 1.
set -euo pipefail
[[ "$1" != "$2" && "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -1)" == "$1" ]]
