#!/usr/bin/env python3
"""Consistency pass for the store listing (docs/store-listing.md).

Never modifies the verbatim original. Writes docs/store-listing.cleaned.md with deterministic
fixes, and prints findings checked against the repo (manifest, UI labels in code, release notes).

  listing_lint.py [--src FILE] [--out FILE] [--strict]
Exit 1 with --strict if any ERROR remains after autofix.
"""
import argparse, glob, json, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.dirname(__file__))
import release_tools as rt  # noqa: E402

ORDER = ["OVERVIEW", "FEATURES", "WHY INSTALL", "HOW TO USE", "TIPS", "PRIVACY",
         "COMPATIBILITY", "TROUBLESHOOTING", "SUPPORT", "RELEASE NOTES"]
CODE_GLOBS = ["*.js", "features/*.js", "utils/*.js", "styles/*.css"]
SUPPORT_EMAIL = "admin@comproyale.com"


def code_corpus():
    txt = []
    for g in CODE_GLOBS:
        for p in glob.glob(os.path.join(ROOT, g)):
            if "/tests/" not in p:
                txt.append(open(p, encoding="utf-8", errors="ignore").read())
    return "\n".join(txt).lower()


def autofix(md, log):
    out = []
    for l in md.split("\n"):
        n = l.rstrip()
        if re.match(r"^ +- ", n):
            n = re.sub(r"^ +- ", "- ", n); log.append(("fix", f"leading-space bullet -> '- ': {n[:60]}"))
        m = re.match(r"^#{1,6}\s*(.+?)\s*#*$", n)
        if m and m.group(1).upper() in ORDER and n != f"### {m.group(1).upper()}":
            n = f"### {m.group(1).upper()}"; log.append(("fix", f"heading normalised: {n}"))
        if re.match(r"^\s*(-{3,}|\*{3,}|_{3,})\s*$", n) and n != "---":
            n = "---"; log.append(("fix", "separator normalised to ---"))
        out.append(n)
    md = "\n".join(out)
    # exactly one --- between sections
    md2 = re.sub(r"\n*(?:---\n+)*(### [A-Z ]+\n)", lambda m: "\n\n---\n\n" + m.group(1), md).lstrip("\n-")
    md2 = re.sub(r"^\s*---\s*\n+", "", md2)
    if md2.strip() != md.strip():
        log.append(("fix", "section separators made consistent (one --- between sections)"))
    md2 = re.sub(r"\n{3,}", "\n\n", md2).strip() + "\n"
    # RELEASE NOTES: trailing periods off, newest-first rebuilt from release-notes files
    if "### RELEASE NOTES" in md2:
        head, notes = md2.split("### RELEASE NOTES", 1)
        norm = lambda x: rt.ver_label(x if x.count(".") >= 2 else x + ".0")[1:]
        listed = [norm(x) for x in re.findall(r"\*\*v([\d.]+)\*\*", notes)]
        have = {rt.ver_label(v)[1:]: v for v in rt.all_versions()}
        for v in listed:
            if v not in have:
                log.append(("warn", f"v{v} is in the pasted RELEASE NOTES but has no store-listing/release-notes file (kept from paste)"))
        for lab, v in have.items():
            if lab not in listed:
                log.append(("fix", f"v{lab} missing from pasted RELEASE NOTES: added from store-listing/release-notes/{v}.md"))
        blocks = {lab: rt.block(have[lab]) for lab in have}
        for m in re.finditer(r"(\*\*v([\d.]+)\*\*\n(?:.+\n?)*)", notes):
            if norm(m.group(2)) not in blocks:
                blocks[m.group(2)] = "\n".join(re.sub(r"\.$", "", x) for x in m.group(1).strip().split("\n"))
        order = sorted(blocks, key=rt.vkey, reverse=True)
        md2 = head + "### RELEASE NOTES\n\n" + "\n\n".join(blocks[k] for k in order) + "\n"
    return md2


