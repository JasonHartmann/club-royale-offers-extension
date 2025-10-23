// storageShim.js
// Provides a synchronous-feeling facade (GoboStore) backed by extension storage
// for all keys beginning with gobo- / gobohidden / goob- plus specific gobo* keys.
// This lets existing volatile logic keep sequence without broad async refactors.
(function() {
    const EXT_PREFIX_MATCHERS = [
        /^gobo-/,
        /^goob-/,
        /^goboHideTier$/,
        /^goboLinkedAccounts$/,
        /^goboHiddenGroups-/,
        /^goboProfileIdMap_v1$/,
        /^goboProfileIdFreeIds_v1$/,
        /^goboProfileIdNext_v1$/,
        /^goboWhatsNewShown/
    ];
    const DEBUG_STORAGE = true; // toggle for storage shim debug
    function debugStore(...args){ if (DEBUG_STORAGE) { try { console.debug('[GoboStore]', ...args); } catch(e){} } }
    function shouldManage(key) {
        const match = EXT_PREFIX_MATCHERS.some(rx => rx.test(key));
        if (!match && DEBUG_STORAGE) { try { console.debug('[GoboStore] ignoring key (pattern mismatch):', key); } catch(e){} }
        return match;
    }
    const extStorage = (function() {
        if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) return browser.storage.local;
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) return chrome.storage.local;
        return null;
    })();
    const internal = new Map();
    const pendingWrites = new Map();
    let flushScheduled = false;

    function scheduleFlush() {
        if (!extStorage) return; // Nothing to do
        if (flushScheduled) return;
        flushScheduled = true;
        setTimeout(() => {
            if (pendingWrites.size === 0) { flushScheduled = false; return; }
            const batch = {};
            pendingWrites.forEach((v, k) => { batch[k] = v; });
            pendingWrites.clear();
            try {
                debugStore('flush: writing batch', Object.keys(batch));
                extStorage.set(batch, () => { if (chrome && chrome.runtime && chrome.runtime.lastError) { debugStore('flush: lastError', chrome.runtime.lastError); } });
            } catch(e) { debugStore('flush: exception', e); }
            flushScheduled = false;
        }, 25); // small debounce to collapse bursts
    }

    function loadAll(resolve) {
        if (!extStorage) { resolve(); return; }
        try {
            extStorage.get(null, (items) => {
                try {
                    Object.keys(items || {}).forEach(k => {
                        if (shouldManage(k)) internal.set(k, items[k]);
                    });
                } catch(e) { /* ignore */ }
                resolve();
            });
        } catch(e) { resolve(); }
    }

    const GoboStore = {
        ready: false,
        _initPromise: null,
        init() {
            if (this._initPromise) return this._initPromise;
            this._initPromise = new Promise(res => loadAll(() => {
                this.ready = true;
                try {
                    window.__goboStorageReady = true;
                    if (typeof document !== 'undefined') {
                        document.dispatchEvent(new Event('goboStorageReady'));
                    }
                } catch(e) { /* ignore */ }
                res();
            }));
            return this._initPromise;
        },
        // Mimic localStorage.getItem returning a string or null
        getItem(key) {
            if (!shouldManage(key)) return null; // never proxy site storage keys
            const val = internal.get(key);
            debugStore('getItem', key, val === undefined ? '(undefined)' : 'hit');
            if (val === undefined) return null;
            if (typeof val === 'string') return val;
            try { return JSON.stringify(val); } catch(e) { return null; }
        },
        setItem(key, value) {
            if (!shouldManage(key)) return; // ignore other keys
            internal.set(key, value);
            pendingWrites.set(key, value);
            debugStore('setItem queued', key);
            scheduleFlush();
            // Dispatch a lightweight in-page event so UI can react immediately to important keys
            try {
                if (typeof document !== 'undefined') {
                    const ev = new CustomEvent('goboStorageUpdated', { detail: { key } });
                    document.dispatchEvent(ev);
                }
            } catch(e) { /* ignore */ }
        },
        removeItem(key) {
            if (!shouldManage(key)) return;
            internal.delete(key);
            debugStore('removeItem', key);
            if (extStorage) {
                try { extStorage.remove(key); } catch(e) { debugStore('removeItem error', key, e); }
            }
        },
        key(index) {
            // Only enumerate profile keys (gobo-*) like original code
            const keys = Array.from(internal.keys()).filter(k => k.startsWith('gobo-')).sort();
            return keys[index] || null;
        },
        get length() {
            return Array.from(internal.keys()).filter(k => k.startsWith('gobo-')).length;
        },
        getAllProfileKeys() {
            return Array.from(internal.keys()).filter(k => k.startsWith('gobo-'));
        },
        listKeys(prefix) {
            const keys = Array.from(internal.keys());
            if (prefix) return keys.filter(k => k.startsWith(prefix));
            return keys.slice();
        }
    };

    // Convenience global helpers so existing code can be surgically swapped
    function goboStorageGet(key) { if (GoboStore.ready) return GoboStore.getItem(key); return GoboStore.getItem(key); }
    function goboStorageSet(key, value) { GoboStore.setItem(key, value); }
    function goboStorageRemove(key) { GoboStore.removeItem(key); }

    // Expose globally
    try {
        window.GoboStore = GoboStore;
        window.goboStorageGet = goboStorageGet;
        window.goboStorageSet = goboStorageSet;
        window.goboStorageRemove = goboStorageRemove;
    } catch(e) { /* ignore */ }

    // Also listen for external storage changes (chrome.storage.onChanged / browser.storage.onChanged)
    try {
        const handleExternalChange = (changes, areaName) => {
            try {
                if (areaName && areaName !== 'local') return; // only care about local area
                const keys = Object.keys(changes || {});
                keys.forEach(k => {
                    if (!shouldManage(k)) return;
                    const newVal = changes[k] && Object.prototype.hasOwnProperty.call(changes[k], 'newValue') ? changes[k].newValue : undefined;
                    if (newVal === undefined) {
                        internal.delete(k);
                        debugStore('externalChange: deleted key', k);
                    } else {
                        internal.set(k, newVal);
                        debugStore('externalChange: updated key', k);
                    }
                    try { document.dispatchEvent(new CustomEvent('goboStorageUpdated', { detail: { key: k } })); } catch(e){}
                });
            } catch(e) { debugStore('handleExternalChange error', e); }
        };
        // Prefer browser API if available
        if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
            browser.storage.onChanged.addListener(handleExternalChange);
        } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener(handleExternalChange);
        }
    } catch(e) { /* ignore */ }

    // Kick off async init
    GoboStore.init();
})();

