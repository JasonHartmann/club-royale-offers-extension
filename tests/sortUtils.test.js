const fs = require('fs');
const path = require('path');

describe('SortUtils.sortOffers', () => {
    let SortUtils;

    beforeAll(() => {
        global.App = {
            Utils: {
                parseItinerary(itin) {
                    if (!itin) return { nights: '-', destination: '-' };
                    const match = itin.match(/^\s*(\d+)\s*N(?:IGHT|T)?S?\b[\s\-.,]*([\s\S]*)$/i);
                    if (match) {
                        return { nights: match[1], destination: match[2] ? match[2].trim() || '-' : '-' };
                    }
                    return { nights: '-', destination: itin };
                },
                computePerks(offer, sailing) {
                    const names = new Set();
                    const perkCodes = offer?.campaignOffer?.perkCodes;
                    if (Array.isArray(perkCodes)) {
                        perkCodes.forEach(p => {
                            const name = p?.perkName || p?.perkCode;
                            if (name) names.add(name.trim());
                        });
                    }
                    return names.size ? Array.from(names).join(' | ') : '-';
                },
                getShipClass(shipName) {
                    if (!shipName) return '-';
                    const key = shipName.trim().toLowerCase();
                    const map = {
                        'icon of the seas': 'Icon',
                        'oasis of the seas': 'Oasis',
                        'freedom of the seas': 'Freedom',
                    };
                    return map[key] || '-';
                },
                computeOfferValue(offer, sailing) {
                    return offer?._testOfferValue ?? null;
                },
                getIncludeTaxesAndFeesPreference() { return true; },
                computeUpgradePriceForColumn(col, offer, sailing) {
                    return offer?._testUpgrade?.[col] ?? null;
                },
            },
            CurrentProfile: { key: 'gobo-test' },
            TableRenderer: { lastState: null },
        };

        const src = fs.readFileSync(path.resolve(__dirname, '..', 'utils', 'sortUtils.js'), 'utf8');
        const fn = new Function('App', src + '\nreturn SortUtils;');
        SortUtils = fn(global.App);
    });

    afterAll(() => {
        delete global.App;
    });

    function mkOffer(overrides = {}) {
        return {
            offer: {
                campaignOffer: {
                    offerCode: overrides.offerCode || 'CODE1',
                    startDate: overrides.startDate || '2025-01-01',
                    reserveByDate: overrides.reserveByDate || '2025-02-01',
                    name: overrides.offerName || 'Offer',
                    tradeInValue: overrides.tradeInValue ?? 100,
                    perkCodes: overrides.perkCodes || [],
                },
                _testOfferValue: overrides.offerValue ?? null,
                _testUpgrade: overrides.upgrade || {},
            },
            sailing: {
                shipName: overrides.shipName || 'Icon Of The Seas',
                sailDate: overrides.sailDate || '2025-03-15',
                departurePort: { name: overrides.departurePort || 'Miami' },
                itineraryDescription: overrides.itinerary || '7 Nights Caribbean',
                roomType: overrides.roomType || 'Interior',
                isGTY: overrides.isGTY || false,
                isGOBO: overrides.isGOBO || false,
                isDOLLARSOFF: overrides.isDOLLARSOFF || false,
                DOLLARSOFF_AMT: overrides.DOLLARSOFF_AMT || 0,
                isFREEPLAY: overrides.isFREEPLAY || false,
                FREEPLAY_AMT: overrides.FREEPLAY_AMT || 0,
                __b2bDepth: overrides.b2bDepth ?? 1,
                __b2bChainId: overrides.b2bChainId || null,
            },
        };
    }

    test('returns offers unchanged when sortOrder is original', () => {
        const offers = [mkOffer({ sailDate: '2025-06-01' }), mkOffer({ sailDate: '2025-01-01' })];
        const result = SortUtils.sortOffers(offers, 'sailDate', 'original');
        expect(result[0].sailing.sailDate).toBe('2025-06-01');
        expect(result[1].sailing.sailDate).toBe('2025-01-01');
    });

    test('sorts by sailDate ascending', () => {
        const offers = [
            mkOffer({ sailDate: '2025-06-01' }),
            mkOffer({ sailDate: '2025-01-01' }),
            mkOffer({ sailDate: '2025-03-15' }),
        ];
        SortUtils.sortOffers(offers, 'sailDate', 'asc');
        expect(offers[0].sailing.sailDate).toBe('2025-01-01');
        expect(offers[1].sailing.sailDate).toBe('2025-03-15');
        expect(offers[2].sailing.sailDate).toBe('2025-06-01');
    });

    test('sorts by sailDate descending', () => {
        const offers = [
            mkOffer({ sailDate: '2025-01-01' }),
            mkOffer({ sailDate: '2025-06-01' }),
        ];
        SortUtils.sortOffers(offers, 'sailDate', 'desc');
        expect(offers[0].sailing.sailDate).toBe('2025-06-01');
        expect(offers[1].sailing.sailDate).toBe('2025-01-01');
    });

    test('sorts by offerCode alphabetically ascending', () => {
        const offers = [
            mkOffer({ offerCode: 'ZZZ' }),
            mkOffer({ offerCode: 'AAA' }),
            mkOffer({ offerCode: 'MMM' }),
        ];
        SortUtils.sortOffers(offers, 'offerCode', 'asc');
        expect(offers[0].offer.campaignOffer.offerCode).toBe('AAA');
        expect(offers[1].offer.campaignOffer.offerCode).toBe('MMM');
        expect(offers[2].offer.campaignOffer.offerCode).toBe('ZZZ');
    });

    test('sorts by ship name', () => {
        const offers = [
            mkOffer({ shipName: 'Oasis Of The Seas' }),
            mkOffer({ shipName: 'Freedom Of The Seas' }),
        ];
        SortUtils.sortOffers(offers, 'ship', 'asc');
        expect(offers[0].sailing.shipName).toBe('Freedom Of The Seas');
        expect(offers[1].sailing.shipName).toBe('Oasis Of The Seas');
    });

    test('sorts by destination extracted from itinerary', () => {
        const offers = [
            mkOffer({ itinerary: '5 Nights Mediterranean' }),
            mkOffer({ itinerary: '7 Nights Caribbean' }),
            mkOffer({ itinerary: '3 Nights Alaska' }),
        ];
        SortUtils.sortOffers(offers, 'destination', 'asc');
        expect(offers[0].sailing.itineraryDescription).toBe('3 Nights Alaska');
        expect(offers[1].sailing.itineraryDescription).toBe('7 Nights Caribbean');
        expect(offers[2].sailing.itineraryDescription).toBe('5 Nights Mediterranean');
    });

    test('sorts by nights numerically', () => {
        const offers = [
            mkOffer({ itinerary: '14 Nights Transatlantic' }),
            mkOffer({ itinerary: '3 Nights Bahamas' }),
            mkOffer({ itinerary: '7 Nights Caribbean' }),
        ];
        SortUtils.sortOffers(offers, 'nights', 'asc');
        expect(offers[0].sailing.itineraryDescription).toContain('3 Nights');
        expect(offers[1].sailing.itineraryDescription).toContain('7 Nights');
        expect(offers[2].sailing.itineraryDescription).toContain('14 Nights');
    });

    test('sorts by departurePort', () => {
        const offers = [
            mkOffer({ departurePort: 'Tampa' }),
            mkOffer({ departurePort: 'Fort Lauderdale' }),
        ];
        SortUtils.sortOffers(offers, 'departurePort', 'asc');
        expect(offers[0].sailing.departurePort.name).toBe('Fort Lauderdale');
        expect(offers[1].sailing.departurePort.name).toBe('Tampa');
    });

    test('sorts by offerDate (startDate)', () => {
        const offers = [
            mkOffer({ startDate: '2025-06-01' }),
            mkOffer({ startDate: '2025-01-15' }),
        ];
        SortUtils.sortOffers(offers, 'offerDate', 'asc');
        expect(offers[0].offer.campaignOffer.startDate).toBe('2025-01-15');
    });

    test('sorts by expiration (reserveByDate)', () => {
        const offers = [
            mkOffer({ reserveByDate: '2025-12-31' }),
            mkOffer({ reserveByDate: '2025-03-01' }),
        ];
        SortUtils.sortOffers(offers, 'expiration', 'asc');
        expect(offers[0].offer.campaignOffer.reserveByDate).toBe('2025-03-01');
    });

    test('sorts by category with GTY suffix', () => {
        const offers = [
            mkOffer({ roomType: 'Balcony', isGTY: true }),
            mkOffer({ roomType: 'Balcony', isGTY: false }),
            mkOffer({ roomType: 'Interior', isGTY: false }),
        ];
        SortUtils.sortOffers(offers, 'category', 'asc');
        // "Balcony" < "Balcony GTY" < "Interior" alphabetically
        expect(offers[0].sailing.roomType).toBe('Balcony');
        expect(offers[0].sailing.isGTY).toBe(false);
        expect(offers[1].sailing.isGTY).toBe(true);
        expect(offers[2].sailing.roomType).toBe('Interior');
    });

    test('sorts by guests with GOBO and modifiers', () => {
        const offers = [
            mkOffer({ isGOBO: false }),
            mkOffer({ isGOBO: true }),
        ];
        SortUtils.sortOffers(offers, 'guests', 'asc');
        expect(offers[0].sailing.isGOBO).toBe(true);
        expect(offers[1].sailing.isGOBO).toBe(false);
    });

    test('sorts by tradeInValue numerically', () => {
        const offers = [
            mkOffer({ tradeInValue: 500 }),
            mkOffer({ tradeInValue: 100 }),
            mkOffer({ tradeInValue: 250 }),
        ];
        SortUtils.sortOffers(offers, 'tradeInValue', 'asc');
        expect(offers[0].offer.campaignOffer.tradeInValue).toBe(100);
        expect(offers[1].offer.campaignOffer.tradeInValue).toBe(250);
        expect(offers[2].offer.campaignOffer.tradeInValue).toBe(500);
    });

    test('tradeInValue handles string dollar amounts', () => {
        const offers = [
            mkOffer({ tradeInValue: '$500' }),
            mkOffer({ tradeInValue: '$100' }),
        ];
        SortUtils.sortOffers(offers, 'tradeInValue', 'asc');
        expect(offers[0].offer.campaignOffer.tradeInValue).toBe('$100');
    });

    test('tradeInValue falls back to string comparison for non-numeric values', () => {
        const offers = [
            mkOffer({ tradeInValue: null }),
            mkOffer({ tradeInValue: 'N/A' }),
        ];
        SortUtils.sortOffers(offers, 'tradeInValue', 'asc');
        expect(offers.length).toBe(2);
    });

    test('secondary sort by sailDate when primary values are equal', () => {
        const offers = [
            mkOffer({ shipName: 'Same Ship', sailDate: '2025-06-01' }),
            mkOffer({ shipName: 'Same Ship', sailDate: '2025-01-01' }),
            mkOffer({ shipName: 'Same Ship', sailDate: '2025-03-15' }),
        ];
        SortUtils.sortOffers(offers, 'ship', 'asc');
        expect(offers[0].sailing.sailDate).toBe('2025-01-01');
        expect(offers[1].sailing.sailDate).toBe('2025-03-15');
        expect(offers[2].sailing.sailDate).toBe('2025-06-01');
    });

    test('b2bDepth sorts by numeric depth when not viewing favorites', () => {
        const offers = [
            mkOffer({ b2bDepth: 1 }),
            mkOffer({ b2bDepth: 5 }),
            mkOffer({ b2bDepth: 3 }),
        ];
        SortUtils.sortOffers(offers, 'b2bDepth', 'desc');
        expect(offers[0].sailing.__b2bDepth).toBe(5);
        expect(offers[1].sailing.__b2bDepth).toBe(3);
        expect(offers[2].sailing.__b2bDepth).toBe(1);
    });

    test('b2bDepth defaults to 1 when depth is missing', () => {
        const o1 = mkOffer({});
        const o2 = mkOffer({ b2bDepth: 3 });
        delete o1.sailing.__b2bDepth;
        const offers = [o1, o2];
        SortUtils.sortOffers(offers, 'b2bDepth', 'asc');
        expect(offers[0].sailing.__b2bDepth).toBeUndefined();
        expect(offers[1].sailing.__b2bDepth).toBe(3);
    });

    test('handles empty offers array', () => {
        const result = SortUtils.sortOffers([], 'sailDate', 'asc');
        expect(result).toEqual([]);
    });

    test('handles single-element array', () => {
        const offers = [mkOffer({})];
        const result = SortUtils.sortOffers(offers, 'sailDate', 'asc');
        expect(result.length).toBe(1);
    });

    test('handles missing optional chaining properties gracefully', () => {
        const offers = [
            { offer: { campaignOffer: null }, sailing: { shipName: 'Test' } },
            { offer: {}, sailing: {} },
        ];
        expect(() => SortUtils.sortOffers(offers, 'offerCode', 'asc')).not.toThrow();
        expect(() => SortUtils.sortOffers(offers, 'offerDate', 'asc')).not.toThrow();
        expect(() => SortUtils.sortOffers(offers, 'ship', 'asc')).not.toThrow();
        expect(() => SortUtils.sortOffers(offers, 'departurePort', 'asc')).not.toThrow();
    });

    test('shipClass sorts by class name', () => {
        const offers = [
            mkOffer({ shipName: 'Oasis Of The Seas' }),
            mkOffer({ shipName: 'Freedom Of The Seas' }),
            mkOffer({ shipName: 'Icon Of The Seas' }),
        ];
        SortUtils.sortOffers(offers, 'shipClass', 'asc');
        expect(offers[0].sailing.shipName).toBe('Freedom Of The Seas');
    });

    test('offerName sorts alphabetically', () => {
        const offers = [
            mkOffer({ offerName: 'Zebra Deal' }),
            mkOffer({ offerName: 'Alpha Offer' }),
        ];
        SortUtils.sortOffers(offers, 'offerName', 'asc');
        expect(offers[0].offer.campaignOffer.name).toBe('Alpha Offer');
        expect(offers[1].offer.campaignOffer.name).toBe('Zebra Deal');
    });

    test('itinerary sorts by full description', () => {
        const offers = [
            mkOffer({ itinerary: '7 Nights Caribbean' }),
            mkOffer({ itinerary: '3 Nights Alaska' }),
        ];
        SortUtils.sortOffers(offers, 'itinerary', 'asc');
        expect(offers[0].sailing.itineraryDescription).toBe('3 Nights Alaska');
    });
});
