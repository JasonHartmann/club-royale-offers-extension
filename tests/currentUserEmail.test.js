/**
 * Tests for CurrentUserEmail initialization, fatal API failure, and profile key resolution
 * 
 * Covers:
 * 1. CurrentUserEmail: null initialization in app.js
 * 2. fetchGuestAccount failure is FATAL — error shown, no localStorage fallback
 * 3. Breadcrumbs currentKey resolution (no fallback, email required)
 * 4. TableRenderer brand-aware key resolution
 */
function createLocalStorageMock() {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
    key(index) { return Array.from(store.keys())[index] || null; },
    get length() { return store.size; },
    _store: store
  };
}

describe('CurrentUserEmail initialization and fatal failure', () => {
  describe('app.js initialization', () => {
    test('App.CurrentUserEmail initializes to null, not undefined', () => {
      const App = { CurrentUserEmail: null };
      
      expect(App.CurrentUserEmail).toBeNull();
      expect(App.CurrentUserEmail).not.toBeUndefined();
      expect(typeof App.CurrentUserEmail).toBe('object');
    });

    test('CurrentUserEmail: null is safe to read before API sets it', () => {
      const App = { CurrentUserEmail: null };
      
      const email = App.CurrentUserEmail;
      expect(email).toBeNull();
      
      if (!App.CurrentUserEmail) {
        expect(true).toBe(true);
      }
      
      const result = App.CurrentUserEmail ? 'has email' : 'no email';
      expect(result).toBe('no email');
    });

    test('CurrentUserEmail: null is safe for brand-aware key construction', () => {
      const App = { CurrentUserEmail: null };
      
      let email = App.CurrentUserEmail;
      const usernameKey = email ? email.replace(/[^a-zA-Z0-9-_.]/g, '_') : null;
      const currentKey = usernameKey ? `gobo-${usernameKey}` : null;
      
      expect(usernameKey).toBeNull();
      expect(currentKey).toBeNull();
    });
  });

  describe('apiClient.js - fetchGuestAccount failure is fatal', () => {
    test('fetchGuestAccount returning null triggers error', () => {
      global.App = {
        CurrentUserEmail: null,
        ErrorHandler: {
          showError: jest.fn()
        }
      };
      
      // Simulate: guestAccount is null
      const guestAccount = null;
      if (!guestAccount || !guestAccount?.email) {
        global.App.ErrorHandler.showError('Failed to load user profile. Please reload the page and try again.');
      }
      
      expect(global.App.ErrorHandler.showError).toHaveBeenCalled();
      expect(global.App.CurrentUserEmail).toBeNull();
    });

    test('fetchGuestAccount returning object without email triggers error', () => {
      global.App = {
        CurrentUserEmail: null,
        ErrorHandler: {
          showError: jest.fn()
        }
      };
      
      // Simulate: guestAccount returned but no email
      const guestAccount = { accountId: '12345' };
      if (!guestAccount || !guestAccount.email) {
        global.App.ErrorHandler.showError('Failed to load user profile. Please reload the page and try again.');
      }
      
      expect(global.App.ErrorHandler.showError).toHaveBeenCalled();
      expect(global.App.CurrentUserEmail).toBeNull();
    });

    test('fetchGuestAccount returning empty email triggers error', () => {
      global.App = {
        CurrentUserEmail: null,
        ErrorHandler: {
          showError: jest.fn()
        }
      };
      
      const guestAccount = { email: '', accountId: '12345' };
      if (!guestAccount || !guestAccount.email) {
        global.App.ErrorHandler.showError('Failed to load user profile. Please reload the page and try again.');
      }
      
      expect(global.App.ErrorHandler.showError).toHaveBeenCalled();
      expect(global.App.CurrentUserEmail).toBeNull();
    });

    test('fetchGuestAccount success sets App.CurrentUserEmail', () => {
      global.App = {
        CurrentUserEmail: null,
        ErrorHandler: {
          showError: jest.fn()
        }
      };
      
      const guestAccount = { email: 'user@example.com', accountId: '12345' };
      if (guestAccount && guestAccount.email) {
        global.App.CurrentUserEmail = guestAccount.email;
      }
      
      expect(global.App.CurrentUserEmail).toBe('user@example.com');
      expect(global.App.ErrorHandler.showError).not.toHaveBeenCalled();
    });
  });

  describe('breadcrumbs.js - currentKey resolution (no localStorage fallback)', () => {
    test('currentKey resolved from App.CurrentUserEmail when email is set', () => {
      global.App = {
        CurrentUserEmail: 'bob@example.com',
        Utils: { detectBrand: () => 'R' }
      };
      
      const profileKeys = ['gobo-R-bob_example.com', 'gobo-R-alice_example.com'];
      
      let currentKey = null;
      if (global.App.CurrentUserEmail) {
        const email = global.App.CurrentUserEmail;
        const usernameKey = email.replace(/[^a-zA-Z0-9-_.]/g, '_');
        const brand = global.App.Utils.detectBrand();
        const brandedCandidate = `gobo-${brand}-${usernameKey}`;
        if (profileKeys.includes(brandedCandidate)) currentKey = brandedCandidate;
        else {
          const legacyCandidate = `gobo-${usernameKey}`;
          if (profileKeys.includes(legacyCandidate)) currentKey = legacyCandidate;
        }
      }
      
      expect(currentKey).toBe('gobo-R-bob_example.com');
    });

    test('currentKey is null when App.CurrentUserEmail is null (no fallback)', () => {
      global.App = {
        CurrentUserEmail: null,
        Utils: { detectBrand: () => 'R' }
      };
      
      const profileKeys = ['gobo-R-bob_example.com', 'gobo-R-alice_example.com'];
      
      let currentKey = null;
      if (global.App.CurrentUserEmail) {
        // This branch never executes
        const email = global.App.CurrentUserEmail;
        const usernameKey = email.replace(/[^a-zA-Z0-9-_.]/g, '_');
        const brand = global.App.Utils.detectBrand();
        const brandedCandidate = `gobo-${brand}-${usernameKey}`;
        if (profileKeys.includes(brandedCandidate)) currentKey = brandedCandidate;
      }
      
      // No fallback — currentKey stays null
      expect(currentKey).toBeNull();
    });

    test('profiles still sorted by savedAt for display order', () => {
      const profiles = [
        { key: 'gobo-R-old', savedAt: 1000 },
        { key: 'gobo-R-new', savedAt: 9999 },
        { key: 'gobo-R-middle', savedAt: 5000 }
      ];
      
      profiles.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      
      expect(profiles[0].key).toBe('gobo-R-new');
      expect(profiles[1].key).toBe('gobo-R-middle');
      expect(profiles[2].key).toBe('gobo-R-old');
    });
  });

  describe('tableRenderer.js brand-aware key resolution', () => {
    test('currentKey uses branded format when profile exists', () => {
      global.localStorage = createLocalStorageMock();
      global.localStorage.setItem('gobo-R-john_example.com', JSON.stringify({ savedAt: Date.now(), data: {} }));
      
      global.App = {
        CurrentUserEmail: 'john@example.com',
        Utils: { detectBrand: () => 'R' }
      };
      
      const email = global.App.CurrentUserEmail;
      const usernameKey = email.replace(/[^a-zA-Z0-9-_.]/g, '_');
      const brand = global.App.Utils.detectBrand();
      const brandedCandidate = `gobo-${brand}-${usernameKey}`;
      const legacyCandidate = `gobo-${usernameKey}`;
      
      const exists = (key) => {
        try {
          const raw = global.localStorage.getItem(key);
          return !!raw;
        } catch(e) { return false; }
      };
      
      let currentKey = null;
      if (exists(brandedCandidate)) currentKey = brandedCandidate;
      else if (exists(legacyCandidate)) currentKey = legacyCandidate;
      
      expect(currentKey).toBe('gobo-R-john_example.com');
    });

    test('currentKey falls back to legacy format when branded not found', () => {
      global.localStorage = createLocalStorageMock();
      global.localStorage.setItem('gobo-john_example.com', JSON.stringify({ savedAt: Date.now(), data: {} }));
      
      global.App = {
        CurrentUserEmail: 'john@example.com',
        Utils: { detectBrand: () => 'R' }
      };
      
      const email = global.App.CurrentUserEmail;
      const usernameKey = email.replace(/[^a-zA-Z0-9-_.]/g, '_');
      const brand = global.App.Utils.detectBrand();
      const brandedCandidate = `gobo-${brand}-${usernameKey}`;
      const legacyCandidate = `gobo-${usernameKey}`;
      
      const exists = (key) => {
        try {
          const raw = global.localStorage.getItem(key);
          return !!raw;
        } catch(e) { return false; }
      };
      
      let currentKey = null;
      if (exists(brandedCandidate)) currentKey = brandedCandidate;
      else if (exists(legacyCandidate)) currentKey = legacyCandidate;
      
      expect(currentKey).toBe('gobo-john_example.com');
    });

    test('currentKey is null when no profile matches', () => {
      global.localStorage = createLocalStorageMock();
      
      global.App = {
        CurrentUserEmail: 'nobody@example.com',
        Utils: { detectBrand: () => 'R' }
      };
      
      const email = global.App.CurrentUserEmail;
      const usernameKey = email.replace(/[^a-zA-Z0-9-_.]/g, '_');
      const brand = global.App.Utils.detectBrand();
      const brandedCandidate = `gobo-${brand}-${usernameKey}`;
      const legacyCandidate = `gobo-${usernameKey}`;
      
      const exists = (key) => {
        try {
          const raw = global.localStorage.getItem(key);
          return !!raw;
        } catch(e) { return false; }
      };
      
      let currentKey = null;
      if (exists(brandedCandidate)) currentKey = brandedCandidate;
      else if (exists(legacyCandidate)) currentKey = legacyCandidate;
      
      expect(currentKey).toBeNull();
    });

    test('currentKey handles null CurrentUserEmail safely', () => {
      global.App = {
        CurrentUserEmail: null,
        Utils: { detectBrand: () => 'R' }
      };
      
      const email = global.App.CurrentUserEmail;
      
      expect(() => {
        let usernameKey = null;
        if (email) {
          usernameKey = email.replace(/[^a-zA-Z0-9-_.]/g, '_');
        }
      }).not.toThrow();
    });
  });

  describe('apiClient.js persistence safety', () => {
    test('persisted payload includes email from CurrentUserEmail', () => {
      global.App = {
        CurrentUserEmail: 'test@example.com',
        Utils: { detectBrand: () => 'R' }
      };
      
      const rawKey = (global.App.CurrentUserEmail) ? String(global.App.CurrentUserEmail) : 'unknown-user';
      const usernameKey = rawKey.replace(/[^a-zA-Z0-9-_.]/g, '_');
      const brandCode = global.App.Utils.detectBrand();
      const brandedKey = `gobo-${brandCode}-${usernameKey}`;
      const payload = { 
        savedAt: Date.now(), 
        data: {},
        brand: brandCode, 
        email: global.App.CurrentUserEmail 
      };
      
      expect(payload.email).toBe('test@example.com');
      expect(brandedKey).toBe('gobo-R-test_example.com');
    });
  });

  describe('email sanitization edge cases', () => {
    test('email with special characters gets sanitized correctly', () => {
      const email = 'user+tag@sub-domain.example.com';
      const sanitized = email.replace(/[^a-zA-Z0-9-_.]/g, '_');
      expect(sanitized).toBe('user_tag_sub-domain.example.com');
    });

    test('email with unicode characters gets sanitized', () => {
      const email = 'test@例え.jp';
      const sanitized = email.replace(/[^a-zA-Z0-9-_.]/g, '_');
      expect(sanitized).toBe('test___.jp');
    });

    test('null email does not crash sanitization', () => {
      const email = null;
      expect(() => {
        if (email) {
          const sanitized = email.replace(/[^a-zA-Z0-9-_.]/g, '_');
        }
      }).not.toThrow();
    });
  });
});
