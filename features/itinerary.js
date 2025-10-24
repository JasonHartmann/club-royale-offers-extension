// features/itinerary.js
// Builds and maintains a shared itinerary -> sailing cache across all profiles.
// Key format: <itineraryCode>_<sailDate> e.g. "EX05E057_2025-12-08"
// Stored under storage key: goob-itinerary-map (managed by storageShim via /^goob-/ pattern)
(function(){
    const STORAGE_KEY = 'goob-itinerary-map';
    const ItineraryCache = {
        _cache: {},
        _loaded: false,
        _ensureLoaded() {
            if (this._loaded) return;
            try {
                const raw = (typeof goboStorageGet === 'function' ? goboStorageGet(STORAGE_KEY) : localStorage.getItem(STORAGE_KEY));
                if (raw) {
                    try { this._cache = JSON.parse(raw) || {}; } catch(e){ this._cache = {}; }
                }
            } catch(e) { this._cache = {}; }
            this._loaded = true;
        },
        buildOrUpdateFromOffers(data) {
            if (!data || !Array.isArray(data.offers)) return;
            this._ensureLoaded();
            const now = Date.now();
            data.offers.forEach(offerObj => {
                try {
                    const co = offerObj && offerObj.campaignOffer;
                    if (!co || !Array.isArray(co.sailings)) return;
                    const offerCode = (co.offerCode || '').toString().trim();
                    co.sailings.forEach(s => {
                        try {
                            const itineraryCode = (s && s.itineraryCode) ? String(s.itineraryCode).trim() : '';
                            const sailDate = (s && s.sailDate) ? String(s.sailDate).trim() : '';
                            if (!itineraryCode || !sailDate) return; // require both pieces
                            const key = `${itineraryCode}_${sailDate}`;
                            let entry = this._cache[key];
                            if (!entry) {
                                entry = this._cache[key] = {
                                    itineraryCode,
                                    sailDate,
                                    offerCodes: [],
                                    shipName: s.shipName || s.ship?.name || '',
                                    itineraryDescription: s.itineraryDescription || '',
                                    // Placeholder flags/fields for future hydration during TableRenderer.displayTable
                                    enriched: false,
                                    updatedAt: now
                                };
                            }
                            if (offerCode && !entry.offerCodes.includes(offerCode)) entry.offerCodes.push(offerCode);
                            // Opportunistically fill blanks
                            if (!entry.shipName && (s.shipName || s.ship?.name)) entry.shipName = s.shipName || s.ship?.name;
                            if (!entry.itineraryDescription && s.itineraryDescription) entry.itineraryDescription = s.itineraryDescription;
                            entry.updatedAt = now;
                        } catch(inner) { /* ignore single sailing issues */ }
                    });
                } catch(e) { /* ignore single offer issues */ }
            });
            // Persist
            try {
                const serialized = JSON.stringify(this._cache);
                goboStorageSet(STORAGE_KEY, serialized);
            } catch(e) { /* ignore persist errors */ }
        },
        get(key) { this._ensureLoaded(); return this._cache[key]; },
        all() { this._ensureLoaded(); return { ...this._cache }; }
    };
    try { window.ItineraryCache = ItineraryCache; } catch(e) { /* ignore */ }
})();

