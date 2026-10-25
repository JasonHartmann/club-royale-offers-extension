#!/usr/bin/env python3
"""Release notes, README, website and store-listing updates for Comp Royale.

Single source of truth: store-listing/description.html (static listing text, AMO HTML subset)
and store-listing/release-notes/<version>.md (one bullet list per version).

Subcommands (all idempotent; --apply writes/sends, otherwise prints a diff only):
  notes   VERSION                 ensure release-notes/VERSION.md exists (generated from git log)
  docs    VERSION [--site DIR]    update README.md (and the site's index.html)
  listing VERSION --out DIR       render per-store paste files (Chrome, AMO, App Store)
  amo     VERSION                 diff/PATCH AMO description + version release_notes
  asc     VERSION --platform IOS|MAC_OS   diff/PATCH App Store whatsNew + description
  check   VERSION                 validate release-notes/VERSION.md against docs/release-notes-style.md
  github  VERSION                 print the GitHub release body (house format)
Secrets come from the environment and are never printed.
"""
import argparse, base64, difflib, glob, hashlib, hmac, html, json, os, re, subprocess, sys, time, urllib.request, uuid

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LST = os.path.join(ROOT, "store-listing")
SKIP = re.compile(r"^(chore|docs|ci|test|tests|style|refactor|build|merge)(\(|:|\b)", re.I)


def vkey(v):
    return [int(x) for x in re.findall(r"\d+", v)]


def notes_path(v):
    return os.path.join(LST, "release-notes", f"{v}.md")


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def show_or_write(path, new, apply):
    old = read(path) if os.path.exists(path) else ""
    if old == new:
        print(f"unchanged: {os.path.relpath(path, ROOT) if path.startswith(ROOT) else path}")
        return False
    sys.stdout.writelines(difflib.unified_diff(old.splitlines(True), new.splitlines(True), f"a/{os.path.basename(path)}", f"b/{os.path.basename(path)}"))
    if apply:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new)
        print(f"wrote {path}")
    return True


# ---------- release notes
def cmd_notes(a):
    p = notes_path(a.version)
    if os.path.exists(p):
        print(f"exists (hand edits win): {p}")
        return
    try:
        base = subprocess.check_output(["git", "-C", ROOT, "describe", "--tags", "--abbrev=0", "--match", "release/*"], text=True, stderr=subprocess.DEVNULL).strip()
        rng = f"{base}..HEAD"
    except subprocess.CalledProcessError:
        base, rng = None, "HEAD"
    subs = subprocess.check_output(["git", "-C", ROOT, "log", "--no-merges", "--format=%s", rng], text=True).splitlines()
    items = [s for s in subs if s and not SKIP.match(s)] or ["Bug fixes and performance improvements"]
    body = draft_notes(items, a.version)
    print(f"# generated from git log {rng} ({len(items)} items); edit before release")
    show_or_write(p, body, a.apply)


PREFIX = re.compile(r"^[a-z0-9 _-]+(\([^)]*\))?: ", re.I)
PLATFORMS = ("Firefox", "Safari", "Chrome", "iPhone", "Mac")


def draft_bullet(subject):
    """Deterministic commit subject -> house-style bullet (see docs/release-notes-style.md)."""
    t = PREFIX.sub("", subject).strip().rstrip(".")
    plat = next((p for p in PLATFORMS if re.search(rf"\b{p}\b", t, re.I)), None)
    if plat:
        t = re.sub(rf"\s*\b(on|in|for)\s+{plat}\b|\b{plat}\s+", " ", t, count=1, flags=re.I)
        t = re.sub(r"\s{2,}", " ", t).strip()
    t = t[:1].upper() + t[1:]
    return f"{plat}: {t[:1].lower() + t[1:]}" if plat else t


def ver_label(v):
    """House version line: **vX.Y.Z**, or **vX.Y** when the patch number is 0 (v2.1, v2.2 style)."""
    parts = v.split(".")
    return "v" + (".".join(parts[:2]) if len(parts) == 3 and parts[2] == "0" else v)


