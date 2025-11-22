const { computeSimplifiedRoute } = require('../utils/b2bRoute');

describe('computeSimplifiedRoute', () => {
    test('omits departure region when redundant (origin region ignored)', () => {
        const meta = {
            embarkPort: 'Fort Lauderdale',
            disembarkPort: 'Fort Lauderdale',
            timeline: [
                { label: 'Fort Lauderdale, Florida' },
                { label: 'Nassau, Bahamas' },
                { label: 'Fort Lauderdale, Florida' }
            ]
        };
        expect(computeSimplifiedRoute(meta)).toBe('Fort Lauderdale → Bahamas → Fort Lauderdale');
    });

    test('collapses consecutive identical regions', () => {
        const meta = {
            embarkPort: 'Miami',
            disembarkPort: 'Miami',
            timeline: [
                { label: 'Miami, Florida' },
                { label: 'Key West, Florida' },
                { label: 'Nassau, Bahamas' },
                { label: 'Miami, Florida' }
            ]
        };
        expect(computeSimplifiedRoute(meta)).toBe('Miami → Florida → Bahamas → Miami');
    });

    test('shows Overnight when same port repeated twice in a row', () => {
        const meta = {
            embarkPort: 'Port A',
            disembarkPort: 'Port A',
            timeline: [
                { label: 'Port A, Region1' },
                { label: 'Port A, Region1' },
                { label: 'Port B, Region2' },
                { label: 'Port A, Region1' }
            ]
        };
        expect(computeSimplifiedRoute(meta)).toBe('Port A → Region1 (Overnight) → Region2 → Port A');
    });

    test('falls back to origin->dest when no intermediate regions', () => {
        const meta = { embarkPort: 'X', disembarkPort: 'Y', timeline: [{ label: 'X, R1' }, { label: 'Y, R2' }] };
        expect(computeSimplifiedRoute(meta)).toBe('X → R2 → Y');
    });
});
