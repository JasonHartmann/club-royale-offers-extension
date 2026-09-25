/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

describe('cards sort', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'tableRenderer.js'), 'utf8');
    const TableRenderer = new Function(src + '\nreturn TableRenderer;')();

    function store(layout, saved) {
        global.App = {
            SettingsStore: {
                getLayoutMode: () => layout,
                getCardSort: () => saved.column ? { column: saved.column, order: saved.order } : { column: 'destination', order: 'asc' },
            },
        };
    }

    test('cards default to destination and leave the table sort alone', () => {
        store('cards', {});
        const state = { viewMode: 'table', currentSortColumn: 'offerDate', currentSortOrder: 'desc' };
        TableRenderer._applyLayoutSort(state);
        expect(state.currentSortColumn).toBe('destination');
        expect(state.currentSortOrder).toBe('asc');
        expect(state._tableSort).toEqual({ column: 'offerDate', order: 'desc' });

        store('cards', { column: 'ship', order: 'desc' });
        TableRenderer._applyLayoutSort(state);
        expect(state.currentSortColumn).toBe('ship');
        expect(state.currentSortOrder).toBe('desc');
        expect(state._tableSort.column).toBe('offerDate');

        store('table', { column: 'ship', order: 'desc' });
        TableRenderer._applyLayoutSort(state);
        expect(state.currentSortColumn).toBe('offerDate');
        expect(state.currentSortOrder).toBe('desc');
        expect(state._tableSort).toBeUndefined();
    });
});
