(function init(factory) {
    if (typeof module !== 'undefined' && module.exports) {
        require('../utils/b2bUtils'); // rowKey resolves playerOfferId via B2BUtils; ensure the global is present
        factory(require('../features/filtering'));
    }
})(function run(Filtering) {
    if (!Filtering || typeof Filtering.rowKey !== 'function') {
        throw new Error('Filtering.rowKey not available');
    }

    function row(code, ship, sail, playerOfferId) {
        const offer = { campaignOffer: { offerCode: code } };
        if (playerOfferId !== undefined) offer.playerOfferId = playerOfferId;
        return { offer, sailing: { shipCode: ship, shipName: ship, sailDate: sail } };
    }

    describe('Filtering.rowKey - hidden-row identity', () => {
        test('distinct offers sharing code+ship+sail get distinct keys (the collision fix)', () => {
            const a = Filtering.rowKey(row('A', 'SHIP1', '2025-01-01', 'u1'));
            const b = Filtering.rowKey(row('A', 'SHIP1', '2025-01-01', 'u2'));
            expect(a).not.toBe(b);
            expect(a).toBe('u1|A|SHIP1|2025-01-01');
            expect(b).toBe('u2|A|SHIP1|2025-01-01');
        });

        test('offer without playerOfferId keeps the legacy key shape', () => {
            expect(Filtering.rowKey(row('A', 'SHIP1', '2025-01-01'))).toBe('A|SHIP1|2025-01-01');
        });

        test('nested playerOfferId (campaignOffer) is honored', () => {
            const offer = { campaignOffer: { offerCode: 'A', playerOfferId: 'u9' } };
            const key = Filtering.rowKey({ offer, sailing: { shipCode: 'SHIP1', shipName: 'SHIP1', sailDate: '2025-01-01' } });
            expect(key).toBe('u9|A|SHIP1|2025-01-01');
        });

        test('empty wrapper returns null', () => {
            expect(Filtering.rowKey({})).toBeNull();
            expect(Filtering.rowKey(null)).toBeNull();
        });
    });
});
