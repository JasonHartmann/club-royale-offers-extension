# Store listing: content fixes needing review

`scripts/ci/listing_lint.py` fixes formatting by itself (leading-space bullets, `###` headings, one `---` between sections, RELEASE NOTES newest-first and rebuilt from `store-listing/release-notes/`, no trailing periods). It never edits `docs/store-listing.md`. The cleaned copy is `docs/store-listing.cleaned.md`.

**Status:** Jason's verbatim paste (t33u) isn't in the repo yet. The findings below come from running the lint on a fixture made from the live AMO listing (Oct 25, 2026). Rerun `python3 scripts/ci/listing_lint.py` after the paste goes in.

| # | Issue | Proposed fix (keeps his tone) | Evidence |
|---|---|---|---|
| 1 | v2.4.0 and v2.3.2 bullets start with ` - ` | Auto-fixed to `- ` | lint FIX |
| 2 | RELEASE NOTES on AMO stop at v2.3.5. v2.4.2, v2.4.1, v2.4.0 and v2.3.3/v2.3.2 are missing | Auto-added from release-notes files. **v2.3.3/v2.3.2 still need files** (they're only on the website) | AMO API `description`; comproyale-site index.html version history |
| 3 | "Cards" layout (v2.4.0) isn't in FEATURES/HOW TO USE | FEATURES: `- **Cards Layout (Beta)** groups trips by ship, port, and nights, with the best price per cabin type`. HOW TO USE: mention the Table / Accordion / Cards / Favorites views | lint REVIEW; `app.js`, `styles.js` |
| 4 | Named filter sets aren't in FEATURES | Extend Advanced Search: `...and save, apply, or delete named filter sets` | `features/advancedSearch.js` |
| 5 | Offer flyer isn't in FEATURES | `- **Offer Flyers** open from the Code column` | `features/offerPdf.js`, `background.js` |
| 6 | Sign Out button isn't in FEATURES/TIPS | `- **Sign Out** button, since Royal removed theirs` | `features/breadcrumbs.js`, `features/whatsNew.js` |
| 7 | Settings categories aren't mentioned | TIPS: `Settings are organized by category` | `features/settings.js` |
| 8 | Awkward v2.4.0 line "Show All Offers underlying base site errors and position fixed!" | `- "Show All Offers" sits under the site header again and shows up on Celebrity!` (the website already says this) | comproyale-site index.html v2.4.0 entry |
| 9 | "Profile Linking" label isn't in the code (the UI says link/chain icon) | Use the UI wording: `**Linked Profiles**`, or keep it and confirm the label | grep finds no "Profile Linking" in *.js |
| 10 | COMPATIBILITY claims Firefox for Android, but manifest.json has only `gecko` (min 102.0) and no `gecko_android` | Either add `gecko_android` to the manifest or soften the claim. Needs Jason's call | manifest.json lines 8-10 |
| 11 | SUPPORT email is rendered as a broken link `<a href="/">` on AMO | Plain `admin@comproyale.com` (the generator emits plain text) | AMO API description |
| 12 | Two FEATURES bullets have no **Bold Name** ("Accordion drilldowns…", "Keyboard shortcuts…") | `**Accordion Drilldowns**`, `**Keyboard Shortcuts**` | lint WARN |
| 13 | AMO's current version is 2.4.1, but the repo and Chrome are on 2.4.2 | Ship 2.4.2 to AMO (this pipeline) | AMO API `current_version` |
| 14 | Edge is listed in the README release checklist, but there's no Edge listing or ID | Leave Edge out of COMPATIBILITY until a listing exists | README Release Checklist step 3 |