// Listen for storage shim updates and refresh Combined Offers UI when relevant
try {
    if (typeof document !== 'undefined') {
        let __goboCombinedDebounce = null;
        document.addEventListener('goboStorageUpdated', (ev) => {
            try {
                const key = ev?.detail?.key;
                if (!key) return;
                if (key === 'goboLinkedAccounts' || key === 'goob-combined') {
                    // Debounce rapid updates
                    if (__goboCombinedDebounce) clearTimeout(__goboCombinedDebounce);
                    __goboCombinedDebounce = setTimeout(() => {
                        try {
                            if (App && App.ProfileCache && App.ProfileCache['goob-combined-linked']) {
                                delete App.ProfileCache['goob-combined-linked'];
                                console.log('[DEBUG] App.ProfileCache["goob-combined-linked"] deleted due to goboStorageUpdated');
                            }
                            if (App && App.TableRenderer) {
                                App.TableRenderer.updateBreadcrumb(App.TableRenderer.lastState?.groupingStack || [], App.TableRenderer.lastState?.groupKeysStack || []);
                            }
                            // If Combined Offers is currently active, reload it immediately from storage so the view updates
                            try {
                                if (App && App.CurrentProfile && App.CurrentProfile.key === 'goob-combined-linked' && typeof App.TableRenderer.loadProfile === 'function') {
                                    const raw = (typeof goboStorageGet === 'function' ? goboStorageGet('goob-combined') : localStorage.getItem('goob-combined'));
                                    if (raw) {
                                        try {
                                            const payload = JSON.parse(raw);
                                            if (payload && payload.data) {
                                                console.log('[DEBUG] Reloading Combined Offers profile in response to storage update');
                                                App.TableRenderer.loadProfile('goob-combined-linked', payload);
                                            }
                                        } catch(e) { /* ignore malformed */ }
                                    }
                                }
                            } catch(e) { /* ignore */ }
                        } catch(e) { /* ignore */ }
                    }, 20);
                }

                // General handling: invalidate cache for changed key and reload if active
                try {
                    // Invalidate cached DOM/state for this key so next load reads fresh data
                    if (App && App.ProfileCache && App.ProfileCache[key]) {
                        delete App.ProfileCache[key];
                        console.log('[DEBUG] App.ProfileCache invalidated due to goboStorageUpdated for', key);
                    }
                    // Update breadcrumb/tabs to reflect possible savedAt changes or added/removed profiles
                    if (App && App.TableRenderer) {
                        App.TableRenderer.updateBreadcrumb(App.TableRenderer.lastState?.groupingStack || [], App.TableRenderer.lastState?.groupKeysStack || []);
                    }
                    // If the active profile is the changed key, reload it immediately
                    try {
                        const activeKey = App && App.CurrentProfile && App.CurrentProfile.key;
                        if (activeKey && activeKey === key && typeof App.TableRenderer.loadProfile === 'function') {
                            const raw = (typeof goboStorageGet === 'function' ? goboStorageGet(key) : localStorage.getItem(key));
                            if (raw) {
                                try {
                                    const payload = JSON.parse(raw);
                                    if (payload && payload.data) {
                                        console.log('[DEBUG] Reloading active profile in response to goboStorageUpdated for', key);
                                        App.TableRenderer.loadProfile(key, payload);
                                    }
                                } catch(e) { /* ignore malformed */ }
                            }
                        }
                    } catch(e) { /* ignore */ }
                } catch(e) { /* ignore */ }

            } catch(e) { /* ignore */ }
        });
    }
} catch(e) { /* ignore */ }

