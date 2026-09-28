describe('Safari background storage owner', () => {
  afterEach(() => {
    delete global.navigator;
    delete global.browser;
    delete global.chrome;
    delete global.indexedDB;
  });

  test('Safari writes storage.local and does not call native messaging', (done) => {
    const local = {};
    let nativeCalls = 0;
    let listener = null;
    global.navigator = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
    };
    global.browser = {
      runtime: {
        sendNativeMessage() { nativeCalls += 1; return Promise.reject(new Error('native should not be used')); },
        onMessage: { addListener: (fn) => { listener = fn; } }
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
    require('../background');
    listener({ channel: 'gobo-storage', op: 'set', entries: { 'gobo-R-a': '1' } }, {}, (response) => {
      try {
        expect(response.error).toBeUndefined();
        expect(local['gobo-R-a']).toBe('1');
        expect(nativeCalls).toBe(0);
        done();
      } catch (e) { done(e); }
    });
  });

  test('uses native messaging only when storage.local throws', (done) => {
    const native = {};
    let listener = null;
    global.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    };
    global.browser = {
      runtime: {
        sendNativeMessage(appId, message, cb) {
          if (message && message.op === 'set') Object.assign(native, message.entries || {});
          const response = { result: {} };
          if (cb) cb(response);
          return Promise.resolve(response);
        },
        onMessage: { addListener: (fn) => { listener = fn; } }
      },
      storage: {
        local: {
          set() { return Promise.reject(new Error('storage.local unavailable')); }
        }
      }
    };
    jest.resetModules();
    require('../background');
    listener({ channel: 'gobo-storage', op: 'set', entries: { 'gobo-ios': 'native' } }, {}, (response) => {
      try {
        expect(response.error).toBeUndefined();
        expect(native['gobo-ios']).toBe('native');
        done();
      } catch (e) { done(e); }
    });
  });

  test('falls back to storage.local when native messaging fails', (done) => {
    const local = {};
    let listener = null;
    global.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    };
    global.browser = {
      runtime: {
        sendNativeMessage() { return Promise.reject(new Error('native missing')); },
        onMessage: { addListener: (fn) => { listener = fn; } }
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
          },
          remove(keys, cb) {
            (Array.isArray(keys) ? keys : [keys]).forEach((key) => { delete local[key]; });
            if (cb) cb();
            return Promise.resolve();
          },
          clear(cb) {
            Object.keys(local).forEach((key) => { delete local[key]; });
            if (cb) cb();
            return Promise.resolve();
          }
        }
      }
    };
    jest.resetModules();
    require('../background');
    listener({ channel: 'gobo-storage', op: 'set', entries: { 'gobo-ios': 'kept' } }, {}, (response) => {
      try {
        expect(response.error).toBeUndefined();
        expect(local['gobo-ios']).toBe('kept');
        done();
      } catch (e) { done(e); }
    });
  });

  test('uses extension IndexedDB when native and storage.local are unavailable', (done) => {
    const records = new Map();
    let listener = null;
    global.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    };
    global.indexedDB = {
      open() {
        const request = {};
        const db = {
          objectStoreNames: { contains: () => true },
          transaction() {
            const tx = {
              objectStore() {
                return {
                  getAll() {
                    const req = {};
                    queueMicrotask(() => {
                      req.result = Array.from(records.entries()).map(([key, value]) => ({ key, value }));
                      if (req.onsuccess) req.onsuccess();
                    });
                    return req;
                  },
                  put(entry) { records.set(entry.key, entry.value); },
                  delete(key) { records.delete(key); }
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
        queueMicrotask(() => {
          request.result = db;
          if (request.onsuccess) request.onsuccess();
        });
        return request;
      }
    };
    global.browser = {
      runtime: {
        sendNativeMessage() { return Promise.reject(new Error('native missing')); },
        onMessage: { addListener: (fn) => { listener = fn; } }
      }
    };
    jest.resetModules();
    require('../background');
    listener({ channel: 'gobo-storage', op: 'set', entries: { 'gobo-ios': 'idb' } }, {}, (response) => {
      try {
        expect(response.error).toBeUndefined();
        expect(records.get('gobo-ios')).toBe('idb');
        done();
      } catch (e) { done(e); }
    });
  });
});
