/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

function loadAdvancedSearch() {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'advancedSearch.js'), 'utf8');
    const fn = new Function('goboStorageGet', 'goboStorageSet', src + '\nreturn AdvancedSearch;');
    return fn(() => null, () => {});
}

describe('taxes and fees setting persistence', () => {
    let AdvancedSearch;
    let setTaxes;

    beforeEach(() => {
        setTaxes = jest.fn();
        global.GoboStore = { ready: false, listKeys: () => [] };
        global.App = {
            SettingsStore: {
                getIncludeTaxesAndFeesInPriceFilters: () => false,
                setIncludeTaxesAndFeesInPriceFilters: setTaxes,
            },
            TableRenderer: { lastState: null, updateView: jest.fn() },
        };
        AdvancedSearch = loadAdvancedSearch();
    });

    afterEach(() => {
        delete global.GoboStore;
        delete global.App;
    });

    test('does not lock the default before storage is ready', () => {
        const state = { advancedSearch: { enabled: false, predicates: [] } };
        AdvancedSearch.ensureState(state);
        expect(state.advancedSearch.includeTaxesAndFeesInPriceFilters).toBeUndefined();
    });

    test('predicate persist does not write the taxes flag back over SettingsStore', () => {
        const state = {
            selectedProfileKey: 'gobo-R-test',
            advancedSearch: { enabled: true, includeTaxesAndFeesInPriceFilters: true, predicates: [] },
        };
        AdvancedSearch.persistPredicates(state);
        expect(setTaxes).not.toHaveBeenCalled();
    });

    test('applies the stored flag once storage is ready', () => {
        const state = { advancedSearch: { enabled: true, predicates: [] } };
        AdvancedSearch._lastState = state;
        global.App.TableRenderer.lastState = state;
        global.GoboStore.ready = true;
        AdvancedSearch.applyStoredTaxesFlag();
        expect(state.advancedSearch.includeTaxesAndFeesInPriceFilters).toBe(false);
        expect(global.App.TableRenderer.updateView).toHaveBeenCalledWith(state);
    });

    test('a toggle this session is not overwritten when storage becomes ready', () => {
        const state = { advancedSearch: { includeTaxesAndFeesInPriceFilters: false, predicates: [] } };
        AdvancedSearch._lastState = state;
        AdvancedSearch._taxesTouched = true;
        global.GoboStore.ready = true;
        AdvancedSearch.applyStoredTaxesFlag();
        expect(state.advancedSearch.includeTaxesAndFeesInPriceFilters).toBe(false);
        expect(global.App.TableRenderer.updateView).not.toHaveBeenCalled();
    });
});
