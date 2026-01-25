# Club Royale Offers Viewer

This Chrome extension enhances the Royal Caribbean Club Royale Offers page by adding a "Show All Offers" button. When clicked, it presents your comp offers in a sortable, groupable table and accordion view, making it easy to analyze and compare your offers.

## Features

- **Show All Offers Button**: Adds a button to the Club Royale Offers page for quick access.
- **Sortable Table**: Click any column header to sort offers by that column (ascending/descending/original order).
- **Groupable Table**: Group offers by any column (e.g., ship, destination, nights, etc.) for easier analysis.
- **Accordion View**: Drill down into groups with nested accordions for detailed exploration.
- **Advanced Search Filters**: Build multi‑field predicates (IN / NOT IN / CONTAINS / NOT CONTAINS) plus a new **Date Range** operator (see below) to refine results without leaving the page.
- **Date Range Picker (Offer / Expiration / Sail Dates)**: Two‑month flight‑style calendar selector lets you highlight offers whose Offer Date, Expiration (Reserve By), or Sail Date fall within an inclusive range.
- **Visual Highlights**:
  - **Green Row**: The single newest offer (by offer date) is highlighted in green.
  - **Pink Row**: The offer expiring soonest (within the next 3 days) is highlighted in pink.
- **Favorites Profile**: Star individual sailings to add them to a persistent `Favorites` pseudo‑profile.
- **Linked / Combined Offers**: Link exactly two profiles to view a merged, upgraded “Combined Offers” view.
- **Stable Profile IDs**: Each saved profile (gobo-* key) gets a permanent numeric ID badge.
- **CSV Export**: Download your offers as a CSV file for offline analysis.
- **Responsive UI**: Table columns are sized for readability.

## New Column: Value
Displays estimated Offer Value per sailing:
- Dual Guest offers: Base category cheapest dual-occupancy price minus Taxes & Fees.
- Single Guest offers (GOBO): Derived using single guest heuristic (assumed $200 discount) mirroring itinerary modal logic.
Included in sorting, grouping, filtering (Advanced Search supports less than / greater than), and CSV export.

## Advanced Search & Date Range Filtering

The Advanced Search panel (toggle button near breadcrumbs) lets you layer multiple filters. Newly added:

### Date Range Operator
Applies to date fields: Offer Date (`offerDate`), Expiration (`expiration`), and Sail Date (`sailDate`).

1. Click "Advanced Search" to enable the panel.
2. Choose one of the date fields via "Add Field…".
3. Select operator "date range".
4. Use the two‑month calendar:
   - Click a start date (it highlights).
   - Click an end date (range fills; both endpoints included).
   - Click another date after completing a range to start over.
5. Press the green commit ✓ button once both dates are selected (or hit Enter while focus is on the predicate box).
6. The committed range shows as a single chip like `MM/DD/YY → MM/DD/YY`. Click the chip to edit the range; click the × inside the chip to clear it.

Behavior details:
- Inclusive boundaries (start and end date both match).
- Persisted per profile session (restored while panel is enabled during the session via `sessionStorage`).
- Editing a committed range reopens the calendar with your previous selection.
- Clearing removes dates and returns the predicate to edit mode.
- Incomplete (only start picked) ranges aren't applied until both ends selected & committed.

### Other Operators (Unchanged)
- IN / NOT IN show a multi‑select list of distinct visible values (case‑insensitive dedupe).
- CONTAINS / NOT CONTAINS build token chips (substring match logic).

### Preview Mode
While a predicate is incomplete but has provisional values, its box outlines in blue (preview). The table is only filtered once you commit.

### Performance Notes
- Large value lists chunk‑render to avoid UI jank.
- Date range filtering uses raw ISO dates when available; falls back to parsing the formatted `MM/DD/YY` display.

### Edge Cases
- Invalid or partial range silently ignored (filter not applied until both dates chosen).
- Changing operator resets any temporary range selection.
- All comparisons are UTC‑normalized to avoid timezone drift.

## Stable Profile IDs (Immutable Assignment)

Each saved profile key beginning with `gobo-` is assigned a numeric Profile ID (shown as a small badge on its tab). These IDs now satisfy the requirement:

> Once profile data is assigned a Profile ID, it must remain static and never change again. The only way to re-use an assigned Profile ID is if that profile is deleted.

### How It Works

A lightweight manager (`profileIdManager.js`) persists three internal records:
- `goboProfileIdMap_v1`: `{ profileKey: id }` mapping.
- `goboProfileIdFreeIds_v1`: queue of numeric IDs available for reuse (from deleted profiles).
- `goboProfileIdNext_v1`: next auto‑increment ID if no reusable IDs exist.