def draft_notes(subjects, v="X.Y.Z"):
    seen, out = set(), []
    for s in subjects:
        b = draft_bullet(s)
        if b.lower() not in seen:
            seen.add(b.lower()); out.append(b)
    # Draft only: TODO forces Jason's wordsmithing before `check` passes.
    return f"**{ver_label(v)}**\n<!-- TODO: wordsmith in the house style, then delete this line -->\n" + "".join(f"- {b}\n" for b in out[:10])


BULLET = re.compile(r"^ ?- (.*)$")


def note_lines(v):
    """(kind, text) for each body line after the **vX** line: kind in bullet|sub."""
    out = []
    for l in read(notes_path(v)).rstrip("\n").split("\n")[1:]:
        m = BULLET.match(l)
        if m: out.append(("bullet", m.group(1).strip()))
        elif l.strip().endswith(":") and l.strip(): out.append(("sub", l.strip()))
        elif l.strip(): out.append(("other", l.strip()))
    return out


def bullets(v):
    return [t for k, t in note_lines(v) if k == "bullet"]


def headline(v):
    return "What's new"


def check_notes(v):
    """Style violations vs docs/release-notes-style.md (empty list = OK)."""
    errs, warns = [], []
    raw = read(notes_path(v)).rstrip("\n").split("\n")
    if raw[0] != f"**{ver_label(v)}**":
        errs.append(f"line 1 must be exactly **{ver_label(v)}**")
    if "TODO" in read(notes_path(v)): errs.append("still contains a TODO (draft not wordsmithed)")
    nb = 0
    for n, l in enumerate(raw[1:], 2):
        if not l.strip(): errs.append(f"line {n}: no blank lines inside a version block"); continue
        if l.startswith("<!--"): continue
        m = BULLET.match(l)
        if not m:
            if l.strip().endswith(":") and not l.startswith("-"): continue  # subheader like 'Bug fixes:'
            errs.append(f"line {n}: must be '- <text>' or a 'Subheader:' line"); continue
        nb += 1; t = m.group(1)
        if l.startswith(" "): warns.append(f"line {n}: leading space before '-' (seen in v2.4.0/v2.3.2 but not the norm)")
        if t.endswith("."): errs.append(f"line {n}: no trailing period")
        if re.match(r"^[a-z][a-z0-9 _-]*(\([^)]*\))?: ", t):
            errs.append(f"line {n}: commit-style 'area:' prefix")
        if not (t[0].isupper() or t[0] in '"\u201c'): errs.append(f"line {n}: start with a capital letter")
        if "`" in t or re.search(r"#\d+|https?://", t): errs.append(f"line {n}: no code, issue refs or links")
        if len(t) > 200: errs.append(f"line {n}: longer than 200 chars")
    if not 1 <= nb <= 12: errs.append(f"need 1-12 bullets, found {nb}")
    for w in warns: print(f"style warning: {w}", file=sys.stderr)
    return errs


def cmd_check(a):
    errs = check_notes(a.version)
    for e in errs: print(f"style: {e}", file=sys.stderr)
    if errs: sys.exit(f"{notes_path(a.version)} does not match docs/release-notes-style.md")
    print(f"style OK: {notes_path(a.version)}")


def block(v):
    """The version block exactly as it appears under RELEASE NOTES (normalised to '- ')."""
    out = [f"**{ver_label(v)}**"]
    for k, t in note_lines(v):
        out.append(f"- {t}" if k == "bullet" else t)
    return "\n".join(out)


def cmd_github(a):
    print(block(a.version))


def all_versions():
    return sorted((os.path.basename(p)[:-3] for p in glob.glob(os.path.join(LST, "release-notes", "*.md"))), key=vkey, reverse=True)


# ---------- README + site
def readme_block(v, repo):
    lines = [f"**Latest version: v{v}** ([release notes](https://github.com/{repo}/releases/tag/release/{v}))", ""]
    lines += [f"- {b}" for b in bullets(v)]
    return "<!-- latest-version:start -->\n" + "\n".join(lines) + "\n<!-- latest-version:end -->"


def update_readme(text, v, repo):
    blk = readme_block(v, repo)
    if "<!-- latest-version:start -->" in text:
        return re.sub(r"<!-- latest-version:start -->.*?<!-- latest-version:end -->", lambda m: blk, text, flags=re.S)
    m = re.search(r"^# .*\n", text, re.M)
    i = m.end() if m else 0
    return text[:i] + "\n" + blk + "\n" + text[i:]


