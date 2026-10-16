// background.js
// Durable gobo* storage for Safari. Content scripts must not use page IndexedDB:
// that store is the website origin and does not survive sessions or profiles.
// Mac storage.local is per profile and wins on read. iOS storage.local can
// return a stale snapshot or never call back, so a native value wins there
// and a hung local or IndexedDB read cannot block it.
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

    function isIOSDevice() {
        try {
            const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
            return /iPhone|iPad|iPod/.test(ua);
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
            const timer = setTimeout(() => fail(new Error('native messaging timeout')), 8000);
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

    function sendNative(message) {
        const runtime = runtimeApi();
        if (!runtime || typeof runtime.sendNativeMessage !== 'function') {
            return Promise.reject(new Error('native messaging unavailable'));
        }
        // Safari routes sendNativeMessage(message) to this extension. A bundle
        // id hangs until timeout, and each extra attempt adds another 8s. The
        // content-script bridge gives up at 12s, so those extra attempts hide
        // a storage.local value that is already saved.
        const attempts = isSafari() ? [null] : NATIVE_APP_IDS.slice();
        const tryNext = (index, lastError) => {
            if (index >= attempts.length) return Promise.reject(lastError || new Error('native messaging failed'));
            return callNativeOnce(runtime, attempts[index], message).catch((err) => tryNext(index + 1, err));
        };
        return tryNext(0, null);
    }

    function managedResult(payload) {
        const result = {};
        Object.keys((payload && payload.result) || {}).forEach((key) => {
            if (shouldManage(key)) result[key] = payload.result[key];
        });
        return result;
    }

    function mergeManaged(primary, secondary) {
        const merged = {};
        Object.keys(secondary || {}).forEach((key) => {
            if (shouldManage(key)) merged[key] = secondary[key];
        });
        Object.keys(primary || {}).forEach((key) => {
            if (shouldManage(key)) merged[key] = primary[key];
        });
        return merged;
    }

    function callStorage(api, method, arg) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (err, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (err) reject(err); else resolve(value);
            };
            const timer = setTimeout(() => finish(new Error('storage.local timeout')), 2000);
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
        const timer = setTimeout(() => reject(new Error('indexedDB timeout')), 2000);
        const fail = (err) => { clearTimeout(timer); reject(err || new Error('indexedDB open failed')); };
        try {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            };
            request.onsuccess = () => { clearTimeout(timer); resolve(request.result); };
            request.onerror = () => fail(request.error);
        } catch (e) { fail(e); }
    });

    const withStore = (mode, operation) => openDb().then((db) => new Promise((resolve, reject) => {
        let result;
        let finished = false;
        const finish = (err) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            if (err) reject(err); else resolve(result);
        };
        const timer = setTimeout(() => finish(new Error('indexedDB timeout')), 2000);
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
        // storage.local is per Safari profile and can come back empty on iOS
        // after a cold start. Native UserDefaults is outside that origin. A
        // write is not durable until that copy is stored: iOS unloads this
        // service worker as soon as sendResponse runs.
        if (!isSafari()) {
            return handleExtensionStorage(message).catch(() => handleIdb(message)).catch((err) => ({ error: String(err && err.message ? err.message : err) }));
        }
        const op = message.op || '';
        if (op === 'get') {
            const extP = handleExtensionStorage(message).catch(() => ({ result: {} }));
            const idbP = handleIdb(message).catch(() => ({ result: {} }));
            const nativeP = sendNative(message).catch(() => null);
            // Mac storage.local is the per-profile copy. Do not wait out a
            // dead native call or the page reloads with an empty GoboStore.
            const nativeForMerge = isIOSDevice()
                ? nativeP
                : Promise.race([
                    nativeP,
                    new Promise((resolve) => setTimeout(() => resolve(null), 300))
                ]);
            return Promise.all([extP, idbP, nativeForMerge]).then(([ext, idb, native]) => {
                const extResult = managedResult(ext);
                const idbResult = managedResult(idb);
                const nativeResult = native ? managedResult(native) : null;

                if (!nativeResult && isIOSDevice()) {
                    const partial = mergeManaged(idbResult, extResult);
                    if (!Object.keys(partial).length) return { error: 'native messaging pending' };
                    return { result: partial };
                }
                // iOS storage.local can keep an older token after the native
                // write. Prefer native keys there. Mac storage.local is the
                // per-profile store, so it still covers native.
                const merged = (isIOSDevice() && nativeResult)
                    ? mergeManaged(nativeResult, mergeManaged(extResult, idbResult))
                    : mergeManaged(extResult, mergeManaged(nativeResult || {}, idbResult));
                if (isIOSDevice() && nativeResult) {
                    const refreshLocal = {};
                    Object.keys(nativeResult).forEach((key) => {
                        if (extResult[key] !== nativeResult[key]) refreshLocal[key] = nativeResult[key];
                    });
                    if (Object.keys(refreshLocal).length) {
                        handleExtensionStorage({ channel: 'gobo-storage', op: 'set', entries: refreshLocal }).catch(() => {});
                    }
                    const missingNative = {};
                    Object.keys(extResult).forEach((key) => {
                        if (!Object.prototype.hasOwnProperty.call(nativeResult, key)) missingNative[key] = extResult[key];
                    });
                    if (Object.keys(missingNative).length) sendNative({ channel: 'gobo-storage', op: 'set', entries: missingNative }).catch(() => {});
                }
                return { result: merged };
            }).catch((err) => ({ error: String(err && err.message ? err.message : err) }));
        }
        const localP = handleExtensionStorage(message).catch((err) => ({ error: err }));
        const nativeP = sendNative(message).then((response) => response || { result: {} }).catch((err) => ({ error: err }));
        // Same hang as get. iOS still waits, because that write is not durable
        // until UserDefaults has it. Mac already has storage.local.
        const nativeForWrite = isIOSDevice()
            ? nativeP
            : Promise.race([
                nativeP,
                new Promise((resolve) => setTimeout(() => resolve({ error: new Error('native messaging timeout') }), 300))
            ]);
        return Promise.all([localP, nativeForWrite]).then(([local, native]) => {
            if (native && !native.error) return { result: {}, build: 'native-noid' };
            return handleIdb(message).catch(() => ({})).then(() => {
                if (!isIOSDevice() && local && !local.error) return { result: {}, build: 'native-noid' };
                const detail = native && native.error ? String(native.error.message || native.error) : 'native messaging failed';
                return { error: 'native messaging failed', detail: detail, build: 'native-noid' };
            });
        });
    }

    try {
        const runtime = runtimeApi();
        if (runtime && runtime.onMessage && runtime.onMessage.addListener) {
            runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message && message.channel === 'gobo-graph' && typeof message.url === 'string') {
                    if (!/^https:\/\/(www\.)?(royalcaribbean|celebritycruises)\.com\/graph$/.test(message.url)) {
                        sendResponse({ error: 'host' });
                        return false;
                    }
                    fetch(message.url, {
                        method: message.method || 'POST',
                        headers: message.headers || { 'content-type': 'application/json' },
                        body: message.body
                    }).then(async (resp) => {
                        const body = await resp.text();
                        sendResponse({ ok: resp.ok, status: resp.status, body });
                    }).catch((err) => {
                        sendResponse({ error: String(err && err.message ? err.message : err) });
                    });
                    return true;
                }
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
