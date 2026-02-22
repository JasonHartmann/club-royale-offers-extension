const fs = require('fs');
const path = require('path');

function createModalEnv() {
    const mockBody = {
        style: { overflow: '' },
        appendChild: jest.fn(),
        removeChild: jest.fn(),
    };

    const elemProto = {
        className: '',
        id: '',
        textContent: '',
        innerHTML: '',
        href: '',
        target: '',
        rel: '',
        alt: '',
        src: '',
        download: '',
        onclick: null,
        dataset: {},
        style: { cssText: '', setProperty: jest.fn() },
        classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn() },
        childNodes: [],
        children: [],
        appendChild: jest.fn(function(child) { return child; }),
        addEventListener: jest.fn(),
        setAttribute: jest.fn(),
        getAttribute: jest.fn(() => null),
        querySelector: jest.fn(() => null),
        querySelectorAll: jest.fn(() => []),
        insertBefore: jest.fn(),
        remove: jest.fn(),
    };

    function createElement() {
        return Object.assign({}, elemProto, {
            style: { cssText: '', setProperty: jest.fn() },
            classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn() },
            dataset: {},
            appendChild: jest.fn(function(child) { return child; }),
            getAttribute: jest.fn(() => null),
            querySelector: jest.fn(() => null),
            querySelectorAll: jest.fn(() => []),
            insertBefore: jest.fn(),
        });
    }

    global.document = {
        body: mockBody,
        createElement: jest.fn(() => createElement()),
        getElementById: jest.fn(() => null),
        querySelector: jest.fn(() => null),
        querySelectorAll: jest.fn(() => []),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    };

    global.App = { TableRenderer: { lastState: {} }, Modal: { exportToCSV: jest.fn() } };
    global.chrome = { runtime: { getURL: (p) => p } };
    global.URL = { createObjectURL: jest.fn(() => 'blob:test'), revokeObjectURL: jest.fn() };
    global.Blob = jest.fn();
    global.localStorage = { getItem: jest.fn().mockReturnValue(null), setItem: jest.fn() };
    global.setInterval = jest.fn().mockReturnValue(42);
    global.clearInterval = jest.fn();
    global.setTimeout = jest.fn((fn) => { fn(); return 1; });

    const src = fs.readFileSync(path.resolve(__dirname, '..', 'modal.js'), 'utf8');
    const fn = new Function(src + '\nreturn Modal;');
    const Modal = fn();

    return { Modal, mockBody };
}

function makeState() {
    return {
        container: document.createElement('div'),
        backdrop: document.createElement('div'),
        table: document.createElement('table'),
        tbody: document.createElement('tbody'),
        accordionContainer: document.createElement('div'),
        backButton: document.createElement('button'),
    };
}

describe('Modal scroll lock', () => {
    let Modal, mockBody;

    beforeEach(() => {
        ({ Modal, mockBody } = createModalEnv());
    });

    afterEach(() => {
        delete global.App;
        delete global.chrome;
        delete global.URL;
        delete global.Blob;
    });

    test('setupModal sets body overflow to hidden', () => {
        Modal.setupModal(makeState(), []);
        expect(mockBody.style.overflow).toBe('hidden');
    });

    test('closeModal resets body overflow', () => {
        const container = { remove: jest.fn() };
        const backdrop = { remove: jest.fn() };
        mockBody.style.overflow = 'hidden';
        Modal.closeModal(container, backdrop, []);
        expect(mockBody.style.overflow).toBe('');
    });
});

