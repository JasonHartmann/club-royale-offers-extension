# Club Royale Offers Viewer

This browser extension enhances the Royal Caribbean Club Royale Offers page by adding a "Show All Offers" button. When clicked, it presents your comp offers in a sortable, groupable table and accordion view, making it easy to analyze and compare your offers.

## Features

- **Show All Offers Button**: Adds a button to the Club Royale Offers page for quick access.
- **Sortable Table**: Click any column header to sort offers by that column (ascending/descending/original order).
- **Groupable Table**: Group offers by any column (e.g., ship, destination, nights, etc.) for easier analysis.
- **Accordion View**: Drill down into groups with nested accordions for detailed exploration.
- **Advanced Search Filters**: Build multi‑field predicates (IN / NOT IN / CONTAINS / NOT CONTAINS / Date Range) to refine results without leaving the page.
- **Date Range Picker**: Two‑month flight‑style calendar for Offer Date, Expiration, and Sail Date filtering.
- **Value Column**: Estimated offer value per sailing — dual‑guest base price minus taxes/fees, or single‑guest heuristic for GOBO offers.
- **Configurable Date Format**: Choose between MM/DD/YY (compact) and YYYY-MM-DD (full) in Settings; applied everywhere including tables, filters, and CSV export.
- **Visual Highlights**:
  - **Green Row**: The newest offer (by offer date).
  - **Pink Row**: The offer expiring soonest (within 3 days).
- **Favorites Profile**: Star individual sailings to add them to a persistent Favorites pseudo‑profile.
- **Linked / Combined Offers**: Link exactly two profiles to view a merged, upgraded "Combined Offers" view.
- **Back‑to‑Back Builder**: Discover and save chains of same‑day connecting sailings for back‑to‑back itineraries and upgrade paths.
- **Stable Profile IDs**: Each saved profile gets a permanent numeric ID badge that never changes.
- **CSV Export**: Download your offers as a CSV file for offline analysis.
- **Responsive UI**: Table columns are sized for readability.

## Installation

1. Download or clone this repository.
2. **Chrome**: `chrome://extensions/` → enable Developer Mode → Load unpacked.
3. **Firefox**: `about:debugging` → "This Firefox" → "Load Temporary Add‑on…" → select `manifest.json`.
4. **Edge**: `edge://extensions` → Developer Mode → Load unpacked.
5. Visit the Club Royale offers page and use the injected button.

## Usage

- Click the **Show All Offers** button on an offers page.
- Sort or group columns as needed; drill down via accordion mode.
- Use the star column to add/remove sailings from Favorites.
- Link two accounts with the chain icon to view Combined Offers.
- Use **Advanced Search** to layer filters or define a date range.
- Click **CSV Export** to download raw data.

## Development

### Key Files

| Path | Purpose |
|------|---------|
| `app.js` / `modal.js` / `tableRenderer.js` | Core entry points executed by the content script. |
| `features/` | Feature modules (accordion, favorites, advanced search, B2B builder, etc.). |
| `utils/` | Shared helpers grouped by concern (B2B, sorting, DOM, pricing, API). |
| `styles/` | Plain CSS plus generated Tailwind bundle. |
| `scripts/` | Utility snippets for DevTools data cleanup/imports. |
| `tests/` | Jest test suites. |
| `images/` | Extension icons/art. |

### Prerequisites

- Latest Chrome, Edge, or Firefox for loading the unpacked extension.
- Node.js 18+ for running tests and tooling.

### Local Setup

1. Clone the repo.
2. `npm install` (for tests and tooling).
3. Load the extension unpacked in your preferred browser (see Installation).
4. Visit the Club Royale Offers page — the content script auto‑injects when the URL matches.

Tips:
- Use Chrome's Extensions toolbar → "Inspect views" for a DevTools console scoped to the content script.
- CSS edits in `styles/` take effect on a simple page refresh.
- Toggle `window.GOBO_DEBUG_LOGS = true` in DevTools to enable verbose debug output. Use `dlog('message', data)` for new debug statements.

### Testing

```powershell
npm install
npm test
```

Runs the Jest harness across all test suites. The GitHub Action workflow runs the same command and will fail the build if tests regress.

### Release Checklist

1. Update `manifest.json` → `version` and ensure icons reference the latest assets.
2. Pack or zip the extension for upload to the Chrome Web Store / Firefox Add‑ons / Edge Add‑ons portals.
3. Clear `chrome.storage.local` to verify first‑run onboarding.
4. Run the full test suite and spot‑check key flows (Show All Offers, Favorites, Combined Offers, Advanced Search).
5. Tag the release: `git tag vX.Y.Z && git push --tags`.

### Troubleshooting

- **Content script not loading**: Confirm the offers URL matches `manifest.json` `matches` entries, then reload the extension and tab.
- **Stale data**: Run `chrome.storage.local.clear()` in DevTools or delete the relevant `gobo-*` keys.
- **CSS not applying**: Check that `styles.js` is injecting your stylesheet; syntax errors surface as `ERR_FILE_NOT_FOUND` or parsing errors in the console.

## Customization

- Modify visible columns: edit the `headers` arrays in `tableRenderer.js`.
- Adjust colors / styles: update `styles.js` or the CSS under `styles/`.
- Extend grouping rules: see `accordionBuilder.js`.

## Report Issues & Contribute

Found a bug or have an improvement idea? Please open an issue or submit a pull request on GitHub:

- https://github.com/JasonHartmann/club-royale-offers-extension/issues

## License

© 2026 Percex Technologies, LLC. All rights reserved.

---

**Not affiliated with Royal Caribbean International or Celebrity Cruises. For personal use only.**
