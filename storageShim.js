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
        /^goboHiddenGroups-/
    ];
    function shouldManage(key) {
        return EXT_PREFIX_MATCHERS.some(rx => rx.test(key));
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
            try { extStorage.set(batch, () => { /* ignore errors */ }); } catch(e) { /* ignore */ }
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
            if (val === undefined) return null;
            if (typeof val === 'string') return val;
            try { return JSON.stringify(val); } catch(e) { return null; }
        },
        setItem(key, value) {
            if (!shouldManage(key)) return; // ignore other keys
            internal.set(key, value);
            pendingWrites.set(key, value);
            scheduleFlush();
        },
        removeItem(key) {
            if (!shouldManage(key)) return;
            internal.delete(key);
            if (extStorage) {
                try { extStorage.remove(key); } catch(e) { /* ignore */ }
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

    // Kick off async init
    GoboStore.init();
})();
