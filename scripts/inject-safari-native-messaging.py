#!/usr/bin/env python3
"""Add nativeMessaging to built Safari extension manifests only.

Chrome and Firefox load manifest.json from this repository. That file must
not request nativeMessaging, or a store update disables existing installs
until each user accepts "Communicate with cooperating native applications."
Safari still requires the permission, so the Xcode build adds it to the
copied manifest inside the built .appex.
"""

import json
import sys
from pathlib import Path


PERMISSION = "nativeMessaging"
SOURCE_NAME = "club-royale-offers-extension/manifest.json"


def is_store_manifest(path):
    return Path(path).resolve().as_posix().endswith(SOURCE_NAME)


def inject_file(path):
    target = Path(path).resolve()
    if is_store_manifest(target):
        raise SystemExit(f"error: refusing to edit the store manifest at {target}")
    data = json.loads(target.read_text(encoding="utf-8"))
    permissions = list(data.get("permissions") or [])
    if PERMISSION not in permissions:
        permissions.append(PERMISSION)
        data["permissions"] = permissions
        target.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return permissions


def manifests_for(path):
    target = Path(path)
    if target.is_file():
        return [target]
    if not target.is_dir():
        raise SystemExit(f"error: manifest not found at {target}")
    found = sorted(target.rglob("manifest.json"))
    if not found:
        raise SystemExit(f"error: no manifest.json under {target}")
    return found


def main(argv):
    if len(argv) != 2:
        raise SystemExit(f"usage: {argv[0]} <built-manifest.json-or-bundle>")
    for manifest in manifests_for(argv[1]):
        permissions = inject_file(manifest)
        print(f"{manifest}: {', '.join(permissions)}")


if __name__ == "__main__":
    main(sys.argv)
