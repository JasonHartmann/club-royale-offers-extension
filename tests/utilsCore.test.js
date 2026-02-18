const fs = require('fs');
const path = require('path');

describe('Utils (utils_core)', () => {
    let Utils;

    beforeAll(() => {
        global.window = global.window || {};
        global.window.GOBO_DEBUG_LOGS = false;
        global.location = { hostname: 'www.royalcaribbean.com' };
        global.localStorage = {
            _store: {},
            getItem(k) { return this._store[k] ?? null; },
            setItem(k, v) { this._store[k] = String(v); },
            removeItem(k) { delete this._store[k]; },
        };
        global.document = {
            addEventListener: jest.fn(),
            querySelectorAll: jest.fn(() => []),
        };
        global.ItineraryCache = {
            get: jest.fn(() => null),
            all: jest.fn(() => ({})),
            buildOrUpdateFromOffers: jest.fn(),
        };
        global.App = {};
        global.PricingUtils = undefined;

        const src = fs.readFileSync(path.resolve(__dirname, '..', 'utils', 'utils_core.js'), 'utf8');
        const fn = new Function(src + '\nreturn Utils;');
        Utils = fn();
        global.App.Utils = Utils;
        global.App.PricingUtils = undefined;
    });

    afterAll(() => {
        delete global.location;
        delete global.ItineraryCache;
        delete global.App;
        delete global.PricingUtils;
    });

    describe('formatDate', () => {
        test('formats YYYY-MM-DD to MM/DD/YY', () => {
            expect(Utils.formatDate('2025-03-15')).toBe('03/15/25');
        });

        test('formats YYYY-MM-DDTHH:mm:ss by stripping time', () => {
            expect(Utils.formatDate('2025-12-01T14:30:00')).toBe('12/01/25');
        });

        test('returns dash for null/undefined/empty', () => {
            expect(Utils.formatDate(null)).toBe('-');
            expect(Utils.formatDate(undefined)).toBe('-');
            expect(Utils.formatDate('')).toBe('-');
        });

        test('handles single-digit month and day in source', () => {
            expect(Utils.formatDate('2025-01-05')).toBe('01/05/25');
        });

        test('handles year 2000', () => {
            expect(Utils.formatDate('2000-06-15')).toBe('06/15/00');
        });
    });

    describe('parseItinerary', () => {
        test('extracts nights and destination from standard format', () => {
            const result = Utils.parseItinerary('7 Nights Caribbean');
            expect(result.nights).toBe('7');
            expect(result.destination).toBe('Caribbean');
        });

        test('handles N abbreviation', () => {
            const result = Utils.parseItinerary('5N Mediterranean');
            expect(result.nights).toBe('5');
            expect(result.destination).toBe('Mediterranean');
        });

        test('handles NT abbreviation', () => {
            const result = Utils.parseItinerary('3NT Bahamas');
            expect(result.nights).toBe('3');
            expect(result.destination).toBe('Bahamas');
        });

        test('handles NTS abbreviation', () => {
            const result = Utils.parseItinerary('4NTS Alaska');
            expect(result.nights).toBe('4');
            expect(result.destination).toBe('Alaska');
        });

        test('handles NIGHT singular', () => {
            const result = Utils.parseItinerary('1 Night Bahamas');
            expect(result.nights).toBe('1');
            expect(result.destination).toBe('Bahamas');
        });

        test('returns dashes for null/undefined/empty', () => {
            expect(Utils.parseItinerary(null)).toEqual({ nights: '-', destination: '-' });
            expect(Utils.parseItinerary('')).toEqual({ nights: '-', destination: '-' });
            expect(Utils.parseItinerary(undefined)).toEqual({ nights: '-', destination: '-' });
        });

        test('returns full string as destination when no nights pattern', () => {
            const result = Utils.parseItinerary('Caribbean Cruise');
            expect(result.nights).toBe('-');
            expect(result.destination).toBe('Caribbean Cruise');
        });

        test('handles leading/trailing whitespace', () => {
            const result = Utils.parseItinerary('  7 Nights   Caribbean  ');
            expect(result.nights).toBe('7');
            expect(result.destination).toBe('Caribbean');
        });

        test('handles hyphen separator after nights', () => {
            const result = Utils.parseItinerary('7 Nights - Caribbean');
            expect(result.nights).toBe('7');
            expect(result.destination).toBe('Caribbean');
        });

        test('returns dash destination when only nights present', () => {
            const result = Utils.parseItinerary('7 Nights');
            expect(result.nights).toBe('7');
            expect(result.destination).toBe('-');
        });
    });

    describe('formatTradeValue', () => {
        test('formats integer number with dollar sign', () => {
            expect(Utils.formatTradeValue(500)).toBe('$500');
        });

        test('formats decimal number with two decimal places', () => {
            const result = Utils.formatTradeValue(499.99);
            expect(result).toMatch(/^\$499\.99$/);
        });

        test('returns dash for null/undefined/empty string', () => {
            expect(Utils.formatTradeValue(null)).toBe('-');
            expect(Utils.formatTradeValue(undefined)).toBe('-');
            expect(Utils.formatTradeValue('')).toBe('-');
        });

        test('parses string with dollar sign', () => {
            const result = Utils.formatTradeValue('$1000');
            expect(result).toBe('$1,000');
        });

        test('formats large integers with commas', () => {
            expect(Utils.formatTradeValue(10000)).toBe('$10,000');
        });

        test('returns non-numeric string as-is', () => {
            expect(Utils.formatTradeValue('N/A')).toBe('N/A');
        });

        test('returns dash for whitespace-only string', () => {
            expect(Utils.formatTradeValue('   ')).toBe('-');
        });

        test('handles zero', () => {
            expect(Utils.formatTradeValue(0)).toBe('$0');
        });

        test('handles negative numbers', () => {
            const result = Utils.formatTradeValue(-50);
            expect(result).toMatch(/\$-50/);
        });
    });

    describe('formatOfferValue', () => {
        test('formats number as rounded whole dollar', () => {
            expect(Utils.formatOfferValue(1234)).toBe('$1,234');
        });

        test('rounds to nearest dollar', () => {
            expect(Utils.formatOfferValue(99.7)).toBe('$100');
            expect(Utils.formatOfferValue(99.3)).toBe('$99');
        });

        test('returns dash for null/undefined', () => {
            expect(Utils.formatOfferValue(null)).toBe('-');
            expect(Utils.formatOfferValue(undefined)).toBe('-');
        });

        test('returns dash for Infinity/NaN', () => {
            expect(Utils.formatOfferValue(Infinity)).toBe('-');
            expect(Utils.formatOfferValue(-Infinity)).toBe('-');
            expect(Utils.formatOfferValue(NaN)).toBe('-');
        });

        test('handles zero', () => {
            expect(Utils.formatOfferValue(0)).toBe('$0');
        });

        test('handles string that converts to number', () => {
            expect(Utils.formatOfferValue('500')).toBe('$500');
        });

        test('returns dash for non-numeric string', () => {
            expect(Utils.formatOfferValue('abc')).toBe('-');
        });
    });

    describe('toTitleCase', () => {
        test('capitalizes each word', () => {
            expect(Utils.toTitleCase('hello world')).toBe('Hello World');
        });

        test('handles all uppercase input', () => {
            expect(Utils.toTitleCase('FREEDOM OF THE SEAS')).toBe('Freedom Of The Seas');
        });

        test('handles single word', () => {
            expect(Utils.toTitleCase('test')).toBe('Test');
        });

        test('handles empty string', () => {
            expect(Utils.toTitleCase('')).toBe('');
        });
    });

    describe('toPortTitleCase', () => {
        test('title-cases words longer than 2 characters', () => {
            expect(Utils.toPortTitleCase('FORT LAUDERDALE')).toBe('Fort Lauderdale');
        });

        test('preserves short words (<=2 chars) as-is', () => {
            const result = Utils.toPortTitleCase('PORT OF MIAMI');
            expect(result).toContain('Port');
            expect(result).toContain('OF');
            expect(result).toContain('Miami');
        });

        test('returns falsy input as-is', () => {
            expect(Utils.toPortTitleCase(null)).toBe(null);
            expect(Utils.toPortTitleCase('')).toBe('');
            expect(Utils.toPortTitleCase(undefined)).toBe(undefined);
        });
    });

    describe('getShipClass', () => {
        test('returns Icon for Icon of the Seas', () => {
            expect(Utils.getShipClass('Icon of the Seas')).toBe('Icon');
        });

        test('returns Oasis for Oasis-class ships', () => {
            expect(Utils.getShipClass('Symphony of the Seas')).toBe('Oasis');
            expect(Utils.getShipClass('Utopia of the Seas')).toBe('Oasis');
        });

        test('returns Edge for Celebrity Edge-class ships', () => {
            expect(Utils.getShipClass('Celebrity Beyond')).toBe('Edge');
            expect(Utils.getShipClass('celebrity edge')).toBe('Edge');
        });

        test('returns Solstice for Celebrity Solstice-class', () => {
            expect(Utils.getShipClass('Celebrity Reflection')).toBe('Solstice');
        });

        test('returns dash for unknown ship', () => {
            expect(Utils.getShipClass('Unknown Ship')).toBe('-');
        });

        test('returns dash for null/empty', () => {
            expect(Utils.getShipClass(null)).toBe('-');
            expect(Utils.getShipClass('')).toBe('-');
        });

        test('handles short Celebrity names', () => {
            expect(Utils.getShipClass('Beyond')).toBe('Edge');
            expect(Utils.getShipClass('Solstice')).toBe('Solstice');
        });

        test('is case-insensitive', () => {
            expect(Utils.getShipClass('ICON OF THE SEAS')).toBe('Icon');
            expect(Utils.getShipClass('icon of the seas')).toBe('Icon');
        });

        test('handles leading/trailing whitespace', () => {
            expect(Utils.getShipClass('  Icon of the Seas  ')).toBe('Icon');
        });
    });

    describe('computePerks', () => {
        test('returns dash when no perks', () => {
            expect(Utils.computePerks({ campaignOffer: {} }, {})).toBe('-');
        });

        test('joins multiple perk names with pipe', () => {
            const offer = {
                campaignOffer: {
                    perkCodes: [
                        { perkName: 'Wifi' },
                        { perkName: 'Drink Package' },
                    ],
                },
            };
            const result = Utils.computePerks(offer, {});
            expect(result).toContain('Wifi');
            expect(result).toContain('Drink Package');
            expect(result).toContain(' | ');
        });

        test('deduplicates perk names', () => {
            const offer = {
                campaignOffer: {
                    perkCodes: [
                        { perkName: 'Wifi' },
                        { perkName: 'Wifi' },
                    ],
                },
            };
            expect(Utils.computePerks(offer, {})).toBe('Wifi');
        });

        test('falls back to perkCode when perkName missing', () => {
            const offer = {
                campaignOffer: {
                    perkCodes: [{ perkCode: 'WIFI123' }],
                },
            };
            expect(Utils.computePerks(offer, {})).toBe('WIFI123');
        });

        test('includes nextCruiseBonusPerkCode from sailing', () => {
            const offer = { campaignOffer: {} };
            const sailing = { nextCruiseBonusPerkCode: { perkName: 'Bonus OBC' } };
            expect(Utils.computePerks(offer, sailing)).toBe('Bonus OBC');
        });

        test('handles null offer gracefully', () => {
            expect(Utils.computePerks({}, {})).toBe('-');
        });
    });

    describe('detectBrand', () => {
        test('detects Royal Caribbean by default', () => {
            global.location.hostname = 'www.royalcaribbean.com';
            expect(Utils.detectBrand()).toBe('R');
        });

        test('detects Celebrity from hostname', () => {
            global.location.hostname = 'www.celebritycruises.com';
            expect(Utils.detectBrand()).toBe('C');
            global.location.hostname = 'www.royalcaribbean.com';
        });

        test('detects Celebrity from bluechipcluboffers.com', () => {
            global.location.hostname = 'www.bluechipcluboffers.com';
            expect(Utils.detectBrand()).toBe('C');
            global.location.hostname = 'www.royalcaribbean.com';
        });

        test('localStorage override takes precedence', () => {
            global.localStorage._store.casinoBrand = 'C';
            expect(Utils.detectBrand()).toBe('C');
            delete global.localStorage._store.casinoBrand;
        });

        test('localStorage X maps to C', () => {
            global.localStorage._store.casinoBrand = 'X';
            expect(Utils.detectBrand()).toBe('C');
            delete global.localStorage._store.casinoBrand;
        });
    });

    describe('getIncludeTaxesAndFeesPreference', () => {
        test('returns true by default', () => {
            expect(Utils.getIncludeTaxesAndFeesPreference(null)).toBe(true);
        });

        test('reads from state.advancedSearch', () => {
            const state = { advancedSearch: { includeTaxesAndFeesInPriceFilters: false } };
            expect(Utils.getIncludeTaxesAndFeesPreference(state)).toBe(false);
        });

        test('returns true when flag is explicitly true', () => {
            const state = { advancedSearch: { includeTaxesAndFeesInPriceFilters: true } };
            expect(Utils.getIncludeTaxesAndFeesPreference(state)).toBe(true);
        });
    });

    describe('computeUpgradePriceForColumn', () => {
        test('returns null for unknown column key', () => {
            expect(Utils.computeUpgradePriceForColumn('unknownCol', {}, {})).toBeNull();
        });

        test('returns null when no PricingUtils available', () => {
            expect(Utils.computeUpgradePriceForColumn('suiteUpgrade', {}, {})).toBeNull();
            expect(Utils.computeUpgradePriceForColumn('balconyUpgrade', {}, {})).toBeNull();
            expect(Utils.computeUpgradePriceForColumn('oceanViewUpgrade', {}, {})).toBeNull();
        });

        test('delegates to PricingUtils when available', () => {
            global.App.PricingUtils = {
                computeSuiteUpgradePrice: jest.fn(() => 999),
                computeBalconyUpgradePrice: jest.fn(() => 555),
                computeOceanViewUpgradePrice: jest.fn(() => 333),
            };
            expect(Utils.computeUpgradePriceForColumn('suiteUpgrade', {}, {})).toBe(999);
            expect(Utils.computeUpgradePriceForColumn('balconyUpgrade', {}, {})).toBe(555);
            expect(Utils.computeUpgradePriceForColumn('oceanViewUpgrade', {}, {})).toBe(333);
            delete global.App.PricingUtils;
        });
    });

    describe('formatUpgradePriceForColumn', () => {
        test('returns dash when raw value is null', () => {
            expect(Utils.formatUpgradePriceForColumn('suiteUpgrade', {}, {})).toBe('-');
        });

        test('formats valid number', () => {
            global.App.PricingUtils = {
                computeSuiteUpgradePrice: jest.fn(() => 1234),
            };
            expect(Utils.formatUpgradePriceForColumn('suiteUpgrade', {}, {})).toBe('$1,234');
            delete global.App.PricingUtils;
        });
    });

    describe('normalizeOffers', () => {
        test('trims and uppercases offer codes', () => {
            const data = {
                offers: [{
                    campaignOffer: {
                        offerCode: '  abc123  ',
                        name: 'test offer',
                        sailings: [],
                    },
                }],
            };
            Utils.normalizeOffers(data);
            expect(data.offers[0].campaignOffer.offerCode).toBe('ABC123');
        });

        test('title-cases offer names', () => {
            const data = {
                offers: [{
                    campaignOffer: {
                        offerCode: 'X',
                        name: 'GREAT DEAL FOR YOU',
                        sailings: [],
                    },
                }],
            };
            Utils.normalizeOffers(data);
            expect(data.offers[0].campaignOffer.name).toBe('Great Deal For You');
        });

        test('title-cases ship names in sailings', () => {
            const data = {
                offers: [{
                    campaignOffer: {
                        offerCode: 'X',
                        name: 'deal',
                        sailings: [{ shipName: 'ICON OF THE SEAS' }],
                    },
                }],
            };
            Utils.normalizeOffers(data);
            expect(data.offers[0].campaignOffer.sailings[0].shipName).toBe('Icon Of The Seas');
        });

        test('handles null offers array gracefully', () => {
            expect(() => Utils.normalizeOffers({})).not.toThrow();
            expect(() => Utils.normalizeOffers(null)).not.toThrow();
        });

        test('returns the data object', () => {
            const data = { offers: [] };
            expect(Utils.normalizeOffers(data)).toBe(data);
        });
    });

    describe('isCelebrity / getRedemptionBase', () => {
        test('isCelebrity returns false for Royal Caribbean', () => {
            global.location.hostname = 'www.royalcaribbean.com';
            expect(Utils.isCelebrity()).toBe(false);
        });

        test('getRedemptionBase returns Royal URL by default', () => {
            global.location.hostname = 'www.royalcaribbean.com';
            expect(Utils.getRedemptionBase()).toContain('royalcaribbean.com');
        });

        test('getRedemptionBase returns Celebrity URL when celebrity', () => {
            global.location.hostname = 'www.celebritycruises.com';
            expect(Utils.getRedemptionBase()).toContain('celebritycruises.com');
            global.location.hostname = 'www.royalcaribbean.com';
        });
    });
});
