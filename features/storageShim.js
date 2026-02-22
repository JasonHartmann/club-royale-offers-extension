// storageShim.js
// Provides a synchronous-feeling facade (GoboStore) backed by extension storage
// for all keys beginning with gobo- / gobohidden / goob- plus specific gobo* keys.
// This lets existing volatile logic keep sequence without broad async refactors.
(function() {
    const DEBUG_STORAGE = false; // deprecated; use window.GOBO_DEBUG_LOGS instead
    function debugEnabled(){ try { return (typeof window !== 'undefined' && !!window.GOBO_DEBUG_LOGS) || DEBUG_STORAGE; } catch(e){ return !!DEBUG_STORAGE; } }
    function debugStore(...args){ if (debugEnabled()) { try { console.debug('[GoboStore]', ...args); } catch(e){} } }
    function infoStore(...args){ if (debugEnabled()) { try { console.log('[GoboStore]', ...args); } catch(e){} } }
    try {
    const debugFlag = (typeof window !== 'undefined' && 'GOBO_DEBUG_LOGS' in window) ? window.GOBO_DEBUG_LOGS : 'unset';
    if (debugEnabled()) console.log('[GoboStore] shim loaded', { debugFlag });
        if (typeof window !== 'undefined') window.__goboStorageShimLoaded = true;
    } catch(e) { /* ignore */ }
    let extStorage = null;

    const isIOS = (() => {
        try {
            if (typeof navigator === 'undefined') return false;
            const ua = navigator.userAgent || '';
            const iOSDevice = /iPad|iPhone|iPod/.test(ua);
            const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
            const iPadOSMobile = /Macintosh/.test(ua) && /Mobile/.test(ua);
            return iOSDevice || iPadOS || iPadOSMobile;
        } catch (e) { return false; }
    })();

    const isSafari = (() => {
        try {
            if (typeof navigator === 'undefined') return false;
            const ua = navigator.userAgent || '';
            const isApple = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
            return isApple;
        } catch (e) { return false; }
    })();

    function shouldManage(key) {
        if (!key || typeof key !== 'string') return false;
        return key.startsWith('gobo') || key.startsWith('goob');
    }

    function createIndexedDbStorage() {
        if (typeof indexedDB === 'undefined') return null;
        const DB_NAME = 'gobo-storage';
        const STORE_NAME = 'kv';
        let dbPromise = null;

        const openDb = () => {
            if (dbPromise) return dbPromise;
            dbPromise = new Promise((resolve, reject) => {
                try {
                    const request = indexedDB.open(DB_NAME, 1);
                    request.onupgradeneeded = () => {
                        const db = request.result;
                        if (!db.objectStoreNames.contains(STORE_NAME)) {
                            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                        }
                    };
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                } catch (e) {
                    reject(e);
                }
            });
            return dbPromise;
        };

        const withStore = (mode, operation) => openDb().then((db) => new Promise((resolve, reject) => {
            let result;
            let finished = false;
            const finish = (err) => {
                if (finished) return;
                finished = true;
                if (err) reject(err); else resolve(result);
            };
            try {
                const tx = db.transaction(STORE_NAME, mode);
                const store = tx.objectStore(STORE_NAME);
                operation(store, (value) => { result = value; });
                tx.oncomplete = () => finish();
                tx.onerror = () => finish(tx.error || new Error('IndexedDB transaction error'));
                tx.onabort = () => finish(tx.error || new Error('IndexedDB transaction aborted'));
            } catch (e) {
                finish(e);
            }
        }));

        const withCallback = (promise, callback, fallbackValue) => {
            if (typeof callback === 'function') {
                promise.then((value) => callback(value)).catch(() => callback(fallbackValue));
                return undefined;
            }
            return promise;
        };

        return {
            get(keys, callback) {
                try { infoStore('idb.get', keys == null ? 'all' : keys); } catch(e){}
                const promise = withStore('readonly', (store, setResult) => {
                    const result = {};
                    if (keys == null) {
                        const req = store.getAll();
                        req.onsuccess = () => {
                            try {
                                (req.result || []).forEach((entry) => {
                                    if (entry && entry.key != null) result[entry.key] = entry.value;
                                });
                            } catch (e) { /* ignore */ }
                            setResult(result);
                        };
                        req.onerror = () => setResult(result);
                        return;
                    }
                    const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
                    if (!keyList.length) {
                        setResult(result);
                        return;
                    }
                    let remaining = keyList.length;
                    keyList.forEach((key) => {
                        const req = store.get(key);
                        req.onsuccess = () => {
                            try {
                                if (req.result && Object.prototype.hasOwnProperty.call(req.result, 'value')) {
                                    result[key] = req.result.value;
                                }
                            } catch (e) { /* ignore */ }
                            remaining -= 1;
                            if (remaining === 0) setResult(result);
                        };
                        req.onerror = () => {
                            remaining -= 1;
                            if (remaining === 0) setResult(result);
                        };
                    });
                }).catch(() => ({}));
                return withCallback(promise, callback, {});
            },
            set(items, callback) {
                try { infoStore('idb.set', items ? Object.keys(items).length : 0); } catch(e){}
                const payload = (items && typeof items === 'object') ? items : {};
                const promise = withStore('readwrite', (store) => {
                    Object.keys(payload).forEach((key) => {
                        try { store.put({ key, value: payload[key] }); } catch (e) { /* ignore */ }
                    });
                }).catch(() => ({}));
                return withCallback(promise, callback, null);
            },
            remove(keys, callback) {
                try { infoStore('idb.remove', keys); } catch(e){}
                const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
                const promise = withStore('readwrite', (store) => {
                    keyList.forEach((key) => {
                        try { store.delete(key); } catch (e) { /* ignore */ }
                    });
                }).catch(() => ({}));
                return withCallback(promise, callback, null);
            },
            clear(callback) {
                try { infoStore('idb.clear'); } catch(e){}
                const promise = withStore('readwrite', (store) => {
                    try { store.clear(); } catch (e) { /* ignore */ }
                }).catch(() => ({}));
                return withCallback(promise, callback, null);
            }
        };
    }
        try {
            infoStore('env', { isIOS, isSafari, userAgent: (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : 'unknown' });
        } catch(e) { /* ignore */ }
    const idbStorage = createIndexedDbStorage();
    extStorage = (function() {
        if (isSafari && idbStorage) return idbStorage;
        if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) return browser.storage.local;
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) return chrome.storage.local;
        if (idbStorage) return idbStorage;
        return null;
    })();
    try {
        const backend = extStorage === idbStorage ? 'indexeddb' : (extStorage ? 'browser.storage.local' : 'none');
        infoStore('backend', backend, { isIOS });
        if (isIOS && backend !== 'indexeddb') infoStore('iosStorageFallback', backend);
    } catch(e) { /* ignore */ }
    const internal = new Map();
    const pendingWrites = new Map();
    let flushScheduled = false;

    function flushNow() {
        if (!extStorage) return;
        if (pendingWrites.size === 0) return;
        const batch = {};
        pendingWrites.forEach((v, k) => { batch[k] = v; });
        pendingWrites.clear();
        try {
            debugStore('flush: writing batch', Object.keys(batch));
            try {
                const maybePromise = extStorage.set(batch, () => {
                    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
                        debugStore('flush: lastError', chrome.runtime.lastError);
                    }
                });
                if (maybePromise && typeof maybePromise.then === 'function') {
                    maybePromise.catch(e => debugStore('flush: promise error', e));
                }
            } catch(cbErr) {
                try {
                    const p = extStorage.set(batch);
                    if (p && typeof p.then === 'function') p.catch(e => debugStore('flush: promise error', e));
                } catch(pErr) {
                    debugStore('flush: exception', pErr);
                }
            }
        } catch(e) { debugStore('flush: exception', e); }
    }

    function scheduleFlush(immediate) {
        if (!extStorage) return; // Nothing to do when extension storage isn't present
        if (flushScheduled) return;
        flushScheduled = true;
        const delay = (immediate || extStorage === idbStorage) ? 0 : 25;
        setTimeout(() => {
            flushNow();
            flushScheduled = false;
        }, delay);
    }

    function loadAll(resolve) {
        if (!extStorage) { resolve(); return; }
        try { infoStore('loadAll.start'); } catch(e) {}
        try {
            // Support both callback-style and Promise-style get
            try {
                const maybePromise = extStorage.get(null, (items) => {
                    try {
                        Object.keys(items || {}).forEach(k => {
                            if (shouldManage(k)) internal.set(k, items[k]);
                        });
                    } catch(e) { /* ignore */ }
                    try { infoStore('loadAll.done', internal.size); } catch(e) {}
                    resolve();
                });
                if (maybePromise && typeof maybePromise.then === 'function') {
                    maybePromise.then((items) => {
                        try {
                            Object.keys(items || {}).forEach(k => {
                                if (shouldManage(k)) internal.set(k, items[k]);
                            });
                        } catch(e) { /* ignore */ }
                        try { infoStore('loadAll.done', internal.size); } catch(e) {}
                        resolve();
                    }).catch(() => resolve());
                }
            } catch(cbErr) {
                // Try promise form
                try {
                    const p = extStorage.get(null);
                    if (p && typeof p.then === 'function') {
                        p.then((items) => {
                            try {
                                Object.keys(items || {}).forEach(k => {
                                    if (shouldManage(k)) internal.set(k, items[k]);
                                });
                            } catch(e) { /* ignore */ }
                            try { infoStore('loadAll.done', internal.size); } catch(e) {}
                            resolve();
                        }).catch(() => resolve());
                    } else {
                        resolve();
                    }
                } catch(e) { resolve(); }
            }
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
            const val = internal.get(key);
            // debugStore('getItem', key, val === undefined ? '(undefined)' : 'hit');
            if (val === undefined) return null;
            if (typeof val === 'string') return val;
            try { return JSON.stringify(val); } catch(e) { return null; }
        },
        setItem(key, value) {
            internal.set(key, value);
            pendingWrites.set(key, value);
            debugStore('setItem queued', key);
            scheduleFlush(true);
            // Dispatch a lightweight in-page event so UI can react immediately to important keys
            try {
                if (typeof document !== 'undefined') {
                    const ev = new CustomEvent('goboStorageUpdated', { detail: { key } });
                    document.dispatchEvent(ev);
                }
            } catch(e) { /* ignore */ }
        },
        removeItem(key) {
            internal.delete(key);
            debugStore('removeItem', key);
            if (extStorage) {
                try {
                    try {
                        const maybePromise = extStorage.remove(key, () => {
                            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) debugStore('removeItem lastError', chrome.runtime.lastError);
                        });
                        if (maybePromise && typeof maybePromise.then === 'function') maybePromise.catch(e => debugStore('removeItem promise error', e));
                    } catch(cbErr) {
                        const p = extStorage.remove(key);
                        if (p && typeof p.then === 'function') p.catch(e => debugStore('removeItem promise error', e));
                    }
                } catch(e) { debugStore('removeItem error', key, e); }
            }
        },
        key(index) {
            const keys = Array.from(internal.keys()).sort();
            return keys[index] || null;
        },
        get length() {
            return Array.from(internal.keys()).length;
        },
        getAllProfileKeys() {
            return Array.from(internal.keys());
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
    // Manual storage quota probe (call from console when needed).
    try {
        if (typeof window !== 'undefined' && !window.goboDiagnoseStorageQuota) {
            window.goboDiagnoseStorageQuota = async function() {
                const estimateQuota = async () => {
                    try {
                        if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
                            const estimate = await navigator.storage.estimate();
                            if (estimate && (typeof estimate.quota === 'number' || typeof estimate.usage === 'number')) {
                                infoStore('quotaProbe', {
                                    quotaBytes: estimate.quota ?? null,
                                    usageBytes: estimate.usage ?? null,
                                    method: 'storage.estimate'
                                });
                                return estimate;
                            }
                        }
                    } catch (e) {
                        infoStore('quotaProbe', { error: String(e), method: 'storage.estimate' });
                    }
                    return null;
                };
                const storage = (typeof browser !== 'undefined' && browser.storage && browser.storage.local)
                    ? browser.storage.local
                    : (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local ? chrome.storage.local : null);
                if (!storage || extStorage === idbStorage) {
                    const estimate = await estimateQuota();
                    if (!estimate) infoStore('quotaProbe', 'storage.local unavailable');
                    return estimate?.quota ?? null;
                }
                const key = '__goboStorageQuotaProbe';
                const supportsPromise = (() => { try { return storage.set({}).then; } catch(e) { return false; } })();
                const setValue = (value) => new Promise((resolve, reject) => {
                    try {
                        const payload = { [key]: value };
                        if (supportsPromise) {
                            storage.set(payload).then(() => resolve()).catch(reject);
                            return;
                        }
                        storage.set(payload, () => {
                            try {
                                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
                                    reject(chrome.runtime.lastError);
                                    return;
                                }
                            } catch(e) {}
                            resolve();
                        });
                    } catch (e) { reject(e); }
                });
                const removeKey = () => new Promise((resolve) => {
                    try {
                        if (supportsPromise) {
                            storage.remove(key).then(() => resolve()).catch(() => resolve());
                            return;
                        }
                        storage.remove(key, () => resolve());
                    } catch(e) { resolve(); }
                });

                let low = 0;
                let high = 1024 * 1024 * 5; // 5MB upper bound probe
                let lastOk = 0;
                while (low <= high) {
                    const mid = Math.floor((low + high) / 2);
                    const testValue = 'x'.repeat(mid);
                    try {
                        await setValue(testValue);
                        lastOk = mid;
                        low = mid + 1;
                    } catch (e) {
                        high = mid - 1;
                    }
                }
                await removeKey();
                infoStore('quotaProbe', { maxBytes: lastOk, method: 'storage.local' });
                if (lastOk === 0) await estimateQuota();
                return lastOk;
            };
        }
        if (isSafari && typeof window !== 'undefined' && typeof window.goboDiagnoseStorageQuota === 'function') {
            window.goboDiagnoseStorageQuota();
        }
    } catch(e) { /* ignore */ }
    // Best-effort flush on page hide/unload to avoid losing pending writes on iOS
    try {
        if (typeof window !== 'undefined') {
            window.addEventListener('pagehide', () => flushNow());
            window.addEventListener('beforeunload', () => flushNow());
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') flushNow();
            });
        }
    } catch(e) { /* ignore */ }
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
                                debugStore('App.ProfileCache["goob-combined-linked"] deleted due to goboStorageUpdated');
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
                                                debugStore('Reloading Combined Offers profile in response to storage update');
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
                        debugStore('App.ProfileCache invalidated due to goboStorageUpdated for', key);
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
                                        debugStore('Reloading active profile in response to goboStorageUpdated for', key);
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

