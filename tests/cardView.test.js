/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

// Verifies the mobile card view in features/cardView.js:
//   - render emits a card with .b2b-depth-cell, .gobo-itinerary-link, .gobo-offer-pdf-link;
//   - clicking the offer code button calls OfferPdf.open with that code;
//   - the toolbar carries a .gobo-card-filter button;
//   - openFilterSheet expands #advanced-search-panel (drops adv-collapsed, adds gobo-card-filter-sheet + backdrop);
//   - openFilterSheet scaffolds the enabled panel into .breadcrumb-container (no stale disabled message, Add Field present);
//   - closeFilterSheet re-collapses the panel and leaves state.advancedSearch.enabled true;
//   - a committed filter chip's × button calls AdvancedSearch._removePredicate.
describe('cardView mobile card layout', () => {
    let CardView;
    let OfferPdfStub;
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
        const ItineraryCacheStub = { showModal: jest.fn() };
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
    });

    test('clicking the offer code button calls OfferPdf.open with that code', () => {
        const state = makeState();
        CardView.render(container, state);
        const codeBtn = container.querySelector('.gobo-card-code');
        expect(codeBtn.textContent).toBe('26TOR604');
        codeBtn.click();
        expect(OfferPdfStub.open).toHaveBeenCalledWith('26TOR604', state);
    });

    test('toolbar carries a .gobo-card-filter button', () => {
        const state = makeState();
        CardView.render(container, state);
        expect(container.querySelector('.gobo-card-filter')).not.toBeNull();
    });

    test('openFilterSheet expands the panel and adds a backdrop; closeFilterSheet re-collapses and keeps advancedSearch enabled', () => {
        const state = makeState();
        CardView.render(container, state);

        // Scaffold the advanced-search panel (as App.AdvancedSearch would).
        const panel = document.createElement('div');
        panel.id = 'advanced-search-panel';
        panel.classList.add('adv-collapsed');
        const header = document.createElement('div');
        header.className = 'adv-search-header';
        header.textContent = 'Advanced Search';
        panel.appendChild(header);
        document.body.appendChild(panel);

        CardView.openFilterSheet(state);
        expect(panel.classList.contains('gobo-card-filter-sheet')).toBe(true);
        expect(panel.classList.contains('adv-collapsed')).toBe(false);
        expect(document.querySelector('.gobo-card-filter-backdrop')).not.toBeNull();
        expect(panel.querySelector('.gobo-card-filter-done')).not.toBeNull();

        CardView.closeFilterSheet(state);
        expect(panel.classList.contains('adv-collapsed')).toBe(true);
        expect(document.querySelector('.gobo-card-filter-backdrop')).toBeNull();
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
        expect(panel.querySelector('.adv-search-disabled-msg')).not.toBeNull();

        // User clicks Filters.
        CardView.openFilterSheet(state);

        expect(state.advancedSearch.enabled).toBe(true);
        expect(panel.classList.contains('gobo-card-filter-sheet')).toBe(true);
        // Panel stays inside the breadcrumb container (descendant of #gobo-offers-table, where the sheet CSS matches).
        expect(bc.contains(panel)).toBe(true);
        // Stale disabled message is gone; the Add Field control is present.
        expect(panel.querySelector('.adv-search-disabled-msg')).toBeNull();
        expect(panel.querySelector('.adv-search-empty-inline')).not.toBeNull();
        expect(panel.querySelector('button.adv-add-field-btn')).not.toBeNull();
        expect(panel.querySelector('select.adv-add-field-select')).not.toBeNull();
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

    test('a committed filter chip renders and its × button calls _removePredicate', () => {
        const pred = { id: 'p1', field: 'ship', values: [{ label: 'Test Ship' }], complete: true };
        const state = makeState({ advancedSearch: { enabled: true, predicates: [pred] } });
        CardView.render(container, state);
        const chip = container.querySelector('.gobo-card-filter-chip');
        expect(chip).not.toBeNull();
        const x = chip.querySelector('.gobo-card-filter-chip-x');
        expect(x).not.toBeNull();
        x.click();
        expect(AppStub.AdvancedSearch._removePredicate).toHaveBeenCalledWith(pred, state);
    });
});