On each render/update of the tab strip:
1. Existing mappings are loaded (no re-numbering or compaction ever occurs).
2. Missing (new) profile keys get the lowest available freed ID, or the next incrementing ID.
3. Deleted keys free their ID back into the pool for future use.

### Guarantees
- Opening / closing the modal or reordering profiles will not change existing IDs.
- Adding new profiles never shifts older IDs.
- Deleting a profile frees its numeric ID for future brand‑new profiles only.
- Favorites (`goob-favorites`) and combined linked tab (`goob-combined-linked`) do not consume numeric IDs.

### Rationale
Previously IDs were recomputed from ordering, causing churn. The new manager ensures traceability (e.g., screenshots, cross‑session notes) and meets the immutability requirement without inflating the ID space indefinitely (because released IDs are recycled deterministically—smallest first).

## Installation (Chrome / Firefox / Edge)

1. Download or clone this repository.
2. Chrome: go to `chrome://extensions/` → enable Developer Mode → Load unpacked.
3. Firefox: Open `about:debugging` → “This Firefox” → “Load Temporary Add‑on…” → select `manifest.json`.
4. Edge (Chromium): `edge://extensions` → Developer Mode → Load unpacked.
5. Visit the Club Royale or Blue Chip Club offers page and use the injected button.

## Safari (macOS & iOS) Support

This project is now Safari‑ready via a tiny compatibility shim (`safari-polyfill.js`) that normalizes `chrome.*` vs `browser.*` APIs. Safari 16+ (macOS Ventura / iOS 16) supports Manifest V3 Safari Web Extensions.

### Option A: Xcode GUI Conversion

1. Install the latest Xcode (14+ recommended).
2. Open Xcode → File → New → Project… → “Safari Web Extension” template.
3. When prompted, choose “Convert existing extension” and select this project folder.
4. Xcode generates a container macOS app + embedded Safari Web Extension target.
5. In the extension target’s `Resources` folder, verify all source files and `manifest.json` were copied.
6. Add proper PNG icons (Safari prefers square `.png` sizes: 32, 48, 128, 256). Place them under `images/` and update the `icons` field in `manifest.json` (Safari does not use `.ico`).
7. Set a unique Bundle Identifier (e.g., `com.percex.club-royale-offers`).
8. Build & run. Safari will prompt to enable the extension (Preferences → Extensions).
9. Test on target pages; the polyfill ensures storage/runtime calls work.

### Option B: Command Line Converter

Use Apple’s tool to produce an Xcode project automatically:

```bash
xcrun safari-web-extension-converter ./club-royale-offers-extension \
  --app-name "Club Royale Offers" \
  --bundle-identifier com.percex.club-royale-offers \
  --project-location ./safari-build \
  --force
```

After conversion:
- Open the generated project in Xcode and supply signing (Developer ID or local signing for testing).
- Replace/augment icons (PNG) and re-run.

### Required Adjustments for Safari

- **Icons**: Provide PNGs (e.g., `images/icon-48.png`, `images/icon-128.png`). Update `manifest.json` accordingly.
- **Permissions**: Current `storage` permission is compatible. No host permissions are needed because content scripts specify `matches`.
- **Background Scripts**: None used; content scripts only → simpler conversion.
- **Polyfill**: Already first in the `js` array (`safari-polyfill.js`). It maps `browser.*` to `chrome.*` (and vice‑versa) for uniform access.
- **Testing iOS**: Build the iOS app target (created by converter) → install on device → enable extension under Settings → Safari → Extensions.

### Debugging in Safari

- Open Develop → Web Extension Background Pages (if a background page existed; not needed here since only content scripts).
- Use Web Inspector on a target tab to view content script console output.
- Check the `local` storage area via the Inspector’s Storage tab (mirrors `chrome.storage.local`).

### Potential Future Enhancements for Safari

- Add `action` popup with quick summary.
- Provide dedicated PNG icon set with brand styling.
- Integrate optional `contextMenus` for quick CSV export.

## Usage

- Click the **Show All Offers** button on an offers page.
- Sort or group columns as needed; drill down via accordion mode.
- Use the star column to add/remove sailings from Favorites.
- (Optional) Link two accounts with the chain icon to view Combined Offers.
- Use **Advanced Search** to layer filters or define a date range for Offer / Expiration / Sail Date.
- Click **CSV Export** to download raw data.

## Development

