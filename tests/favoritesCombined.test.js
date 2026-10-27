/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

function loadFavorites() {
  localStorage.clear();
  global.App = {
    ProfileCache: {},
    TableRenderer: { updateBreadcrumb() {} },
  };
  global.getLinkedAccounts = () => [
    { key: 'gobo-R-a' },
    { key: 'gobo-R-b' },
    { key: 'gobo-R-c' },
  ];
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'favorites.js'), 'utf8');
  new Function(src)();
  return window.Favorites;
}

describe('combined favorites', () => {
  test('a star saves that pair, not every linked account, and toggles off', () => {
    const Fav = loadFavorites();
    const offer = { campaignCode: 'CAMP', campaignOffer: { offerCode: 'AA / BB', name: 'Pair', sailings: [] } };
    const sailing = {
      shipName: 'Wonder',
      sailDate: '2026-06-01',
      isGOBO: false,
      __profileSources: [{ id: 1, email: 'a@x.com' }, { id: 2, email: 'b@x.com' }],
    };
    const otherOffer = { campaignCode: 'CAMP', campaignOffer: { offerCode: 'AA / CC', sailings: [] } };
    const other = {
      shipName: 'Wonder',
      sailDate: '2026-06-01',
      isGOBO: false,
      __profileSources: [{ id: 1 }, { id: 4 }],
    };

    Fav.toggleFavorite(offer, sailing, null);
    expect(Fav.isFavorite(offer, sailing, null)).toBe(true);
    expect(Fav.isFavorite(otherOffer, other, null)).toBe(false);
    expect(Fav.loadProfileObject().data.offers[0].campaignOffer.sailings[0].__profileId).toBe('1-2');

    Fav.toggleFavorite(offer, sailing, null);
    expect(Fav.isFavorite(offer, sailing, null)).toBe(false);
    expect(Fav.loadProfileObject().data.offers).toHaveLength(0);
  });

  test('a union-only sailing saves its one profile id', () => {
    const Fav = loadFavorites();
    const offer = { campaignOffer: { offerCode: 'CC', sailings: [] } };
    const sailing = { shipName: 'Edge', sailDate: '2026-08-01', isGOBO: false, __profileSources: [{ id: 3, key: 'gobo-C-c' }] };
    Fav.addFavorite(offer, sailing, null);
    expect(Fav.loadProfileObject().data.offers[0].campaignOffer.sailings[0].__profileId).toBe('3');
    expect(Fav.isFavorite(offer, sailing, null)).toBe(true);
  });
});
