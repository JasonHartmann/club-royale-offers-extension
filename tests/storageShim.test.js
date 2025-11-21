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