def checks(md, log):
    code = code_corpus()
    secs = re.findall(r"^### (.+)$", md, re.M)
    missing = [s for s in ORDER if s not in secs]
    if missing: log.append(("error", f"missing sections: {', '.join(missing)}"))
    if [s for s in secs if s in ORDER] != [s for s in ORDER if s in secs]:
        log.append(("error", f"section order differs from {ORDER}"))
    body = lambda name: (re.search(rf"^### {re.escape(name)}\n(.*?)(?=^### |\Z)", md, re.M | re.S) or [None, ""])[1]
    feats, howto = body("FEATURES"), body("HOW TO USE")
    for l in feats.split("\n"):
        if l.startswith("- ") and not l.startswith("- **"):
            log.append(("warn", f"FEATURES bullet without **Bold Name**: {l[:70]}"))
    # feature names claimed in FEATURES must exist in the code/UI
    for name in re.findall(r"\*\*(.+?)\*\*", feats):
        key = re.sub(r"[^a-z0-9 ]", " ", name.lower()).strip()
        words = [w for w in key.split() if len(w) > 3]
        if words and not all(w in code for w in words):
            log.append(("review", f"FEATURES '{name}': label not found in code ({', '.join(w for w in words if w not in code)})"))
    # features introduced in release notes but never described
    feat_text = (feats + howto).lower()
    for v in rt.all_versions()[:3]:
        for b in rt.bullets(v):
            for nm in re.findall(r'"([^"]+)"|\b(Cards|Sign Out|filter sets|offer flyer|Settings dialog)\b', b):
                n = (nm[0] or nm[1]).strip()
                if n and n.lower() not in feat_text:
                    log.append(("review", f"v{v} introduces '{n}' but FEATURES/HOW TO USE never mention it"))
    # compatibility vs manifest
    man = json.load(open(os.path.join(ROOT, "manifest.json")))
    gecko = man.get("browser_specific_settings", {})
    comp = body("COMPATIBILITY").lower()
    if "android" in comp and "firefox" in comp and "gecko_android" not in gecko:
        log.append(("review", "COMPATIBILITY claims Firefox for Android but manifest has no browser_specific_settings.gecko_android"))
    if "safari" in comp and not os.path.exists(os.path.join(ROOT, "scripts", "build-safari-xcode.sh")):
        log.append(("review", "COMPATIBILITY claims Safari but no Safari build script exists"))
    if "edge" in comp:
        log.append(("review", "COMPATIBILITY mentions Edge: there is no Edge listing in the pipeline"))
    # support email / links
    emails = set(re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", md))
    for e in emails - {SUPPORT_EMAIL}:
        log.append(("review", f"unexpected email {e} (support address is {SUPPORT_EMAIL})"))
    if SUPPORT_EMAIL not in emails and "### SUPPORT" in md:
        log.append(("error", f"SUPPORT section lacks {SUPPORT_EMAIL}"))
    for u in re.findall(r"\]\((?!https?://)([^)]+)\)|href=\"(/[^\"]*)\"", md):
        log.append(("error", f"relative/broken link: {u[0] or u[1]}"))
    # release notes rules
    for m in re.finditer(r"^- (.+)\.$", body("RELEASE NOTES"), re.M):
        log.append(("error", f"release note ends with a period: {m.group(1)[:60]}"))
    ver = man["version"]
    if f"**{rt.ver_label(ver)}**" not in md:
        log.append(("error", f"RELEASE NOTES lacks the current manifest version {rt.ver_label(ver)}"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.path.join(ROOT, "docs", "store-listing.md"))
    ap.add_argument("--out", default=os.path.join(ROOT, "docs", "store-listing.cleaned.md"))
    ap.add_argument("--strict", action="store_true")
    a = ap.parse_args()
    raw = open(a.src, encoding="utf-8").read()
    m = re.search(r"<!-- listing:start -->\n(.*?)\n<!-- listing:end -->", raw, re.S)
    md = m.group(1) if m else raw
    if rt.PENDING in md:
        print("listing_lint: docs/store-listing.md still has the PENDING placeholder; nothing to lint")
        return
    log = []
    clean = autofix(md, log)
    checks(clean, log)
    with open(a.out, "w", encoding="utf-8") as f:
        f.write("<!-- GENERATED by scripts/ci/listing_lint.py from docs/store-listing.md; do not edit -->\n"
                "<!-- listing:start -->\n" + clean + "<!-- listing:end -->\n")
    log = list(dict.fromkeys(log))
    for kind, msg in log:
        print(f"{kind.upper():6} {msg}")
    errs = sum(k == "error" for k, _ in log)
    print(f"wrote {a.out}: {sum(k=='fix' for k,_ in log)} fixes, {errs} errors, {sum(k=='review' for k,_ in log)} to review")
    if a.strict and errs:
        sys.exit(1)


if __name__ == "__main__":
    main()
