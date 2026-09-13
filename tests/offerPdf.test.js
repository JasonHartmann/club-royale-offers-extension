/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

// Verifies the pure flyer-grouping logic in features/offerPdf.js:
//   - groupByCategory orders sections Suite -> Balcony -> Ocean View -> Interior (better rooms first),
//     groups by ship within a section, and titles a section "… GUARANTEE STATEROOM" only when a sailing is isGTY;
//   - formatDateGroups collapses dates into "YYYY: M/D, M/D" lines (no leading zeros);
//   - kicker names a single ship class only when it holds a strict majority (>50%) of known-class sailings;
//   - taxesRange is null when no itinerary cache hit yields a finite taxesAndFees.
describe('offerPdf flyer grouping', () => {
    let OfferPdf;
    let UtilsStub;
    let ItineraryCacheStub;

    function makeSailing(over = {}) {
        return Object.assign({
            id: 's' + Math.random().toString(36).slice(2),
            shipName: 'Test Ship',
            shipCode: 'TST',
            departurePort: { name: 'Test Port' },
            totalNights: 7,
            sailDate: '2026-01-01',
            roomType: 'Interior',
            isGTY: false,
            itineraryDescription: 'desc',
        }, over);
    }
    function makePair(sailing, offerCode = 'TEST') {
        return { offer: { campaignOffer: { offerCode, name: 'Test Offer', offerType: { name: 'STATEROOM' } } }, sailing };
    }

    beforeEach(() => {
        UtilsStub = {
            getShipClass: (shipName) => {
                const u = (shipName || '').toUpperCase();
                if (u.includes('OASIS')) return 'OASIS';
                if (u.includes('RADIANCE')) return 'RADIANCE';
                if (u.includes('VOYAGER')) return 'VOYAGER';
                return '-';
            },
            parseItinerary: () => ({ destination: 'Test Destination' }),
        };
        ItineraryCacheStub = { getByShipDate: () => null };
        const AppStub = { Utils: { getCookie: () => '' }, SettingsStore: { getDarkMode: () => false } };
        const ErrorHandlerStub = { showError: () => {} };

        const src = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'offerPdf.js'), 'utf8');
        const fn = new Function('Utils', 'ItineraryCache', 'App', 'ErrorHandler', src);
        fn(UtilsStub, ItineraryCacheStub, AppStub, ErrorHandlerStub);
        OfferPdf = window.OfferPdf;
    });

    test('four same-group GTY sailings across two years -> one section, one ship, one itinerary, correct date lines', () => {
        const dates = ['2026-11-16', '2026-11-30', '2027-01-04', '2027-01-11'];
        const pairs = dates.map(d => makePair(makeSailing({ roomType: 'Ocean View', isGTY: true, sailDate: d })));
        const sections = OfferPdf.groupByCategory(pairs);
        expect(sections).toHaveLength(1);
        expect(sections[0].title).toBe('OCEAN VIEW GUARANTEE STATEROOM');
        expect(sections[0].isGTY).toBe(true);
        expect(sections[0].ships).toHaveLength(1);
        expect(sections[0].ships[0].itineraries).toHaveLength(1);
        expect(sections[0].ships[0].itineraries[0].dates).toEqual(['2026-11-16', '2026-11-30', '2027-01-04', '2027-01-11']);
        expect(OfferPdf.formatDateGroups(sections[0].ships[0].itineraries[0].dates)).toEqual(['2026: 11/16, 11/30', '2027: 1/4, 1/11']);
    });

    test('mixed Interior + Balcony orders Balcony before Interior (better rooms first) and never emits Suite', () => {
        const pairs = [
            makePair(makeSailing({ roomType: 'Balcony' })),
            makePair(makeSailing({ roomType: 'Interior' })),
        ];
        const sections = OfferPdf.groupByCategory(pairs);
        expect(sections.map(s => s.room)).toEqual(['Balcony', 'Interior']);
        expect(sections.some(s => s.room === 'Suite')).toBe(false);
    });

    test('kicker names a class only on a strict majority (>50%) of known-class sailings', () => {
        const majority = [
            makePair(makeSailing({ shipName: 'Oasis 1' })),
            makePair(makeSailing({ shipName: 'Oasis 2' })),
            makePair(makeSailing({ shipName: 'Oasis 3' })),
            makePair(makeSailing({ shipName: 'Radiance 1' })),
        ];
        expect(OfferPdf.kicker(majority)).toContain('OASIS CLASS');

        const split = [
            makePair(makeSailing({ shipName: 'Oasis 1' })),
            makePair(makeSailing({ shipName: 'Radiance 1' })),
            makePair(makeSailing({ shipName: 'Voyager 1' })),
        ];
        const k = OfferPdf.kicker(split);
        expect(k).not.toContain('OASIS');
        expect(k).not.toContain('RADIANCE');
        expect(k).not.toContain('VOYAGER');
    });

    test('taxesRange is null when no itinerary cache hit yields a finite taxesAndFees', () => {
        const pairs = [makePair(makeSailing({ sailDate: '2026-01-01' })), makePair(makeSailing({ sailDate: '2026-02-01' }))];
        expect(OfferPdf.taxesRange(pairs)).toBeNull();
    });
});
