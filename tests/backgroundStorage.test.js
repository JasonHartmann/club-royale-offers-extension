describe('Safari background storage owner', () => {
  afterEach(() => {
    delete global.navigator;
    delete global.browser;
    delete global.chrome;
    delete global.indexedDB;
  });
  function installNative(native) {
    return function sendNativeMessage(appIdOrMessage, messageOrCb, maybeCb) {
      const message = appIdOrMessage && typeof appIdOrMessage === 'object' ? appIdOrMessage : messageOrCb;
      const cb = typeof messageOrCb === 'function' ? messageOrCb : maybeCb;
      if (message && message.op === 'set') Object.assign(native, message.entries || {});
      const response = { result: message && message.op === 'get' ? { ...native } : {} };
      if (typeof cb === 'function') cb(response);
      return Promise.resolve(response);
    };
  }


  test('Safari mirrors a write to native storage and keeps storage.local', (done) => {
    const local = {};
    const native = {};
    let listener = null;
    global.navigator = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
    };
    global.browser = {
      runtime: {
        sendNativeMessage: installNative(native),
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
        expect(native['gobo-R-a']).toBe('1');
        done();
      } catch (e) { done(e); }
    });
  });

  test('Mac set returns storage.local when native messaging never answers', (done) => {
    const local = {};
    let listener = null;
    global.navigator = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
    };
    global.browser = {
      runtime: {
        sendNativeMessage() {},
        onMessage: { addListener: (fn) => { listener = fn; } }
      },
      storage: {
        local: {
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
    const started = Date.now();
    listener({ channel: 'gobo-storage', op: 'set', entries: { 'gobo-R-a': '1' } }, {}, (response) => {
      try {
        expect(response.error).toBeUndefined();
        expect(local['gobo-R-a']).toBe('1');
        expect(Date.now() - started).toBeLessThan(1000);
        done();
      } catch (e) { done(e); }
    });
  }, 3000);


  test('get returns native profiles when storage.local was wiped', (done) => {
    const local = {};
    const native = { 'gobo-R-first': 'kept', 'gobo-R-second': 'also' };
    let listener = null;
    global.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    };
    global.browser = {
      runtime: {
        sendNativeMessage: installNative(native),
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
    listener({ channel: 'gobo-storage', op: 'get', keys: null }, {}, (response) => {
      try {
        expect(response.result['gobo-R-first']).toBe('kept');
        expect(response.result['gobo-R-second']).toBe('also');
        setTimeout(() => {
          try {
            expect(local['gobo-R-first']).toBe('kept');
            expect(local['gobo-R-second']).toBe('also');
            done();
          } catch (e) { done(e); }
        }, 30);
      } catch (e) { done(e); }
    });
  });

  test('iOS get prefers native when storage.local is stale', (done) => {
    const local = { 'gobo-R-first': 'stale' };
    const native = { 'gobo-R-first': 'kept' };
    let listener = null;
    global.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    };
    global.browser = {
      runtime: {
        sendNativeMessage: installNative(native),
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
    listener({ channel: 'gobo-storage', op: 'get', keys: null }, {}, (response) => {
      try {
        expect(response.result['gobo-R-first']).toBe('kept');
        done();
      } catch (e) { done(e); }
    });
  });

  test('Mac get prefers storage.local over a different native value', (done) => {
    const local = { 'gobo-R-first': 'profile-copy' };
    const native = { 'gobo-R-first': 'other-profile' };
    let listener = null;
    global.navigator = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
    };
    global.browser = {
      runtime: {
        sendNativeMessage: installNative(native),
        onMessage: { addListener: (fn) => { listener = fn; } }
      },
      storage: {
        local: {
          get(keys, cb) {
            const value = { ...local };
            if (cb) cb(value);
            return Promise.resolve(value);
          },
          set() { return Promise.resolve(); }
        }
      }
    };
    jest.resetModules();
    require('../background');
    listener({ channel: 'gobo-storage', op: 'get', keys: null }, {}, (response) => {
      try {
        expect(response.result['gobo-R-first']).toBe('profile-copy');
        done();
      } catch (e) { done(e); }
    });
  });

  test('Mac get returns storage.local when native messaging never answers', (done) => {
    const local = { 'gobo-R-first': 'profile-copy' };
    let listener = null;
    global.navigator = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
    };
    global.browser = {
      runtime: {
        sendNativeMessage() {},
        onMessage: { addListener: (fn) => { listener = fn; } }
      },
      storage: {
        local: {
          get(keys, cb) {
            const value = { ...local };
            if (cb) cb(value);
            return Promise.resolve(value);
          }
        }
      }
    };
    jest.resetModules();
    require('../background');
    const started = Date.now();
    listener({ channel: 'gobo-storage', op: 'get', keys: null }, {}, (response) => {
      try {
        expect(response.result['gobo-R-first']).toBe('profile-copy');
        expect(Date.now() - started).toBeLessThan(1000);
        done();
      } catch (e) { done(e); }
    });
  }, 3000);


  test('iOS get returns native when storage.local never answers', (done) => {
    const native = { 'gobo-R-first': 'kept' };
    let listener = null;
    global.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    };
    global.browser = {
      runtime: {
        sendNativeMessage: installNative(native),
        onMessage: { addListener: (fn) => { listener = fn; } }
      },
      storage: {
        local: {
          get() {}
        }
      }
    };
    jest.resetModules();
    require('../background');
    listener({ channel: 'gobo-storage', op: 'get', keys: null }, {}, (response) => {
      try {
        expect(response.result['gobo-R-first']).toBe('kept');
        done();
      } catch (e) { done(e); }
    });
  }, 5000);


  test('uses native messaging only when storage.local throws', (done) => {
    const native = {};
    let listener = null;
    global.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    };
    global.browser = {
      runtime: {
        sendNativeMessage: installNative(native),
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
  test('Safari reaches the extension handler when a bundle id is rejected', (done) => {
    const native = {};
    let listener = null;
    global.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    };
    global.browser = {
      runtime: {
        sendNativeMessage(appIdOrMessage, messageOrCb) {
          if (typeof appIdOrMessage === 'string') return Promise.reject(new Error('no such native host'));
          if (appIdOrMessage && appIdOrMessage.op === 'set') Object.assign(native, appIdOrMessage.entries || {});
          const response = { result: {} };
          if (typeof messageOrCb === 'function') messageOrCb(response);
          return Promise.resolve(response);
        },
        onMessage: { addListener: (fn) => { listener = fn; } }
      },
      storage: {
        local: {
          set(items, cb) {
            if (cb) cb();
            return Promise.resolve();
          }
        }
      }
    };
    jest.resetModules();
    require('../background');
    listener({ channel: 'gobo-storage', op: 'set', entries: { 'gobo-ios': 'direct' } }, {}, (response) => {
      try {
        expect(response.error).toBeUndefined();
        expect(native['gobo-ios']).toBe('direct');
        done();
      } catch (e) { done(e); }
    });
  });


  test('does not report an iOS write as saved when native messaging fails', (done) => {
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
          }
        }
      }
    };
    jest.resetModules();
    require('../background');
    listener({ channel: 'gobo-storage', op: 'set', entries: { 'gobo-ios': 'kept' } }, {}, (response) => {
      try {
        expect(response.error).toBe('native messaging failed');
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
        expect(response.error).toBe('native messaging failed');
        expect(records.get('gobo-ios')).toBe('idb');
        done();
      } catch (e) { done(e); }
    });
  });

  test('flyer message opens a blob tab', (done) => {
    let listener = null;
    const created = [];
    global.navigator = { userAgent: 'Mozilla/5.0 Firefox/156.0' };
    global.URL.createObjectURL = () => 'blob:flyer';
    global.URL.revokeObjectURL = () => {};
    global.browser = {
      runtime: { onMessage: { addListener: (fn) => { listener = fn; } } },
      tabs: { create: (opts) => { created.push(opts); return Promise.resolve({}); } }
    };
    jest.resetModules();
    require('../background');
    listener({ channel: 'gobo-flyer', html: '<!doctype html><p>hi</p>' }, {}, (resp) => {
      try {
        expect(resp.ok).toBe(true);
        expect(created[0].url).toBe('blob:flyer');
        done();
      } catch (e) { done(e); }
    });
  });
});
