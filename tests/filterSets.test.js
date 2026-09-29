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

    test('applyFilterSet marks the set applied and the dropdown pre-selects it', () => {
        state.advancedSearch.predicates = [{ id: 'a', fieldKey: 'nights', operator: 'greater than', values: ['6'], complete: true }];
        AdvancedSearch.saveCurrentFilterSet(state);
        const setId = AdvancedSearch.loadFilterSets()[0].id;
        AdvancedSearch.applyFilterSet(state, setId);
        expect(state._advAppliedSetId).toBe(setId);
        const header = document.createElement('div');
        header.className = 'adv-search-header';
        document.body.appendChild(header);
        AdvancedSearch.renderFilterSetsControls(state, header);
        const select = header.querySelector('.adv-sets-select');
        expect(select.value).toBe(setId);
        expect(select.selectedOptions[0].textContent).toBe('My set');
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

    test('renderFilterSetsControls appends a select, save, new, and delete control listing the sets', () => {
        state.advancedSearch.predicates = [{ id: 'a', fieldKey: 'nights', operator: 'greater than', values: ['6'], complete: true }];
        AdvancedSearch.saveCurrentFilterSet(state);
        const header = document.createElement('div');
        header.className = 'adv-search-header';
        document.body.appendChild(header);
        AdvancedSearch.renderFilterSetsControls(state, header);
        expect(header.querySelector('.adv-sets-select')).not.toBeNull();
        expect(header.querySelector('.adv-sets-save-btn')).not.toBeNull();
        expect(header.querySelector('.adv-sets-new-btn')).not.toBeNull();
        expect(header.querySelector('.adv-sets-del-btn')).not.toBeNull();
        const names = [...header.querySelector('.adv-sets-select').options].map(o => o.textContent);
        expect(names).toContain('My set');
    });

    test('updateSelectedFilterSet updates the selected set in place without prompting', () => {
        state.advancedSearch.predicates = [{ id: 'a', fieldKey: 'nights', operator: 'greater than', values: ['6'], complete: true }];
        AdvancedSearch.saveCurrentFilterSet(state); // creates "My set" and marks it applied
        const setId = AdvancedSearch.loadFilterSets()[0].id;
        expect(state._advAppliedSetId).toBe(setId);
        state.advancedSearch.predicates = [
            { id: 'x', fieldKey: 'class', operator: 'in', values: ['SUITE'], complete: true },
            { id: 'y', fieldKey: 'nights', operator: 'less than', values: ['5'], complete: true },
        ];
        let prompted = false;
        window.prompt = () => { prompted = true; return 'SHOULD NOT PROMPT'; };
        AdvancedSearch.updateSelectedFilterSet(state);
        expect(prompted).toBe(false);
        const sets = AdvancedSearch.loadFilterSets();
        expect(sets).toHaveLength(1);
        expect(sets[0].id).toBe(setId);
        expect(sets[0].predicates).toHaveLength(2);
        expect(sets[0].predicates.map(p => p.fieldKey).sort()).toEqual(['class', 'nights']);
    });

    test('the Save button is greyed out with no set, no filters, or no changes', () => {
        const header = document.createElement('div');
        header.className = 'adv-search-header';
        document.body.appendChild(header);
        // no set selected -> greyed out
        AdvancedSearch.renderFilterSetsControls(state, header);
        expect(header.querySelector('.adv-sets-save-btn').disabled).toBe(true);
        // create a set from the current filters -> they match, so "no changes" -> still greyed
        state.advancedSearch.predicates = [{ id: 'a', fieldKey: 'nights', operator: 'greater than', values: ['6'], complete: true }];
        AdvancedSearch.saveCurrentFilterSet(state);
        AdvancedSearch.renderFilterSetsControls(state, header);
        expect(header.querySelector('.adv-sets-save-btn').disabled).toBe(true);
        expect(header.querySelector('.adv-sets-save-btn').title).toBe('No changes to save');
        // change a filter -> there are changes now -> enabled
        state.advancedSearch.predicates = [{ id: 'b', fieldKey: 'nights', operator: 'greater than', values: ['9'], complete: true }];
        AdvancedSearch._syncSaveButton(state);
        expect(header.querySelector('.adv-sets-save-btn').disabled).toBe(false);
        expect(header.querySelector('.adv-sets-save-btn').title).toBe('Update the selected set with the current filters');
    });

    test('the Save button is greyed out when there are no active filters', () => {
        const header = document.createElement('div');
        header.className = 'adv-search-header';
        document.body.appendChild(header);
        state.advancedSearch.predicates = [{ id: 'a', fieldKey: 'nights', operator: 'greater than', values: ['6'], complete: true }];
        AdvancedSearch.saveCurrentFilterSet(state); // a set is now selected
        AdvancedSearch.renderFilterSetsControls(state, header);
        state.advancedSearch.predicates = []; // clear the filters
        AdvancedSearch._syncSaveButton(state);
        expect(header.querySelector('.adv-sets-save-btn').disabled).toBe(true);
        expect(header.querySelector('.adv-sets-save-btn').title).toBe('No active filters to save');
    });

    test('Clear All and removing the last filter reset the saved-set dropdown', () => {
        const AS = loadAdvancedSearch(
            (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
            (k, v) => { store[k] = String(v); }
        );
        AS.lightRefresh = () => {};
        AS.renderPredicates = () => {};
        AS.updateBadge = () => {};
        AS.persistPredicates = () => {};
        AS.debouncedPersist = () => {};
        const panel = document.createElement('div');
        panel.id = 'advanced-search-panel';
        document.body.appendChild(panel);
        const st = {
            selectedProfileKey: 'gobo-R-test',
            advancedSearch: {
                enabled: true,
                includeTaxesAndFeesInPriceFilters: true,
                predicates: [{ id: 'a', fieldKey: 'nights', operator: 'greater than', values: ['6'], complete: true }],
            },
            advancedSearchPanel: panel,
        };
        window.prompt = () => 'Oasis';
        AS.saveCurrentFilterSet(st);
        const setId = AS.loadFilterSets()[0].id;
        AS.applyFilterSet(st, setId);
        const shown = () => panel.querySelector('.adv-sets-select');
        expect(shown().value).toBe(setId);
        expect(shown().selectedOptions[0].textContent).toBe('Oasis');

        panel.querySelector('.adv-search-clear-btn').click();
        expect(st._advAppliedSetId).toBeNull();
        expect(shown().value).toBe('');
        expect(shown().selectedOptions[0].textContent).toBe('Saved sets…');
        expect(shown().selectedOptions[0].disabled).toBe(true);

        AS.applyFilterSet(st, setId);
        st.advancedSearch.predicates.push({ id: 'b', fieldKey: 'ship', operator: 'in', values: ['Oasis'], complete: true });
        AS._removePredicate(st.advancedSearch.predicates[0], st);
        expect(st._advAppliedSetId).toBe(setId);
        expect(shown().value).toBe(setId);

        AS._removePredicate(st.advancedSearch.predicates[0], st);
        expect(st.advancedSearch.predicates).toHaveLength(0);
        expect(st._advAppliedSetId).toBeNull();
        expect(shown().value).toBe('');
        expect(shown().selectedOptions[0].textContent).toBe('Saved sets…');
        panel.remove();
    });
});
