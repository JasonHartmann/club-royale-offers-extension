# Copilot Project Notes (Club Royale / Blue Chip Offers Extension)

Keep responses terse. Prefer existing utility helpers. Avoid inline styles; put new CSS rules in css files under `/styles`.

## Core Data Flow
API -> `TableRenderer.prepareOfferData` builds `originalOffers` array of `{ offer, sailing }` -> sorting (`SortUtils.sortOffers`) & filtering (`Filtering.filterOffers`) -> row HTML via `Utils.createOfferRow`.

## Column System Overview
Canonical column order (indexes fixed by nth-child selectors in `styles.css`):
1 favorite (★ / ID)
2 offerCode
3 offerDate
4 expiration
5 offerName
6 shipClass
7 ship
8 sailDate
9 departurePort
10 nights
11 destination
12 category
13 guests
14 perks
Adding a column shifts all later nth-child widths unless appended at end. Prefer appending after `perks` and update CSS accordingly, or update ALL affected nth-child mappings.

Headers defined in three places (must stay in sync):
- Initial build paths: `TableRenderer.loadProfile` & `TableRenderer.displayTable` (`state.headers` array)
- Rebuild path: `TableRenderer.rebuildProfileView` (ensures favorite column)
- CSV export: `Modal.exportToCSV` (header labels reused; first label overridden to `Profile` during export)

Grouping / Accordion relies on:
- `TableBuilder.createTableHeader` (adds group icon per sortable column except favorite)
- `AccordionBuilder.createGroupedData` (switch on `currentGroupColumn`)
- `Filtering.getOfferColumnValue` (must return same displayed value for hidden group logic)

Sorting relies on `SortUtils.sortOffers` `switch(sortColumn)`.

Row rendering relies on the order inside `Utils.createOfferRow` (string of `<td>` cells). Must align with header order & CSS nth-child indices.

CSV relies on explicit array build inside `Modal.exportToCSV` (order must match headers). It re-computes derived values (nights, destination, guests, perks, category, class).

## Adding a New Column (Example: `itineraryType`)
1 Decide placement. Prefer appending to avoid nth-child churn. If inserting mid-list, update all nth-child width rules in `styles.css` below the insertion.
2 Update every headers array: add `{ key: 'itineraryType', label: 'Type' }`.
3 Update `Utils.createOfferRow`: add `<td class="border p-2">...</td>` in correct position (handle favorites view variant if needed).
4 Add retrieval logic:
   - `Filtering.getOfferColumnValue` case `'itineraryType'` -> derived value.
   - `AccordionBuilder.createGroupedData` case `'itineraryType'` -> same derived value for grouping.
   - `SortUtils.sortOffers` case `'itineraryType'` -> comparable primitive (string / number).
5 Update CSV: in `Modal.exportToCSV` add the field into row array & optionally width rule in CSS.
6 Add style rules in `styles.css`:
   - `th[data-key="itineraryType"], .accordion-table th[data-key="itineraryType"], .table-auto td:nth-child(N), .accordion-table td:nth-child(N)` width specs.
7 If column supports grouping, no further changes; group icon appears automatically (not for `favorite`).
8 Test: open modal, sort, group by new column, export CSV, verify value appears and hide-group feature filters correctly.
9 (Optional) Update `Utils.normalizeOffers` to standardize capitalization for any new raw API field used.

## Favorites View Nuances
`favorite` column switches to ID badges in favorites profile. If you add a new data column that depends on favorites metadata (e.g. per-profile variance), ensure `Utils.createOfferRow` computes it consistently for both normal and favorites views. Avoid storing logic only in the favorites branch.

## Normalization
`Utils.normalizeOffers(data)` capitalizes & trims key fields. When adding new ship / itinerary related fields you want standardized, extend this function rather than duplicating casing code elsewhere.

## Utilities To Reuse
- `Utils.formatDate(dateStr)` for date display (no TZ shift).
- `Utils.parseItinerary(itinerary)` -> `{ nights, destination }`.
- `Utils.computePerks(offer, sailing)` aggregated perks string.
- `Utils.getShipClass(shipName)` classification.

## Favorites Column
Key `'favorite'` is special: not sortable, width fixed, sometimes shows ID badges in favorites view. Rebuild logic ensures it exists. Do not repurpose.

## Styling Guidelines
- Use existing class patterns (`border p-2`, `hover:bg-gray-50`).
- Do not inline layout/styling except minimal dynamic color changes already present (future: migrate remaining inline styles if touched).
- Add widths using attribute selectors (`th[data-key]`) and parallel nth-child indices.

## Tokens & State Guards
Profile switching uses `_switchToken` to avoid stale DOM writes. When manually calling `updateView`, preserve `state._switchToken` from `App.TableRenderer.currentSwitchToken` so sort/group clicks are not aborted.

## Hidden Groups
Hidden groups store label:value pairs globally. Their matching depends on header label -> key mapping; keep labels stable. Changing a label breaks existing hidden entries.

## Performance / Safety
- Avoid recomputing heavy derived values inside loops; use existing helpers.
- If adding asynchronous operations, guard with current switch token.

