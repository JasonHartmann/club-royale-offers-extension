/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

// Verifies the header sort-click behavior:
//   - the spinner is shown on EVERY sort click (not just B2B),
//   - the heavy updateView is deferred (so the spinner can paint first),
//   - the spinner is hidden after updateView completes,
//   - the sort state is updated correctly.
describe('tableBuilder sort click spinner', () => {
    let TableBuilder;
    let updateView;
    let showSpinner;
    let hideSpinner;
    let rafCallbacks;

    beforeEach(() => {
        document.body.innerHTML = '';
        // Capture requestAnimationFrame callbacks so we control when the deferred
        // work runs (jsdom's rAF is not timer-driven).
        rafCallbacks = [];
        global.requestAnimationFrame = (cb) => { rafCallbacks.push(cb); return rafCallbacks.length; };

        updateView = jest.fn();
        showSpinner = jest.fn();
        hideSpinner = jest.fn();
        // Content-script reality: `const Spinner` is in lexical scope, NOT on window.
        // Passing it as a Function argument — not global.Spinner — so a
        // `window.Spinner` check cannot accidentally pass this test.
        const spinner = { showSpinner, hideSpinner };
        global.App = {
            TableRenderer: {
                updateView,
                updateBreadcrumb: jest.fn(),
                currentSwitchToken: 'token-1',
                isB2BDepthPending: () => false,
                hasComputedB2BDepths: () => true,
                waitForB2BDepths: async () => {},
            },
        };

        const src = fs.readFileSync(path.resolve(__dirname, '..', 'tableBuilder.js'), 'utf8');
        const fn = new Function('Spinner', src + '\nreturn TableBuilder;');
        TableBuilder = fn(spinner);
    });

    afterEach(() => {
        delete global.App;
        delete global.requestAnimationFrame;
    });

    function makeState() {
        return {
            headers: [
                { key: 'ship', label: 'Ship' },
                { key: 'b2bDepth', label: 'B2B Depth' },
            ],
            currentSortColumn: null,
            currentSortOrder: null,
            groupingStack: [],
            groupKeysStack: [],
            viewMode: 'table',
            sortedOffers: [],
        };
    }

    function clickSortLabel(state, key) {
        const thead = TableBuilder.createTableHeader(state);
        document.body.appendChild(thead);
        const th = thead.querySelector(`th[data-key="${key}"]`);
        const label = th.querySelector('.sort-label');
        label.click();
    }

    function clickGroupIcon(state, key) {
        const thead = TableBuilder.createTableHeader(state);
        document.body.appendChild(thead);
        const th = thead.querySelector(`th[data-key="${key}"]`);
        const icon = th.querySelector('.group-icon');
        icon.click();
    }

    // Run the captured rAF callbacks (which schedule the setTimeout(doWork, 0)).
    function flushRaf() {
        const cbs = rafCallbacks.splice(0);
        cbs.forEach((cb) => cb());
    }

    test('shows spinner on a non-b2b sort click, defers updateView, hides after', async () => {
        const state = makeState();
        clickSortLabel(state, 'ship');

        // Spinner shown synchronously on click.
        expect(showSpinner).toHaveBeenCalledTimes(1);
        // updateView is deferred, not called synchronously.
        expect(updateView).not.toHaveBeenCalled();
        // Sort state updated immediately.
        expect(state.currentSortColumn).toBe('ship');
        expect(state.currentSortOrder).toBe('asc');

        // Flush the deferred work.
        flushRaf();
        await new Promise((r) => setTimeout(r, 0));

        expect(updateView).toHaveBeenCalledTimes(1);
        expect(hideSpinner).toHaveBeenCalledTimes(1);
    });

    test('shows spinner on a b2b sort click too (depths already computed)', async () => {
        const state = makeState();
        clickSortLabel(state, 'b2bDepth');

        expect(showSpinner).toHaveBeenCalledTimes(1);
        expect(updateView).not.toHaveBeenCalled();
        expect(state.currentSortColumn).toBe('b2bDepth');

        flushRaf();
        await new Promise((r) => setTimeout(r, 0));

        expect(updateView).toHaveBeenCalledTimes(1);
        expect(hideSpinner).toHaveBeenCalledTimes(1);
    });

    test('cycles sort order asc -> desc -> original on repeated clicks', async () => {
        const state = makeState();
        clickSortLabel(state, 'ship');
        flushRaf();
        await new Promise((r) => setTimeout(r, 0));
        expect(state.currentSortOrder).toBe('asc');

        clickSortLabel(state, 'ship');
        flushRaf();
        await new Promise((r) => setTimeout(r, 0));
        expect(state.currentSortOrder).toBe('desc');

        clickSortLabel(state, 'ship');
        flushRaf();
        await new Promise((r) => setTimeout(r, 0));
        expect(state.currentSortOrder).toBe('original');
    });

    test('b2b sort waits for pending depths before deferring updateView', async () => {
        let resolveWait;
        global.App.TableRenderer.isB2BDepthPending = () => true;
        global.App.TableRenderer.waitForB2BDepths = () => new Promise((r) => { resolveWait = r; });

        const state = makeState();
        clickSortLabel(state, 'b2bDepth');

        // Spinner shown synchronously; updateView still waiting on depths.
        expect(showSpinner).toHaveBeenCalledTimes(1);
        expect(updateView).not.toHaveBeenCalled();

        resolveWait();
        // Let the async handler resume and schedule the deferred work.
        await new Promise((r) => setTimeout(r, 0));
        flushRaf();
        await new Promise((r) => setTimeout(r, 0));

        expect(updateView).toHaveBeenCalledTimes(1);
        expect(hideSpinner).toHaveBeenCalledTimes(1);
    });
    test('group icon click shows spinner, defers updateView, enters accordion view', async () => {
        const state = makeState();
        clickGroupIcon(state, 'ship');

        // Spinner shown synchronously on click.
        expect(showSpinner).toHaveBeenCalledTimes(1);
        // updateView is deferred, not called synchronously.
        expect(updateView).not.toHaveBeenCalled();
        // Accordion state set immediately.
        expect(state.viewMode).toBe('accordion');
        expect(state.groupingStack).toEqual(['ship']);
        expect(state.groupKeysStack).toEqual([]);

        // Flush the deferred work.
        flushRaf();
        await new Promise((r) => setTimeout(r, 0));

        expect(updateView).toHaveBeenCalledTimes(1);
        expect(global.App.TableRenderer.updateBreadcrumb).toHaveBeenCalledTimes(1);
        expect(hideSpinner).toHaveBeenCalledTimes(1);
    });

});
