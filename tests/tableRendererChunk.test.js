/** @jest-environment jsdom */
const TableRenderer = require('../tableRenderer');

describe('table chunk listener and card resize pause', () => {
    let layoutMode;
    let cardView;
    let chunkListeners;

    function makeState() {
        return {
            originalOffers: [{ offer: { campaignOffer: { offerCode: 'A' } }, sailing: { sailDate: '2026-01-01' } }],
            sortedOffers: [],
            viewMode: 'table',
            currentSortColumn: 'offerDate',
            currentSortOrder: 'original',
            groupingStack: [],
            groupKeysStack: [],
            headers: [],
            table: document.createElement('table'),
            thead: document.createElement('thead'),
            tbody: document.createElement('tbody'),
            accordionContainer: document.createElement('div'),
            cardContainer: document.createElement('div'),
            selectedProfileKey: 'gobo-R-test',
            advancedSearch: { enabled: false, predicates: [] },
        };
    }

    beforeEach(() => {
        document.body.innerHTML = '';
        layoutMode = 'cards';
        cardView = {
            render: jest.fn(),
            resumeResizeObserver: jest.fn(),
            pauseResizeObserver: jest.fn(),
            hideCards: jest.fn(),
        };
        chunkListeners = [];
        const add = document.addEventListener.bind(document);
        const remove = document.removeEventListener.bind(document);
        jest.spyOn(document, 'addEventListener').mockImplementation((type, fn, opts) => {
            if (type === 'tableChunkRendered') chunkListeners.push(fn);
            return add(type, fn, opts);
        });
        jest.spyOn(document, 'removeEventListener').mockImplementation((type, fn, opts) => {
            if (type === 'tableChunkRendered') {
                const idx = chunkListeners.lastIndexOf(fn);
                if (idx >= 0) chunkListeners.splice(idx, 1);
            }
            return remove(type, fn, opts);
        });
        global.preserveSelectedProfileKey = (state) => state;
        global.Filtering = {
            loadHiddenGroups: () => [],
            filterOffers: (state, offers) => offers || [],
        };
        global.Breadcrumbs = { updateBreadcrumb() {} };
        global.App = {
            BackToBackAutoRun: false,
            SettingsStore: {
                getLayoutMode: () => layoutMode,
                getHiddenColumns: () => [],
                getSoloBooking: () => false,
                getIncludeTaxesAndFeesInPriceFilters: () => true,
                getCardSort: () => ({ column: 'destination', order: 'asc' }),
                getAutoRunB2B: () => false,
            },
            TableRenderer,
            CardView: cardView,
            SortUtils: { sortOffers: (rows) => rows },
            TableBuilder: { renderTable: jest.fn() },
            CurrentProfile: null,
        };
        const shell = document.createElement('div');
        shell.id = 'gobo-offers-table';
        document.body.appendChild(shell);
        TableRenderer._tableChunkListener = null;
    });

    afterEach(() => {
        jest.restoreAllMocks();
        delete global.preserveSelectedProfileKey;
        delete global.Filtering;
        delete global.Breadcrumbs;
        delete global.App;
        TableRenderer._tableChunkListener = null;
    });

    test('cards and table renders keep a single tableChunkRendered listener', () => {
        const state = makeState();
        TableRenderer.updateView(state);
        TableRenderer.updateView(state);
        expect(chunkListeners).toHaveLength(1);
        expect(cardView.resumeResizeObserver).toHaveBeenCalledWith(state.cardContainer);
        expect(cardView.render).toHaveBeenCalledTimes(2);

        const cardSpy = jest.spyOn(state.cardContainer, 'querySelectorAll');
        document.dispatchEvent(new CustomEvent('tableChunkRendered'));
        expect(cardSpy).toHaveBeenCalledTimes(1);

        layoutMode = 'table';
        TableRenderer.updateView(state);
        expect(cardView.pauseResizeObserver).toHaveBeenCalled();
        expect(chunkListeners).toHaveLength(1);
        cardSpy.mockClear();
        const bodySpy = jest.spyOn(state.tbody, 'querySelectorAll');
        document.dispatchEvent(new CustomEvent('tableChunkRendered'));
        expect(cardSpy).not.toHaveBeenCalled();
        expect(bodySpy).toHaveBeenCalledTimes(2);

        TableRenderer.updateView(state);
        expect(chunkListeners).toHaveLength(1);
    });
});
