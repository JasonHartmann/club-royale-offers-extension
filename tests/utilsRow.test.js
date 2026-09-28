/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

function loadUtils() {
    const core = fs.readFileSync(path.resolve(__dirname, '..', 'utils', 'utils_core.js'), 'utf8');
    const row = fs.readFileSync(path.resolve(__dirname, '..', 'utils', 'utils_row.js'), 'utf8');
    const Utils = new Function(core + '\n' + row + '\nreturn Utils;')();
    return Utils;
}

describe('createOfferRow HTML escaping', () => {
    let Utils;

    beforeEach(() => {
        global.App = {
            DateFullFormat: false,
            TableRenderer: {
                lastState: {},
                getHiddenColumnsSet: () => null,
            },
            CurrentProfile: null,
        };
        global.B2BUtils = { buildB2BRowId: () => 'row-1' };
        global.window.GOBO_DEBUG_LOGS = false;
        Utils = loadUtils();
        global.App.Utils = Utils;
    });

    afterEach(() => {
        delete global.App;
        delete global.B2BUtils;
    });

    function rowFor(offer, sailing) {
        return Utils.createOfferRow({ offer, sailing }, false, false, 0);
    }

    test('offer code, name, ship, port, destination, and perks are inserted as text', () => {
        const code = 'X</td><img src=x onerror=alert(1)>';
        const name = '<script>alert("name")</script>';
        const ship = '<svg onload=alert(1)>Ship';
        const port = 'Miami & <img src=p>';
        const destination = '<img src=d onerror=alert(1)>';
        const perk = '<img src=perk>';
        const offer = {
            campaignOffer: {
                offerCode: code,
                name,
                startDate: '2026-01-01',
                reserveByDate: '2026-06-01',
                perkCodes: [{ perkName: perk }],
            },
        };
        const sailing = {
            shipName: ship,
            shipCode: 'OA',
            sailDate: '2026-11-16',
            departurePort: { name: port },
            itineraryDescription: '7 Night ' + destination,
            roomType: 'Interior',
        };
        const row = rowFor(offer, sailing);
        expect(row.querySelector('img')).toBeNull();
        expect(row.querySelector('script')).toBeNull();
        expect(row.querySelector('svg')).toBeNull();
        expect(row.querySelector('[data-col="offerCode"]').textContent).toBe(code);
        expect(row.querySelector('[data-col="offerName"]').textContent).toBe(name);
        expect(row.querySelector('[data-col="ship"]').textContent).toBe(ship);
        expect(row.querySelector('[data-col="departurePort"]').textContent).toBe(port);
        expect(row.querySelector('[data-col="destination"]').textContent).toContain(destination);
        expect(row.querySelector('[data-col="perks"]').textContent).toBe(perk);
    });

    test('plain offer fields still render', () => {
        const offer = {
            campaignOffer: {
                offerCode: '26TOR604',
                name: 'Play Your Way',
                startDate: '2026-01-01',
                reserveByDate: '2026-09-16',
                perkCodes: [{ perkName: 'Beverage' }],
            },
        };
        const sailing = {
            shipName: 'Oasis of the Seas',
            shipCode: 'OA',
            sailDate: '2026-11-16',
            departurePort: { name: 'Miami' },
            itineraryDescription: '7 Night Western Caribbean',
            roomType: 'Interior',
        };
        const row = rowFor(offer, sailing);
        expect(row.querySelector('[data-col="offerCode"]').textContent).toBe('26TOR604');
        expect(row.querySelector('[data-col="offerName"]').textContent).toBe('Play Your Way');
        expect(row.querySelector('[data-col="ship"]').textContent).toBe('Oasis of the Seas');
        expect(row.querySelector('[data-col="departurePort"]').textContent).toBe('Miami');
        expect(row.querySelector('[data-col="destination"]').textContent).toContain('Western Caribbean');
        expect(row.querySelector('[data-col="perks"]').textContent).toBe('Beverage');
    });
});