Key files:
- `advancedSearch.js`: Advanced Search state, rendering, date range picker.
- `filtering.js`: Filtering layer (now includes date range predicate evaluation).
- `profileIdManager.js`: Stable, immutable profile ID assignment logic.
- `tableRenderer.js`: Orchestrates rendering, integrates stable IDs.
- `favorites.js`: Manages the Favorites pseudo-profile.
- `accordionBuilder.js`, `tableBuilder.js`: Render logic for hierarchical/table views.
- `sortUtils.js`, `filtering.js`: Sorting & filtering logic.
- `modal.js`: Modal creation and auxiliary UI elements.
- `utils_core.js` + `utils_row.js` / `domUtils.js`: Utilities and DOM helpers (utils.js has been split into core helpers and row rendering).

### Prerequisites

- Latest Chrome/Edge/Firefox (for loading the unpacked extension during development).
- Node.js 18+ (optional) if you want to run quick utility scripts or add tooling later. The extension itself ships as plain ES modules and does **not** require `npm install` today.
- Xcode 14+ only if you plan to build the Safari Web Extension container (see Safari section above).

### Local Setup (5‑minute onboarding)

1. Clone the repo and open it in VS Code (or your editor of choice).
2. No build step is needed—`manifest.json` points directly at the source files under the repo root.
3. Load the extension unpacked in your preferred browser (see Installation section). Keep the extensions page pinned so you can click **Reload** after edits.
4. Visit the Club Royale Offers page. The content script auto-injects when the URL matches the manifest `matches` entries.

Tips for fast iteration:
- Use Chrome’s **Extensions** toolbar button → “Inspect views” to open a DevTools console scoped to the content script.
- The `styles/` folder is read directly; editing CSS and pressing `Ctrl/Cmd+R` on the target tab reapplies styles immediately.
- If you need persistent test data, toggle `window.GOBO_DEBUG_ENABLED = true` (see Debug Logging section) and inspect `chrome.storage.local` via DevTools → Application tab.

### Project Layout Cheat Sheet

| Path | Purpose |
|------|---------|
| `features/` | Feature-specific modules (accordion, favorites, advanced search, etc.). |
| `utils/` | Shared helpers grouped by concern (`b2b`, sorting, DOM, pricing). |
| `styles/` | Plain CSS plus generated Tailwind bundle for quick prototyping. |
| `scripts/` | Utility snippets that can be pasted into DevTools for data cleanup/imports. |
| `tests/` | Lightweight browser-run harnesses (currently `b2bUtils` coverage). |
| `images/` | Extension icons/art. |
| `app.js` / `modal.js` / `tableRenderer.js` | Core entry points executed by the content script listed in `manifest.json`. |

### Testing & QA

**Automated (Jest):**

```powershell
npm install
npm test
```

This runs the Jest harness that exercises `B2BUtils.computeB2BDepth` via `tests/b2bUtils.test.js`. The GitHub Action workflow runs the same command and will fail the build if tests fail.

**Manual browser harness (optional):**

1. Load the extension and open the offers page in Chrome.
2. Open DevTools → Console and paste in:
  ```javascript
  import(chrome.runtime.getURL('tests/b2bUtils.test.js')).then(() => window.runB2BTests());
  ```
  (If `import` is unavailable, use a script tag: `const s = document.createElement('script'); s.src = chrome.runtime.getURL('tests/b2bUtils.test.js'); document.head.appendChild(s); s.onload = () => window.runB2BTests();`)
3. Watch for `[B2B TEST] ... PASS/FAIL` logs in the console.

Additional manual checks before shipping:
- Load multiple Club Royale profiles and confirm stable Profile IDs remain unchanged.
- Exercise Advanced Search (including date range) and CSV export.
- Toggle Safari polyfill behavior by loading the extension in Firefox to ensure cross-browser compatibility.

### Release Checklist

1. Update `manifest.json` → `version` and ensure icons reference the latest assets under `images/`.
2. In Chrome/Edge: use **Pack extension...** to produce a `.crx` (or zip the folder for uploading to the Web Store/Addon portals). Safari releases follow the conversion steps described earlier.
3. Clear `chrome.storage.local` (DevTools → Application → Clear storage) to verify first-run onboarding.
4. Run the B2B tests and spot-check key flows (Show All Offers, Favorites, Combined Offers, Advanced Search).
5. Tag the release in Git (`git tag vX.Y.Z && git push --tags`).

### Troubleshooting

