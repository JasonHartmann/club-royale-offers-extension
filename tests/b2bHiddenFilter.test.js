(function init(factory) {
    if (typeof module !== 'undefined' && module.exports) {
        factory(require('../utils/b2bUtils'));
    }
})(function run(B2BUtils) {
    if (!B2BUtils || typeof B2BUtils.computeB2BDepth !== 'function') {
        throw new Error('B2BUtils.computeB2BDepth not available');
    }

    function row(code, ship, departPort, departDate, nights) {
        return {
            offer: { campaignOffer: { offerCode: code } },
            sailing: {
                shipName: ship,
                shipCode: ship,
                departurePort: { name: departPort },
                sailDate: departDate,
                itineraryDescription: nights + ' Nights ' + departPort
            }
        };
    }

    describe('B2BUtils.computeB2BDepth - hidden row exclusion', () => {
        test('hidden middle row is excluded from depth calculation', () => {
            const rows = [
                row('A', 'SHIP1', 'Miami', '2025-01-01', 3),
                row('25TIER3', 'SHIP1', 'Miami', '2025-01-04', 3),
                row('C', 'SHIP1', 'Miami', '2025-01-07', 3)
            ];

            // Simulate a filterPredicate that hides any row with offerCode '25TIER3'
            const options = { allowSideBySide: false, filterPredicate: (r) => (r.offer && r.offer.campaignOffer && r.offer.campaignOffer.offerCode !== '25TIER3') };
            const depths = B2BUtils.computeB2BDepth(rows, options);

            // Expect that row 0 and row 2 are isolated (depth 1) because middle row was excluded
            expect(depths.get(0)).toBe(1);
            expect(depths.get(1)).toBeUndefined();
            expect(depths.get(2)).toBe(1);
        });
    });
});
