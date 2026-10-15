const B2BUtils = require('../utils/b2bUtils');

function iso(day) {
    return new Date(Date.UTC(2026, 0, 1) + day * 86400000).toISOString().slice(0, 10);
}

function row(code, ship, port, date, nights, pid) {
    const offer = { campaignOffer: { offerCode: code } };
    if (pid) offer.playerOfferId = pid;
    return {
        offer,
        sailing: {
            shipCode: ship,
            shipName: ship,
            sailDate: date,
            departurePort: { name: port },
            arrivalPort: { name: port },
            itineraryDescription: nights + ' Night Caribbean'
        }
    };
}

function largeFixture() {
    const rows = [];
    for (let i = 0; i < 5; i++) {
        rows.push(row('CHAIN', 'PLANT', 'Plantation Key', iso(i * 7), 7, 'chain-' + i));
    }
    const ports = ['Miami', 'FLL', 'Canaveral'];
    for (let i = 0; i < 2000; i++) {
        rows.push(row('C' + (i % 20), 'S' + (i % 15), ports[i % 3], iso(Math.floor(i / 15) * 7), 7, 'p' + (i % 45)));
    }
    return rows;
}

describe('B2B large offer set', () => {
    test('finishes a 2000-sailing / 45-key set without hanging and keeps a planted chain', () => {
        const rows = largeFixture();
        const t0 = Date.now();
        const depths = B2BUtils.computeB2BDepth(rows, { allowSideBySide: true, lagDays: 3, force: true });
        const dt = Date.now() - t0;
        expect(dt).toBeLessThan(500);
        expect(depths.get(0)).toBeGreaterThanOrEqual(5);
        expect(depths.size).toBeGreaterThan(1000);
    });

    test('longest-path diagnostic cannot hang a dense set', () => {
        const rows = [];
        for (let i = 0; i < 300; i++) {
            rows.push(row('C' + (i % 10), 'S' + (i % 8), 'Miami', iso(Math.floor(i / 8) * 7), 7, 'p' + (i % 12)));
        }
        const t0 = Date.now();
        const path = B2BUtils.computeLongestB2BPath(rows, { allowSideBySide: true });
        expect(Date.now() - t0).toBeLessThan(800);
        expect(Array.isArray(path)).toBe(true);
    });

    test('auto-run off still skips the compute unless forced', () => {
        const prev = global.App;
        global.App = { SettingsStore: { getAutoRunB2B: () => false } };
        try {
            const depths = B2BUtils.computeB2BDepth(largeFixture().slice(0, 8), { allowSideBySide: true });
            expect(depths.size).toBe(0);
        } finally {
            if (prev === undefined) delete global.App;
            else global.App = prev;
        }
    });
});