- **Content script not loading**: Confirm the offers URL matches `manifest.json` `matches` entries, then reload the extension and tab.
- **Stale data**: `chrome.storage.local.clear()` in DevTools or delete the relevant `gobo-*` keys.
- **CSS not applying**: Check that `styles.js` is injecting your stylesheet; syntax errors in CSS files surface in the console as `ERR_FILE_NOT_FOUND` or parsing errors.
- **Safari quirks**: Ensure the polyfill is listed first in `manifest.json` and that icons use PNGs (no `.ico`).

## Customization

- Modify visible columns: edit the `headers` arrays in `tableRenderer.js`.
- Adjust colors / styles: update `styles.js` or the CSS under `styles/`.
- Extend grouping rules: see `accordionBuilder.js`.

## Planned updates

- Browse Itineraries: View detailed sailing itineraries directly from an offer — port-by-port stops, durations, and links to shore excursions.
- Back-to-Back Builder: Guided assistant to detect and link back-to-back sailings, surface upgrade opportunities, and simplify combined booking flows.

## Back-to-Back (B2B) Builder

A built-in Back-to-Back ("B2B") visualizer helps you discover and save chains of same-day connecting sailings (useful for detecting back-to-back itineraries and potential upgrade paths).

- **Purpose:** Identify sailings that connect on the same day (disembark and embark on the same date) and build a multi-leg chain you can save into your `Favorites` profile.
-- **How to use:** Click the small chevrons/pill in the table's B2B column for any sailing to open the Back-to-Back Builder modal. The builder lists matching next-connections (by port & date) and lets you add them to a chain.
- **Side-by-side rule:** Connections must be same-day (no lag) and, unless "side-by-side" is allowed, on the same ship. UI badges indicate when a candidate is side-by-side.
- **Depth & insights:** The UI shows immediate connection counts and a computed descendant depth to help prioritise options that yield longer chains.
- **Saving:** Save a chain of two or more sailings directly into `Favorites`. Saved sailings receive a short chain ID and `__b2bDepth` / `__b2bChainId` metadata for later discovery.

Notes for developers:
- Implemented in `features/backToBackTool.js` and relies on `B2BUtils.computeB2BDepth` (tests: `tests/b2bUtils.test.js`).
- Integration points: the builder reads `data-b2b-row-id` from table rows and updates `.b2b-depth-cell`. It uses `Favorites.bulkAddFavorites` / `Favorites.addFavorite` to persist chains.
- Matching logic: requires identical embark/disembark ports and exact same-day adjacency (lag === 0). Offer codes are not re-used inside a chain.

## Report issues & contribute

Found a bug or have an improvement idea? Please open an issue or submit a pull request on GitHub so I can track and prioritize it:

- https://github.com/JasonHartmann/club-royale-offers-extension/issues

## Data Storage Keys (Overview)

| Key | Purpose |
|-----|---------|
| `gobo-*` | Saved profile payloads (offer data & metadata) |
| `goob-favorites` | Favorites pseudo-profile data |
| `goboProfileIdMap_v1` | Stable profileKey → numeric ID mapping |
| `goboProfileIdFreeIds_v1` | Pool of reusable numeric IDs from deleted profiles |
| `goboProfileIdNext_v1` | Next auto-increment ID when no free IDs exist |
| `goboLinkedAccounts` | Metadata for linked accounts (for Combined Offers) |
| `goob-combined` | Merged profile data for two linked accounts |

## License

© 2026 Percex Technologies, LLC. All rights reserved.

---

**Not affiliated with Royal Caribbean International or Celebrity Cruises. For personal use only.**

## Debug Logging Toggle

All verbose debug output (console.debug and any console.log / console.info lines beginning with `[DEBUG]`) is now gated behind a single immutable global constant: `window.GOBO_DEBUG_ENABLED`.

### How to Enable
1. Open `safari-polyfill.js` (first script loaded per `manifest.json`).
2. Change the value in the `Object.defineProperty(window, 'GOBO_DEBUG_ENABLED', { value: false, ... })` call from `false` to `true`.
3. Reload the extension (or the tab) to start seeing debug output.

### Behavior
- When `GOBO_DEBUG_ENABLED` is `false` (default):
  - `console.debug(...)` produces no output.
  - `console.log('[DEBUG] ...')` and `console.info('[DEBUG] ...')` are suppressed.
  - Regular `console.log`, `console.info`, `console.warn`, and `console.error` remain visible.
- When `GOBO_DEBUG_ENABLED` is `true`: all original logging behavior is restored.

### Preferred Helper
Use `dlog('message', data)` for future debug statements. It automatically respects the global toggle and maps to `console.debug` internally.
