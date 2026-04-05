const path = require('path');

describe('ItineraryCache._enrichEntryFromSailing pricing merge', () => {
    let ItineraryCache;

    beforeEach(() => {
        jest.resetModules();
        // Minimal DOM/browser stubs required by the IIFE
        global.window = global.window || {};
        global.document = global.document || {
            addEventListener: () => {},
            createElement: () => ({ style: {}, classList: { add() {}, toggle() {} }, appendChild() {}, setAttribute() {}, addEventListener() {} }),
            body: { appendChild() {}, classList: { toggle() {} } },
            dispatchEvent: () => {},
            readyState: 'complete',
            documentElement: { classList: { toggle() {} } }
        };
        global.localStorage = global.localStorage || { getItem: () => null, setItem: () => {} };
        global.goboStorageGet = global.goboStorageGet || (() => null);
        global.goboStorageSet = global.goboStorageSet || (() => {});
        global.CustomEvent = global.CustomEvent || class CustomEvent {};
        // Stub modules referenced in app.js
        const noop = {};
        ['DOMUtils', 'Styles', 'ButtonManager', 'ErrorHandler', 'Spinner', 'ApiClient',
         'Modal', 'TableBuilder', 'AccordionBuilder', 'SortUtils', 'TableRenderer',
         'AdvancedItinerarySearch', 'Breadcrumbs', 'AdvancedSearch', 'AdvancedSearchAddField',
         'Utils', 'Filtering', 'B2BUtils', 'BackToBackTool', 'Favorites',
         'Settings'].forEach(name => { if (!global[name]) global[name] = noop; });
        global.DOMUtils.waitForDom = () => {};

        // Load itinerary module (sets window.ItineraryCache)
        require(path.resolve(__dirname, '../features/itinerary.js'));
        ItineraryCache = global.window.ItineraryCache || global.ItineraryCache;
    });

    function makeSailing(pricesByCode, taxes, taxesIncluded) {
        return {
            taxesAndFees: { value: taxes },
            taxesAndFeesIncluded: taxesIncluded,
            stateroomClassPricing: Object.entries(pricesByCode).map(([code, price]) => ({
                stateroomClass: { content: { code }, id: code },
                price: { value: price, currency: { code: 'USD' } }
            }))
        };
    }

    test('keeps cheaper prices when enriched with a more expensive sailing', () => {
        const key = 'SD_OV_2026-09-04';
        // Seed the cache with a blank entry
        ItineraryCache._ensureLoaded();
        ItineraryCache._cache[key] = {
            keyType: 'SHIPDATE', enriched: false,
            taxesAndFees: null, taxesAndFeesIncluded: null,
            stateroomPricing: {}
        };

        // First enrichment: cheap cruise prices
        const cheapSailing = makeSailing({ I: 728.87, O: 948.87, B: 968.87, D: 4273.37 }, 254.37, true);
        ItineraryCache._enrichEntryFromSailing(key, {}, cheapSailing);

        // Verify first enrichment
        expect(ItineraryCache._cache[key].stateroomPricing.I.price).toBeCloseTo(728.87);
        expect(ItineraryCache._cache[key].stateroomPricing.O.price).toBeCloseTo(948.87);

        // Second enrichment: expensive cruisetour prices
        const expensiveSailing = makeSailing({ I: 2137.87, O: 2358.37, B: 2425.37, D: 5682.37 }, 254.37, true);
        ItineraryCache._enrichEntryFromSailing(key, {}, expensiveSailing);

        // The cheaper prices from the first enrichment must be preserved
        const pricing = ItineraryCache._cache[key].stateroomPricing;
        expect(pricing.I.price).toBeCloseTo(728.87);
        expect(pricing.O.price).toBeCloseTo(948.87);
        expect(pricing.B.price).toBeCloseTo(968.87);
        expect(pricing.D.price).toBeCloseTo(4273.37);
    });

    test('updates to cheaper prices when enriched with a less expensive sailing', () => {
        const key = 'SD_OV_2026-09-04';
        ItineraryCache._ensureLoaded();
        ItineraryCache._cache[key] = {
            keyType: 'SHIPDATE', enriched: false,
            taxesAndFees: null, taxesAndFeesIncluded: null,
            stateroomPricing: {}
        };

        // First enrichment: expensive cruisetour
        const expensiveSailing = makeSailing({ I: 2137.87, O: 2358.37, B: 2425.37, D: 5682.37 }, 254.37, true);
        ItineraryCache._enrichEntryFromSailing(key, {}, expensiveSailing);

        expect(ItineraryCache._cache[key].stateroomPricing.I.price).toBeCloseTo(2137.87);

        // Second enrichment: cheaper base cruise
        const cheapSailing = makeSailing({ I: 728.87, O: 948.87, B: 968.87, D: 4273.37 }, 254.37, true);
        ItineraryCache._enrichEntryFromSailing(key, {}, cheapSailing);

        // Should now reflect the cheaper prices
        const pricing = ItineraryCache._cache[key].stateroomPricing;
        expect(pricing.I.price).toBeCloseTo(728.87);
        expect(pricing.O.price).toBeCloseTo(948.87);
        expect(pricing.B.price).toBeCloseTo(968.87);
        expect(pricing.D.price).toBeCloseTo(4273.37);
    });

    test('retains codes only present in previous enrichment', () => {
        const key = 'SD_OV_2026-09-04';
        ItineraryCache._ensureLoaded();
        ItineraryCache._cache[key] = {
            keyType: 'SHIPDATE', enriched: false,
            taxesAndFees: null, taxesAndFeesIncluded: null,
            stateroomPricing: {}
        };

        // First enrichment has an extra code X
        const first = makeSailing({ I: 500, X: 300 }, 100, true);
        ItineraryCache._enrichEntryFromSailing(key, {}, first);

        // Second enrichment does not include X
        const second = makeSailing({ I: 600 }, 100, true);
        ItineraryCache._enrichEntryFromSailing(key, {}, second);

        const pricing = ItineraryCache._cache[key].stateroomPricing;
        // I should keep cheaper (500), X should be retained
        expect(pricing.I.price).toBeCloseTo(500);
        expect(pricing.X.price).toBeCloseTo(300);
    });
});
