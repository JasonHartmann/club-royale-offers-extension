# Store listing: consistency pass on Jason's paste (Oct 25, 2026)

Input: `docs/store-listing.md`, the verbatim t33u paste. This file is never edited.
Output: `docs/store-listing.cleaned.md`, written by `python3 scripts/ci/listing_lint.py`. The tone and wording are kept; this pass is cleanup only.

## Auto-fixed (deterministic)
| Fix | Evidence |
|---|---|
| v2.4.0 (8 bullets) and v2.3.2 (2 bullets): ` - ` changed to `- ` | Paste RELEASE NOTES |
| v2.2: trailing space removed from "…direct lookup links " | Paste line |
| v2.4.2 and v2.4.1 added at the top of RELEASE NOTES (the paste stops at v2.4.0) | manifest.json and package.json are 2.4.2; GitHub release `release/2.4.2`; AMO version notes for 2.4.1 |
| Headings and `---` separators already consistent: no change | lint |

## Needs Jason's review (wording suggestions in his voice)
| # | Issue | Suggested fix | Evidence |
|---|---|---|---|
| 1 | Cards layout (v2.4.0) isn't in FEATURES or HOW TO USE. HOW TO USE lists only Table, Accordion and Favorites views | FEATURES: `- **Cards Layout (Beta)** groups trips by ship, port, and nights with the best price per cabin type`. HOW TO USE: "Switch between Table, Accordion, Cards, and Favorites views" | `app.js`, `styles.js` |
| 2 | Named filter sets aren't in FEATURES or HOW TO USE | Add to the Advanced Search bullet: "…and save, apply, or delete named filter sets" | `features/advancedSearch.js` |
| 3 | Offer flyer isn't in FEATURES | `- **Offer Flyers** open from the Code column` | `features/offerPdf.js`, `background.js` |
| 4 | Sign Out button isn't in FEATURES or TIPS | `- **Sign Out** button, since RCL removed theirs` | `features/breadcrumbs.js`, `features/whatsNew.js` |
| 5 | Settings categories aren't mentioned (TIPS says "Enable Solo Booking in Settings") | TIPS: "Settings are organized by category" | `features/settings.js` |
| 6 | Awkward v2.4.0 line: "Show All Offers" underlying base site errors and position fixed! | `- "Show All Offers" sits under the site header again and shows up on Celebrity!` (meaning taken from the website's v2.4.0 entry) | comproyale-site index.html |
| 7 | v2.4.0 Sign Out line ends with "?" ("…because RCL deleted their Sign Out?") and reads as a question | `…because RCL removed theirs!` | Paste |
| 8 | "Profile Linking" (FEATURES, v1.3) doesn't appear in code or UI text; the UI uses the chain/link icon (HOW TO USE says so) | Keep the name and confirm, or use "**Linked Profiles**" | grep: no "Profile Linking" in *.js |
| 9 | COMPATIBILITY says "Firefox (desktop and Android)", but manifest.json has only `browser_specific_settings.gecko` (strict_min_version 102.0) and no `gecko_android` | Add `gecko_android` to the manifest, or change it to "Firefox desktop" | manifest.json lines 8-10 |
| 10 | Two FEATURES bullets have no **Bold Name** ("Accordion drilldowns…", "Keyboard shortcuts…") | `**Accordion Drilldowns**…`, `**Keyboard Shortcuts**…` | Rule: FEATURES bullets lead with bold |
| 11 | OVERVIEW and FEATURES don't mention the 2.4.2 freeze fix, and the app's own What's New covers newer features | Optional: no change needed | - |

## Support email and links
`admin@comproyale.com` matches the website. The paste has no links (AMO currently renders the email as a broken `<a href="/">`, which the generator fixes by sending plain text).
