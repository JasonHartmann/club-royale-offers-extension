// background.js
// Durable gobo* storage for Safari. Content scripts must not use page IndexedDB:
// that store is the website origin and does not survive sessions or profiles.
// iOS content scripts often have no storage.local, so prefer the native
// extension handler (UserDefaults, scoped per Safari profile), then
// browser.storage.local, then IndexedDB in this extension origin.
(function(){
    const NATIVE_APP_IDS = [
        'com.percex.Club-Royale-and-Blue-Chip-Offers.Extension',
        'com.percex.Club-Royale-and-Blue-Chip-Offers'
    ];
    const DB_NAME = 'gobo-extension-storage';
    const STORE_NAME = 'kv';

    function isSafari() {
        try {
            const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
            return /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
        } catch (e) { return false; }
    }

    function runtimeApi() {
        try {
            if (typeof browser !== 'undefined' && browser.runtime) return browser.runtime;
            if (typeof chrome !== 'undefined' && chrome.runtime) return chrome.runtime;
        } catch (e) { /* ignore */ }
        return null;
    }

    function extensionStorage() {
        try {
            if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) return browser.storage.local;
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) return chrome.storage.local;
        } catch (e) { /* ignore */ }
        return null;
    }

    function shouldManage(key) {
        return typeof key === 'string' && (key.startsWith('gobo') || key.startsWith('goob'));
    }

    function callNativeOnce(runtime, appId, message) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const fail = (err) => {
                if (settled) return;
                settled = true;
                reject(err || new Error('native messaging failed'));
            };
            const ok = (response) => {
                if (settled) return;
                if (response == null) return;
                settled = true;
                if (response.error) reject(new Error(response.error));
                else resolve(response);
            };
            const timer = setTimeout(() => fail(new Error('native messaging timeout')), 1500);
            const finishErr = (err) => { clearTimeout(timer); fail(err); };
            try {
                const callback = (response) => {
                    let lastError = null;
                    try { lastError = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) ? chrome.runtime.lastError : null; } catch (e) { /* ignore */ }
                    if (lastError) { finishErr(lastError); return; }
                    clearTimeout(timer);
                    ok(response);
                };
                const maybe = appId == null
                    ? runtime.sendNativeMessage(message, callback)
                    : runtime.sendNativeMessage(appId, message, callback);
                if (maybe && typeof maybe.then === 'function') {
                    maybe.then((response) => { clearTimeout(timer); ok(response); }, finishErr);
                }
            } catch (e) { finishErr(e); }
        });
    }

    let nativeDown = false;

    function sendNative(message) {
        if (nativeDown) return Promise.reject(new Error('native messaging unavailable'));
        const runtime = runtimeApi();
        if (!runtime || typeof runtime.sendNativeMessage !== 'function') {
            nativeDown = true;
            return Promise.reject(new Error('native messaging unavailable'));
        }
        return callNativeOnce(runtime, NATIVE_APP_IDS[0], message).catch((err) => {
            nativeDown = true;
            throw err;
        });
    }

    function callStorage(api, method, arg) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (err, value) => {
                if (settled) return;
                settled = true;
                if (err) reject(err); else resolve(value);
            };
            try {
                const maybe = api[method](arg, (value) => {
                    let lastError = null;
                    try { lastError = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) ? chrome.runtime.lastError : null; } catch (e) { /* ignore */ }
                    if (lastError) finish(lastError);
                    else finish(null, value);
                });
                if (maybe && typeof maybe.then === 'function') maybe.then((value) => finish(null, value), (err) => finish(err));
            } catch (e) { finish(e); }
        });
    }

    function handleExtensionStorage(message) {
        const storage = extensionStorage();
        if (!storage) return Promise.reject(new Error('storage.local unavailable'));
        const op = message.op || '';
        if (op === 'get') {
            return callStorage(storage, 'get', message.keys == null ? null : message.keys).then((items) => {
                const result = {};
                Object.keys(items || {}).forEach((key) => {
                    if (shouldManage(key)) result[key] = items[key];
                });
                return { result };
            });
        }
        if (op === 'set') return callStorage(storage, 'set', message.entries || {}).then(() => ({ result: {} }));
        if (op === 'remove') {
            const keys = Array.isArray(message.keys) ? message.keys : [];
            return callStorage(storage, 'remove', keys).then(() => ({ result: {} }));
        }
        if (op === 'clear') {
            return new Promise((resolve, reject) => {
                try {
                    const maybe = storage.clear(() => {
                        let lastError = null;
                        try { lastError = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) ? chrome.runtime.lastError : null; } catch (e) { /* ignore */ }
                        if (lastError) reject(lastError); else resolve({ result: {} });
                    });
                    if (maybe && typeof maybe.then === 'function') maybe.then(() => resolve({ result: {} }), reject);
                } catch (e) { reject(e); }
            });
        }
        return Promise.reject(new Error('Unknown operation'));
    }

    const openDb = () => new Promise((resolve, reject) => {
        try {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch (e) { reject(e); }
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
        } catch (e) { finish(e); }
    }));

    function handleIdb(message) {
        const op = message.op || '';
        if (op === 'get') {
            const keys = message.keys == null ? null : (Array.isArray(message.keys) ? message.keys : [message.keys]);
            return withStore('readonly', (store, setResult) => {
                const result = {};
                if (keys == null) {
                    const req = store.getAll();
                    req.onsuccess = () => {
                        (req.result || []).forEach((entry) => {
                            if (entry && shouldManage(entry.key)) result[entry.key] = entry.value;
                        });
                        setResult(result);
                    };
                    req.onerror = () => setResult(result);
                    return;
                }
                if (!keys.length) { setResult(result); return; }
                let remaining = keys.length;
                keys.forEach((key) => {
                    const req = store.get(key);
                    req.onsuccess = () => {
                        if (req.result && Object.prototype.hasOwnProperty.call(req.result, 'value')) result[key] = req.result.value;
                        remaining -= 1;
                        if (remaining === 0) setResult(result);
                    };
                    req.onerror = () => { remaining -= 1; if (remaining === 0) setResult(result); };
                });
            }).then((result) => ({ result }));
        }
        if (op === 'set') {
            const payload = (message.entries && typeof message.entries === 'object') ? message.entries : {};
            return withStore('readwrite', (store) => {
                Object.keys(payload).forEach((key) => {
                    if (shouldManage(key)) store.put({ key, value: payload[key] });
                });
            }).then(() => ({ result: {} }));
        }
        if (op === 'remove') {
            const keys = Array.isArray(message.keys) ? message.keys : [];
            return withStore('readwrite', (store) => { keys.forEach((key) => { try { store.delete(key); } catch (e) { /* ignore */ } }); }).then(() => ({ result: {} }));
        }
        if (op === 'clear') {
            return withStore('readwrite', (store) => {
                const req = store.getAllKeys ? store.getAllKeys() : store.getAll();
                req.onsuccess = () => {
                    (req.result || []).forEach((entry) => {
                        const key = typeof entry === 'string' ? entry : entry && entry.key;
                        if (shouldManage(key)) store.delete(key);
                    });
                };
            }).then(() => ({ result: {} }));
        }
        return Promise.resolve({ error: 'Unknown operation' });
    }

    function handleMessage(message) {
        if (!message || message.channel !== 'gobo-storage') return null;
        // storage.local is per Safari profile and is what persisted in the live Mac test.
        // Native UserDefaults is only the iOS fallback, when storage.local throws or is missing.
        // A failed native call is remembered so later reads are not delayed for seconds.
        const run = () => handleExtensionStorage(message).catch(() => {
            if (!isSafari()) return handleIdb(message);
            return sendNative(message).catch(() => handleIdb(message));
        });
        return run().catch((err) => ({ error: String(err && err.message ? err.message : err) }));
    }

    try {
        const runtime = runtimeApi();
        if (runtime && runtime.onMessage && runtime.onMessage.addListener) {
            runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message && message.channel === 'gobo-flyer' && typeof message.html === 'string') {
                    try {
                        const blob = new Blob([message.html], { type: 'text/html' });
                        const url = URL.createObjectURL(blob);
                        const tabs = (typeof browser !== 'undefined' && browser.tabs) ? browser.tabs : chrome.tabs;
                        tabs.create({ url });
                        setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 60000);
                        sendResponse({ ok: true });
                    } catch (e) {
                        sendResponse({ error: String(e && e.message ? e.message : e) });
                    }
                    return false;
                }
                const result = handleMessage(message);
                if (!result) return false;
                result.then((payload) => sendResponse(payload)).catch((err) => {
                    sendResponse({ error: String(err && err.message ? err.message : err) });
                });
                return true;
            });
        }
    } catch (e) { /* ignore */ }
})();
