const fs = require('fs');
const path = require('path');

// Provide minimal window/document shims for node test environment before requiring modules
if (typeof global.window === 'undefined') global.window = global;
if (typeof global.document === 'undefined') global.document = { addEventListener: () => {}, querySelector: () => null };

require('../utils/utils_filter.js');
require('../features/filtering.js');

describe('departureMonth compute and filtering', () => {
    test('computeDepartureMonth returns correct month names for ISO date strings', () => {
        expect(App.FilterUtils.computeDepartureMonth('2025-01-15')).toBe('January');
        expect(App.FilterUtils.computeDepartureMonth('2025-02-01')).toBe('February');
        expect(App.FilterUtils.computeDepartureMonth('2025-12-31')).toBe('December');
    });

    test('computeDepartureMonth handles Date objects and timezone variants', () => {
        const d = new Date(Date.UTC(2025, 4, 10)); // May 10, 2025 UTC
        expect(App.FilterUtils.computeDepartureMonth(d)).toBe('May');
        // date-time string with timezone
        expect(App.FilterUtils.computeDepartureMonth('2025-06-01T08:00:00Z')).toBe('June');
    });

    test('Filtering.getOfferColumnValue returns same month for sailing.sailDate', () => {
        const offer = { campaignOffer: {} };
        const sailing = { sailDate: '2025-07-04' };
        const val = Filtering.getOfferColumnValue(offer, sailing, 'departureMonth');
        expect(val).toBe('July');
    });
});
