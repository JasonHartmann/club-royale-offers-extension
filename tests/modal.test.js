const fs = require('fs');
const path = require('path');

describe('Modal scroll lock', () => {
    let Modal;
    let mockBody;

    beforeEach(() => {
        // Minimal DOM stubs for node environment
        mockBody = {
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
        global.URL = { createObjectURL: jest.fn(), revokeObjectURL: jest.fn() };
        global.Blob = jest.fn();
        global.localStorage = { getItem: jest.fn().mockReturnValue(null), setItem: jest.fn() };
        global.setInterval = jest.fn().mockReturnValue(1);
        global.clearInterval = jest.fn();
        global.setTimeout = jest.fn();

        const src = fs.readFileSync(path.resolve(__dirname, '..', 'modal.js'), 'utf8');
        const fn = new Function(src + '\nreturn Modal;');
        Modal = fn();
    });

    afterEach(() => {
        delete global.App;
        delete global.chrome;
        delete global.URL;
        delete global.Blob;
    });

    test('setupModal sets body overflow to hidden', () => {
        const state = {
            container: document.createElement('div'),
            backdrop: document.createElement('div'),
            table: document.createElement('table'),
            tbody: document.createElement('tbody'),
            accordionContainer: document.createElement('div'),
            backButton: document.createElement('button'),
        };

        Modal.setupModal(state, []);

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
