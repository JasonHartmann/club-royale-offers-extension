/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

function load(rel) {
    const src = fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
    new Function(src)();
}

describe('retail booking host follows the open profile', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        load('utils/utils_core.js');
        global.App = {
            Utils: window.Utils,
            CurrentProfile: { key: 'gobo-C-test' },
            TableRenderer: { lastState: { selectedProfileKey: 'gobo-C-test' } },
            ErrorHandler: { showError() {} }
        };
        load('features/itinerary.js');
        const cache = window.ItineraryCache;
        cache._loaded = true;
        cache._fetchInProgress = false;
        cache._cache = {
            'SD_EQ_2026-10-02': {
                bookingLink: '/booking/landing?packageCode=EQ07E123',
                shipName: 'Oasis of the Seas',
                sailDate: '2026-10-02',
                departurePortName: 'Miami',
                itineraryDescription: 'Eastern Caribbean',
                offerCodes: []
            }
        };
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({ data: { cruiseSearch: { results: { cruises: [] } } } })
        }));
    });

    function linkHost() {
        window.ItineraryCache.showModal('SD_EQ_2026-10-02');
        const a = document.querySelector('a.gobo-itinerary-link');
        return a ? new URL(a.href).host : '';
    }

    test('Celebrity profile on a non-Celebrity page opens celebritycruises.com', () => {
        expect(location.hostname).not.toContain('celebritycruises.com');
        expect(linkHost()).toBe('www.celebritycruises.com');
    });

    test('Royal profile opens royalcaribbean.com', () => {
        App.CurrentProfile.key = 'gobo-R-test';
        App.TableRenderer.lastState.selectedProfileKey = 'gobo-R-test';
        expect(linkHost()).toBe('www.royalcaribbean.com');
    });

    test('graph refresh uses the profile host, not the page', async () => {
        await window.ItineraryCache.hydrateAlways(['SD_EQ_2026-10-02']);
        expect(fetch).toHaveBeenCalled();
        expect(String(fetch.mock.calls[0][0])).toBe('https://www.celebritycruises.com/graph');
    });

    test('cross-brand graph refresh goes through the background, not page fetch', async () => {
        const sent = [];
        global.chrome = {
            runtime: {
                sendMessage: jest.fn(async (msg) => {
                    sent.push(msg);
                    return { ok: true, body: JSON.stringify({ data: { cruiseSearch: { results: { cruises: [] } } } }) };
                })
            }
        };
        fetch.mockClear();
        await window.ItineraryCache.hydrateAlways(['SD_EQ_2026-10-02']);
        expect(sent[0].url).toBe('https://www.celebritycruises.com/graph');
        expect(sent[0].channel).toBe('gobo-graph');
        expect(fetch).not.toHaveBeenCalled();
        delete global.chrome;
    });
});
