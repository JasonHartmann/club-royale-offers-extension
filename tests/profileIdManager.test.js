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

function sailing(ship, date, room) {
  return { shipName: ship, sailDate: date, roomType: room, isGOBO: false };
}

function offer(code, campaign, sailings, pid) {
  const o = { campaignCode: campaign, campaignOffer: { offerCode: code, name: code, perkCodes: [], sailings } };
  if (pid) o.playerOfferId = pid;
  return o;
}

function profile(email, offers) {
  return { data: { email, offers } };
}

function rowsOf(payload) {
  const out = [];
  (payload.data.offers || []).forEach(off => {
    (off.campaignOffer.sailings || []).forEach(s => out.push({ offer: off, sailing: s }));
  });
  return out;
}

function pairKey(row) {
  return (row.sailing.__profileSources || []).map(s => s.email).sort().join('|');
}

describe('buildCombinedOffers', () => {
  const A = {
    key: 'gobo-X-a',
    email: 'a@x.com',
    profile: profile('a@x.com', [
      offer('AA', 'CAMP', [sailing('Wonder', '2026-06-01', 'Interior')], 'uA'),
      offer('OA', 'ONLYA', [sailing('Oasis', '2026-07-01', 'Balcony')]),
      offer('AS', 'SYN', [sailing('Symphony', '2026-09-01', 'Interior')])
    ])
  };
  const B = {
    key: 'gobo-X-b',
    email: 'b@x.com',
    profile: profile('b@x.com', [
      offer('BB', 'CAMP', [sailing('Wonder', '2026-06-01', 'Balcony')], 'uB'),
      offer('BS', 'SYN', [sailing('Symphony', '2026-09-01', 'Balcony')])
    ])
  };
  const C = {
    key: 'gobo-X-c',
    email: 'c@x.com',
    profile: profile('c@x.com', [
      offer('CC', 'CAMP', [sailing('Wonder', '2026-06-01', 'Ocean View')]),
      offer('OC', 'ONLYC', [sailing('Icon', '2026-08-01', 'Interior')])
    ])
  };

  beforeEach(() => {
    loadProfileIdManager();
  });

  test('pairs two profiles, and union also keeps each account copy', () => {
    const snap = JSON.stringify(A.profile);
    const paired = global.buildCombinedOffers([A, B], { unionAll: false });
    const union = global.buildCombinedOffers([A, B], { unionAll: true });
    expect(JSON.stringify(A.profile)).toBe(snap);

    const pairedRows = rowsOf(paired);
    expect(pairedRows.filter(r => r.sailing.shipName === 'Wonder')).toHaveLength(1);
    expect(pairedRows.some(r => r.sailing.shipName === 'Oasis')).toBe(false);

    const wonder = rowsOf(union).filter(r => r.sailing.shipName === 'Wonder');
    const wonderPair = wonder.filter(r => r.sailing.__profileSources.length === 2);
    const wonderSingles = wonder.filter(r => r.sailing.__profileSources.length === 1);
    expect(wonderPair).toHaveLength(1);
    expect(wonderPair[0].sailing.roomType).toBe('Junior Suite');
    expect(wonderPair[0].offer.campaignOffer.offerCode).toBe('AA / BB');
    expect(wonderPair[0].sailing.__profileSources).toHaveLength(2);
    expect(wonderPair[0].sailing.__spendOfferKeys).toEqual(['uA', 'uB']);
    expect(wonderSingles.map(r => r.sailing.__profileSources[0].email).sort()).toEqual(['a@x.com', 'b@x.com']);
    expect(wonderSingles.every(r => !r.sailing.__spendOfferKeys)).toBe(true);
    expect(wonderSingles.find(r => r.sailing.__profileSources[0].email === 'a@x.com').offer.campaignOffer.offerCode).toBe('AA');

    const oasis = rowsOf(union).filter(r => r.sailing.shipName === 'Oasis');
    expect(oasis).toHaveLength(1);
    expect(oasis[0].sailing.__profileSources.map(s => s.email)).toEqual(['a@x.com']);
    expect(oasis[0].offer.campaignOffer.offerCode).toBe('OA');
    expect(oasis[0].sailing.__spendOfferKeys).toBeUndefined();
  });

  test('three profiles emit every pair and never a triple', () => {
    const built = global.buildCombinedOffers([A, B, C], { unionAll: false });
    const union = global.buildCombinedOffers([A, B, C], { unionAll: true });
    const wonder = rowsOf(built).filter(r => r.sailing.shipName === 'Wonder');
    expect(wonder.map(pairKey).sort()).toEqual([
      'a@x.com|b@x.com',
      'a@x.com|c@x.com',
      'b@x.com|c@x.com'
    ]);
    expect(wonder.every(r => r.sailing.__profileSources.length === 2)).toBe(true);
    expect(rowsOf(built).some(r => r.sailing.shipName === 'Icon')).toBe(false);

    const symphony = rowsOf(built).filter(r => r.sailing.shipName === 'Symphony');
    expect(symphony).toHaveLength(1);
    expect(pairKey(symphony[0])).toBe('a@x.com|b@x.com');
    expect(symphony[0].sailing.roomType).toBe('Junior Suite');

    const byPair = Object.fromEntries(wonder.map(r => [pairKey(r), r.sailing.roomType]));
    expect(byPair['a@x.com|b@x.com']).toBe('Junior Suite');
    expect(byPair['a@x.com|c@x.com']).toBe('Balcony');
    expect(byPair['b@x.com|c@x.com']).toBe('Junior Suite');

    const unionWonder = rowsOf(union).filter(r => r.sailing.shipName === 'Wonder');
    expect(unionWonder.filter(r => r.sailing.__profileSources.length === 2)).toHaveLength(3);
    expect(unionWonder.filter(r => r.sailing.__profileSources.length === 1).map(r => r.sailing.__profileSources[0].email).sort()).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
    expect(rowsOf(union).filter(r => r.sailing.shipName === 'Icon')).toHaveLength(1);
    expect(rowsOf(union).filter(r => r.sailing.shipName === 'Oasis')).toHaveLength(1);
    expect(rowsOf(union).every(r => (r.sailing.__profileSources || []).length <= 2)).toBe(true);
  });

  test('royal and celebrity never pair, and union still shows both', () => {
    const royal = {
      key: 'gobo-R-a',
      email: 'royal@x.com',
      profile: profile('royal@x.com', [offer('RA', 'CAMP', [sailing('Wonder', '2026-06-01', 'Interior')])])
    };
    const celeb = {
      key: 'gobo-C-b',
      email: 'celeb@x.com',
      profile: profile('celeb@x.com', [
        offer('CA', 'CAMP', [sailing('Wonder', '2026-06-01', 'Veranda')]),
        offer('CB', 'ONLYC', [sailing('Edge', '2026-08-01', 'Interior')])
      ])
    };
    expect(rowsOf(global.buildCombinedOffers([royal, celeb], { unionAll: false }))).toHaveLength(0);
    const rows = rowsOf(global.buildCombinedOffers([royal, celeb], { unionAll: true }));
    expect(rows.every(r => r.sailing.__profileSources.length === 1)).toBe(true);
    expect(rows.map(r => r.sailing.shipName).sort()).toEqual(['Edge', 'Wonder', 'Wonder']);
    expect(rows.map(r => r.sailing.__profileSources[0].email).sort()).toEqual(['celeb@x.com', 'celeb@x.com', 'royal@x.com']);
  });

  test('a celebrity sailing is not swallowed by a royal pair on the same key', () => {
    const royalA = { key: 'gobo-R-a', email: 'a@x.com', profile: profile('a@x.com', [offer('AA', 'CAMP', [sailing('Wonder', '2026-06-01', 'Interior')])]) };
    const royalB = { key: 'gobo-R-b', email: 'b@x.com', profile: profile('b@x.com', [offer('BB', 'CAMP', [sailing('Wonder', '2026-06-01', 'Balcony')])]) };
    const celeb = { key: 'gobo-C-c', email: 'c@x.com', profile: profile('c@x.com', [offer('CC', 'CAMP', [sailing('Wonder', '2026-06-01', 'Veranda')])]) };
    const wonder = rowsOf(global.buildCombinedOffers([royalA, royalB, celeb], { unionAll: true })).filter(r => r.sailing.shipName === 'Wonder');
    expect(wonder.filter(r => r.sailing.__profileSources.length === 2)).toHaveLength(1);
    expect(wonder.filter(r => r.sailing.__profileSources.length === 1).map(r => r.sailing.__profileSources[0].email).sort()).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });
});
