(function(){
    // Simple test harness for B2BUtils.computeB2BDepth
    function assertEqual(actual, expected, label) {
        const ok = actual === expected;
        console[ok ? 'log' : 'error'](`[B2B TEST] ${label}: ${ok ? 'PASS' : 'FAIL'} (expected=${expected}, actual=${actual})`);
    }

    function runTests() {
        if (typeof B2BUtils === 'undefined' || typeof B2BUtils.computeB2BDepth !== 'function') {
            console.error('[B2B TEST] B2BUtils.computeB2BDepth not available');
            return;
        }
        // Helper to build row
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

        // Test 1: Simple chain of 3 consecutive sailings same ship & port
        const rows1 = [
            row('A', 'SHIP1', 'Miami', '2025-01-01', 3), // ends 2025-01-04
            row('B', 'SHIP1', 'Miami', '2025-01-04', 3), // ends 2025-01-07
            row('C', 'SHIP1', 'Miami', '2025-01-07', 3)  // ends 2025-01-10
        ];
        const depths1 = B2BUtils.computeB2BDepth(rows1, { allowSideBySide: false });
        assertEqual(depths1.get(0), 3, 'Chain length from A (no side-by-side)');
        assertEqual(depths1.get(1), 2, 'Chain length from B (no side-by-side)');
        assertEqual(depths1.get(2), 1, 'Chain length from C (no side-by-side)');

        // Test 2: Side-by-side allowed, different ships same port/date
        const rows2 = [
            row('A', 'SHIP1', 'Miami', '2025-01-01', 3), // ends 2025-01-04
            row('B', 'SHIP2', 'Miami', '2025-01-04', 3), // side-by-side candidate
            row('C', 'SHIP1', 'Miami', '2025-01-04', 3)  // same-date, same-port same-ship
        ];
        const depths2_noSide = B2BUtils.computeB2BDepth(rows2, { allowSideBySide: false });
        const depths2_side = B2BUtils.computeB2BDepth(rows2, { allowSideBySide: true });
        assertEqual(depths2_noSide.get(0), 2, 'No side-by-side: A->C only');
        assertEqual(depths2_side.get(0), 2, 'Side-by-side: A can still reach depth 2 (one of B/C)');

        // Test 3: Filter predicate excludes one offer from chains
        const rows3 = [
            row('A', 'SHIP1', 'Miami', '2025-01-01', 3),
            row('B', 'SHIP1', 'Miami', '2025-01-04', 3),
            row('C', 'SHIP1', 'Miami', '2025-01-07', 3)
        ];
        const depths3 = B2BUtils.computeB2BDepth(rows3, {
            allowSideBySide: false,
            filterPredicate: (row) => row.offer.campaignOffer.offerCode !== 'B'
        });
        assertEqual(depths3.get(0), 1, 'Filter excludes B so A cannot chain');
        assertEqual(depths3.get(2), 1, 'C still depth 1');

        console.log('[B2B TEST] Tests complete');
    }

    window.runB2BTests = runTests;
})();
