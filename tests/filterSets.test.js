/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

// Verifies named filter sets in features/advancedSearch.js:
//   - saveCurrentFilterSet stores only committed predicates under the prompted name;
//   - saving again with the same name overwrites rather than duplicates;
//   - applyFilterSet hydrates state predicates (fresh unique ids, includeTaxes restored);
//   - deleteFilterSet removes one set and keeps the rest;
//   - renderFilterSetsControls appends a select + save + delete control listing the sets.
function loadAdvancedSearch(get, set) {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'advancedSearch.js'), 'utf8');
    const fn = new Function('goboStorageGet', 'goboStorageSet', src + '\nreturn AdvancedSearch;');
    return fn(get, set);
}

describe('named filter sets', () => {
    let store, AdvancedSearch, state;
    let origPrompt, origConfirm, origAlert;

    beforeEach(() => {
        store = {};
        AdvancedSearch = loadAdvancedSearch(
            (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
            (k, v) => { store[k] = String(v); }
        );
        // isolate the data logic from the DOM-heavy methods
        AdvancedSearch.renderPredicates = () => {};
        AdvancedSearch.lightRefresh = () => {};
        AdvancedSearch.updateBadge = () => {};
        AdvancedSearch.persistPredicates = () => {};
        AdvancedSearch.buildHeader = () => {};
        state = {
            advancedSearch: { enabled: true, includeTaxesAndFeesInPriceFilters: true, predicates: [] },
            advancedSearchPanel: null,
        };
        origPrompt = window.prompt; origConfirm = window.confirm; origAlert = window.alert;
        window.prompt = () => 'My set';
        window.confirm = () => true;
        window.alert = () => {};
    });

    afterEach(() => {
        window.prompt = origPrompt; window.confirm = origConfirm; window.alert = origAlert;
    });

    test('saveCurrentFilterSet stores only committed predicates under the prompted name', () => {
        state.advancedSearch.predicates = [
            { id: 'a', fieldKey: 'nights', operator: 'greater than', values: ['6'], complete: true },
            { id: 'b', fieldKey: 'class', operator: 'in', values: ['BALCONY'], complete: true },
            { id: 'c', fieldKey: 'ship', operator: 'in', values: ['X'], complete: false },
        ];
        AdvancedSearch.saveCurrentFilterSet(state);
        const sets = AdvancedSearch.loadFilterSets();
        expect(sets).toHaveLength(1);
        expect(sets[0].name).toBe('My set');
        expect(sets[0].predicates).toHaveLength(2);
        expect(sets[0].predicates.every(p => p.complete)).toBe(true);
        expect(sets[0].predicates.map(p => p.fieldKey).sort()).toEqual(['class', 'nights']);
    });

    test('saveCurrentFilterSet overwrites an existing set with the same name', () => {
        state.advancedSearch.predicates = [{ id: 'a', fieldKey: 'nights', operator: 'greater than', values: ['6'], complete: true }];
        AdvancedSearch.saveCurrentFilterSet(state);
        state.advancedSearch.predicates = [
            { id: 'x', fieldKey: 'class', operator: 'in', values: ['SUITE'], complete: true },
            { id: 'y', fieldKey: 'nights', operator: 'less than', values: ['5'], complete: true },
        ];
        AdvancedSearch.saveCurrentFilterSet(state);
        const sets = AdvancedSearch.loadFilterSets();
        expect(sets).toHaveLength(1);
        expect(sets[0].predicates).toHaveLength(2);
    });

    test('applyFilterSet hydrates state predicates from the saved set with fresh unique ids', () => {
        state.advancedSearch.predicates = [
            { id: 'a', fieldKey: 'nights', operator: 'greater than', values: ['6'], complete: true },
            { id: 'b', fieldKey: 'class', operator: 'in', values: ['BALCONY'], complete: true },
        ];
        AdvancedSearch.saveCurrentFilterSet(state);
        const setId = AdvancedSearch.loadFilterSets()[0].id;
        state.advancedSearch.predicates = [];
        state.advancedSearch.includeTaxesAndFeesInPriceFilters = false;
        AdvancedSearch.applyFilterSet(state, setId);
        expect(state.advancedSearch.enabled).toBe(true);
        expect(state.advancedSearch.predicates).toHaveLength(2);
        expect(state.advancedSearch.predicates.every(p => p.complete)).toBe(true);
        expect(state.advancedSearch.includeTaxesAndFeesInPriceFilters).toBe(true);
        expect(new Set(state.advancedSearch.predicates.map(p => p.id)).size).toBe(2);
    });

    test('deleteFilterSet removes the named set and keeps the rest', () => {
        state.advancedSearch.predicates = [{ id: 'a', fieldKey: 'nights', operator: 'greater than', values: ['6'], complete: true }];
        AdvancedSearch.saveCurrentFilterSet(state);
        window.prompt = () => 'Second';
        state.advancedSearch.predicates = [{ id: 'b', fieldKey: 'class', operator: 'in', values: ['SUITE'], complete: true }];
        AdvancedSearch.saveCurrentFilterSet(state);
        expect(AdvancedSearch.loadFilterSets()).toHaveLength(2);
        const toDelete = AdvancedSearch.loadFilterSets().find(s => s.name === 'Second').id;
        AdvancedSearch.deleteFilterSet(state, toDelete);
        const remaining = AdvancedSearch.loadFilterSets();
        expect(remaining).toHaveLength(1);
        expect(remaining[0].name).toBe('My set');
    });

    test('renderFilterSetsControls appends a select, save, and delete control listing the sets', () => {
        state.advancedSearch.predicates = [{ id: 'a', fieldKey: 'nights', operator: 'greater than', values: ['6'], complete: true }];
        AdvancedSearch.saveCurrentFilterSet(state);
        const header = document.createElement('div');
        header.className = 'adv-search-header';
        document.body.appendChild(header);
        AdvancedSearch.renderFilterSetsControls(state, header);
        expect(header.querySelector('.adv-sets-select')).not.toBeNull();
        expect(header.querySelector('.adv-sets-save-btn')).not.toBeNull();
        expect(header.querySelector('.adv-sets-del-btn')).not.toBeNull();
        const names = [...header.querySelector('.adv-sets-select').options].map(o => o.textContent);
        expect(names).toContain('My set');
    });
});
