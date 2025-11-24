(function initB2BMoreTests(factory) {
    if (typeof module !== 'undefined' && module.exports) {
        factory(require('../utils/b2bUtils'), { env: 'node' });
    } else if (typeof window !== 'undefined') {
        factory(window.B2BUtils, { env: 'browser', window });
    }
})(function runMoreTests(B2BUtils, context) {
    if (!B2BUtils || typeof B2BUtils.computeB2BDepth !== 'function') {
        if (context && context.env === 'node') {
            throw new Error('B2BUtils.computeB2BDepth is not available for tests');
        }
        if (context && context.window) {
            context.window.console.error('[B2B TEST] B2BUtils.computeB2BDepth not available');
        }
        return;
    }

    function rowWithNights(code, ship, port, sailDate, nights) {
        return {
            offer: { campaignOffer: { offerCode: code } },
            sailing: {
                shipName: ship,
                shipCode: ship,
                departurePort: { name: port },
                sailDate: sailDate,
                itineraryDescription: (typeof nights === 'number') ? (nights + ' Nights') : ''
            }
        };
    }

    if (context && context.env === 'node') {
        describe('B2BUtils.computeB2BDepth additional cases', () => {
            test('does not chain to next-day sailings (only same-day allowed)', () => {
                // A ends 2025-01-04, B starts 2025-01-05 -> should NOT be linkable
                const rows = [
                    rowWithNights('A', 'S1', 'Miami', '2025-01-01', 3), // ends 2025-01-04
                    rowWithNights('B', 'S1', 'Miami', '2025-01-05', 3)  // starts next day
                ];
                const depths = B2BUtils.computeB2BDepth(rows, { allowSideBySide: true });
                expect(depths.get(0)).toBe(1);
                expect(depths.get(1)).toBe(1);
            });

            test('treats timezoneed start ISO as same-day when dates match', () => {
                // A ends 2025-01-04, B starts '2025-01-04T05:00:00-0500' which slices to 2025-01-04
                const rows = [
                    rowWithNights('A', 'S1', 'Miami', '2025-01-01', 3), // ends 2025-01-04
                    rowWithNights('B', 'S1', 'Miami', '2025-01-04T05:00:00-0500', 3) // same start day
                ];
                const depths = B2BUtils.computeB2BDepth(rows, { allowSideBySide: false });
                // A should link to B (same ship, same day), thus depth for A becomes 2
                expect(depths.get(0)).toBe(2);
                expect(depths.get(1)).toBe(1);
            });
        });
    }
});
