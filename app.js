(function() {
    console.debug('Club Royale GOBO Indicator extension loaded on:', window.location.href);

    // Preserve any pre-existing App (e.g., FilterUtils injected earlier) before redefining
    const _prev = window.App || {};

    // Read persisted settings early so runtime flags (like BackToBackAutoRun) are available
    let __goboSettings = {};
    const readGoboSettings = () => {
        try {
            const raw = (typeof goboStorageGet === 'function') ? goboStorageGet('goboSettings') : null;
            return raw ? JSON.parse(raw || '{}') || {} : {};
        } catch(e) { return {}; }
    };
    __goboSettings = readGoboSettings();

    // Global App object to coordinate modules (merge instead of overwrite to keep advanced-only utilities)
    window.App = {
        ..._prev,
        DOMUtils,
        Styles,
        ButtonManager,
        ErrorHandler,
        Spinner,
        ApiClient,
        Modal,
        TableBuilder,
        AccordionBuilder,
        SortUtils,
        TableRenderer,
        ItineraryCache,
        AdvancedItinerarySearch,
        Breadcrumbs,
        AdvancedSearch,
        AdvancedSearchAddField,
        Utils,
        OfferCodeLookup,
        Filtering,
        B2BUtils,
        BackToBackTool,
        Favorites,
        Settings,
        SettingsStore: {
            getSettings() {
                try {
                    const raw = (typeof goboStorageGet === 'function') ? goboStorageGet('goboSettings') : null;
                    return raw ? JSON.parse(raw) : {};
                } catch (e) { return {}; }
            },
            setSettings(obj) {
                try {
                    const raw = JSON.stringify(obj || {});
                    if (typeof goboStorageSet === 'function') goboStorageSet('goboSettings', raw);
                    else localStorage.setItem('goboSettings', raw);
                } catch (e) { /* ignore */ }
            },
            getHiddenColumns() {
                try {
                    const s = this.getSettings();
                    return Array.isArray(s.hiddenColumns) ? s.hiddenColumns : [];
                } catch (e) { return []; }
            },
            setHiddenColumns(cols) {
                try {
                    const s = this.getSettings() || {};
                    s.hiddenColumns = Array.isArray(cols) ? cols : [];
                    this.setSettings(s);
                } catch (e) { /* ignore */ }
            },
            getAutoRunB2B() {
                try { const s = this.getSettings(); return (typeof s.autoRunB2B !== 'undefined') ? !!s.autoRunB2B : true; } catch(e) { return true; }
            },
            setAutoRunB2B(val) {
                try { const s = this.getSettings() || {}; s.autoRunB2B = !!val; this.setSettings(s); try { window.App.BackToBackAutoRun = !!val; } catch(e) {} } catch(e) {}
            },
            getB2BComputeByRegion() {
                try { const s = this.getSettings(); return (typeof s.b2bComputeByRegion !== 'undefined') ? !!s.b2bComputeByRegion : false; } catch(e) { return false; }
            },
            setB2BComputeByRegion(val) {
                try {
                    const s = this.getSettings() || {};
                    s.b2bComputeByRegion = !!val;
                    this.setSettings(s);
                    try { window.App.B2BComputeByRegion = !!val; } catch(e) {}
                    try {
                        if (window.App && App.TableRenderer && typeof App.TableRenderer.refreshB2BDepths === 'function') {
                            App.TableRenderer.refreshB2BDepths({ showSpinner: true });
                        }
                    } catch(e) {}
                } catch(e) {}
            },
            getIncludeSideBySide() {
                try { const s = this.getSettings(); return (typeof s.includeSideBySide !== 'undefined') ? !!s.includeSideBySide : true; } catch(e) { return true; }
            },
            setIncludeSideBySide(val) {
                try { const s = this.getSettings() || {}; s.includeSideBySide = !!val; this.setSettings(s); try { if (window.App && App.TableRenderer) App.TableRenderer._sideBySidePreferenceCache = !!val; } catch(e) {} } catch(e) {}
            },
            getIncludeTaxesAndFeesInPriceFilters() {
                try { const s = this.getSettings(); return (typeof s.includeTaxesAndFeesInPriceFilters !== 'undefined') ? !!s.includeTaxesAndFeesInPriceFilters : true; } catch(e) { return true; }
            },
            setIncludeTaxesAndFeesInPriceFilters(val) {
                try { const s = this.getSettings() || {}; s.includeTaxesAndFeesInPriceFilters = !!val; this.setSettings(s); try { if (window.App && App.AdvancedSearch && App.AdvancedSearch._lastState && App.AdvancedSearch._lastState.advancedSearch) App.AdvancedSearch._lastState.advancedSearch.includeTaxesAndFeesInPriceFilters = !!val; } catch(e) {} } catch(e) {}
            },
            getSoloBooking() {
                try { const s = this.getSettings(); return (typeof s.soloBooking !== 'undefined') ? !!s.soloBooking : false; } catch(e) { return false; }
            },
            setSoloBooking(val) {
                try { const s = this.getSettings() || {}; s.soloBooking = !!val; this.setSettings(s); } catch(e) {}
            },
            getDarkMode() {
                try { const s = this.getSettings(); return (typeof s.darkMode !== 'undefined') ? !!s.darkMode : false; } catch(e) { return false; }
            },
            setDarkMode(val) {
                try { const s = this.getSettings() || {}; s.darkMode = !!val; this.setSettings(s); } catch(e) {}
            }
        },
        // runtime flag to control expensive B2B computations; default true for backwards compatibility
        BackToBackAutoRun: (typeof __goboSettings.autoRunB2B !== 'undefined') ? !!__goboSettings.autoRunB2B : true,
        // runtime flag to match B2B by region instead of port; default false
        B2BComputeByRegion: (typeof __goboSettings.b2bComputeByRegion !== 'undefined') ? !!__goboSettings.b2bComputeByRegion : false,
        ProfileCache: _prev.ProfileCache || [],
        refreshSettingsFromStorage() {
            try {
                const latest = readGoboSettings();
                __goboSettings = latest || {};
                App.BackToBackAutoRun = (typeof __goboSettings.autoRunB2B !== 'undefined') ? !!__goboSettings.autoRunB2B : true;
                App.B2BComputeByRegion = (typeof __goboSettings.b2bComputeByRegion !== 'undefined') ? !!__goboSettings.b2bComputeByRegion : false;
            } catch(e) { /* ignore */ }
            try { App.applyTheme(); } catch(e) { /* ignore */ }
        },
        applyTheme() {
            try {
                const enabled = (App && App.SettingsStore && typeof App.SettingsStore.getDarkMode === 'function') ? App.SettingsStore.getDarkMode() : false;
                const root = document.documentElement;
                const body = document.body;
                if (root) root.classList.toggle('gobo-dark', !!enabled);
                if (body) body.classList.toggle('gobo-dark', !!enabled);
            } catch(e) { /* ignore */ }
        },
        init() {
            this.DOMUtils.waitForDom();
            try {
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => App.applyTheme(), { once: true });
                } else {
                    App.applyTheme();
                }
            } catch(e) { /* ignore */ }
            try {
                if (typeof document !== 'undefined') {
                    document.addEventListener('goboStorageReady', () => App.refreshSettingsFromStorage());
                }
            } catch(e) { /* ignore */ }
        }
    };

    // Listen for external storage updates and keep the runtime flag in sync
    try {
        if (typeof document !== 'undefined') {
            document.addEventListener('goboStorageUpdated', (ev) => {
                try {
                    const key = ev?.detail?.key;
                    if (!key) return;
                    if (key === 'goboSettings') {
                        try {
                            App.refreshSettingsFromStorage();
                        } catch(e) { /* ignore */ }
                    }
                } catch(e) { /* ignore */ }
            });
        }
    } catch(e) { /* ignore */ }

    // Start the application
    App.init();
})();