(function init(factory) {
    if (typeof module !== 'undefined' && module.exports) {
        factory(require('../features/filtering'));
    }
})(function run(Filtering) {
    if (!Filtering || typeof Filtering._rowKey !== 'function') {
        throw new Error('Filtering._rowKey not available');
    }

    function row(code, ship, sail, playerOfferId) {
        const offer = { campaignOffer: { offerCode: code } };
        if (playerOfferId !== undefined) offer.playerOfferId = playerOfferId;
        return { offer, sailing: { shipCode: ship, shipName: ship, sailDate: sail } };
    }

    describe('Filtering._rowKey - hidden-row identity', () => {
        test('distinct offers sharing code+ship+sail get distinct keys (the collision fix)', () => {
            const a = Filtering._rowKey(row('A', 'SHIP1', '2025-01-01', 'u1'));
            const b = Filtering._rowKey(row('A', 'SHIP1', '2025-01-01', 'u2'));
            expect(a).not.toBe(b);
            expect(a).toBe('u1|A|SHIP1|2025-01-01');
            expect(b).toBe('u2|A|SHIP1|2025-01-01');
        });

        test('offer without playerOfferId keeps the legacy key shape', () => {
            expect(Filtering._rowKey(row('A', 'SHIP1', '2025-01-01'))).toBe('A|SHIP1|2025-01-01');
        });

        test('nested playerOfferId (campaignOffer) is honored', () => {
            const offer = { campaignOffer: { offerCode: 'A', playerOfferId: 'u9' } };
            const key = Filtering._rowKey({ offer, sailing: { shipCode: 'SHIP1', shipName: 'SHIP1', sailDate: '2025-01-01' } });
            expect(key).toBe('u9|A|SHIP1|2025-01-01');
        });

        test('empty wrapper returns null', () => {
            expect(Filtering._rowKey({})).toBeNull();
            expect(Filtering._rowKey(null)).toBeNull();
        });
    });
});