def dot(b):
    return b if b.endswith((".", "!", "?")) else b + "."


def update_site(text, v):
    e = lambda s: html.escape(s, quote=False)
    text = re.sub(r"(Cruise Offers Viewer )v[\d.]+", rf"\g<1>v{v}", text)
    text = re.sub(r"(✦ )v[\d.]+( Now Available)", rf"\g<1>v{v}\g<2>", text)
    lis = "".join(f"\n      <li>{e(b)}</li>" for b in bullets(v))
    text = re.sub(r"(What's New in )v[\d.]+(</h2>\s*<p class=\"section-lead\">[^<]*</p>\s*<ul class=\"section-lead\">).*?(\n\s*</ul>)",
                  lambda m: f"{m.group(1)}v{v}{m.group(2)}{lis}{m.group(3)}", text, count=1, flags=re.S)
    if f'<span class="ver-badge">v{v}</span>' not in text:
        text = text.replace('<div class="release-entry current">', '<div class="release-entry">')
        entry = (f'<div class="release-entry current">\n        <div class="release-ver"><span class="ver-badge">v{v}</span></div>\n'
                 f'        <div class="release-body">\n          <h4>{e(headline(v))}</h4>\n          <ul>'
                 + "".join(f"\n            <li>{e(dot(b))}</li>" for b in bullets(v)) + "\n          </ul>\n        </div>\n      </div>\n\n      ")
        text = text.replace('<div class="release-entry">', entry + '<div class="release-entry">', 1)
    return text


def cmd_docs(a):
    changed = False
    if not a.site_only:
        changed = show_or_write(os.path.join(ROOT, "README.md"), update_readme(read(os.path.join(ROOT, "README.md")), a.version, a.repo), a.apply)
    if a.site:
        idx = os.path.join(a.site, "index.html")
        if not os.path.exists(idx):
            print(f"TODO: no index.html in {a.site}; site step skipped")
        else:
            changed |= show_or_write(idx, update_site(read(idx), a.version), a.apply)
    print("changed" if changed else "no changes")


