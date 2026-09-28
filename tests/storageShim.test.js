function createChromeStorageMock() {
  const store = {};
  return {
    local: {
      get: (keys, cb) => { cb({ ...store }); },
      set: (items, cb) => { Object.assign(store, items); if (cb) cb(); },
      remove: (key, cb) => { delete store[key]; if (cb) cb(); }
    }
  };
}

describe('GoboStore shim with chrome.storage mock', () => {
  beforeEach(() => {
    // Clear globals that may persist from other tests
    delete global.window;
    global.window = {};
    global.document = { addEventListener: () => {}, dispatchEvent: () => {} };
    global.chrome = createChromeStorageMock();
    // Load the shim freshly
    jest.resetModules();
    require('../features/storageShim');
  });

  test('writes and reads via chrome.storage.local', (done) => {
    try {
      // Wait a tick for GoboStore.init to finish (it uses async extStorage.get)
      setTimeout(() => {
        try {
          const pre = typeof global.window.goboStorageGet === 'function' ? global.window.goboStorageGet('goboLinkedAccounts') : null;
          expect(pre).toBeNull();
          // Use goboStorageSet to write
          global.window.goboStorageSet('goboLinkedAccounts', JSON.stringify([{ key: 'gobo-1' }]));
          // allow flush debounce to run
          setTimeout(() => {
            const raw = global.window.goboStorageGet('goboLinkedAccounts');
            expect(raw).toBe(JSON.stringify([{ key: 'gobo-1' }]));
            done();
          }, 50);
        } catch(e) { done(e); }
      }, 20);
    } catch(e) { done(e); }
  });
});

function safariUserAgent() {
  return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
}

