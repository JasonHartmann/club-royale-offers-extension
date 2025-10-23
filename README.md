# Club Royale Offers Viewer

This Chrome extension enhances the Royal Caribbean Club Royale Offers page by adding a "Show All Offers" button. When clicked, it presents your comp offers in a sortable, groupable table and accordion view, making it easy to analyze and compare your offers.

## Features

- **Show All Offers Button**: Adds a button to the Club Royale Offers page for quick access.
- **Sortable Table**: Click any column header to sort offers by that column (ascending/descending/original order).
- **Groupable Table**: Group offers by any column (e.g., ship, destination, nights, etc.) for easier analysis.
- **Accordion View**: Drill down into groups with nested accordions for detailed exploration.
- **Visual Highlights**:
  - **Green Row**: The single newest offer (by offer date) is highlighted in green.
  - **Pink Row**: The offer expiring soonest (within the next 3 days) is highlighted in pink.
- **Favorites Profile**: Star individual sailings to add them to a persistent `Favorites` pseudo‑profile.
- **Linked / Combined Offers**: Link exactly two profiles to view a merged, upgraded “Combined Offers” view.
- **Stable Profile IDs**: Each saved profile (gobo-* key) gets a permanent numeric ID badge.
- **Export to CSV**: Download your offers as a CSV file for offline analysis.
- **Responsive UI**: Table columns are sized for readability.

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

## Installation

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable "Developer mode" (top right).
4. Click "Load unpacked" and select the folder containing this extension.
5. Visit the Club Royale or Blue Chip Club offers page and use the injected button.

## Usage

- Click the **Show All Offers** button on an offers page.
- Sort or group columns as needed; drill down via accordion mode.
- Use the star column to add/remove sailings from Favorites.
- (Optional) Link two accounts with the chain icon to view Combined Offers.
- Click **Export to CSV** to download raw data.

## Development

Key files:
- `profileIdManager.js`: Stable, immutable profile ID assignment logic.
- `tableRenderer.js`: Orchestrates rendering, integrates stable IDs.
- `favorites.js`: Manages the Favorites pseudo-profile.
- `accordionBuilder.js`, `tableBuilder.js`: Render logic for hierarchical/table views.
- `sortUtils.js`, `filtering.js`: Sorting & filtering logic.
- `modal.js`: Modal creation and auxiliary UI elements.
- `utils_core.js` + `utils_row.js` / `domUtils.js`: Utilities and DOM helpers (utils.js has been split into core helpers and row rendering).

## Customization

- Modify visible columns: edit the `headers` arrays in `tableRenderer.js`.
- Adjust colors / styles: update `styles.js`.
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
