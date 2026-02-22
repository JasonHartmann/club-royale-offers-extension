const B2BUtils = require('../utils/b2bUtils');

function makeRow(offerCode, ship, sailDate, nights = 6, startPort = 'Los Angeles', endPort = 'Los Angeles') {
    const start = sailDate;
    // compute endDate by adding nights (simple UTC arithmetic)
    const d = new Date(start + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + nights);
    const end = d.toISOString().slice(0, 10);
    return {
        offer: { campaignOffer: { offerCode } },
        sailing: {
            shipCode: ship,
            shipName: ship,
            sailDate: start,
            startDate: start,
            endDate: end,
            departurePort: { name: startPort },
            arrivalPort: { name: endPort }
        }
    };
}

describe('B2B filter alignment', () => {
    test('table hidden-only predicate matches builder (null predicate) and differs from advanced predicate', () => {
        // Create a small chain where each next sailing starts on the prior end date
        // ROOT -> A -> B -> C -> D (each 1-night sail so dates line up)
        const rows = [
            makeRow('ROOT', 'QN', '2026-02-27', 1),
            makeRow('A', 'QN', '2026-02-28', 1),
            makeRow('B', 'QN', '2026-03-01', 1),
            makeRow('C', 'QN', '2026-03-02', 1),
            makeRow('D', 'QN', '2026-03-03', 1)
        ];

        // table predicate (hidden-only): in test environment no hidden rows exist so return true for all
        const tablePredicate = (row) => true;
        // advanced predicate simulating Advanced Search excluding the immediate child 'A'
        const advancedPredicate = (row) => !(row && row.offer && row.offer.campaignOffer && row.offer.campaignOffer.offerCode === 'A');

        const depthsTable = B2BUtils.computeB2BDepth(rows, { allowSideBySide: true, filterPredicate: tablePredicate, force: true });
        const depthsBuilder = B2BUtils.computeB2BDepth(rows, { allowSideBySide: true, filterPredicate: null, force: true });
        const depthsAdvanced = B2BUtils.computeB2BDepth(rows, { allowSideBySide: true, filterPredicate: advancedPredicate, force: true });

        // Builder and table (hidden-only) SHOULD match
        for (let i = 0; i < rows.length; i++) {
            const t = depthsTable.get(i) || 1;
            const b = depthsBuilder.get(i) || 1;
            expect(t).toBe(b);
        }

        // Advanced predicate should produce a different result for the ROOT depth
        const rootTable = depthsTable.get(0) || 1;
        const rootAdv = depthsAdvanced.get(0) || 1;
        expect(rootTable).not.toBe(rootAdv);
    });
});