function createMemoryIdb(seed) {
  const map = new Map(Object.entries(seed || {}));
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore() {},
    transaction() {
      const tx = {
        objectStore() {
          return {
            getAll() {
              const req = {};
              queueMicrotask(() => {
                req.result = Array.from(map.entries()).map(([key, value]) => ({ key, value }));
                if (req.onsuccess) req.onsuccess();
              });
              return req;
            },
            get(key) {
              const req = {};
              queueMicrotask(() => {
                req.result = map.has(key) ? { key, value: map.get(key) } : undefined;
                if (req.onsuccess) req.onsuccess();
              });
              return req;
            },
            put(entry) { map.set(entry.key, entry.value); },
            delete(key) { map.delete(key); },
            clear() { map.clear(); }
          };
        },
        oncomplete: null,
        onerror: null,
        onabort: null
      };
      queueMicrotask(() => queueMicrotask(() => { if (tx.oncomplete) tx.oncomplete(); }));
      return tx;
    }
  };
  return {
    open() {
      const req = {};
      queueMicrotask(() => {
        req.result = db;
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    }
  };
}

describe('GoboStore Safari persistence', () => {
  afterEach(() => {
    delete global.navigator;
    delete global.browser;
    delete global.chrome;
    delete global.indexedDB;
    delete global.window;
    delete global.document;
  });

  test('writes through the background bridge instead of page IndexedDB', (done) => {
    const persisted = {};
    global.window = {};
    global.document = { addEventListener: () => {}, dispatchEvent: () => {} };
    global.navigator = { userAgent: safariUserAgent(), platform: 'MacIntel', maxTouchPoints: 0 };
    global.browser = {
      runtime: {
        sendMessage(message, cb) {
          if (message.op === 'get') {
            const response = { result: { ...persisted } };
            if (cb) cb(response);
            return Promise.resolve(response);
          }
          if (message.op === 'set') Object.assign(persisted, message.entries || {});
          const response = { result: {} };
          if (cb) cb(response);
          return Promise.resolve(response);
        }
      },
      storage: { local: { set: () => { throw new Error('content script must not write storage.local on Safari'); } } }
    };
    jest.resetModules();
    require('../features/storageShim');
    setTimeout(() => {
      try {
        global.window.goboStorageSet('gobo-R-one', 'saved');
        setTimeout(() => {
          try {
            expect(persisted['gobo-R-one']).toBe('saved');
            expect(global.window.goboStorageGet('gobo-R-one')).toBe('saved');
            done();
          } catch (e) { done(e); }
        }, 40);
      } catch (e) { done(e); }
    }, 30);
  });

  test('copies leftover page IndexedDB into the background store once', (done) => {
    const persisted = {};
    global.window = {};
    global.document = { addEventListener: () => {}, dispatchEvent: () => {} };
    global.navigator = { userAgent: safariUserAgent(), platform: 'MacIntel', maxTouchPoints: 0 };
    global.indexedDB = createMemoryIdb({ 'gobo-R-kept': 'from-page', 'unrelated': 'nope' });
    global.browser = {
      runtime: {
        sendMessage(message, cb) {
          if (message.op === 'get') {
            const response = { result: { ...persisted } };
            if (cb) cb(response);
            return Promise.resolve(response);
          }
          if (message.op === 'set') Object.assign(persisted, message.entries || {});
          const response = { result: {} };
          if (cb) cb(response);
          return Promise.resolve(response);
        }
      }
    };
    jest.resetModules();
    require('../features/storageShim');
    const started = Date.now();
    const wait = () => {
      if (global.window.GoboStore && global.window.GoboStore.ready) {
        try {
          expect(persisted['gobo-R-kept']).toBe('from-page');
          expect(persisted.unrelated).toBeUndefined();
          expect(global.window.goboStorageGet('gobo-R-kept')).toBe('from-page');
          done();
        } catch (e) { done(e); }
        return;
      }
      if (Date.now() - started > 1500) { done(new Error('GoboStore not ready')); return; }
      setTimeout(wait, 15);
    };
    wait();
  });
  test('keeps an existing durable key and copies only missing page IndexedDB keys', (done) => {
    const persisted = { 'gobo-R-new': 'durable' };
    global.window = {};
    global.document = { addEventListener: () => {}, dispatchEvent: () => {} };
    global.navigator = { userAgent: safariUserAgent(), platform: 'MacIntel', maxTouchPoints: 0 };
    global.indexedDB = createMemoryIdb({ 'gobo-R-kept': 'from-page', 'gobo-R-new': 'stale-page' });
    global.browser = {
      runtime: {
        sendMessage(message, cb) {
          if (message.op === 'get') {
            const response = { result: { ...persisted } };
            if (cb) cb(response);
            return Promise.resolve(response);
          }
          if (message.op === 'set') Object.assign(persisted, message.entries || {});
          const response = { result: {} };
          if (cb) cb(response);
          return Promise.resolve(response);
        }
      }
    };
    jest.resetModules();
    require('../features/storageShim');
    const started = Date.now();
    const wait = () => {
      if (global.window.GoboStore && global.window.GoboStore.ready) {
        try {
          expect(persisted['gobo-R-new']).toBe('durable');
          expect(persisted['gobo-R-kept']).toBe('from-page');
          done();
        } catch (e) { done(e); }
        return;
      }
      if (Date.now() - started > 1500) { done(new Error('GoboStore not ready')); return; }
      setTimeout(wait, 15);
    };
    wait();
  });

  test('falls back to extension storage when the background bridge fails', (done) => {
    const local = {};
    global.window = {};
    global.document = { addEventListener: () => {}, dispatchEvent: () => {} };
    global.navigator = { userAgent: safariUserAgent(), platform: 'MacIntel', maxTouchPoints: 0 };
    global.browser = {
      runtime: {
        sendMessage() { return Promise.reject(new Error('no background')); }
      },
      storage: {
        local: {
          get(keys, cb) {
            const value = { ...local };
            if (cb) cb(value);
            return Promise.resolve(value);
          },
          set(items, cb) {
            Object.assign(local, items);
            if (cb) cb();
            return Promise.resolve();
          }
        }
      }
    };
    jest.resetModules();
    require('../features/storageShim');
    const started = Date.now();
    const wait = () => {
      if (global.window.GoboStore && global.window.GoboStore.ready) {
        try {
          global.window.goboStorageSet('gobo-R-fallback', 'kept');
          setTimeout(() => {
            try {
              expect(local['gobo-R-fallback']).toBe('kept');
              done();
            } catch (e) { done(e); }
          }, 80);
        } catch (e) { done(e); }
        return;
      }
      if (Date.now() - started > 2500) { done(new Error('GoboStore not ready')); return; }
      setTimeout(wait, 20);
    };
    wait();
  });
});
