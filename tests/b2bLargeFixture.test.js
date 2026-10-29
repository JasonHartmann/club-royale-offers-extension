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

    test('a spent deadline still returns beam depths instead of an empty map', () => {
        const rows = largeFixture();
        const depths = B2BUtils.computeB2BDepth(rows, { allowSideBySide: true, lagDays: 3, force: true, deadlineMs: -1 });
        expect(depths.incomplete).toBeFalsy();
        expect(depths.get(0)).toBeGreaterThanOrEqual(5);
        expect(depths.size).toBeGreaterThan(1000);
    });

    test('cancel does not look like a finished map of ones', () => {
        const depths = B2BUtils.computeB2BDepth(largeFixture().slice(0, 40), { force: true, shouldAbort: () => true });
        expect(depths.incomplete).toBe(true);
        expect(depths.size).toBe(0);
    });

    test('longest-path diagnostic cannot hang a dense set', () => {
        const rows = [];
        for (let i = 0; i < 300; i++) {
            rows.push(row('C' + (i % 10), 'S' + (i % 8), 'Miami', iso(Math.floor(i / 8) * 7), 7, 'p' + (i % 12)));
        }
        const t0 = Date.now();
        const path = B2BUtils.computeLongestB2BPath(rows, { allowSideBySide: true });
        // The search is visit-capped (VISIT_CAP); the original hang was 20s+. 2s keeps the
        // guard meaningful without flaking on a loaded machine (observed 350-800ms).
        expect(Date.now() - t0).toBeLessThan(2000);
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

    test('a chain longer than 15 is stored as 16 and the pill says 15+', () => {
        const rows = [];
        for (let i = 0; i < 21; i++) rows.push(row('C' + i, 'SHIP', 'Miami', iso(i * 7), 7, 'p' + i));
        const depths = B2BUtils.computeB2BDepth(rows, { force: true, allowSideBySide: false });
        expect(depths.get(0)).toBe(16);
        expect(B2BUtils.formatB2BPill(16)).toBe('15+');
        expect(B2BUtils.formatB2BPill(2)).toBe('1');
        expect(B2BUtils.formatB2BPill(1)).toBe('0');
    });

    test('a high depthCap keeps the true chain length (builder)', () => {
        const rows = [];
        for (let i = 0; i < 21; i++) rows.push(row('C' + i, 'SHIP', 'Miami', iso(i * 7), 7, 'p' + i));
        // Default cap (table): the 21-chain is stored as 16.
        const capped = B2BUtils.computeB2BDepth(rows, { force: true, allowSideBySide: false, deadlineMs: -1 });
        expect(capped.get(0)).toBe(16);
        // Builder cap: the true length is kept.
        const uncapped = B2BUtils.computeB2BDepth(rows, { force: true, allowSideBySide: false, deadlineMs: -1, depthCap: 999 });
        expect(uncapped.get(0)).toBe(21);
    });

    test('a dense set cannot block past the deadline', () => {
        const rows = [];
        for (let i = 0; i < 2000; i++) rows.push(row('C' + i, 'SHIP', 'Miami', iso(0), 3, 'p' + i));
        const t0 = Date.now();
        const depths = B2BUtils.computeB2BDepth(rows, { force: true, allowSideBySide: true, deadlineMs: 20 });
        expect(Date.now() - t0).toBeLessThan(150);
        expect(depths.incomplete).toBe(true);
        expect(depths._job).toBeTruthy();
    });

    test('sliced compute resumes to the same cap', () => {
        const rows = [];
        for (let i = 0; i < 21; i++) rows.push(row('C' + i, 'SHIP', 'Miami', iso(i * 7), 7, 'p' + i));
        let job = null;
        let map;
        let slices = 0;
        do {
            map = B2BUtils.computeB2BDepth(rows, { force: true, allowSideBySide: false, maxSteps: 30, _job: job });
            job = map && map._job;
            slices++;
        } while (map && map.incomplete && job && slices < 40);
        expect(map.incomplete).toBeFalsy();
        expect(map.get(0)).toBe(16);
        expect(slices).toBeGreaterThan(1);
    });

    test('sliced compute matches a full run on same-day cycles', () => {
        // 0-night sailings on the same date/port/ship form same-day edges in both
        // directions, which is what forces the extra beam passes. A sliced run must
        // land on exactly the same depths as one that runs to completion.
        const mk = (code, pid) => {
            const r = row(code, 'SHIP', 'Miami', iso(0), 7, pid);
            r.sailing.endDate = iso(0);
            return r;
        };
        const rows = [mk('A', 'pa'), mk('B', 'pb'), mk('C', 'pc'), mk('D', 'pd')];
        const full = B2BUtils.computeB2BDepth(rows, { force: true, allowSideBySide: false, deadlineMs: -1 });
        expect(full.incomplete).toBeFalsy();
        let job = null;
        let map;
        let slices = 0;
        do {
            // 10 steps per slice: the DFS needs more than a few steps to complete a frame,
            // so a smaller budget would yield without making progress.
            map = B2BUtils.computeB2BDepth(rows, { force: true, allowSideBySide: false, maxSteps: 10, _job: job });
            job = map && map._job;
            slices++;
        } while (map && map.incomplete && job && slices < 200);
        expect(map.incomplete).toBeFalsy();
        expect(slices).toBeGreaterThan(1);
        for (let i = 0; i < rows.length; i++) expect(map.get(i)).toBe(full.get(i));
    });
});