# ---------- listing renderers
def html_to_text(s):
    s = re.sub(r"<li>", "• ", s)
    s = re.sub(r"</li>|</ul>|<br\s*/?>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    return re.sub(r"\n{3,}", "\n\n", s).strip() + "\n"


def history_html(limit):
    return "\n\n".join(md_to_amo_html(block(v)).strip() for v in all_versions()[:limit])


SRC = os.path.join(ROOT, "docs", "store-listing.md")
PENDING = "<!-- PENDING-VERBATIM-PASTE -->"


def listing_markdown():
    """Jason's canonical listing (docs/store-listing.md, between the fences), RELEASE NOTES rebuilt newest-first."""
    src = SRC.replace(".md", ".cleaned.md")
    if not os.path.exists(src):
        src = SRC
    m = re.search(r"<!-- listing:start -->\n(.*?)\n?<!-- listing:end -->", read(src), re.S)
    if not m or PENDING in m.group(1):
        return None
    body = m.group(1)
    notes = "\n\n".join(block(v) for v in all_versions())
    return re.sub(r"(### RELEASE NOTES\n).*\Z", lambda x: x.group(1) + "\n" + notes + "\n", body, flags=re.S)


def md_to_amo_html(md):
    out = []
    for l in md.split("\n"):
        if l.strip() == "---": out.append(""); continue
        l = html.escape(l, quote=False)
        l = re.sub(r"^### (.+)$", r"<strong>\1</strong>", l)
        out.append(re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", l))
    return "\n".join(out).strip() + "\n"


def md_to_plain(md):
    t = re.sub(r"\*\*(.+?)\*\*", r"\1", md)
    t = re.sub(r"^### ", "", t, flags=re.M)
    return t.strip() + "\n"


def amo_description():
    md = listing_markdown()
    if md: return md_to_amo_html(md)
    return read(os.path.join(LST, "description.html")).rstrip() + "\n\n\n" + history_html(99) + "\n"


def plain_description(maxlen):
    md = listing_markdown()
    t = md_to_plain(md) if md else html_to_text(read(os.path.join(LST, "description.html")).rstrip() + "\n\n" + history_html(3))
    return t if len(t) <= maxlen else t[: maxlen - 2].rsplit("\n", 1)[0] + "\n"


def plain_notes(v):
    return md_to_plain(block(v))


def amo_version_notes(v):
    return md_to_amo_html(block(v)).strip()


def cmd_listing(a):
    os.makedirs(a.out, exist_ok=True)
    files = {
        "chrome-description.txt": plain_description(16000),
        "chrome-release-notes.txt": plain_notes(a.version),
        "store-listing.md": (listing_markdown() or "PENDING: paste Jason's listing into docs/store-listing.md\n"),
        "amo-description.html": amo_description(),
        "amo-release-notes.txt": amo_version_notes(a.version) + "\n",
        "appstore-description.txt": plain_description(4000),
        "appstore-whats-new.txt": plain_notes(a.version)[:4000],
    }
    for n, t in files.items():
        with open(os.path.join(a.out, n), "w", encoding="utf-8") as f:
            f.write(t)
    print(f"listing files for v{a.version} in {a.out}: {', '.join(files)}")


# ---------- HTTP helpers
def http(method, url, headers=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    h = dict(headers or {})
    if data is not None:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    return json.loads(raw) if raw else {}


def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def diff_text(label, old, new):
    old, new = (old or "").strip() + "\n", new.strip() + "\n"
    if old == new:
        print(f"{label}: unchanged")
        return False
    print(f"--- {label} (store)\n+++ {label} (repo)")
    sys.stdout.writelines(list(difflib.unified_diff(old.splitlines(True), new.splitlines(True), n=1))[2:])
    return True


# ---------- AMO (https://mozilla.github.io/addons-server/topics/api/addons.html)
def amo_jwt():
    iss, sec = os.environ.get("AMO_JWT_ISSUER"), os.environ.get("AMO_JWT_SECRET")
    if not iss or not sec:
        return None
    now = int(time.time())
    hdr = b64u(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    pl = b64u(json.dumps({"iss": iss, "jti": str(uuid.uuid4()), "iat": now, "exp": now + 240}).encode())
    sig = b64u(hmac.new(sec.encode(), f"{hdr}.{pl}".encode(), hashlib.sha256).digest())
    return f"JWT {hdr}.{pl}.{sig}"


def cmd_amo(a):
    addon = os.environ.get("AMO_ADDON_ID") or "rcl-club-offers"
    base = f"https://addons.mozilla.org/api/v5/addons/addon/{addon}"
    auth = amo_jwt()
    hdr = {"Authorization": auth} if auth else {}
    cur = http("GET", f"{base}/?lang=en-US", hdr)
    want_desc, want_notes = amo_description(), amo_version_notes(a.version)
    d1 = diff_text("AMO description", (cur.get("description") or {}).get("en-US"), want_desc)
    try:
        ver = http("GET", f"{base}/versions/v{a.version}/?lang=en-US", hdr)
        have_ver = True
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        ver, have_ver = {}, False
        print(f"AMO version {a.version} not found yet (expected before sign); release notes will be set after upload")
    d2 = diff_text(f"AMO {a.version} release notes", (ver.get("release_notes") or {}).get("en-US"), want_notes) if have_ver else False
    if not a.apply:
        print("[dry-run] AMO: nothing sent")
        return
    if not auth:
        sys.exit("AMO_JWT_ISSUER/AMO_JWT_SECRET required")
    if d1:
        http("PATCH", f"{base}/", {"Authorization": amo_jwt()}, {"description": {"en-US": want_desc}})
        print("AMO description updated")
    if have_ver and d2:
        http("PATCH", f"{base}/versions/v{a.version}/", {"Authorization": amo_jwt()}, {"release_notes": {"en-US": want_notes}})
        print("AMO release notes updated")


# ---------- App Store Connect (https://developer.apple.com/documentation/appstoreconnectapi/app-store-version-localizations)
def asc_token():
    kid, iss = os.environ.get("ASC_KEY_ID"), os.environ.get("ASC_ISSUER_ID")
    path = os.environ.get("ASC_KEY_PATH") or (kid and os.path.expanduser(f"~/.appstoreconnect/private_keys/AuthKey_{kid}.p8"))
    if not (kid and iss and path and os.path.exists(path)):
        return None
    now = int(time.time())
    msg = f"{b64u(json.dumps({'alg': 'ES256', 'kid': kid, 'typ': 'JWT'}).encode())}.{b64u(json.dumps({'iss': iss, 'iat': now, 'exp': now + 1200, 'aud': 'appstoreconnect-v1'}).encode())}"
    der = subprocess.run(["openssl", "dgst", "-sha256", "-sign", path], input=msg.encode(), capture_output=True, check=True).stdout
    # DER ECDSA signature -> raw r||s (64 bytes)
    i = 2 if der[1] < 0x80 else 3
    rl = der[i + 1]; r = der[i + 2:i + 2 + rl]; j = i + 2 + rl
    sl = der[j + 1]; s = der[j + 2:j + 2 + sl]
    raw = r.lstrip(b"\0").rjust(32, b"\0") + s.lstrip(b"\0").rjust(32, b"\0")
    return f"Bearer {msg}.{b64u(raw)}"


def cmd_asc(a):
    tok = asc_token()
    if not tok:
        print("ASC API key not found: skipping App Store listing (paste appstore-*.txt manually)")
        if a.apply:
            sys.exit(1)
        return
    api, h = "https://api.appstoreconnect.apple.com/v1", {"Authorization": tok}
    bid = os.environ.get("APPLE_BUNDLE_ID", "com.percex.Club-Royale-and-Blue-Chip-Offers")
    apps = http("GET", f"{api}/apps?filter[bundleId]={bid}", h)["data"]
    if not apps:
        sys.exit(f"no app with bundle id {bid}")
    vers = http("GET", f"{api}/apps/{apps[0]['id']}/appStoreVersions?filter[platform]={a.platform}&filter[versionString]={a.version}", h)["data"]
    if not vers:
        print(f"No {a.platform} App Store version {a.version} yet: create it in App Store Connect (or after upload), then rerun")
        if a.apply:
            sys.exit(1)
        return
    locs = http("GET", f"{api}/appStoreVersions/{vers[0]['id']}/appStoreVersionLocalizations", h)["data"]
    loc = next((l for l in locs if l["attributes"]["locale"] == "en-US"), None)
    if not loc:
        sys.exit("no en-US localization")
    want = {"description": plain_description(4000), "whatsNew": plain_notes(a.version)[:4000]}
    changed = {k: v for k, v in want.items() if diff_text(f"App Store {a.platform} {k}", loc["attributes"].get(k), v)}
    if not a.apply:
        print(f"[dry-run] App Store {a.platform}: nothing sent")
        return
    if changed:
        http("PATCH", f"{api}/appStoreVersionLocalizations/{loc['id']}", h,
             {"data": {"type": "appStoreVersionLocalizations", "id": loc["id"], "attributes": changed}})
        print(f"App Store {a.platform} listing updated ({', '.join(changed)})")


def main():
    p = argparse.ArgumentParser()
    sp = p.add_subparsers(dest="cmd", required=True)
    for name in ("notes", "docs", "listing", "amo", "asc", "check", "github"):
        s = sp.add_parser(name)
        s.add_argument("version")
        s.add_argument("--apply", action="store_true", help="write files / call store APIs (default: diff only)")
        if name == "docs":
            s.add_argument("--site")
            s.add_argument("--site-only", action="store_true")
            s.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", "JasonHartmann/club-royale-offers-extension"))
        if name == "listing":
            s.add_argument("--out", required=True)
        if name == "asc":
            s.add_argument("--platform", choices=["IOS", "MAC_OS"], required=True)
    a = p.parse_args()
    if a.cmd != "notes" and not os.path.exists(notes_path(a.version)):
        sys.exit(f"missing {notes_path(a.version)}; run 'notes {a.version} --apply' first")
    globals()[f"cmd_{a.cmd}"](a)


if __name__ == "__main__":
    main()
