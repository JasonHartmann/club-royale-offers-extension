/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

describe('preserveSelectedProfileKey', () => {
    let preserveSelectedProfileKey;

    beforeAll(() => {
        const src = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'profileIdManager.js'), 'utf8');
        const match = src.match(/function preserveSelectedProfileKey\(state, prevState\) \{[\s\S]*?\n\}/);
        if (!match) throw new Error('preserveSelectedProfileKey not found');
        preserveSelectedProfileKey = new Function(match[0] + '\nreturn preserveSelectedProfileKey;')();
    });

    test('returns the same state object so render signatures stay put', () => {
        const state = { selectedProfileKey: 'gobo-R-a', _lastRenderSig: 'offerDate|desc', sortedOffers: [1] };
        const out = preserveSelectedProfileKey(state, null);
        expect(out).toBe(state);
        expect(out._lastRenderSig).toBe('offerDate|desc');
    });

    test('fills a missing profile key from the previous state without cloning', () => {
        const state = { _filterCache: { sig: 'x' } };
        const prev = { selectedProfileKey: 'gobo-R-b' };
        const out = preserveSelectedProfileKey(state, prev);
        expect(out).toBe(state);
        expect(state.selectedProfileKey).toBe('gobo-R-b');
        expect(state._filterCache.sig).toBe('x');
    });
});