## Common Pitfalls
- Forgetting to update one of: `Filtering.getOfferColumnValue`, `AccordionBuilder.createGroupedData`, `SortUtils.sortOffers`, CSV builder.
- Inserting column mid-order without adjusting all nth-child selectors.
- Label mismatch causing hidden group or grouping breadcrumb issues.
- Direct DOM manipulation without preserving `selectedProfileKey` (use `preserveSelectedProfileKey`).

## Minimal Template Snippets (Pseudo — keep code terse)
Header entry: `{ key: 'itineraryType', label: 'Type' }`
Sort case: `case 'itineraryType': aValue = derive(...); bValue = derive(...); break;`
Filter value: `case 'itineraryType': return derive(...);`
Group value: `case 'itineraryType': groupKey = derive(...); break;`
Row cell: `<td class="border p-2">${derive(... ) || '-'}</td>`
CSV: add `derive(... )` into array.
CSS: `th[data-key="itineraryType"], ... td:nth-child(N) { width:90px; min-width:70px; }`

## When Removing a Column
- Remove from all header arrays & row HTML.
- Remove nth-child width rule and adjust indices after it.
- Remove switch cases (Sorting, Grouping, Filtering, CSV). Leave no unused key.
- Consider migrating any hidden group entries referencing old label (optional cleanup).

## Brand Detection
Centralized in `Utils.detectBrand()`:
- Returns `'C'` if hostname contains `celebritycruises.com` or `bluechipcluboffers.com`, else `'R'`.
- LocalStorage override key: `casinoBrand`. Accepted values: `R`, `C`, `X` (where `X` coerces to `C`). Ignore other values.
Helpers: `Utils.isCelebrity()` (boolean) and `Utils.getRedemptionBase()` (brand-specific redemption URL).
Usage hotspots: `apiClient` (selects base domain & annotates payload with `brand`), `offerCodeLookup` (endpoint selection), offer merging logic (`tableRenderer.mergeProfiles` checks brand heuristics to choose category order). When adding brand-sensitive logic, call `Utils.detectBrand()` or `Utils.isCelebrity()` instead of duplicating hostname checks.
Do NOT persist derived brand anywhere besides existing payload field; rely on detection each time for correctness across tabs.

## Profile Tabs Construction
Driven by `TableRenderer.updateBreadcrumb()` (top half builds tabs, bottom half builds breadcrumb trail).
Key steps:
1 Enumerate profile keys: prefer `GoboStore.getAllProfileKeys()`; fallback to localStorage keys starting with `gobo-`.
2 Ensure favorites profile exists via `Favorites.ensureProfileExists()`; include `goob-favorites` if storage has data.
3 Load each profile payload (`{ data, savedAt }`) to determine `savedAt` for sorting and derive label (strip `gobo-`, replace `_` with `@`).
4 Sort non-special profiles by `savedAt` desc. Extract favorites; move current user's profile (derived from `persist:session`) to front. Re-append Favorites at far right.
5 Append synthetic Combined Offers tab (`goob-combined-linked`) after sorted profiles (before Favorites). It pulls linked account emails via `getLinkedAccounts()`; linking logic merges underlying payloads into storage key `goob-combined` when two accounts are linked.
6 Assign stable numeric profile IDs using `ProfileIdManager.ensureIds()` (only for `gobo-*` profiles). Skip Favorites & Combined.
7 Build tabs with badges (profileId, combined ID math, loyaltyId, last refreshed time via `formatTimeAgo`). `TabKeyMap` ensures unique DOM `data-key` for duplicates.
8 Initial open flags: `_initialOpenPending` + `hasSelectedDefaultTab` force first (current) profile active once per modal open; prevents auto-selecting Favorites.
9 Tab click handler: shows spinner, loads correct payload via `TableRenderer.loadProfile()`. Special cases: Combined tab loads merged `goob-combined`; Favorites loads `goob-favorites` (fallback empty payload). Cache invalidation compares `savedAt` vs cached DOM `_cachedAt` to force rebuild.
10 Link/unlink icon: toggles membership in `goboLinkedAccounts`; on second link merges profiles (`mergeProfiles`) and stores combined payload; unlink deleting combined if <2 linked accounts. Trash icon deletes profile, unlinks if needed, reclaims ID with `ProfileIdManager.removeKeys()`.
11 Storage events (`goboStorageUpdated`): debounce; invalidate affected cache entries, rebuild tabs, reload active profile if changed. Also refresh Combined Offers if relevant keys updated.
12 Highlighting: `_applyActiveTabHighlight()` uses underlying storage key (`data-storage-key`) to set `.active`. Always preserve `selectedProfileKey` via `preserveSelectedProfileKey()` during view updates.

Modifying tabs:
- To add new synthetic tab: inject into profiles array before Combined/Favorites ordering adjustments; assign unique storage key; exclude from ID assignment if not `gobo-*`.
- To change ordering rules: adjust sort/move logic before tabs are rendered; keep Favorites last for user expectation unless intentionally changed.
- When altering payload shape for tabs (adding loyalty or merged metadata), update badge assembly but avoid inline styles beyond existing small adjustments.

Keep tab-related changes inside `updateBreadcrumb()`; avoid duplicating enumeration logic elsewhere.

### Avoid adding comments unless **vital** to describe complex logic. 
### Do not add useless comments like "Removed XYZ".

