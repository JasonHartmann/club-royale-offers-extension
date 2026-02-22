// background.js
// MV3 service worker to provide persistent storage for Safari/iOS via IndexedDB.
(function(){
    const DB_NAME = 'gobo-extension-storage';
    const STORE_NAME = 'kv';

    function debugEnabled(){ try { return !!globalThis.GOBO_DEBUG_LOGS; } catch(e){ return false; } }
    function log(...args){ if (!debugEnabled()) return; try { console.info('[GoboStoreBG]', ...args); } catch(e){} }

    const openDb = () => new Promise((resolve, reject) => {
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

    const normalizeKeys = (input) => {
        if (input == null) return null;
        if (Array.isArray(input)) return input;
        if (typeof input === 'string') return [input];
        if (typeof input === 'object') return Object.keys(input);
        return null;
    };

    const handlers = {
        get(message) {
            const keys = normalizeKeys(message.keys);
            return withStore('readonly', (store, setResult) => {
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
                if (!keys.length) {
                    setResult(result);
                    return;
                }
                let remaining = keys.length;
                keys.forEach((key) => {
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
            }).then((result) => ({ result }));
        },
        set(message) {
            const payload = (message.entries && typeof message.entries === 'object') ? message.entries : {};
            return withStore('readwrite', (store) => {
                Object.keys(payload).forEach((key) => {
                    try { store.put({ key, value: payload[key] }); } catch (e) { /* ignore */ }
                });
            }).then(() => ({ result: {} }));
        },
        remove(message) {
            const keys = normalizeKeys(message.keys) || [];
            return withStore('readwrite', (store) => {
                keys.forEach((key) => {
                    try { store.delete(key); } catch (e) { /* ignore */ }
                });
            }).then(() => ({ result: {} }));
        },
        clear() {
            return withStore('readwrite', (store) => {
                try { store.clear(); } catch (e) { /* ignore */ }
            }).then(() => ({ result: {} }));
        }
    };

    function handleMessage(message) {
        if (!message || message.channel !== 'gobo-storage') return null;
        const op = message.op || '';
        const handler = handlers[op];
        if (!handler) return Promise.resolve({ error: 'Unknown operation' });
        return handler(message).catch((err) => ({ error: String(err && err.message ? err.message : err) }));
    }

    try {
        const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : (typeof chrome !== 'undefined' ? chrome.runtime : null);
        if (runtime && runtime.onMessage && runtime.onMessage.addListener) {
            runtime.onMessage.addListener((message, sender, sendResponse) => {
                const result = handleMessage(message);
                if (!result) return false;
                result.then((payload) => {
                    try { log('message', message.op || 'unknown'); } catch(e){}
                    sendResponse(payload);
                }).catch((err) => {
                    sendResponse({ error: String(err && err.message ? err.message : err) });
                });
                return true;
            });
            log('background ready');
        }
    } catch(e) {
        // ignore
    }
})();
