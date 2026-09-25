/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

// Verifies the mobile card view in features/cardView.js:
//   - render emits a card with .b2b-depth-cell, .gobo-itinerary-link, .gobo-offer-pdf-link;
//   - clicking the offer code button calls OfferPdf.open with that code;
//   - the toolbar carries a .gobo-card-filter button;
//   - openFilterSheet shows the panel in the card bar with no backdrop;
//   - openFilterSheet scaffolds the enabled panel (no stale disabled message, Add Field present);
//   - closeFilterSheet hides an empty editor and leaves applied filters visible;
//   - committed filters stay in the bar, not as pills and not behind a dimmer.
describe('cardView mobile card layout', () => {
    let CardView;
    let OfferPdfStub;
    let ItineraryCacheStub;
    let AppStub;
    let container;

    function makeState(over = {}) {
        const offer = {
            campaignOffer: {
                offerCode: '26TOR604',
                name: 'Play Your Way',
                startDate: '2026-01-01',
                reserveByDate: '2026-09-16',
                category: 'TEST',
            },
        };
        const sailing = {
            id: 's1',
            shipName: 'Test Ship',
            shipCode: 'TST',
            departurePort: { name: 'Test Port' },
            totalNights: 7,
            sailDate: '2026-11-16',
            roomType: 'Interior',
            isGTY: false,
            itineraryDescription: 'Test Itinerary',
        };
        return Object.assign({
            sortedOffers: [{ offer, sailing }],
            headers: [
                { key: 'offerDate', label: 'Offer Date' },
                { key: 'sailDate', label: 'Sail Date' },
            ],
            currentSortColumn: 'offerDate',
            currentSortOrder: 'asc',
            advancedSearch: { enabled: false, predicates: [] },
            advancedSearchPanel: null,
        }, over);
    }

    beforeEach(() => {
        window.matchMedia = (q) => ({
            matches: /max-width:\s*720px/.test(String(q)),
            media: String(q),
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            dispatchEvent() { return false; },
        });
        document.body.innerHTML = '';
        container = document.createElement('div');
        container.id = 'gobo-card-container';
        document.body.appendChild(container);

        const UtilsStub = {
            parseItinerary: () => ({ nights: 7, destination: 'Test Destination' }),
            computePerks: () => '',
            getShipClass: () => 'TEST',
            formatDate: (d) => d || '-',
            formatTradeValue: () => '-',
            computeOfferValue: () => 100,
            formatOfferValue: (v) => '$' + v,
            computeInteriorYouPayPrice: () => 100,
            formatUpgradePriceForColumn: () => '$100',
            getIncludeTaxesAndFeesPreference: () => true,
        };
        AppStub = {
            CurrentProfile: null,
            Utils: UtilsStub,
            TableRenderer: { lastState: null, updateB2BDepthCell: jest.fn(), getHiddenColumnsSet: () => null },
            AdvancedSearch: {
                scaffoldPanel: jest.fn(),
                restorePredicates: jest.fn(),
                updateBadge: jest.fn(),
                _removePredicate: jest.fn(),
            },
            SettingsStore: { getLayoutMode: () => 'cards' },
        };
        ItineraryCacheStub = { showModal: jest.fn() };
        const B2BUtilsStub = { buildB2BRowId: (offer, sailing, idx) => 'b2b-' + idx };
        OfferPdfStub = {
            heroFileUrl: () => '',
            heroSrc: () => Promise.resolve(''),
            open: jest.fn(),
        };
        window.BackToBackTool = {
            _selectedRowId: null,
            openByRowId: jest.fn(),
            attachToCell: jest.fn(),
        };

        const src = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'cardView.js'), 'utf8');
        const fn = new Function('Utils', 'App', 'ItineraryCache', 'B2BUtils', 'OfferPdf', src);
        fn(UtilsStub, AppStub, ItineraryCacheStub, B2BUtilsStub, OfferPdfStub);
        CardView = window.CardView;
    });

    afterEach(() => {
        delete window.BackToBackTool;
        delete window.CardView;
    });

    test('render emits a card with b2b-depth-cell, itinerary link, and offer-code link', () => {
        const state = makeState();
        CardView.render(container, state);
        const card = container.querySelector('.gobo-sailing-card');
        expect(card).not.toBeNull();
        expect(container.querySelector('.b2b-depth-cell')).not.toBeNull();
        expect(container.querySelector('.gobo-itinerary-link')).not.toBeNull();
        expect(container.querySelector('.gobo-card-code')).not.toBeNull();
        expect(container.querySelector('.gobo-card-date').textContent).toMatch(/Guest/);
        expect(container.querySelector('.gobo-card-details-toggle')).toBeNull();
    });

    test('same ship, destination, and offer share one card, and you-pay is not a delta', () => {
        const offer = {
            campaignOffer: {
                offerCode: '26TOR604',
                name: 'Play Your Way',
                startDate: '2026-01-01',
                reserveByDate: '2026-12-01',
                category: 'TEST',
            },
        };
        const sailing = (date) => ({
            id: date,
            shipName: 'Oasis of the Seas',
            shipCode: 'OA',
            departurePort: { name: 'Miami' },
            totalNights: 7,
            sailDate: date,
            roomType: 'Interior',
            isGTY: false,
            itineraryDescription: '7 Night Western Caribbean',
        });
        const state = makeState({
            sortedOffers: [
                { offer, sailing: sailing('2026-11-16') },
                { offer, sailing: sailing('2026-12-07') },
            ],
            currentSortColumn: 'interior',
            currentSortOrder: 'asc',
        });
        CardView.render(container, state);
        expect(container.querySelectorAll('.gobo-sailing-card')).toHaveLength(1);
        expect(container.querySelectorAll('.gobo-date-row')).toHaveLength(2);
        expect(container.querySelector('.gobo-perk')).toBeNull();
        const amounts = [...container.querySelectorAll('.gobo-youpay-val')].map(node => node.textContent);
        expect(amounts.length).toBeGreaterThan(0);
        amounts.forEach(text => expect(text.startsWith('+')).toBe(false));
    });

    test('changing the card sort is saved', () => {
        AppStub.SettingsStore.setCardSort = jest.fn();
        AppStub.TableRenderer.updateView = jest.fn();
        const prev = global.requestAnimationFrame;
        global.requestAnimationFrame = (fn) => fn();
        jest.useFakeTimers();
        CardView._applySort(makeState(), 'ship', 'desc');
        jest.runAllTimers();
        jest.useRealTimers();
        global.requestAnimationFrame = prev;
        expect(AppStub.SettingsStore.setCardSort).toHaveBeenCalledWith('ship', 'desc');
    });

    test('sort arrow toggles only up and down', () => {
        AppStub.SettingsStore.setCardSort = jest.fn();
        AppStub.TableRenderer.updateView = jest.fn();
        const prev = global.requestAnimationFrame;
        global.requestAnimationFrame = (fn) => fn();
        jest.useFakeTimers();
        CardView.render(container, makeState());
        const dir = container.querySelector('.gobo-card-sort-dir');
        expect(dir.textContent).toBe('\u2191');
        dir.click();
        jest.runAllTimers();
        expect(dir.textContent).toBe('\u2193');
        expect(AppStub.SettingsStore.setCardSort).toHaveBeenCalledWith('offerDate', 'desc');
        dir.click();
        jest.runAllTimers();
        expect(dir.textContent).toBe('\u2191');
        expect(AppStub.SettingsStore.setCardSort).toHaveBeenLastCalledWith('offerDate', 'asc');
        jest.useRealTimers();
        global.requestAnimationFrame = prev;
    });

    test('hero leads with destination or ship, whichever is the sort', () => {
        CardView.render(container, makeState({ currentSortColumn: 'destination' }));
        expect(container.querySelector('.gobo-card-ship').textContent).toBe('Test Destination');
        expect(container.querySelector('.gobo-hero-sub').textContent).toMatch(/^Test Ship/);
        container.innerHTML = '';
        CardView.render(container, makeState({ currentSortColumn: 'ship' }));
        expect(container.querySelector('.gobo-card-ship').textContent).toBe('Test Ship');
        expect(container.querySelector('.gobo-hero-sub').textContent).toMatch(/^Test Destination/);
        container.innerHTML = '';
        CardView.render(container, makeState({ currentSortColumn: 'offerDate' }));
        expect(container.querySelector('.gobo-card-ship').textContent).toBe('Test Destination');
    });

    test('itinerary control opens the itinerary popup for that sailing', () => {
        CardView.render(container, makeState());
        const link = container.querySelector('.gobo-itinerary-link');
        link.click();
        expect(ItineraryCacheStub.showModal).toHaveBeenCalledWith('SD_TST_2026-11-16', link);
    });

    test('clicking the offer code button calls OfferPdf.open with that code', () => {
        const state = makeState();
        CardView.render(container, state);
        const codeBtn = container.querySelector('.gobo-card-code');
        expect(codeBtn.textContent).toBe('26TOR604');
        codeBtn.click();
        expect(OfferPdfStub.open).toHaveBeenCalledWith('26TOR604', state);
    });

    test('toolbar has no Filters button and no Close', () => {
        const state = makeState({
            advancedSearch: { enabled: true, predicates: [{ id: 'p1', fieldKey: 'visits', values: ['ARUBA'], complete: true }] },
        });
        CardView.render(container, state);
        expect(container.querySelector('.gobo-card-filter')).toBeNull();
        expect(container.querySelector('.gobo-card-exit')).toBeNull();
        expect(container.querySelector('.gobo-card-filter-chips')).toBeNull();
    });

    test('openFilterSheet shows the panel with no backdrop; closeFilterSheet hides an empty editor', () => {
        const state = makeState();
        CardView.render(container, state);

        const panel = document.createElement('div');
        panel.id = 'advanced-search-panel';
        panel.classList.add('adv-collapsed');
        const header = document.createElement('div');
        header.className = 'adv-search-header';
        panel.appendChild(header);
        document.body.appendChild(panel);

        CardView.openFilterSheet(state);
        expect(panel.classList.contains('gobo-card-filter-sheet')).toBe(true);
        expect(panel.classList.contains('adv-collapsed')).toBe(false);
        expect(document.querySelector('.gobo-card-filter-backdrop')).toBeNull();
        expect(panel.parentElement).not.toBeNull();

        CardView.closeFilterSheet(state);
        expect(panel.classList.contains('adv-collapsed')).toBe(true);
        expect(state.advancedSearch.enabled).toBe(true);
    });

    test('openFilterSheet scaffolds the enabled panel into .breadcrumb-container (regression: disabled message, missing Add Field)', () => {
        // Real app DOM: body > #gobo-offers-table > .table-scroll-container > .breadcrumb-container > .breadcrumb-crumb-row
        const shell = document.createElement('div');
        shell.id = 'gobo-offers-table';
        shell.classList.add('gobo-layout-cards');
        const scroll = document.createElement('div');
        scroll.className = 'table-scroll-container';
        const bc = document.createElement('div');
        bc.className = 'breadcrumb-container';
        const crumbs = document.createElement('div');
        crumbs.className = 'breadcrumb-crumb-row';
        bc.appendChild(crumbs);
        scroll.appendChild(bc);
        shell.appendChild(scroll);
        document.body.appendChild(shell);

        // Real content-script reality: advancedSearch.js + advancedSearchAddField.js share one global lexical scope.
        const advSrc = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'advancedSearch.js'), 'utf8');
        const addSrc = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'advancedSearchAddField.js'), 'utf8');
        const realAdvancedSearch = new Function(advSrc + '\n' + addSrc + '\nreturn AdvancedSearch;')();
        AppStub.AdvancedSearch = realAdvancedSearch;

        const state = makeState({
            selectedProfileKey: 'test-profile',
            headers: [
                { key: 'offerDate', label: 'Offer Date' },
                { key: 'sailDate', label: 'Sail Date' },
                { key: 'ship', label: 'Ship' },
            ],
        });

        // Existing app state: the breadcrumb render already scaffolded the panel (disabled) into the container.
        realAdvancedSearch.scaffoldPanel(state, bc);
        const panel = document.getElementById('advanced-search-panel');
        expect(bc.contains(panel)).toBe(true);
        expect(panel.classList.contains('adv-collapsed')).toBe(false);

        CardView.openFilterSheet(state);

        expect(state.advancedSearch.enabled).toBe(true);
        expect(panel.classList.contains('gobo-card-filter-sheet')).toBe(true);
        expect(panel.parentElement).toBe(bc);
        // Stale disabled message is gone; the Add Field control is present.
        expect(panel.querySelector('.adv-search-disabled-msg')).toBeNull();
        expect(panel.querySelector('.adv-search-empty-inline')).not.toBeNull();
        expect(panel.querySelector('button.adv-add-field-btn')).not.toBeNull();
        const addBtn = panel.querySelector('button.adv-add-field-btn');
        addBtn.click();
        const popup = document.querySelector('.adv-add-field-popup');
        expect(popup).not.toBeNull();
        expect(popup.style.display).toBe('block');
        expect(popup.parentElement).toBe(shell);
        expect(panel.querySelector('select.adv-add-field-select')).not.toBeNull();
    });

    test('wide screens open the same in-flow filter bar', () => {
        window.matchMedia = (q) => ({
            matches: false,
            media: String(q),
            addEventListener() {},
            removeEventListener() {},
        });
        const shell = document.createElement('div');
        shell.id = 'gobo-offers-table';
        shell.classList.add('gobo-layout-cards');
        const bc = document.createElement('div');
        bc.className = 'breadcrumb-container';
        const panel = document.createElement('div');
        panel.id = 'advanced-search-panel';
        panel.classList.add('adv-collapsed');
        bc.appendChild(panel);
        shell.appendChild(bc);
        document.body.appendChild(shell);

        CardView.openFilterSheet(makeState());

        expect(panel.classList.contains('gobo-card-filter-sheet')).toBe(true);
        expect(panel.classList.contains('adv-collapsed')).toBe(false);
        expect(document.querySelector('.gobo-card-filter-backdrop')).toBeNull();
    });

    test('scaffoldPanel keeps the enable pass when the crumb row is nested (regression: body-level call)', () => {
        const shell = document.createElement('div');
        shell.id = 'gobo-offers-table';
        const scroll = document.createElement('div');
        scroll.className = 'table-scroll-container';
        const bc = document.createElement('div');
        bc.className = 'breadcrumb-container';
        const crumbs = document.createElement('div');
        crumbs.className = 'breadcrumb-crumb-row';
        bc.appendChild(crumbs);
        scroll.appendChild(bc);
        shell.appendChild(scroll);
        document.body.appendChild(shell);

        const advSrc = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'advancedSearch.js'), 'utf8');
        const addSrc = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'advancedSearchAddField.js'), 'utf8');
        const realAdvancedSearch = new Function(advSrc + '\n' + addSrc + '\nreturn AdvancedSearch;')();
        const state = makeState({ selectedProfileKey: 'test-profile-2' });

        realAdvancedSearch.scaffoldPanel(state, bc);
        const panel = document.getElementById('advanced-search-panel');
        expect(bc.contains(panel)).toBe(true);

        // The old openFilterSheet call passed document.body: with a nested crumb row, insertBefore used to
        // throw NotFoundError and skip the enable/render pass.
        state.advancedSearch.enabled = true;
        realAdvancedSearch.scaffoldPanel(state, document.body);
        expect(panel.classList.contains('enabled')).toBe(true);
    });


    test('scaffoldPanel parks the card sheet under the profile row', () => {
        const shell = document.createElement('div');
        shell.id = 'gobo-offers-table';
        shell.classList.add('gobo-layout-cards');
        const bc = document.createElement('div');
        bc.className = 'breadcrumb-container';
        const tabs = document.createElement('div');
        tabs.className = 'breadcrumb-tabs-row gobo-profile-combo';
        bc.appendChild(tabs);
        shell.appendChild(bc);
        document.body.appendChild(shell);

        const advSrc = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'advancedSearch.js'), 'utf8');
        const addSrc = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'advancedSearchAddField.js'), 'utf8');
        const realAdvancedSearch = new Function(advSrc + '\n' + addSrc + '\nreturn AdvancedSearch;')();

        const panel = document.createElement('div');
        panel.id = 'advanced-search-panel';
        shell.appendChild(panel);

        realAdvancedSearch.scaffoldPanel(makeState({ advancedSearch: { enabled: false, predicates: [] } }), bc);
        expect(panel.previousSibling).toBe(tabs);
        expect(panel.classList.contains('gobo-card-filter-sheet')).toBe(true);
        expect(panel.classList.contains('adv-collapsed')).toBe(false);
    });

    test('card render does not hide an open filter sheet', () => {
        const shell = document.createElement('div');
        shell.id = 'gobo-offers-table';
        shell.classList.add('gobo-layout-cards');
        const bc = document.createElement('div');
        bc.className = 'breadcrumb-container';
        const tabs = document.createElement('div');
        tabs.className = 'breadcrumb-tabs-row';
        bc.appendChild(tabs);
        shell.appendChild(bc);
        const cards = document.createElement('div');
        shell.appendChild(cards);
        const panel = document.createElement('div');
        panel.id = 'advanced-search-panel';
        panel.classList.add('gobo-card-filter-sheet');
        bc.appendChild(panel);

        CardView.render(cards, makeState({
            advancedSearch: { enabled: true, predicates: [{ id: 'p1', fieldKey: 'visits', values: ['ARUBA'], complete: true }] },
        }));
        expect(cards.querySelector('.gobo-card-filter')).toBeNull();
        expect(panel.parentElement).toBe(bc);
        expect(panel.classList.contains('adv-collapsed')).toBe(false);
    });
});
