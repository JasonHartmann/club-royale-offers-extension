/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

function load() {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'backToBackTool.js'), 'utf8');
    new Function(src)();
    return window.BackToBackTool;
}

function opt(id, extra) {
    const base = {
        rowId: id,
        isSoldOut: false,
        isSideBySide: false,
        isRegionMatch: false,
        lag: 0,
        depth: 1,
        travelMinutes: Infinity,
        offerValue: 0,
        meta: { roomLabel: 'Interior', startISO: '2026-01-01', shipKey: 'S1' }
    };
    const out = Object.assign(base, extra || {});
    if (extra && extra.meta) out.meta = Object.assign({}, base.meta, extra.meta);
    return out;
}

// "Same room" is the green criteria: same ship (shipKey) AND exact room label.
const LAST = { roomLabel: 'Balcony', shipKey: 'SHIP_A' };

describe('Next Connections sort', () => {
    test('Distance: same-room (green) then same-ship then side-by-side then region then different port, gaps last within each', () => {
        const tool = load();
        const options = [
            opt('diff-port', { meta: { roomLabel: 'Interior', shipKey: 'SHIP_C' } }),
            opt('same-room', { meta: { roomLabel: 'Balcony', shipKey: 'SHIP_A' } }),
            opt('region-gap', { isRegionMatch: true, lag: 2, meta: { roomLabel: 'Interior', shipKey: 'SHIP_B' } }),
            opt('same-ship-diff-room', { meta: { roomLabel: 'Interior', shipKey: 'SHIP_A' } }),
            opt('sbs-gap', { isSideBySide: true, lag: 1, meta: { roomLabel: 'Interior', shipKey: 'SHIP_B' } }),
            opt('sbs', { isSideBySide: true, meta: { roomLabel: 'Interior', shipKey: 'SHIP_B' } }),
            opt('region', { isRegionMatch: true, meta: { roomLabel: 'Interior', shipKey: 'SHIP_B' } })
        ];
        tool._sortNextOptions(options, 'distance', LAST);
        expect(options.map(o => o.rowId)).toEqual([
            'same-room',
            'same-ship-diff-room',
            'sbs',
            'sbs-gap',
            'region',
            'region-gap',
            'diff-port'
        ]);
    });

    test('Same Room by Price: green offers first by their chip, rest by distance', () => {
        const tool = load();
        const options = [
            opt('balcony-dear', { meta: { roomLabel: 'Balcony', shipKey: 'SHIP_A', __row: 'balcony-dear' } }),
            opt('interior-cheap', { meta: { roomLabel: 'Interior', shipKey: 'SHIP_B', __row: 'interior-cheap' } }),
            opt('balcony-cheap', { meta: { roomLabel: 'Balcony', shipKey: 'SHIP_A', __row: 'balcony-cheap' } }),
            opt('balcony-mid', { meta: { roomLabel: 'Balcony', shipKey: 'SHIP_A', __row: 'balcony-mid' } })
        ];
        tool._chipPrice = (meta) => ({ balcony_dear: 900, balcony_cheap: 400, balcony_mid: 600, interior_cheap: 100 })[meta.__row.replace('-', '_')] ?? null;
        tool._sortNextOptions(options, 'same-room-price', LAST);
        expect(options.map(o => o.rowId)).toEqual([
            'balcony-cheap',
            'balcony-mid',
            'balcony-dear',
            'interior-cheap'
        ]);
    });

    test('Cheapest is the cheapest balcony chip; Cheapest Longest Chain keeps depth first', () => {
        const tool = load();
        const mk = () => [
            opt('short-cheap', { depth: 1, meta: { roomLabel: 'Interior', __chip: 100 } }),
            opt('long-dear', { depth: 4, meta: { roomLabel: 'Suite', __chip: 800 } }),
            opt('long-cheap', { depth: 4, meta: { roomLabel: 'Balcony', __chip: 300 } })
        ];
        tool._chipPrice = (meta) => meta.__chip;
        const cheapest = mk();
        tool._sortNextOptions(cheapest, 'cheapest', LAST);
        expect(cheapest.map(o => o.rowId)).toEqual(['short-cheap', 'long-cheap', 'long-dear']);
        const longest = mk();
        tool._sortNextOptions(longest, 'cheapest-longest', LAST);
        expect(longest.map(o => o.rowId)).toEqual(['long-cheap', 'long-dear', 'short-cheap']);
    });

    test('sold-out cards stay last', () => {
        const tool = load();
        tool._chipPrice = (meta) => meta.__chip;
        const options = [
            opt('dead', { isSoldOut: true, meta: { roomLabel: 'Balcony', __chip: 0 } }),
            opt('live', { meta: { roomLabel: 'Interior', __chip: 700 } })
        ];
        tool._sortNextOptions(options, 'cheapest', LAST);
        expect(options.map(o => o.rowId)).toEqual(['live', 'dead']);
    });

    test('chip price maps the category to the right column and normalizes float dust', () => {
        const tool = load();
        tool._getPricingData = () => ({
            valuesRaw: {
                interior: 0.0000000000001,
                oceanViewUpgrade: null,
                balconyUpgrade: 1045,
                suiteUpgrade: 2943
            }
        });
        expect(tool._chipPrice({}, 'INTERIOR')).toBe(0);
        expect(tool._chipPrice({}, 'OUTSIDE')).toBeNull();
        expect(tool._chipPrice({}, 'BALCONY')).toBe(1045);
        expect(tool._chipPrice({}, 'DELUXE')).toBe(2943);
    });

    test('_isSameRoom is the green criteria: same ship AND exact room label', () => {
        const tool = load();
        expect(tool._isSameRoom({ meta: { roomLabel: 'Balcony', shipKey: 'SHIP_A' } }, LAST)).toBe(true);
        expect(tool._isSameRoom({ meta: { roomLabel: 'Interior', shipKey: 'SHIP_A' } }, LAST)).toBe(false); // same ship, different room
        expect(tool._isSameRoom({ meta: { roomLabel: 'Balcony', shipKey: 'SHIP_B' } }, LAST)).toBe(false); // different ship, same room
        expect(tool._isSameRoom({ meta: { roomLabel: 'Balcony', shipKey: 'SHIP_B' } }, null)).toBe(false);
    });
});
