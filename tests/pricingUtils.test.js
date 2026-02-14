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
});