describe('Modal ESC key handling', () => {
    let Modal, mockBody;

    beforeEach(() => {
        ({ Modal, mockBody } = createModalEnv());
    });

    afterEach(() => {
        delete global.App;
        delete global.chrome;
        delete global.URL;
        delete global.Blob;
    });

    test('setupModal registers a keydown listener', () => {
        Modal.setupModal(makeState(), []);
        const keydownCalls = global.document.addEventListener.mock.calls.filter(c => c[0] === 'keydown');
        expect(keydownCalls.length).toBe(1);
    });

    test('handleEscapeKey calls closeModal on Escape', () => {
        Modal.setupModal(makeState(), []);
        const spy = jest.spyOn(Modal, 'closeModal');
        Modal.handleEscapeKey({ key: 'Escape' });
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    test('handleEscapeKey ignores non-Escape keys', () => {
        Modal.setupModal(makeState(), []);
        const spy = jest.spyOn(Modal, 'closeModal');
        Modal.handleEscapeKey({ key: 'Enter' });
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    test('closeModal removes keydown listener', () => {
        Modal.setupModal(makeState(), []);
        const handler = Modal._escapeHandler;
        expect(handler).toBeTruthy();
        Modal.closeModal();
        expect(global.document.removeEventListener).toHaveBeenCalledWith('keydown', handler);
    });
});

describe('Modal close idempotency', () => {
    let Modal, mockBody;

    beforeEach(() => {
        ({ Modal, mockBody } = createModalEnv());
    });

    afterEach(() => {
        delete global.App;
        delete global.chrome;
        delete global.URL;
        delete global.Blob;
    });

    test('closeModal returns early when no container/backdrop stored', () => {
        Modal._container = null;
        Modal._backdrop = null;
        expect(() => Modal.closeModal()).not.toThrow();
    });

    test('calling closeModal twice does not throw', () => {
        Modal.setupModal(makeState(), []);
        Modal.closeModal();
        expect(() => Modal.closeModal()).not.toThrow();
    });

    test('closeModal clears stored references', () => {
        Modal.setupModal(makeState(), []);
        Modal.closeModal();
        expect(Modal._container).toBeNull();
        expect(Modal._backdrop).toBeNull();
        expect(Modal._escapeHandler).toBeNull();
    });
});

describe('Modal session watcher', () => {
    let Modal, mockBody;

    beforeEach(() => {
        ({ Modal, mockBody } = createModalEnv());
    });

    afterEach(() => {
        delete global.App;
        delete global.chrome;
        delete global.URL;
        delete global.Blob;
    });

    test('setupModal starts a session check interval', () => {
        Modal.setupModal(makeState(), []);
        expect(global.setInterval).toHaveBeenCalled();
        expect(Modal._sessionCheckInterval).toBe(42);
    });

    test('closeModal clears session check interval', () => {
        Modal.setupModal(makeState(), []);
        Modal.closeModal();
        expect(global.clearInterval).toHaveBeenCalledWith(42);
        expect(Modal._sessionCheckInterval).toBeNull();
    });
});

describe('Modal overlapping elements', () => {
    let Modal, mockBody;

    beforeEach(() => {
        ({ Modal, mockBody } = createModalEnv());
    });

    afterEach(() => {
        delete global.App;
        delete global.chrome;
        delete global.URL;
        delete global.Blob;
    });

    test('closeModal restores overlapping elements display', () => {
        const el = {
            style: { display: 'none' },
            dataset: { originalDisplay: 'block' },
        };
        const container = { remove: jest.fn() };
        const backdrop = { remove: jest.fn() };
        Modal.closeModal(container, backdrop, [el]);
        expect(el.style.display).toBe('block');
        expect(el.dataset.originalDisplay).toBeUndefined();
    });

    test('closeModal handles empty overlapping elements array', () => {
        const container = { remove: jest.fn() };
        const backdrop = { remove: jest.fn() };
        expect(() => Modal.closeModal(container, backdrop, [])).not.toThrow();
    });
});

describe('Modal.exportToCSV', () => {
    let Modal, mockBody;

    beforeEach(() => {
        ({ Modal, mockBody } = createModalEnv());
        global.App.Utils = {
            parseItinerary(itin) {
                if (!itin) return { nights: '-', destination: '-' };
                const match = itin.match(/^\s*(\d+)\s*N(?:IGHT|T)?S?\b[\s\-.,]*([\s\S]*)$/i);
                if (match) return { nights: match[1], destination: match[2] ? match[2].trim() || '-' : '-' };
                return { nights: '-', destination: itin };
            },
            computePerks() { return '-'; },
            getShipClass() { return '-'; },
            formatDate(d) { if (!d) return '-'; const [y,m,dy] = d.split('T')[0].split('-'); return `${m}/${dy}/${y.slice(-2)}`; },
            computeOfferValue() { return null; },
            formatOfferValue(v) { return v != null ? `$${v}` : '-'; },
            getIncludeTaxesAndFeesPreference() { return true; },
            computeUpgradePriceForColumn() { return null; },
        };
        global.App.AccordionBuilder = {
            createGroupedData(offers, key) {
                const groups = {};
                offers.forEach(o => {
                    const val = o.sailing[key] || 'Unknown';
                    if (!groups[val]) groups[val] = [];
                    groups[val].push(o);
                });
                return groups;
            },
        };
        global.App.ProfileIdMap = {};
        global.goboStorageGet = undefined;
    });

    afterEach(() => {
        delete global.App;
        delete global.chrome;
        delete global.URL;
        delete global.Blob;
        delete global.goboStorageGet;
    });

    test('creates CSV blob and triggers download', () => {
        const aElem = { href: '', download: '', click: jest.fn() };
        global.document.createElement = jest.fn((tag) => {
            if (tag === 'a') return aElem;
            return { appendChild: jest.fn(), style: { cssText: '', setProperty: jest.fn() }, classList: { add: jest.fn() }, setAttribute: jest.fn(), getAttribute: jest.fn(() => null), dataset: {} };
        });

        const state = {
            headers: [{ key: 'profile', label: 'Profile' }, { key: 'offerCode', label: 'Offer Code' }],
            sortedOffers: [{
                offer: {
                    campaignOffer: {
                        offerCode: 'TEST1',
                        startDate: '2025-01-01',
                        reserveByDate: '2025-02-01',
                        name: 'Test Offer',
                        tradeInValue: 100,
                    },
                },
                sailing: {
                    shipName: 'Icon',
                    sailDate: '2025-03-15',
                    departurePort: { name: 'Miami' },
                    itineraryDescription: '7 Nights Caribbean',
                    roomType: 'Interior',
                    isGOBO: false,
                    isGTY: false,
                    isDOLLARSOFF: false,
                    DOLLARSOFF_AMT: 0,
                    isFREEPLAY: false,
                    FREEPLAY_AMT: 0,
                },
            }],
            selectedProfileKey: 'gobo-testuser',
            viewMode: 'table',
            groupKeysStack: [],
            groupingStack: [],
        };

        Modal.exportToCSV(state);

        expect(global.Blob).toHaveBeenCalled();
        expect(aElem.click).toHaveBeenCalled();
        expect(aElem.download).toBe('offers.csv');
    });

    test('handles empty sortedOffers', () => {
        const aElem = { href: '', download: '', click: jest.fn() };
        global.document.createElement = jest.fn((tag) => {
            if (tag === 'a') return aElem;
            return { appendChild: jest.fn(), style: { cssText: '', setProperty: jest.fn() }, classList: { add: jest.fn() }, setAttribute: jest.fn(), getAttribute: jest.fn(() => null), dataset: {} };
        });

        const state = {
            headers: [{ key: 'profile', label: 'Profile' }],
            sortedOffers: [],
            selectedProfileKey: 'gobo-test',
            viewMode: 'table',
            groupKeysStack: [],
            groupingStack: [],
        };

        expect(() => Modal.exportToCSV(state)).not.toThrow();
        expect(global.Blob).toHaveBeenCalled();
    });

    test('CSV first header is overridden to Profile', () => {
        let csvContent = '';
        global.Blob = jest.fn((content) => { csvContent = content[0]; });
        const aElem = { href: '', download: '', click: jest.fn() };
        global.document.createElement = jest.fn((tag) => {
            if (tag === 'a') return aElem;
            return { appendChild: jest.fn(), style: { cssText: '', setProperty: jest.fn() }, classList: { add: jest.fn() }, setAttribute: jest.fn(), getAttribute: jest.fn(() => null), dataset: {} };
        });

        const state = {
            headers: [{ key: 'x', label: 'Something Else' }, { key: 'offerCode', label: 'Offer Code' }],
            sortedOffers: [],
            selectedProfileKey: 'gobo-test',
            viewMode: 'table',
            groupKeysStack: [],
            groupingStack: [],
        };

        Modal.exportToCSV(state);
        expect(csvContent).toContain('"Profile"');
    });

    test('exports accordion subset when group path is active', () => {
        let csvContent = '';
        global.Blob = jest.fn((content) => { csvContent = content[0]; });
        const aElem = { href: '', download: '', click: jest.fn() };
        global.document.createElement = jest.fn((tag) => {
            if (tag === 'a') return aElem;
            return { appendChild: jest.fn(), style: { cssText: '', setProperty: jest.fn() }, classList: { add: jest.fn() }, setAttribute: jest.fn(), getAttribute: jest.fn(() => null), dataset: {} };
        });

        const mkRow = (ship) => ({
            offer: { campaignOffer: { offerCode: 'X', startDate: '2025-01-01', reserveByDate: '2025-02-01', name: 'O', tradeInValue: 0 } },
            sailing: { shipName: ship, sailDate: '2025-03-15', departurePort: { name: 'Miami' }, itineraryDescription: '7N Car', roomType: 'Int', isGOBO: false, isGTY: false, isDOLLARSOFF: false, DOLLARSOFF_AMT: 0, isFREEPLAY: false, FREEPLAY_AMT: 0 },
        });

        const state = {
            headers: [{ key: 'profile', label: 'P' }],
            sortedOffers: [mkRow('Ship A'), mkRow('Ship A'), mkRow('Ship B')],
            selectedProfileKey: 'gobo-test',
            viewMode: 'accordion',
            groupKeysStack: ['Ship A'],
            groupingStack: ['shipName'],
        };

        Modal.exportToCSV(state);
        expect(csvContent).toContain('Filters:');
        expect(csvContent).toContain('Ship A');
    });

    test('shorten strips gobo- prefix from profile key', () => {
        let csvContent = '';
        global.Blob = jest.fn((content) => { csvContent = content[0]; });
        const aElem = { href: '', download: '', click: jest.fn() };
        global.document.createElement = jest.fn((tag) => {
            if (tag === 'a') return aElem;
            return { appendChild: jest.fn(), style: { cssText: '', setProperty: jest.fn() }, classList: { add: jest.fn() }, setAttribute: jest.fn(), getAttribute: jest.fn(() => null), dataset: {} };
        });

        const state = {
            headers: [{ key: 'p', label: 'P' }],
            sortedOffers: [{
                offer: { campaignOffer: { offerCode: 'X', startDate: '2025-01-01', reserveByDate: '2025-02-01', name: 'O', tradeInValue: 0 } },
                sailing: { shipName: 'S', sailDate: '2025-03-15', departurePort: { name: 'M' }, itineraryDescription: '7N C', roomType: 'I', isGOBO: false, isGTY: false, isDOLLARSOFF: false, DOLLARSOFF_AMT: 0, isFREEPLAY: false, FREEPLAY_AMT: 0 },
            }],
            selectedProfileKey: 'gobo-john_doe@test.com',
            viewMode: 'table',
            groupKeysStack: [],
            groupingStack: [],
        };

        Modal.exportToCSV(state);
        expect(csvContent).toContain('john');
        expect(csvContent).not.toContain('gobo-');
    });
});
