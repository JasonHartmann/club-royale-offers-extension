/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

describe('DOMUtils', () => {
    let DOMUtils;
    let addButton;
    let injectStylesheet;
    let offerCodeInit;

    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = '';
        document.head.innerHTML = '';

        addButton = jest.fn();
        injectStylesheet = jest.fn();
        offerCodeInit = jest.fn();

        global.App = {
            ButtonManager: { addButton },
            Styles: { injectStylesheet },
            OfferCodeLookup: { init: offerCodeInit }
        };

        const src = fs.readFileSync(path.resolve(__dirname, '..', 'utils', 'domUtils.js'), 'utf8');
        const fn = new Function(src + '\nreturn DOMUtils;');
        DOMUtils = fn();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        delete global.App;
    });

    test('schedules late injection retries', () => {
        DOMUtils._onDomReady();

        expect(injectStylesheet).toHaveBeenCalledTimes(1);
        expect(addButton).toHaveBeenCalledTimes(1);
        expect(offerCodeInit).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(1500);
        expect(addButton).toHaveBeenCalledTimes(2);

        jest.advanceTimersByTime(2500);
        expect(addButton).toHaveBeenCalledTimes(3);
    });

    test('retries on visibility change', () => {
        Object.defineProperty(document, 'visibilityState', {
            value: 'visible',
            configurable: true
        });

        DOMUtils._onDomReady();
        const callsAfterReady = addButton.mock.calls.length;

        document.dispatchEvent(new Event('visibilitychange'));
        expect(addButton.mock.calls.length).toBeGreaterThan(callsAfterReady);
    });

    test('reattaches observer when body changes', () => {
        const observeCalls = [];
        const disconnectCalls = [];

        global.MutationObserver = class {
            constructor() {}
            observe(target) {
                observeCalls.push(target);
            }
            disconnect() {
                disconnectCalls.push(true);
            }
        };

        const originalBody = document.body;
        DOMUtils.observeDomChanges();
        expect(observeCalls[0]).toBe(originalBody);

        const newBody = document.createElement('body');
        Object.defineProperty(document, 'body', {
            value: newBody,
            configurable: true
        });

        DOMUtils.observeDomChanges();
        expect(disconnectCalls.length).toBe(1);
        expect(observeCalls[1]).toBe(newBody);
    });
});