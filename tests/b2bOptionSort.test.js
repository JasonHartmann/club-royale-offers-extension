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

describe('Next Connections sort', () => {
    const last = { roomLabel: 'Balcony' };

    test('Distance ranks same room, same ship, side-by-side, then different port, gaps last within those', () => {
        const tool = load();
        const options = [
            opt('port-gap', { isSideBySide: true, isRegionMatch: true, lag: 2, meta: { roomLabel: 'Interior' } }),
            opt('same-room-other-ship', { isSideBySide: true, meta: { roomLabel: 'Balcony', startISO: '2026-03-01' } }),
            opt('sbs-gap', { isSideBySide: true, lag: 1, meta: { roomLabel: 'Interior' } }),
            opt('same-ship-gap', { lag: 2, meta: { roomLabel: 'Interior', startISO: '2026-01-08' } }),
            opt('sbs', { isSideBySide: true, meta: { roomLabel: 'Interior' } }),
            opt('port', { isSideBySide: true, isRegionMatch: true, meta: { roomLabel: 'Interior' } }),
            opt('same-ship', { meta: { roomLabel: 'Interior', startISO: '2026-01-05' } })
        ];
        tool._sortNextOptions(options, 'distance', last);
        expect(options.map(o => o.rowId)).toEqual([
            'same-room-other-ship',
            'same-ship',
            'same-ship-gap',
            'sbs',
            'sbs-gap',
            'port',
            'port-gap'
        ]);
    });

    test('Same Room by Price uses the chip for the room the chain ends on', () => {
        const tool = load();
        const options = [
            opt('balcony-dear', { meta: { roomLabel: 'Balcony' } }),
            opt('interior-cheap', { meta: { roomLabel: 'Interior' } }),
            opt('balcony-cheap', { isSideBySide: true, meta: { roomLabel: 'Balcony', startISO: '2026-02-01' } }),
            opt('balcony-mid', { meta: { roomLabel: 'Balcony', startISO: '2026-01-04' } })
        ];
        // Give the balcony options distinct chips via a per-rowId stub
        tool._chipPrice = (meta) => {
            const byRow = { 'balcony-dear': 900, 'balcony-cheap': 400, 'balcony-mid': 600, 'interior-cheap': 100 };
            return byRow[meta.__row] != null ? byRow[meta.__row] : null;
        };
        options.forEach(o => { o.meta.__row = o.rowId; });
        tool._sortNextOptions(options, 'same-room-price', last);
        expect(options.map(o => o.rowId)).toEqual([
            'balcony-cheap',
            'balcony-mid',
            'balcony-dear',
            'interior-cheap'
        ]);
    });

    test('Cheapest is the cheapest balcony chip, Cheapest Longest Chain keeps depth first', () => {
        const tool = load();
        const mk = () => [
            opt('short-cheap', { depth: 1, meta: { roomLabel: 'Interior', __chip: 100 } }),
            opt('long-dear', { depth: 4, meta: { roomLabel: 'Suite', __chip: 800 } }),
            opt('long-cheap', { depth: 4, meta: { roomLabel: 'Balcony', __chip: 300 } })
        ];
        tool._chipPrice = (meta) => meta.__chip;
        const cheapest = mk();
        tool._sortNextOptions(cheapest, 'cheapest', last);
        expect(cheapest.map(o => o.rowId)).toEqual(['short-cheap', 'long-cheap', 'long-dear']);
        const longest = mk();
        tool._sortNextOptions(longest, 'cheapest-longest', last);
        expect(longest.map(o => o.rowId)).toEqual(['long-cheap', 'long-dear', 'short-cheap']);
    });

    test('sold-out cards stay last', () => {
        const tool = load();
        const options = [
            opt('dead', { isSoldOut: true, meta: { roomLabel: 'Balcony', __chip: 0 } }),
            opt('live', { meta: { roomLabel: 'Interior', __chip: 700 } })
        ];
        tool._chipPrice = (meta) => meta.__chip;
        tool._sortNextOptions(options, 'cheapest', last);
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
});
