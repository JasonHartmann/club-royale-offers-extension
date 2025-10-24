// features/itinerary.js
// Builds and maintains a shared sailing cache where each key is primarily the GraphQL sailing id.
// Fallback key pattern (when id missing): <itineraryCode>_<sailDate> e.g. "EX05E057_2025-12-08".
// Stored under storage key: goob-itinerary-map (managed by storageShim via /^goob-/ pattern)
(function(){
    const STORAGE_KEY = 'goob-itinerary-map';
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
    const DEBUG_ITIN = true; // toggle itinerary cache debug
    function dbg(...args){ if (DEBUG_ITIN) { try { console.debug('[ItineraryCache]', ...args); } catch(e){} } }
    const ItineraryCache = {
        _cache: {},
        _loaded: false,
        _ensureLoaded() {
            if (this._loaded) return;
            try {
                const raw = (typeof goboStorageGet === 'function' ? goboStorageGet(STORAGE_KEY) : localStorage.getItem(STORAGE_KEY));
                if (raw) {
                    try { this._cache = JSON.parse(raw) || {}; } catch(e){ this._cache = {}; }
                    dbg('Loaded cache from storage', { entries: Object.keys(this._cache).length });
                } else {
                    dbg('No existing cache found in storage');
                }
            } catch(e) { this._cache = {}; dbg('Error loading cache', e); }
            this._loaded = true;
        },
        buildOrUpdateFromOffers(data) {
            if (!data || !Array.isArray(data.offers)) { dbg('buildOrUpdateFromOffers: no offers in payload'); return; }
            this._ensureLoaded();
            const now = Date.now();
            let newEntries = 0; let updatedEntries = 0; let offersProcessed = 0; let sailingsProcessed = 0;
            data.offers.forEach(offerObj => {
                offersProcessed++;
                try {
                    const co = offerObj && offerObj.campaignOffer;
                    if (!co || !Array.isArray(co.sailings)) return;
                    const offerCode = (co.offerCode || '').toString().trim();
                    co.sailings.forEach(s => {
                        sailingsProcessed++;
                        try {
                            const rawId = s?.id && String(s.id).trim();
                            const itineraryCode = (s && s.itineraryCode) ? String(s.itineraryCode).trim() : '';
                            const sailDate = (s && s.sailDate) ? String(s.sailDate).trim() : '';
                            const fallbackId = (itineraryCode && sailDate) ? `${itineraryCode}_${sailDate}` : '';
                            // Primary key: sailing.id (matches GraphQL filter expectation). Fallback to composite if id missing.
                            const key = rawId || fallbackId;
                            if (!key) { dbg('Skipping sailing missing id and composite parts', { itineraryCode, sailDate }); return; }
                            let entry = this._cache[key];
                            if (!entry) {
                                entry = this._cache[key] = {
                                    itineraryCode,
                                    sailDate,
                                    offerCodes: [],
                                    shipName: s.shipName || s.ship?.name || '',
                                    shipCode: s.ship?.code || '',
                                    itineraryDescription: s.itineraryDescription || '',
                                    destinationName: '',
                                    departurePortName: '',
                                    totalNights: null,
                                    days: null,
                                    type: '',
                                    enriched: false,
                                    updatedAt: now
                                };
                                newEntries++;
                                dbg('New entry created', key, { shipName: entry.shipName });
                            } else {
                                updatedEntries++;
                            }
                            if (offerCode && !entry.offerCodes.includes(offerCode)) { entry.offerCodes.push(offerCode); }
                            // Opportunistically fill blanks
                            if (!entry.shipName && (s.shipName || s.ship?.name)) entry.shipName = s.shipName || s.ship?.name;
                            if (!entry.shipCode && s.ship?.code) entry.shipCode = s.ship.code;
                            if (!entry.itineraryDescription && s.itineraryDescription) entry.itineraryDescription = s.itineraryDescription;
                            // Keep itineraryCode/sailDate fields updated if they were blank and we used fallback
                            if (!entry.itineraryCode && itineraryCode) entry.itineraryCode = itineraryCode;
                            if (!entry.sailDate && sailDate) entry.sailDate = sailDate;
                            entry.updatedAt = now;
                        } catch(inner) { dbg('Error processing sailing', inner); }
                    });
                } catch(e) { dbg('Error processing offer', e); }
            });
            this._persist();
            dbg('buildOrUpdateFromOffers complete', { offersProcessed, sailingsProcessed, newEntries, updatedEntries, totalCacheSize: Object.keys(this._cache).length });
        },
        async hydrateIfNeeded(subsetKeys) {
            try {
                this._ensureLoaded();
                const now = Date.now();
                const keys = Array.isArray(subsetKeys) && subsetKeys.length ? subsetKeys : Object.keys(this._cache);
                const stale = [];
                keys.forEach(k => {
                    const e = this._cache[k];
                    if (!e) return;
                    if (!e.enriched || !e.updatedAt || (now - e.updatedAt) > TWELVE_HOURS_MS) stale.push(k);
                });
                dbg('hydrateIfNeeded evaluated keys', { providedKeys: keys.length, stale: stale.length });
                if (!stale.length) return;
                let brandHost = 'www.royalcaribbean.com';
                try { if (typeof App !== 'undefined' && App.Utils && typeof App.Utils.detectBrand === 'function') brandHost = App.Utils.detectBrand() === 'C' ? 'www.celebritycruises.com' : 'www.royalcaribbean.com'; } catch(e){}
                const endpoint = `https://${brandHost}/graph`;
                // NOTE: Do not modify the GraphQL string per user instruction
                const query = 'query cruiseSearch_Cruises($filters:String,$qualifiers:String,$sort:CruiseSearchSort,$pagination:CruiseSearchPagination,$nlSearch:String){cruiseSearch(filters:$filters,qualifiers:$qualifiers,sort:$sort,pagination:$pagination,nlSearch:$nlSearch){results{cruises{id productViewLink masterSailing{itinerary{name code days{number type ports{activity arrivalTime departureTime port{code name region}}}departurePort{code name region}destination{code name}portSequence sailingNights ship{code name}totalNights type}}sailings{bookingLink id itinerary{code}sailDate startDate endDate taxesAndFees{value}taxesAndFeesIncluded stateroomClassPricing{price{value currency{code}}stateroomClass{id content{code}}}}}cruiseRecommendationId total}}}';
                const CHUNK_SIZE = 100;
                const chunks = [];
                for (let i=0;i<stale.length;i+=CHUNK_SIZE) chunks.push(stale.slice(i,i+CHUNK_SIZE));
                dbg('Hydration chunks prepared', { chunkCount: chunks.length, chunkSizes: chunks.map(c => c.length) });
                // Metrics aggregated across parallel chunk requests
                let anyUpdated = false;
                let cruisesSeenTotal = 0; let cruisesMatched = 0; let cruisesSkippedNoKey = 0; let sailingsSeen = 0; let sailingsMatched = 0;
                // Fire all chunk fetches in parallel (one request per chunk). Cardinality: #requests === #chunks.
                const chunkPromises = chunks.map(chunk => (async () => {
                    const filtersValue = 'id:' + chunk.join(',');
                    dbg('Hydration chunk start', { size: chunk.length, filtersValue: filtersValue.slice(0,120) + (filtersValue.length>120?'...':'') });
                    let respJson = null; let status = null; let localAnyUpdated = false;
                    let localCruisesSeen = 0; let localCruisesMatched = 0; let localCruisesSkippedNoKey = 0; let localSailingsSeen = 0; let localSailingsMatched = 0;
                    try {
                        const body = JSON.stringify({ query, variables: { filters: filtersValue, pagination: { count: 1000, skip: 0 } } });
                        const resp = await fetch(endpoint, {
                            method: 'POST',
                            headers: {
                                'content-type': 'application/json',
                                'accept': 'application/json',
                                'apollographql-client-name': 'rci-NextGen-Cruise-Search',
                                'apollographql-query-name': 'cruiseSearch_Cruises',
                                'skip_authentication': 'true'
                            },
                            body
                        });
                        status = resp.status;
                        if (!resp.ok) { dbg('Hydration chunk fetch not ok', { status }); return { localAnyUpdated, localCruisesSeen, localCruisesMatched, localCruisesSkippedNoKey, localSailingsSeen, localSailingsMatched }; }
                        respJson = await resp.json();
                    } catch(netErr) { dbg('Hydration fetch error', netErr); return { localAnyUpdated, localCruisesSeen, localCruisesMatched, localCruisesSkippedNoKey, localSailingsSeen, localSailingsMatched }; }
                    const cruises = respJson?.data?.cruiseSearch?.results?.cruises || [];
                    dbg('Hydration response', { status, cruises: cruises.length });
                    localCruisesSeen += cruises.length;
                    cruises.forEach(c => {
                        try {
                            const itin = c?.masterSailing?.itinerary || {};
                            const sailingList = Array.isArray(c?.sailings) ? c.sailings : [];
                            if (!sailingList.length) { dbg('Cruise has no sailings array; skipping', { cruiseId: c.id }); return; }
                            sailingList.forEach(s => {
                                localSailingsSeen++;
                                const key = s?.id?.trim();
                                if (!key || !this._cache[key]) { localCruisesSkippedNoKey++; return; }
                                const entry = this._cache[key];
                                const before = { shipName: entry.shipName, shipCode: entry.shipCode, desc: entry.itineraryDescription, enriched: entry.enriched };
                                // Copy shared itinerary details onto each sailing entry
                                entry.shipName = itin.ship?.name || entry.shipName;
                                entry.shipCode = itin.ship?.code || entry.shipCode || '';
                                entry.itineraryDescription = itin.name || entry.itineraryDescription;
                                entry.destinationName = itin.destination?.name || entry.destinationName || '';
                                entry.departurePortName = itin.departurePort?.name || entry.departurePortName || '';
                                entry.totalNights = itin.totalNights || itin.sailingNights || entry.totalNights;
                                entry.days = Array.isArray(itin.days) ? itin.days : entry.days;
                                entry.type = itin.type || entry.type || '';
                                entry.enriched = true;
                                entry.updatedAt = Date.now();
                                localAnyUpdated = true; localCruisesMatched++; localSailingsMatched++;
                                const after = { shipName: entry.shipName, shipCode: entry.shipCode, desc: entry.itineraryDescription, enriched: entry.enriched };
                                dbg('Sailing hydrated', { key, before, after });
                            });
                        } catch(updateErr) { dbg('Error updating cruise sailings', updateErr); }
                    });
                    return { localAnyUpdated, localCruisesSeen, localCruisesMatched, localCruisesSkippedNoKey, localSailingsSeen, localSailingsMatched };
                })());
                const results = await Promise.all(chunkPromises);
                // Aggregate metrics
                results.forEach(r => {
                    if (!r) return;
                    if (r.localAnyUpdated) anyUpdated = true;
                    cruisesSeenTotal += r.localCruisesSeen;
                    cruisesMatched += r.localCruisesMatched;
                    cruisesSkippedNoKey += r.localCruisesSkippedNoKey;
                    sailingsSeen += r.localSailingsSeen;
                    sailingsMatched += r.localSailingsMatched;
                });
                if (anyUpdated) {
                    this._persist();
                    try { document.dispatchEvent(new CustomEvent('goboItineraryHydrated', { detail: { keys: stale } })); } catch(e){}
                }
                dbg('Hydration complete', { anyUpdated, cruisesSeenTotal, cruisesMatched, sailingsSeen, sailingsMatched, cruisesSkippedNoKey, cacheSize: Object.keys(this._cache).length });
            } catch(e) { dbg('hydrateIfNeeded error', e); }
        },
        _persist() {
            try { goboStorageSet(STORAGE_KEY, JSON.stringify(this._cache)); dbg('Cache persisted', { entries: Object.keys(this._cache).length }); } catch(e) { dbg('Persist error', e); }
        },
        get(key) { this._ensureLoaded(); return this._cache[key]; },
        all() { this._ensureLoaded(); return { ...this._cache }; }
    };
    try { window.ItineraryCache = ItineraryCache; dbg('ItineraryCache exposed'); } catch(e) { /* ignore */ }
})();
