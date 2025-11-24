function createLocalStorageMock() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index) {
      return Array.from(store.keys())[index] || null;
    },
    get length() {
      return store.size;
    }
  };
}

function loadProfileIdManager() {
  jest.resetModules();
  ['ProfileIdManager', 'cleanupRestrictedProfileArtifacts', 'getLinkedAccounts', 'setLinkedAccounts', 'mergeProfiles', 'updateCombinedOffersCache']
    .forEach((key) => {
      try {
        delete global[key];
      } catch (e) {
        /* ignore */
      }
    });
  global.localStorage = createLocalStorageMock();
  global.window = global;
  global.App = {};
  const manager = require('../features/profileIdManager');
  return manager;
}

describe('ProfileIdManager', () => {
  test('assigns sequential IDs to new gobo profile keys', () => {
    const manager = loadProfileIdManager();
    manager.ensureIds(['gobo-X-alpha', 'gobo-X-beta']);

    expect(manager.getId('gobo-X-alpha')).toBe(1);
    expect(manager.getId('gobo-X-beta')).toBe(2);

    expect(manager.map).toEqual({ 'gobo-X-alpha': 1, 'gobo-X-beta': 2 });
    expect(manager.next).toBe(3);
  });

  test('reuses freed IDs after profiles are removed', () => {
    const manager = loadProfileIdManager();
    manager.ensureIds(['gobo-X-alpha', 'gobo-X-beta']);

    manager.removeKeys(['gobo-X-alpha']);
    expect(manager.free).toContain(1);

    manager.ensureIds(['gobo-X-gamma']);
    expect(manager.getId('gobo-X-gamma')).toBe(1);

    expect(manager.map['gobo-X-gamma']).toBe(1);
  });

  test('sanitizeProfileKeys removes restricted keys', () => {
    const manager = loadProfileIdManager();
    const removeSpy = jest.spyOn(manager, 'removeKeys');

    const result = manager.sanitizeProfileKeys(['gobo-R-blocked', 'gobo-X-alpha']);

    expect(result.filteredKeys).toEqual(['gobo-X-alpha']);
    expect(result.removedKeys).toEqual(['gobo-R-blocked']);

    expect(removeSpy).toHaveBeenCalledWith(['gobo-R-blocked']);
  });
});
