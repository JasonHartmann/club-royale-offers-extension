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
        Filtering,
        B2BUtils,
        BackToBackTool,
        Favorites,
        Settings,
        CardView,
        OfferPdf,
        SignOut: {
            // Sign the user out of the RCL/Celebrity session and navigate to the sign-in page.
            // Replicates the site's own sign-out: revoke the OAuth token, log out the AEM session,
            // clear the auth cookies, then navigate to the brand's signin page (relative path).
            async signOut() {
                const go = () => { try { window.location.href = window.location.pathname.replace(/[^/]*$/, 'signin'); } catch (e) {} };
                try {
                    const getCookie = (name) => {
                        const m = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
                        return m ? decodeURIComponent(m[2]) : null;
                    };
                    const feSso = getCookie('fe_sso');
                    const accessToken = getCookie('accessToken');
                    const clientId = 'g9S023t74473ZUk909FN68F0b4N67PSOh92o04vL0BR6537pI2y2h94M6BbU7D6J';
                    const authId = 'W66846kPQv1750975oodH5M8zC6Ta7m30kH2Q78l2WmU50FCgqpP13w77377k7IB';
                    const basic = btoa(clientId + ':' + authId);
                    const posts = [];
                    if (accessToken) {
                        posts.push(fetch('/auth/oauth2/token/revoke?token=' + encodeURIComponent(accessToken) + '&client_id=' + clientId, {
                            method: 'POST',
                            headers: { 'Authorization': 'Basic ' + basic, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
                        }).catch(() => {}));
                    }
                    if (feSso) {
                        posts.push(fetch('/auth/json/sessions?_action=logout', {
                            method: 'POST',
                            credentials: 'omit',
                            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Accept-API-Version': 'resource=4.0', 'rcclssocookie': feSso }
                        }).catch(() => {}));
                    }
                    await Promise.all(posts);
                    const host = window.location.hostname;
                    const base = host.replace(/^www\./, '');
                    for (const name of ['fe_sso', 'accessToken', 'loyaltyData']) {
                        for (const d of [base, '.' + base]) {
                            document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + d;
                        }
                    }
                    go();
                } catch (e) {
                    console.error('[SignOut] Error:', e);
                    go();
                }
            }
        },
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
            getB2BDrivingRangeHours() {
                try { const s = this.getSettings(); return (typeof s.b2bDrivingRangeHours !== 'undefined') ? parseInt(s.b2bDrivingRangeHours, 10) || 0 : 0; } catch(e) { return 0; }
            },
            setB2BDrivingRangeHours(val) {
                try {
                    const s = this.getSettings() || {};
                    s.b2bDrivingRangeHours = Math.max(0, Math.min(5, parseInt(val, 10) || 0));
                    this.setSettings(s);
                    try { window.App.B2BDrivingRangeHours = s.b2bDrivingRangeHours; } catch(e) {}
                    try {
                        if (window.App && App.TableRenderer && typeof App.TableRenderer.refreshB2BDepths === 'function') {
                            App.TableRenderer.refreshB2BDepths({ showSpinner: true });
                        }
                    } catch(e) {}
                } catch(e) {}
            },
            getB2BLagDays() {
                try { const s = this.getSettings(); return (typeof s.b2bLagDays !== 'undefined') ? parseInt(s.b2bLagDays, 10) || 0 : 0; } catch(e) { return 0; }
            },
            setB2BLagDays(val) {
                try {
                    const s = this.getSettings() || {};
                    s.b2bLagDays = Math.max(0, Math.min(7, parseInt(val, 10) || 0));
                    this.setSettings(s);
                    try { window.App.B2BLagDays = s.b2bLagDays; } catch(e) {}
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
            },
            getDateFullFormat() {
                try { const s = this.getSettings(); return (typeof s.dateFullFormat !== 'undefined') ? !!s.dateFullFormat : false; } catch(e) { return false; }
            },
            setDateFullFormat(val) {
                try { const s = this.getSettings() || {}; s.dateFullFormat = !!val; this.setSettings(s); try { window.App.DateFullFormat = !!val; } catch(e) {} } catch(e) {}
            },
            getLayoutMode() {
                try { const s = this.getSettings(); return (typeof s.layoutMode !== 'undefined') ? s.layoutMode : 'table'; } catch(e) { return 'table'; }
            },
            setLayoutMode(val) {
                try { const s = this.getSettings() || {}; s.layoutMode = (val === 'cards') ? 'cards' : 'table'; this.setSettings(s); try { window.App.LayoutMode = s.layoutMode; } catch(e) {} } catch(e) {}
            },
            getCardSort() {
                try {
                    const s = this.getSettings() || {};
                    const order = s.cardSortOrder;
                    return { column: s.cardSortColumn || 'destination', order: (order === 'desc' || order === 'original') ? order : 'asc' };
                } catch(e) { return { column: 'destination', order: 'asc' }; }
            },
            setCardSort(column, order) {
                try {
                    const s = this.getSettings() || {};
                    s.cardSortColumn = column || 'destination';
                    s.cardSortOrder = (order === 'desc' || order === 'original') ? order : 'asc';
                    this.setSettings(s);
                } catch(e) {}
            }
        },
        // runtime flag to control expensive B2B computations; default true for backwards compatibility
        BackToBackAutoRun: (typeof __goboSettings.autoRunB2B !== 'undefined') ? !!__goboSettings.autoRunB2B : true,
        // runtime value: driving range in hours (0-5) for B2B port matching; default 0 (exact port match only)
        B2BDrivingRangeHours: (typeof __goboSettings.b2bDrivingRangeHours !== 'undefined') ? Math.max(0, Math.min(5, parseInt(__goboSettings.b2bDrivingRangeHours, 10) || 0)) : 0,
        // runtime value: lag days (0-7) between sailings for B2B chaining; default 0 (same-day only)
        B2BLagDays: (typeof __goboSettings.b2bLagDays !== 'undefined') ? Math.max(0, Math.min(7, parseInt(__goboSettings.b2bLagDays, 10) || 0)) : 0,
        // runtime flag: full date format (YYYY-MM-DD) vs compact (MM/DD/YY); default false (compact)
        DateFullFormat: (typeof __goboSettings.dateFullFormat !== 'undefined') ? !!__goboSettings.dateFullFormat : false,
        // runtime value: layout mode ('table' | 'cards'); default 'table'
        LayoutMode: (typeof __goboSettings.layoutMode !== 'undefined') ? (__goboSettings.layoutMode === 'cards' ? 'cards' : 'table') : 'table',
        // Shared email: null initially, set by apiClient.fetchGuestAccount, hydrated from localStorage by breadcrumbs fallback
        CurrentUserEmail: null,
        ProfileCache: _prev.ProfileCache || [],
        refreshSettingsFromStorage() {
            try {
                const latest = readGoboSettings();
                __goboSettings = latest || {};
                App.BackToBackAutoRun = (typeof __goboSettings.autoRunB2B !== 'undefined') ? !!__goboSettings.autoRunB2B : true;
                App.B2BDrivingRangeHours = (typeof __goboSettings.b2bDrivingRangeHours !== 'undefined') ? Math.max(0, Math.min(5, parseInt(__goboSettings.b2bDrivingRangeHours, 10) || 0)) : 0;
                App.B2BLagDays = (typeof __goboSettings.b2bLagDays !== 'undefined') ? Math.max(0, Math.min(7, parseInt(__goboSettings.b2bLagDays, 10) || 0)) : 0;
                App.DateFullFormat = (typeof __goboSettings.dateFullFormat !== 'undefined') ? !!__goboSettings.dateFullFormat : false;
                App.LayoutMode = (typeof __goboSettings.layoutMode !== 'undefined') ? (__goboSettings.layoutMode === 'cards' ? 'cards' : 'table') : 'table';
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