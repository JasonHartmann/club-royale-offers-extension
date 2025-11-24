(function() {
    console.debug('Club Royale GOBO Indicator extension loaded on:', window.location.href);

    // Preserve any pre-existing App (e.g., FilterUtils injected earlier) before redefining
    const _prev = window.App || {};

    // Read persisted settings early so runtime flags (like BackToBackAutoRun) are available
    let __goboSettings = {};
    try {
        const raw = (typeof goboStorageGet === 'function') ? goboStorageGet('goboSettings') : null;
        __goboSettings = raw ? JSON.parse(raw || '{}') || {} : {};
    } catch(e) { __goboSettings = {}; }

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
        // Helper to read/write our extension-backed settings using the storage shim
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
            getAutoRunB2B() {
                try { const s = this.getSettings(); return (typeof s.autoRunB2B !== 'undefined') ? !!s.autoRunB2B : true; } catch(e) { return true; }
            },
            setAutoRunB2B(val) {
                try { const s = this.getSettings() || {}; s.autoRunB2B = !!val; this.setSettings(s); try { window.App.BackToBackAutoRun = !!val; } catch(e) {} } catch(e) {}
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
            }
        },
        // runtime flag to control expensive B2B computations; default true for backwards compatibility
        BackToBackAutoRun: (typeof __goboSettings.autoRunB2B !== 'undefined') ? !!__goboSettings.autoRunB2B : true,
        ProfileCache: _prev.ProfileCache || [],
        init() {
            this.DOMUtils.waitForDom();
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
                            const v = (typeof goboStorageGet === 'function') ? goboStorageGet('goboSettings') : null;
                            const parsed = v ? JSON.parse(v) : {};
                            App.BackToBackAutoRun = (typeof parsed.autoRunB2B !== 'undefined') ? !!parsed.autoRunB2B : true;
                        } catch(e) { /* ignore */ }
                    }
                } catch(e) { /* ignore */ }
            });
        }
    } catch(e) { /* ignore */ }

    // Start the application
    App.init();
})();