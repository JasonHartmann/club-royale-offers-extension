const path = require('path');

describe('Utils.refreshOfferValues recomputes Value column on refresh', () => {
    let Utils;

    function setup(options = {}) {
        jest.resetModules();
        const { offerValue = 100, rowText = '-' } = options;
        const cells = [];
        for (let i = 0; i < 11; i++) {
            cells.push({ textContent: '' });
        }
        // Cell 6 = Value column
        cells[6].textContent = rowText;

        const row = {
            dataset: { offerCode: 'GOBO1', sailDate: '2026-09-04', shipName: 'Ovation Of The Seas', offerIndex: '0' },
            querySelectorAll: (sel) => (sel === 'td') ? cells : []
        };

        const rowsList = [row];

        const offer = { category: 'INT', campaignOffer: { offerCode: 'GOBO1', name: 'Interior' } };
        const sailing = { shipCode: 'OV', sailDate: '2026-09-04', shipName: 'Ovation Of The Seas', roomType: 'INT' };

        const appObj = {
            TableRenderer: { lastState: { sortedOffers: [{ offer, sailing }] } },
            Utils: {
                formatOfferValue: (v) => (v != null && isFinite(v)) ? `$${v}` : '-',
                getIncludeTaxesAndFeesPreference: () => true
            }
        };

        global.window = { App: appObj };
        global.App = appObj;
        global.document = {
            addEventListener: () => {},
            createElement: () => ({ style: {}, classList: { add() {}, toggle() {} }, appendChild() {}, setAttribute() {}, addEventListener() {} }),
            body: { appendChild() {}, classList: { toggle() {} } },
            dispatchEvent: () => {},
            readyState: 'complete',
            documentElement: { classList: { toggle() {} } },
            querySelectorAll: () => rowsList
        };
        global.localStorage = { getItem: () => null, setItem: () => {} };
        global.goboStorageGet = () => null;
        global.goboStorageSet = () => {};
        global.CustomEvent = class CustomEvent {};

        // Stub dependent modules
        ['DOMUtils', 'Styles', 'ButtonManager', 'ErrorHandler', 'Spinner', 'ApiClient',
         'Modal', 'TableBuilder', 'AccordionBuilder', 'SortUtils', 'TableRenderer',
         'AdvancedItinerarySearch', 'Breadcrumbs', 'AdvancedSearch', 'AdvancedSearchAddField',
         'Filtering', 'B2BUtils', 'BackToBackTool', 'Favorites',
         'Settings', 'ItineraryCache'].forEach(name => { if (!global[name]) global[name] = {}; });
        global.DOMUtils.waitForDom = () => {};
        global.ItineraryCache = { get: () => null, all: () => ({}) };

        // Load the module (sets window.Utils via the IIFE)
        require(path.resolve(__dirname, '../utils/utils_core.js'));
        Utils = global.window.Utils;

        // Monkey-patch computeOfferValue to return a controlled value
        Utils.computeOfferValue = () => offerValue;
        // Ensure formatOfferValue is on Utils too
        Utils.formatOfferValue = appObj.Utils.formatOfferValue;
        // Stub upgrade helpers to avoid errors
        Utils.computeInteriorYouPayPrice = () => null;
        Utils.formatUpgradePriceForColumn = () => '-';

        return { cells };
    }

    test('updates Value cell even when it already has a value', () => {
        const { cells } = setup({ offerValue: 200, rowText: '$100' });
        Utils.refreshOfferValues();
        expect(cells[6].textContent).toBe('$200');
    });

    test('populates Value cell when it was empty/dash', () => {
        const { cells } = setup({ offerValue: 150, rowText: '-' });
        Utils.refreshOfferValues();
        expect(cells[6].textContent).toBe('$150');
    });

    test('does not overwrite Value cell when computed value matches existing', () => {
        const { cells } = setup({ offerValue: 100, rowText: '$100' });
        // Track writes via property descriptor
        let writeCount = 0;
        let _val = cells[6].textContent;
        Object.defineProperty(cells[6], 'textContent', {
            get() { return _val; },
            set(v) { writeCount++; _val = v; },
            configurable: true
        });
        Utils.refreshOfferValues();
        // Value didn't change, so no write should occur
        expect(writeCount).toBe(0);
        expect(_val).toBe('$100');
    });
});
