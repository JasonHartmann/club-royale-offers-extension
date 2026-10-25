# Release notes style (house style)

Source of truth: Jason's hand-wordsmithed listing in [store-listing.md](store-listing.md), in its `### RELEASE NOTES` section. These rules come from that text. They replace the patterns taken earlier from the repo, GitHub releases and the website.

## Listing structure (checked by `listing_lint.py`)
- Sections are `### UPPERCASE` headings in this order: OVERVIEW, FEATURES, WHY INSTALL, HOW TO USE, TIPS, PRIVACY, COMPATIBILITY, TROUBLESHOOTING, SUPPORT, RELEASE NOTES.
- Exactly one `---` line separates sections.
- FEATURES bullets lead with `**Bold Name**`.

## Release notes block (one file per version: `store-listing/release-notes/X.Y.Z.md`)
```
**v2.4.2**
- The offers page no longer freezes on big accounts! Back-to-back math was locking the tab on load and on Export
Bug fixes:
- Firefox: filter lists fill in, and offer flyers open instead of a blank tab
```
Rules (enforced by `release_tools.py check`):
1. Line 1 is exactly `**vX.Y.Z**`. Minor-only releases use `**vX.Y**` (v2.1 and v2.2 style), with no date line.
2. Every other line is a `- ` dash bullet or an optional subheader ending in `:`, such as `Bug fixes:`. No blank lines and no nested bullets.
3. Bullets start with a capital letter (or a quote) and have **no trailing period**. Exclamation marks are fine.
4. The tone is casual and written for users. Use an em dash (—) to elaborate. A platform or area prefix like `Firefox:`, `Safari:` or `Back-to-Back:` is fine. Commit-style lowercase `area:` prefixes, code, issue numbers, links and TODOs are not.
5. Use 1 to 12 bullets.
6. Leading-space ` - ` bullets (v2.4.0 and v2.3.2) produce a warning. `listing_lint.py --fix` normalizes them to `- `.

## How generation works
- `release_tools.py notes X.Y.Z` drafts the block **deterministically** from `git log release/<prev>..HEAD`, without any free-form writing. It drops chore, docs, ci, test, style, refactor and build commits, strips `area:` prefixes, turns `on Firefox` into a `Firefox:` prefix, removes duplicates and drops periods. It adds a TODO line, so `check` fails until Jason rewords the draft.
- Real (submit) runs require a committed notes file that passes `check`. The cleaned listing must also pass `listing_lint.py` with no errors.
- The same block is used everywhere:
  - GitHub release body and the `### RELEASE NOTES` listing section: as written.
  - AMO: `<strong>` tags.
  - App Store and Chrome: plain text.
  - README "Latest version" block and website: rendered from the bullets (the website adds periods, matching the website's existing style).
