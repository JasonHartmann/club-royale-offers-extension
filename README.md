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
- **Export to CSV**: Download your offers as a CSV file for offline analysis.
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
- Click **Export to CSV** to download raw data.

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

## Customization

- Modify visible columns: edit the `headers` arrays in `tableRenderer.js`.
- Adjust colors / styles: update `styles.js` or the CSS under `styles/`.
- Extend grouping rules: see `accordionBuilder.js`.

## Planned updates

- Browse Itineraries: View detailed sailing itineraries directly from an offer — port-by-port stops, durations, and links to shore excursions.
- Back-to-Back Wizard: Guided assistant to detect and link back-to-back sailings, surface upgrade opportunities, and simplify combined booking flows.

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

© 2025 Percex Technologies, LLC. All rights reserved.

---

**Not affiliated with Royal Caribbean International or Celebrity Cruises. For personal use only.**
