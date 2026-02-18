/**
 * Column Coverage Test
 *
 * Verifies that every column defined in the canonical header list is properly
 * handled across all five systems: sorting, CSV export, grouping, CSS widths,
 * and advanced search (filtering).
 *
 * If you add a new column to the base table headers in tableRenderer.js,
 * this test will fail until the column is also handled in each system.
 *
 * Run: npx jest tests/columnCoverage.test.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readFile(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// --- Extract canonical column keys from tableRenderer.js ---
function getCanonicalHeaders() {
    const src = readFile('tableRenderer.js');
    // Match the first full headers array definition (lines ~707-726)
    const keys = [];
    const re = /\{\s*key:\s*'([^']+)'\s*,\s*label:\s*'[^']*'\s*\}/g;
    // Find the first block that defines the full header array (contains sailDate, perks, etc.)
    // We look for the block starting around "const headers" or the array literal
    const blockMatch = src.match(/(?:const\s+headers\s*=\s*\[|headers\s*(?:=|:)\s*\[)([\s\S]*?)\];/);
    if (blockMatch) {
        let m;
        while ((m = re.exec(blockMatch[1])) !== null) {
            keys.push(m[1]);
        }
    }
    if (keys.length === 0) {
        // Fallback: grab all unique key values from header-like objects in the file
        const allKeys = new Set();
        const globalRe = /\{\s*key:\s*'([^']+)'\s*,\s*label:\s*'[^']*'\s*\}/g;
        let gm;
        while ((gm = globalRe.exec(src)) !== null) allKeys.add(gm[1]);
        return Array.from(allKeys);
    }
    return keys;
}

// --- Extract sort case keys from sortUtils.js ---
function getSortKeys() {
    const src = readFile('utils/sortUtils.js');
    const keys = new Set();
    const re = /case\s+'([^']+)'/g;
    let m;
    while ((m = re.exec(src)) !== null) keys.add(m[1]);
    return keys;
}

// --- Extract CSV column keys from modal.js exportToCSV ---
// The CSV return array (lines ~522-543) maps positionally to headers.
// We count the number of elements in the return array to verify it matches header count.
// We also check that specific column-related identifiers appear in the export function.
function getCSVHandledKeys() {
    const src = readFile('modal.js');
    // Extract the full exportToCSV function body (runs to end of file / Modal object)
    const startIdx = src.indexOf('exportToCSV(state)');
    const exportBody = startIdx !== -1 ? src.slice(startIdx) : '';
    const mentionedKeys = new Set();
    const keyChecks = [
        'b2bDepth', 'offerCode', 'offerDate', 'expiration', 'tradeInValue',
        'offerValue', 'oceanViewUpgrade', 'balconyUpgrade', 'suiteUpgrade',
        'offerName', 'shipClass', 'ship', 'sailDate', 'departurePort',
        'nights', 'destination', 'category', 'guests', 'perks'
    ];
    // Check for identifiers or string patterns that indicate each column is handled
    const csvIndicators = {
        b2bDepth: /b2bDepth|__b2bDepth|__b2bChainId/,
        offerCode: /offerCode/,
        offerDate: /startDate/,
        expiration: /reserveByDate/,
        tradeInValue: /tradeInValue/,
        offerValue: /computeOfferValue|offerValue/,
        oceanViewUpgrade: /oceanViewUpgrade|computeOceanViewUpgradePrice/,
        balconyUpgrade: /balconyUpgrade|computeBalconyUpgradePrice/,
        suiteUpgrade: /suiteUpgrade|computeSuiteUpgradePrice/,
        offerName: /\.name/,
        shipClass: /getShipClass|shipClass/,
        ship: /shipName/,
        sailDate: /sailDate/,
        departurePort: /departurePort/,
        nights: /nights/,
        destination: /destination/,
        category: /roomType|category/,
        guests: /isGOBO|Guests/,
        perks: /computePerks|perksStr/
    };
    for (const [key, pattern] of Object.entries(csvIndicators)) {
        if (pattern.test(exportBody)) mentionedKeys.add(key);
    }
    return { mentionedKeys };
}

// --- Extract grouping case keys from accordionBuilder.js ---
function getGroupingKeys() {
    const src = readFile('features/accordionBuilder.js');
    const keys = new Set();
    // Only look at the createGroupedData switch block
    const fnMatch = src.match(/createGroupedData\s*\([^)]*\)\s*\{([\s\S]*?)\n\s{4}\},?/);
    const block = fnMatch ? fnMatch[1] : src;
    const re = /case\s+'([^']+)'/g;
    let m;
    while ((m = re.exec(block)) !== null) keys.add(m[1]);
    return keys;
}

// --- Extract CSS width keys from table-columns.css ---
function getCSSKeys() {
    const src = readFile('styles/table-columns.css');
    const keys = new Set();
    const re = /data-(?:key|col)="([^"]+)"/g;
    let m;
    while ((m = re.exec(src)) !== null) keys.add(m[1]);
    return keys;
}

// --- Extract advanced search / filtering keys from filtering.js ---
function getFilteringKeys() {
    const src = readFile('features/filtering.js');
    const keys = new Set();
    // Look at getOfferColumnValue switch cases
    const fnMatch = src.match(/getOfferColumnValue\s*\(offer,\s*sailing,\s*key\)\s*\{([\s\S]*?)\n\s{4}\},?/);
    const block = fnMatch ? fnMatch[1] : src;
    const re = /case\s+'([^']+)'/g;
    let m;
    while ((m = re.exec(block)) !== null) keys.add(m[1]);
    return keys;
}

// Columns that are intentionally excluded from certain systems.
// 'favorite' is a UI-only toggle column, not a data column.
const UI_ONLY_COLUMNS = new Set(['favorite']);

// 'perks' and 'offerValue' are computed columns that don't need a sort case
// because they delegate to utility functions or are handled specially.
// However they SHOULD still be in grouping, CSS, and filtering.
// We track per-system intentional exclusions here.
const SORT_EXCLUDED = new Set(['favorite', 'perks']);
const CSV_EXCLUDED = new Set(['favorite']);
const GROUPING_EXCLUDED = new Set(['favorite', 'offerValue']);
const CSS_EXCLUDED = new Set(); // all columns should have CSS widths
const FILTERING_EXCLUDED = new Set(['favorite']);

describe('Column coverage across systems', () => {
    const canonicalHeaders = getCanonicalHeaders();

    test('canonical headers list is non-empty and contains expected columns', () => {
        expect(canonicalHeaders.length).toBeGreaterThanOrEqual(15);
        expect(canonicalHeaders).toContain('sailDate');
        expect(canonicalHeaders).toContain('perks');
        expect(canonicalHeaders).toContain('offerCode');
    });

    test('every column has a sort handler in sortUtils.js', () => {
        const sortKeys = getSortKeys();
        const missing = canonicalHeaders.filter(
            k => !UI_ONLY_COLUMNS.has(k) && !SORT_EXCLUDED.has(k) && !sortKeys.has(k)
        );
        expect(missing).toEqual([]);
    });

    test('CSV export handles every column', () => {
        const { mentionedKeys } = getCSVHandledKeys();
        const missing = canonicalHeaders.filter(
            k => !UI_ONLY_COLUMNS.has(k) && !CSV_EXCLUDED.has(k) && !mentionedKeys.has(k)
        );
        expect(missing).toEqual([]);
    });

    test('every column has a grouping handler in accordionBuilder.js', () => {
        const groupKeys = getGroupingKeys();
        const missing = canonicalHeaders.filter(
            k => !UI_ONLY_COLUMNS.has(k) && !GROUPING_EXCLUDED.has(k) && !groupKeys.has(k)
        );
        expect(missing).toEqual([]);
    });

    test('every column has CSS width rules in table-columns.css', () => {
        const cssKeys = getCSSKeys();
        const missing = canonicalHeaders.filter(
            k => !CSS_EXCLUDED.has(k) && !cssKeys.has(k)
        );
        expect(missing).toEqual([]);
    });

    test('every column has a filtering handler in filtering.js getOfferColumnValue', () => {
        const filterKeys = getFilteringKeys();
        const missing = canonicalHeaders.filter(
            k => !UI_ONLY_COLUMNS.has(k) && !FILTERING_EXCLUDED.has(k) && !filterKeys.has(k)
        );
        expect(missing).toEqual([]);
    });

    test('no system has stale column keys not in canonical headers', () => {
        const headerSet = new Set(canonicalHeaders);
        const sortKeys = getSortKeys();
        const groupKeys = getGroupingKeys();
        const cssKeys = getCSSKeys();
        const filterKeys = getFilteringKeys();

        // Advanced-only fields that legitimately appear in filtering but not in headers
        const advancedOnlyKeys = new Set([
            'departureDayOfWeek', 'departureMonth', 'visits', 'endDate',
            'minInteriorPrice', 'minOutsidePrice', 'minBalconyPrice', 'minSuitePrice'
        ]);

        // 'itinerary' is a valid sort key that maps to destination/nights columns
        const sortOnlyKeys = new Set(['itinerary']);
        const staleSortKeys = [...sortKeys].filter(k => !headerSet.has(k) && !sortOnlyKeys.has(k));
        const staleGroupKeys = [...groupKeys].filter(k => !headerSet.has(k));
        const staleCSSKeys = [...cssKeys].filter(k => !headerSet.has(k));
        const staleFilterKeys = [...filterKeys].filter(k => !headerSet.has(k) && !advancedOnlyKeys.has(k));

        expect(staleSortKeys).toEqual([]);
        expect(staleGroupKeys).toEqual([]);
        expect(staleCSSKeys).toEqual([]);
        expect(staleFilterKeys).toEqual([]);
    });
});
