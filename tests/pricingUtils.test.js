const path = require('path');

describe('PricingUtils upgrade calculations', () => {
    let PricingUtils;

    function loadModule() {
        jest.resetModules();
        global.window = global.window || {};
        global.App = global.App || {};
        delete global.App.Utils;
        // Fresh ItineraryCache per test
        const cache = new Map();
        global.ItineraryCache = {
            get: (key) => cache.get(key),
            all: () => Object.fromEntries(cache.entries())
        };
        require(path.resolve(__dirname, '../utils/pricingUtils.js'));
        PricingUtils = global.App.PricingUtils;
        return { cache };
    }

    function makeEntry(pricingByCat, taxes = 0) {
        const stateroomPricing = {};
        Object.entries(pricingByCat).forEach(([code, price]) => {
            stateroomPricing[code] = { code, price };
        });
        return { stateroomPricing, taxesAndFees: taxes };
    }

    test('suite upgrade with taxes included', () => {
        const { cache } = loadModule();
        const entry = makeEntry({ INT: 500, DLX: 1000 }, 100); // prices per guest; dual computed internally
        cache.set('SD_OA_2026-05-01', entry);
        const offer = { category: 'INT', campaignOffer: { offerCode: 'O1' } };
        const sailing = { shipCode: 'OA', sailDate: '2026-05-01', roomType: 'INT' };
        const res = PricingUtils.computeSuiteUpgradePrice(offer, sailing, { includeTaxes: true });
        // INT dual = 1000, DLX dual = 2000, taxes = 200 => 2000-1000+200 = 1200
        expect(res).toBeCloseTo(1200);
    });

    test('suite upgrade without taxes', () => {
        const { cache } = loadModule();
        const entry = makeEntry({ INT: 500, DLX: 1000 }, 100);
        cache.set('SD_OA_2026-05-01', entry);
        const offer = { category: 'INT', campaignOffer: { offerCode: 'O1' } };
        const sailing = { shipCode: 'OA', sailDate: '2026-05-01', roomType: 'INT' };
        const res = PricingUtils.computeSuiteUpgradePrice(offer, sailing, { includeTaxes: false });
        expect(res).toBeCloseTo(1000); // taxes excluded
    });

    test('offer already suite returns taxes or zero based on includeTaxes', () => {
        const { cache } = loadModule();
        const entry = makeEntry({ DLX: 800 }, 120);
        cache.set('SD_SY_2026-05-01', entry);
        const offer = { category: 'DLX', campaignOffer: { offerCode: 'SUITE' } };
        const sailing = { shipCode: 'SY', sailDate: '2026-05-01', roomType: 'DLX' };
        const withTaxes = PricingUtils.computeSuiteUpgradePrice(offer, sailing, { includeTaxes: true });
        const withoutTaxes = PricingUtils.computeSuiteUpgradePrice(offer, sailing, { includeTaxes: false });
        expect(withTaxes).toBeCloseTo(240); // taxesAndFees stored per guest -> doubled internally
        expect(withoutTaxes).toBe(0);
    });

    test('GOBO path matches modifier logic', () => {
        const { cache } = loadModule();
        const entry = makeEntry({ INT: 600, DLX: 1000 }, 100); // INT dual 1200, DLX dual 2000, taxes dual 200
        cache.set('SD_OA_2026-06-01', entry);
        const offer = { category: 'INT', campaignOffer: { offerCode: 'GOBO' } };
        const sailing = { shipCode: 'OA', sailDate: '2026-06-01', roomType: 'INT', isGOBO: true };
        const res = PricingUtils.computeSuiteUpgradePrice(offer, sailing, { includeTaxes: true });
        // Manual calc documented in code comments; assert within a tight band
        expect(res).toBeCloseTo(1621.43, 2);
    });

    test('balcony upgrade mirrors suite logic', () => {
        const { cache } = loadModule();
        const entry = makeEntry({ INT: 500, B: 750 }, 100); // INT dual 1000, BAL dual 1500, taxes dual 200
        cache.set('SD_OA_2026-07-01', entry);
        const offer = { category: 'INT', campaignOffer: { offerCode: 'B1' } };
        const sailing = { shipCode: 'OA', sailDate: '2026-07-01', roomType: 'INT' };
        const res = PricingUtils.computeBalconyUpgradePrice(offer, sailing, { includeTaxes: true });
        expect(res).toBeCloseTo(700); // 1500-1000+200
    });

    test('uses offer value when available (suite with taxes)', () => {
        const { cache } = loadModule();
        const entry = makeEntry({ INT: 500, DLX: 1000 }, 100); // INT dual 1000, DLX dual 2000, taxes dual 200
        cache.set('SD_OA_2026-09-01', entry);
        global.App.Utils = {
            computeOfferValue: () => 800 // base (dual) 1000 - taxes 200
        };
        const offer = { category: null, campaignOffer: { offerCode: 'O1' } };
        const sailing = { shipCode: 'OA', sailDate: '2026-09-01', roomType: null };
        const res = PricingUtils.computeSuiteUpgradePrice(offer, sailing, { includeTaxes: true });
        expect(res).toBeCloseTo(1200); // max(taxes=200, target 2000 - offerValue 800)
    });

    test('uses offer value when available (balcony without taxes)', () => {
        const { cache } = loadModule();
        const entry = makeEntry({ INT: 500, B: 750 }, 100); // INT dual 1000, BAL dual 1500, taxes dual 200
        cache.set('SD_OA_2026-10-01', entry);
        global.App.Utils = {
            computeOfferValue: () => 800
        };
        const offer = { category: null, campaignOffer: { offerCode: 'B1' } };
        const sailing = { shipCode: 'OA', sailDate: '2026-10-01', roomType: null };
        const res = PricingUtils.computeBalconyUpgradePrice(offer, sailing, { includeTaxes: false });
        expect(res).toBeCloseTo(500); // target 1500 - offerValue 800 - taxes 200
    });

    test('returns null when pricing missing or non-positive', () => {
        const { cache } = loadModule();
        const entry = makeEntry({}, 100);
        cache.set('SD_OA_2026-08-01', entry);
        const offer = { category: 'INT', campaignOffer: { offerCode: 'MISS' } };
        const sailing = { shipCode: 'OA', sailDate: '2026-08-01', roomType: 'INT' };
        expect(PricingUtils.computeSuiteUpgradePrice(offer, sailing)).toBeNull();
        expect(PricingUtils.computeBalconyUpgradePrice(offer, sailing)).toBeNull();
    });

    test('resolveCategory resolves numeric-prefix stateroom codes via classifyBroad fallback', () => {
        loadModule();
        // With RoomCategoryUtils loaded, resolveCategory should still resolve
        // numeric-prefix codes like '4V' (Interior), '6N' (Outside), '8B' (Balcony)
        // by falling through to classifyBroad when baseCategoryMap has no match.
        global.window.RoomCategoryUtils = require(path.resolve(__dirname, '../utils/roomCategory.js'));
        // Re-load pricingUtils so it picks up the global
        jest.resetModules();
        delete global.App.PricingUtils;
        require(path.resolve(__dirname, '../utils/pricingUtils.js'));

        const entry = {
            stateroomPricing: {
                '4V': { code: '4V', price: 500 },
                '6N': { code: '6N', price: 300 },
                '8B': { code: '8B', price: 800 },
                'D':  { code: 'D',  price: 1200 }
            },
            taxesAndFees: 100
        };
        const cache = new Map();
        cache.set('SD_OA_2026-11-01', entry);
        global.ItineraryCache = { get: (key) => cache.get(key), all: () => Object.fromEntries(cache.entries()) };

        const offer = { category: 'INT', campaignOffer: { offerCode: 'T1' } };
        const sailing = { shipCode: 'OA', sailDate: '2026-11-01', roomType: 'Interior' };

        // Interior should NOT be null — '4V' must resolve to INTERIOR
        const interior = global.App.PricingUtils.computeInteriorYouPayPrice(offer, sailing, { includeTaxes: true });
        expect(interior).not.toBeNull();
        // Balcony should NOT be null — '8B' must resolve to BALCONY
        const balcony = global.App.PricingUtils.computeBalconyUpgradePrice(offer, sailing, { includeTaxes: true });
        expect(balcony).not.toBeNull();
        // Ocean view should NOT be null — '6N' must resolve to OUTSIDE
        const ov = global.App.PricingUtils.computeOceanViewUpgradePrice(offer, sailing, { includeTaxes: true });
        expect(ov).not.toBeNull();
    });

    test('same sailing different offer codes produce consistent sold-out categories', () => {
        loadModule();
        global.window.RoomCategoryUtils = require(path.resolve(__dirname, '../utils/roomCategory.js'));
        jest.resetModules();
        delete global.App.PricingUtils;
        require(path.resolve(__dirname, '../utils/pricingUtils.js'));
        const PU = global.App.PricingUtils;

        // Sailing with Interior and Suite priced, OV and Balcony absent (sold out)
        const entry = {
            stateroomPricing: {
                'I':  { code: 'I',  price: 500 },
                'D':  { code: 'D',  price: 1200 }
            },
            taxesAndFees: 100
        };
        const c = new Map();
        c.set('SD_OA_2026-12-01', entry);
        global.ItineraryCache = { get: (key) => c.get(key), all: () => Object.fromEntries(c.entries()) };

        const offerA = { category: 'INT', campaignOffer: { offerCode: 'A1' } };
        const sailingA = { shipCode: 'OA', sailDate: '2026-12-01', roomType: 'Interior', shipName: 'Test' };
        const offerB = { category: 'DLX', campaignOffer: { offerCode: 'B1' } };
        const sailingB = { shipCode: 'OA', sailDate: '2026-12-01', roomType: 'Suite', shipName: 'Test' };

        // OV should be null for BOTH offers (no OV pricing exists)
        const ovA = PU.computeOceanViewUpgradePrice(offerA, sailingA, { includeTaxes: true });
        const ovB = PU.computeOceanViewUpgradePrice(offerB, sailingB, { includeTaxes: true });
        expect(ovA).toBeNull();
        expect(ovB).toBeNull();

        // Balcony should be null for BOTH (no Balcony pricing exists)
        const balA = PU.computeBalconyUpgradePrice(offerA, sailingA, { includeTaxes: true });
        const balB = PU.computeBalconyUpgradePrice(offerB, sailingB, { includeTaxes: true });
        expect(balA).toBeNull();
        expect(balB).toBeNull();

        // Suite should NOT be null for either offer
        const suiteA = PU.computeSuiteUpgradePrice(offerA, sailingA, { includeTaxes: true });
        const suiteB = PU.computeSuiteUpgradePrice(offerB, sailingB, { includeTaxes: true });
        expect(suiteA).not.toBeNull();
        expect(suiteB).not.toBeNull();
    });
});
