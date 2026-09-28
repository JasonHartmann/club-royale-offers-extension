/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

function loadWhatsNew() {
    document.body.innerHTML = '';
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'whatsNew.js'), 'utf8');
    new Function(src)();
    return window.WhatsNew;
}

function armTour(wn) {
    const anchors = ['a', 'b', 'c'].map((id) => {
        const el = document.createElement('button');
        el.id = 'step-' + id;
        el.textContent = id;
        document.body.appendChild(el);
        return el;
    });
    wn._steps = anchors.map((el, i) => ({
        title: 'Step ' + (i + 1),
        body: 'Body ' + (i + 1),
        target: () => el,
    }));
    wn._buildOverlay();
    wn._currentStepIndex = -1;
    wn._hasRenderedOnce = false;
    wn._animating = false;
    wn._pendingNext = 0;
    wn._motionToken = 0;
    return anchors;
}

describe("What's New next() and Enter", () => {
    test('a click during the fade is queued and Done still finishes', async () => {
        const wn = loadWhatsNew();
        armTour(wn);
        let release;
        let fadeIns = 0;
        wn._fadeOutTooltip = () => Promise.resolve();
        wn._fadeInTooltip = () => {
            fadeIns += 1;
            if (fadeIns === 1) return new Promise((resolve) => { release = resolve; });
            return Promise.resolve();
        };

        const first = wn.next();
        for (let i = 0; i < 20 && !release; i++) await Promise.resolve();
        expect(wn._animating).toBe(true);
        expect(wn._currentStepIndex).toBe(0);
        wn.next();
        expect(wn._pendingNext).toBe(1);
        expect(wn._currentStepIndex).toBe(0);

        wn._currentStepIndex = wn._steps.length - 1;
        wn.next();
        expect(document.getElementById('gobo-whatsnew-overlay')).toBeNull();
        expect(wn._animating).toBe(false);
        expect(wn._pendingNext).toBe(0);
        release();
        await first;
        expect(document.getElementById('gobo-whatsnew-overlay')).toBeNull();
    });

    test('queued Next advances after the fade when it is not the last step', async () => {
        const wn = loadWhatsNew();
        armTour(wn);
        let release;
        let fadeIns = 0;
        wn._fadeOutTooltip = () => Promise.resolve();
        wn._fadeInTooltip = () => {
            fadeIns += 1;
            if (fadeIns === 1) return new Promise((resolve) => { release = resolve; });
            return Promise.resolve();
        };
        const first = wn.next();
        for (let i = 0; i < 20 && !release; i++) await Promise.resolve();
        wn.next();
        expect(wn._pendingNext).toBe(1);
        release();
        await first;
        expect(wn._currentStepIndex).toBe(1);
        expect(wn._tooltip.querySelector('.gobo-whatsnew-title').textContent).toBe('Step 2');
        expect(wn._animating).toBe(false);
        expect(wn._pendingNext).toBe(0);
    });

    test('Enter advances only when focus is inside the tour', async () => {
        const wn = loadWhatsNew();
        armTour(wn);
        wn._currentStepIndex = 0;
        wn._hasRenderedOnce = true;
        let started = 0;
        wn._fadeOutTooltip = () => {
            started += 1;
            return new Promise(() => {});
        };
        wn._renderStep();

        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();
        const fromInput = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        input.dispatchEvent(fromInput);
        expect(started).toBe(0);
        expect(fromInput.defaultPrevented).toBe(false);

        const area = document.createElement('textarea');
        document.body.appendChild(area);
        area.focus();
        const fromArea = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        area.dispatchEvent(fromArea);
        expect(started).toBe(0);
        expect(fromArea.defaultPrevented).toBe(false);

        wn._tooltip.tabIndex = 0;
        wn._tooltip.focus();
        const inside = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        wn._tooltip.dispatchEvent(inside);
        expect(started).toBe(1);
        expect(inside.defaultPrevented).toBe(true);

        wn.finish();
        const spy = jest.spyOn(wn, 'next');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        expect(spy).not.toHaveBeenCalled();
    });
});
