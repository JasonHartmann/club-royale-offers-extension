const _FilteringReq = require('../features/filtering.js');
console.log('REQ filtering export type:', typeof _FilteringReq, 'keys:', Object.keys(_FilteringReq || {}));
console.log('globalThis.Filtering type:', typeof globalThis !== 'undefined' ? typeof globalThis.Filtering : 'no-globalThis');
const Filtering = (_FilteringReq && typeof _FilteringReq.applyAdvancedSearch === 'function') ? _FilteringReq : (typeof globalThis !== 'undefined' && globalThis.Filtering ? globalThis.Filtering : _FilteringReq);

// Minimal stubs for App.Utils.formatDate used by Filtering.getOfferColumnValue
global.App = global.App || {};
App.Utils = App.Utils || {};
App.Utils.formatDate = function(raw) {
    if (!raw) return '-';
    try { return String(raw).slice(0,10); } catch(e) { return '-'; }
};

describe('End Date advanced filter', () => {
    it('filters offers by endDate date range', () => {
        const state = { advancedSearch: { enabled: true, predicates: [] }, headers: [] };
        // three sample wrappers with sailing endDate values
        const offers = [
            { offer: { campaignOffer: { offerCode: 'A' } }, sailing: { sailDate: '2025-11-01', endDate: '2025-11-05' } },
            { offer: { campaignOffer: { offerCode: 'B' } }, sailing: { sailDate: '2025-11-10', endDate: '2025-11-15' } },
            { offer: { campaignOffer: { offerCode: 'C' } }, sailing: { sailDate: '2025-12-01', endDate: '2025-12-07' } }
        ];

        // predicate: endDate between 2025-11-04 and 2025-11-30 (inclusive)
        const pred = {
            fieldKey: 'endDate',
            operator: 'date range',
            values: ['2025-11-04', '2025-11-30'],
            complete: true
        };
        state.advancedSearch.predicates = [pred];

        const result = Filtering.applyAdvancedSearch(offers, state);
        // Offers A endDate 2025-11-05 (matches), B endDate 2025-11-15 (matches), C 2025-12-07 (out of range)
        const codes = result.map(r => r.offer.campaignOffer.offerCode);
        expect(codes).toEqual(['A','B']);
    });
});
