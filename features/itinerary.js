(function(){
    const STORAGE_KEY = 'goob-itinerary-map';
    const TWELVE_HOURS_MS = 6 * 60 * 60 * 1000;
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
                                    // pricing-related fields added
                                    taxesAndFees: null,
                                    taxesAndFeesIncluded: null,
                                    stateroomPricing: {},
                                    bookingLink: '',
                                    startDate: '',
                                    endDate: '',
                                    updatedAt: now,
                                    hydratedAt: now // initial ingest treated as a hydration baseline
                                };
                                newEntries++;
                            } else {
                                // Snapshot before changes for diff detection
                                const beforeSnapshot = JSON.stringify({
                                    itineraryCode: entry.itineraryCode,
                                    sailDate: entry.sailDate,
                                    offerCodes: [...entry.offerCodes],
                                    shipName: entry.shipName,
                                    shipCode: entry.shipCode,
                                    itineraryDescription: entry.itineraryDescription
                                });
                                updatedEntries++;
                                entry.hydratedAt = now; // re-ingest baseline
                                // Opportunistic updates below will mutate entry; then we'll diff.
                                if (!entry.itineraryCode && itineraryCode) entry.itineraryCode = itineraryCode;
                                if (!entry.sailDate && sailDate) entry.sailDate = sailDate;
                                if (!entry.shipName && (s.shipName || s.ship?.name)) entry.shipName = s.shipName || s.ship?.name;
                                if (!entry.shipCode && s.ship?.code) entry.shipCode = s.ship.code;
                                if (!entry.itineraryDescription && s.itineraryDescription) entry.itineraryDescription = s.itineraryDescription;
                                if (offerCode && !entry.offerCodes.includes(offerCode)) entry.offerCodes.push(offerCode);
                                const afterSnapshot = JSON.stringify({
                                    itineraryCode: entry.itineraryCode,
                                    sailDate: entry.sailDate,
                                    offerCodes: [...entry.offerCodes],
                                    shipName: entry.shipName,
                                    shipCode: entry.shipCode,
                                    itineraryDescription: entry.itineraryDescription
                                });
                                if (beforeSnapshot !== afterSnapshot) entry.updatedAt = now; // only content change bumps updatedAt
                            }
                            // For new entries we added offerCode above; for existing entries handled in diff section.
                            if (!entry.offerCodes.includes(offerCode) && offerCode) entry.offerCodes.push(offerCode);
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
                    const lastTouch = e.hydratedAt || e.updatedAt || 0;
                    if (!e.enriched || !lastTouch || (now - lastTouch) > TWELVE_HOURS_MS) stale.push(k);
                });
                dbg('hydrateIfNeeded evaluated keys', { providedKeys: keys.length, stale: stale.length });
                if (!stale.length) return;
                let brandHost = 'www.royalcaribbean.com';
                try { if (typeof App !== 'undefined' && App.Utils && typeof App.Utils.detectBrand === 'function') brandHost = App.Utils.detectBrand() === 'C' ? 'www.celebritycruises.com' : 'www.royalcaribbean.com'; } catch(e){}
                const endpoint = `https://${brandHost}/graph`;
                // NOTE: Do not modify the GraphQL string per user instruction
                const query = 'query cruiseSearch_Cruises($filters:String,$qualifiers:String,$sort:CruiseSearchSort,$pagination:CruiseSearchPagination,$nlSearch:String){cruiseSearch(filters:$filters,qualifiers:$qualifiers,sort:$sort,pagination:$pagination,nlSearch:$nlSearch){results{cruises{id productViewLink masterSailing{itinerary{name code days{number type ports{activity arrivalTime departureTime port{code name region}}}departurePort{code name region}destination{code name}portSequence sailingNights ship{code name}totalNights type}}sailings{bookingLink id itinerary{code}sailDate startDate endDate taxesAndFees{value}taxesAndFeesIncluded stateroomClassPricing{price{value currency{code}}stateroomClass{id content{code}}}}}cruiseRecommendationId total}}}';
                const CHUNK_SIZE = 30;
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
                        const body = JSON.stringify({ query, variables: { filters: filtersValue, pagination: { count: CHUNK_SIZE*2, skip: 0 } } });
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
                                const beforeSnapshot = JSON.stringify({
                                    shipName: entry.shipName,
                                    shipCode: entry.shipCode,
                                    itineraryDescription: entry.itineraryDescription,
                                    destinationName: entry.destinationName,
                                    departurePortName: entry.departurePortName,
                                    totalNights: entry.totalNights,
                                    days: entry.days,
                                    type: entry.type,
                                    bookingLink: entry.bookingLink,
                                    startDate: entry.startDate,
                                    endDate: entry.endDate,
                                    taxesAndFees: entry.taxesAndFees,
                                    taxesAndFeesIncluded: entry.taxesAndFeesIncluded,
                                    stateroomPricing: entry.stateroomPricing
                                });
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
                                // pricing enrichment
                                try {
                                    if (s && typeof s === 'object') {
                                        if (s.bookingLink && !entry.bookingLink) entry.bookingLink = s.bookingLink;
                                        if (s.startDate) entry.startDate = s.startDate;
                                        if (s.endDate) entry.endDate = s.endDate;
                                        if (s.taxesAndFees && typeof s.taxesAndFees.value === 'number') entry.taxesAndFees = s.taxesAndFees.value;
                                        if (typeof s.taxesAndFeesIncluded === 'boolean') entry.taxesAndFeesIncluded = s.taxesAndFeesIncluded;
                                        if (Array.isArray(s.stateroomClassPricing)) {
                                            entry.stateroomPricing = entry.stateroomPricing || {};
                                            s.stateroomClassPricing.forEach(p => {
                                                try {
                                                    const classId = p?.stateroomClass?.id || p?.stateroomClass?.content?.code;
                                                    if (!classId) return;
                                                    const priceVal = (p && p.price && typeof p.price.value === 'number') ? p.price.value : null;
                                                    const currencyCode = p?.price?.currency?.code || null;
                                                    const simpleCode = p?.stateroomClass?.content?.code || null;
                                                    entry.stateroomPricing[classId] = { price: priceVal, currency: currencyCode, code: simpleCode };
                                                } catch(innerP){ /* ignore single price item */ }
                                            });
                                        }
                                    }
                                } catch(priceErr){ dbg('Pricing enrichment error', priceErr); }
                                // After enrichment diff detection
                                const afterSnapshot = JSON.stringify({
                                    shipName: entry.shipName,
                                    shipCode: entry.shipCode,
                                    itineraryDescription: entry.itineraryDescription,
                                    destinationName: entry.destinationName,
                                    departurePortName: entry.departurePortName,
                                    totalNights: entry.totalNights,
                                    days: entry.days,
                                    type: entry.type,
                                    bookingLink: entry.bookingLink,
                                    startDate: entry.startDate,
                                    endDate: entry.endDate,
                                    taxesAndFees: entry.taxesAndFees,
                                    taxesAndFeesIncluded: entry.taxesAndFeesIncluded,
                                    stateroomPricing: entry.stateroomPricing
                                });
                                entry.hydratedAt = Date.now();
                                if (beforeSnapshot !== afterSnapshot) {
                                    entry.updatedAt = entry.hydratedAt; // true content change
                                }
                                localAnyUpdated = true; localCruisesMatched++; localSailingsMatched++;
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
                return results;
            } catch(e) { dbg('hydrateIfNeeded error', e); }
        },
        async hydrateAlways(subsetKeys) {
            // Force hydration regardless of enriched/updatedAt age.
            try {
                this._ensureLoaded();
                const keys = Array.isArray(subsetKeys) && subsetKeys.length ? subsetKeys : [];
                if (!keys.length) { dbg('hydrateAlways: no keys provided'); return; }
                dbg('hydrateAlways: forcing hydration for keys', keys);
                console.log('[ItineraryCache] hydrateAlways start', keys);
                let brandHost = 'www.royalcaribbean.com';
                try { if (typeof App !== 'undefined' && App.Utils && typeof App.Utils.detectBrand === 'function') brandHost = App.Utils.detectBrand() === 'C' ? 'www.celebritycruises.com' : 'www.royalcaribbean.com'; } catch(e){}
                const endpoint = `https://${brandHost}/graph`;
                const query = 'query cruiseSearch_Cruises($filters:String,$qualifiers:String,$sort:CruiseSearchSort,$pagination:CruiseSearchPagination,$nlSearch:String){cruiseSearch(filters:$filters,qualifiers:$qualifiers,sort:$sort,pagination:$pagination,nlSearch:$nlSearch){results{cruises{id productViewLink masterSailing{itinerary{name code days{number type ports{activity arrivalTime departureTime port{code name region}}}departurePort{code name region}destination{code name}portSequence sailingNights ship{code name}totalNights type}}sailings{bookingLink id itinerary{code}sailDate startDate endDate taxesAndFees{value}taxesAndFeesIncluded stateroomClassPricing{price{value currency{code}}stateroomClass{id content{code}}}}}cruiseRecommendationId total}}}';
                const CHUNK_SIZE = 30;
                const chunks = [];
                for (let i=0;i<keys.length;i+=CHUNK_SIZE) chunks.push(keys.slice(i,i+CHUNK_SIZE));
                dbg('hydrateAlways: chunks prepared', { chunkCount: chunks.length, sizes: chunks.map(c=>c.length) });
                let anyUpdated = false;
                const chunkPromises = chunks.map(chunk => (async () => {
                    let respJson = null; let status = null; let localAnyUpdated = false;
                    let localCruisesSeen = 0; let localCruisesMatched = 0; let localCruisesSkippedNoKey = 0; let localSailingsSeen = 0; let localSailingsMatched = 0;
                    try {
                        const filtersValue = 'id:' + chunk.join(',');
                        const body = JSON.stringify({ query, variables: { filters: filtersValue, pagination: { count: CHUNK_SIZE*2, skip: 0 } } });
                        console.log('[ItineraryCache] hydrateAlways fetch chunk', chunk);
                        dbg('hydrateAlways: fetching chunk', { filtersValue: filtersValue.slice(0,120) + (filtersValue.length>120?'...':'') });
                        const resp = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json', 'apollographql-client-name': 'rci-NextGen-Cruise-Search', 'apollographql-query-name': 'cruiseSearch_Cruises', 'skip_authentication': 'true' }, body });
                        status = resp.status;
                        if (!resp.ok) { dbg('hydrateAlways: chunk fetch failed', { status }); return { localAnyUpdated, localCruisesSeen, localCruisesMatched, localCruisesSkippedNoKey, localSailingsSeen, localSailingsMatched }; }
                        respJson = await resp.json();
                    } catch(err) { dbg('hydrateAlways: network error', err); return { localAnyUpdated, localCruisesSeen, localCruisesMatched, localCruisesSkippedNoKey, localSailingsSeen, localSailingsMatched }; }
                    const cruises = respJson?.data?.cruiseSearch?.results?.cruises || [];
                    localCruisesSeen += cruises.length;
                    cruises.forEach(c => {
                        try {
                            const itin = c?.masterSailing?.itinerary || {};
                            const sailingList = Array.isArray(c?.sailings) ? c.sailings : [];
                            if (!sailingList.length) return;
                            sailingList.forEach(s => {
                                localSailingsSeen++;
                                const sailKey = s?.id?.trim();
                                if (!sailKey || !this._cache[sailKey]) { localCruisesSkippedNoKey++; return; }
                                const entry = this._cache[sailKey];
                                const beforeSnapshot = JSON.stringify({
                                    shipName: entry.shipName,
                                    shipCode: entry.shipCode,
                                    itineraryDescription: entry.itineraryDescription,
                                    destinationName: entry.destinationName,
                                    departurePortName: entry.departurePortName,
                                    totalNights: entry.totalNights,
                                    days: entry.days,
                                    type: entry.type,
                                    bookingLink: entry.bookingLink,
                                    startDate: entry.startDate,
                                    endDate: entry.endDate,
                                    taxesAndFees: entry.taxesAndFees,
                                    taxesAndFeesIncluded: entry.taxesAndFeesIncluded,
                                    stateroomPricing: entry.stateroomPricing
                                });
                                entry.shipName = itin.ship?.name || entry.shipName;
                                entry.shipCode = itin.ship?.code || entry.shipCode || '';
                                entry.itineraryDescription = itin.name || entry.itineraryDescription;
                                entry.destinationName = itin.destination?.name || entry.destinationName || '';
                                entry.departurePortName = itin.departurePort?.name || entry.departurePortName || '';
                                entry.totalNights = itin.totalNights || itin.sailingNights || entry.totalNights;
                                entry.days = Array.isArray(itin.days) ? itin.days : entry.days;
                                entry.type = itin.type || entry.type || '';
                                entry.enriched = true;
                                try { if (s && typeof s === 'object') {
                                    if (s.bookingLink && !entry.bookingLink) entry.bookingLink = s.bookingLink;
                                    if (s.startDate) entry.startDate = s.startDate;
                                    if (s.endDate) entry.endDate = s.endDate;
                                    if (s.taxesAndFees && typeof s.taxesAndFees.value === 'number') entry.taxesAndFees = s.taxesAndFees.value;
                                    if (typeof s.taxesAndFeesIncluded === 'boolean') entry.taxesAndFeesIncluded = s.taxesAndFeesIncluded;
                                    if (Array.isArray(s.stateroomClassPricing)) {
                                        entry.stateroomPricing = entry.stateroomPricing || {};
                                        s.stateroomClassPricing.forEach(p => { try {
                                            const classId = p?.stateroomClass?.id || p?.stateroomClass?.content?.code; if (!classId) return;
                                            const priceVal = (p && p.price && typeof p.price.value === 'number') ? p.price.value : null;
                                            const currencyCode = p?.price?.currency?.code || null;
                                            const simpleCode = p?.stateroomClass?.content?.code || null;
                                            entry.stateroomPricing[classId] = { price: priceVal, currency: currencyCode, code: simpleCode };
                                        } catch(inner){} });
                                    }
                                } } catch(priceErr){ dbg('hydrateAlways: pricing enrichment error', priceErr); }
                                const afterSnapshot = JSON.stringify({
                                    shipName: entry.shipName,
                                    shipCode: entry.shipCode,
                                    itineraryDescription: entry.itineraryDescription,
                                    destinationName: entry.destinationName,
                                    departurePortName: entry.departurePortName,
                                    totalNights: entry.totalNights,
                                    days: entry.days,
                                    type: entry.type,
                                    bookingLink: entry.bookingLink,
                                    startDate: entry.startDate,
                                    endDate: entry.endDate,
                                    taxesAndFees: entry.taxesAndFees,
                                    taxesAndFeesIncluded: entry.taxesAndFeesIncluded,
                                    stateroomPricing: entry.stateroomPricing
                                });
                                entry.hydratedAt = Date.now();
                                if (beforeSnapshot !== afterSnapshot) {
                                    entry.updatedAt = entry.hydratedAt;
                                }
                                localAnyUpdated = true; localCruisesMatched++; localSailingsMatched++;
                            });
                        } catch(updateErr){ dbg('hydrateAlways: update error', updateErr); }
                    });
                    return { localAnyUpdated, localCruisesSeen, localCruisesMatched, localCruisesSkippedNoKey, localSailingsSeen, localSailingsMatched };
                })());
                const results = await Promise.all(chunkPromises);
                results.forEach(r => { if (!r) return; if (r.localAnyUpdated) anyUpdated = true; });
                if (anyUpdated) {
                    this._persist();
                    try { document.dispatchEvent(new CustomEvent('goboItineraryHydrated', { detail: { keys } })); } catch(e){}
                }
                dbg('hydrateAlways complete', { anyUpdated, keys });
                console.log('[ItineraryCache] hydrateAlways complete', { anyUpdated, keys });
                return results;
            } catch(e) { dbg('hydrateAlways error', e); console.log('[ItineraryCache] hydrateAlways error', e); }
        },
        _persist() {
            try { goboStorageSet(STORAGE_KEY, JSON.stringify(this._cache)); dbg('Cache persisted', { entries: Object.keys(this._cache).length }); } catch(e) { dbg('Persist error', e); }
        },
        get(key) { this._ensureLoaded(); return this._cache[key]; },
        all() { this._ensureLoaded(); return { ...this._cache }; },
        showModal(key, sourceEl) {
            try {
                this._ensureLoaded();
                const data = this._cache[key];
                const existing = document.getElementById('gobo-itinerary-modal');
                if (existing) existing.remove();
                try { document.querySelectorAll('.gobo-itinerary-highlight').forEach(el=>el.classList.remove('gobo-itinerary-highlight')); } catch(e){}
                let rowToHighlight = null;
                try {
                    if (sourceEl && sourceEl instanceof Element) rowToHighlight = sourceEl.closest ? sourceEl.closest('tr') || sourceEl : sourceEl;
                    if (!rowToHighlight) { const cell = document.getElementById(key); if (cell) rowToHighlight = cell.closest ? cell.closest('tr') : null; }
                } catch(e){}
                try {
                    if (!document.getElementById('gobo-itinerary-highlight-style')) {
                        const style = document.createElement('style');
                        style.id = 'gobo-itinerary-highlight-style';
                        style.textContent = `
                            .gobo-itinerary-highlight { animation: gobo-itin-flash 1s ease-in-out; background: rgba(255,245,170,0.9) !important; transition: background .3s, box-shadow .3s; box-shadow: 0 0 0 3px rgba(255,230,120,0.4) inset; }
                            @keyframes gobo-itin-flash { 0% { background: rgba(255,245,170,0.0);} 30% { background: rgba(255,245,170,0.95);} 100% { background: rgba(255,245,170,0.9);} }
                        `;
                        document.head.appendChild(style);
                    }
                } catch(e){}
                if (rowToHighlight) { try { rowToHighlight.classList.add('gobo-itinerary-highlight'); rowToHighlight.scrollIntoView({ behavior:'smooth', block:'center'}); } catch(e){} }
                if (!data) { dbg('showModal: no data for key', key); try { if (typeof App !== 'undefined' && App.ErrorHandler && typeof App.ErrorHandler.showError === 'function') App.ErrorHandler.showError('Itinerary details are not available for this sailing. (Ghost offer!)\nThis offer cannot be redeemed online. You will need to call to book this offer.'); } catch(e){} return; }
                const backdrop = document.createElement('div'); backdrop.id='gobo-itinerary-modal'; backdrop.className='gobo-itinerary-backdrop'; backdrop.addEventListener('click',(e)=>{ if(e.target===backdrop) backdrop.remove(); });
                const panel = document.createElement('div'); panel.className='gobo-itinerary-panel';
                const closeBtn = document.createElement('button'); closeBtn.type='button'; closeBtn.className='gobo-itinerary-close'; closeBtn.textContent='\u00d7'; closeBtn.setAttribute('aria-label','Close'); closeBtn.addEventListener('click',()=>backdrop.remove()); panel.appendChild(closeBtn);
                const refreshBtn = document.createElement('button'); refreshBtn.type='button'; refreshBtn.className='gobo-itinerary-refresh'; refreshBtn.textContent='\u21bb'; refreshBtn.setAttribute('aria-label','Refresh itinerary data'); refreshBtn.title='Refresh itinerary data';
                refreshBtn.addEventListener('click', async (evt)=>{ evt.preventDefault(); if (refreshBtn.classList.contains('loading')) return; refreshBtn.classList.add('loading'); console.log('[ItineraryCache] refresh clicked', key); try { if (typeof ItineraryCache.hydrateAlways === 'function') { await ItineraryCache.hydrateAlways([key]); } else { await ItineraryCache.hydrateIfNeeded([key]); } } catch(err){ dbg('Refresh hydrate error', err); console.log('[ItineraryCache] refresh error', err); } refreshBtn.classList.remove('loading'); try { ItineraryCache.showModal(key, sourceEl); } catch(e){ dbg('Re-render after refresh failed', e); } }); panel.appendChild(refreshBtn);
                const title = document.createElement('h2'); title.className='gobo-itinerary-title'; title.textContent=`${data.itineraryDescription || 'Itinerary'} (${data.totalNights || '?'} nights)`; panel.appendChild(title);
                const subtitle = document.createElement('div'); subtitle.className='gobo-itinerary-subtitle'; subtitle.textContent=`${data.shipName || ''} • ${data.departurePortName || ''} • ${data.sailDate || ''}`; panel.appendChild(subtitle);
                if (data.bookingLink) { const linkWrap=document.createElement('div'); const a=document.createElement('a'); const host=(function(){ try { if (App && App.Utils && typeof App.Utils.detectBrand==='function') return App.Utils.detectBrand()==='C'? 'www.celebritycruises.com':'www.royalcaribbean.com'; } catch(e){} return 'www.royalcaribbean.com'; })(); a.href=`https://${host}${data.bookingLink}`; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent='Open Retail Booking Page'; a.className='gobo-itinerary-link'; linkWrap.appendChild(a); panel.appendChild(linkWrap); }
                const priceKeys = Object.keys(data.stateroomPricing || {});
                if (priceKeys.length) {
                    const priceTitle=document.createElement('h3'); priceTitle.className='gobo-itinerary-section-title'; priceTitle.textContent='Stateroom Pricing'; panel.appendChild(priceTitle);
                    const pTable=document.createElement('table'); pTable.className='gobo-itinerary-table'; const thead=document.createElement('thead'); const thr=document.createElement('tr'); ['Class','Price','Currency'].forEach(h=>{ const th=document.createElement('th'); th.textContent=h; thr.appendChild(th); }); thead.appendChild(thr); pTable.appendChild(thead); const tbody=document.createElement('tbody');
                    const codeMap={I:'Interior', IN:'Interior', INT:'Interior', INSIDE:'Interior', INTERIOR:'Interior', O:'Ocean View', OV:'Ocean View', OB:'Ocean View', E:'Ocean View', OCEAN:'Ocean View', OCEANVIEW:'Ocean View', OUTSIDE:'Ocean View', B:'Balcony', BAL:'Balcony', BK:'Balcony', BALCONY:'Balcony', D:'Suite', DLX:'Suite', DELUXE:'Suite', JS:'Suite', SU:'Suite', SUITE:'Suite'};
                    const baseCategoryMap={I:'INTERIOR', IN:'INTERIOR', INT:'INTERIOR', INSIDE:'INTERIOR', INTERIOR:'INTERIOR', O:'OUTSIDE', OV:'OUTSIDE', OB:'OUTSIDE', E:'OUTSIDE', OCEAN:'OUTSIDE', OCEANVIEW:'OUTSIDE', OUTSIDE:'OUTSIDE', B:'BALCONY', BAL:'BALCONY', BK:'BALCONY', BALCONY:'BALCONY', D:'DELUXE', DLX:'DELUXE', DELUXE:'DELUXE', JS:'DELUXE', SU:'DELUXE', SUITE:'DELUXE'};
                    function resolveDisplay(raw){ raw=(raw||'').toString().trim(); return codeMap[raw.toUpperCase()]||raw; }
                    function resolveCategory(raw){ raw=(raw||'').toString().trim(); const up=raw.toUpperCase(); if (baseCategoryMap[up]) return baseCategoryMap[up]; if(['INTERIOR','OUTSIDE','BALCONY','DELUXE'].includes(up)) return up; return null; }
                    const sortOrder={INTERIOR:0, OUTSIDE:1, BALCONY:2, DELUXE:3};
                    priceKeys.sort((a,b)=>{ const aRaw=data.stateroomPricing[a]?.code||a; const bRaw=data.stateroomPricing[b]?.code||b; const aCat=resolveCategory(aRaw); const bCat=resolveCategory(bRaw); const aRank=aCat!=null && aCat in sortOrder? sortOrder[aCat]:100; const bRank=bCat!=null && bCat in sortOrder? sortOrder[bCat]:100; if (aRank!==bRank) return aRank-bRank; return resolveDisplay(aRaw).toUpperCase().localeCompare(resolveDisplay(bRaw).toUpperCase()); });
                    priceKeys.forEach(k=>{ const pr=data.stateroomPricing[k]; const tr=document.createElement('tr'); const rawCode=pr.code||k||''; const label=resolveDisplay(rawCode); const hasPrice=typeof pr.price==='number'; const priceVal=hasPrice? (Number(pr.price)*2).toFixed(2):'Sold Out'; const currency=hasPrice? (pr.currency||''):''; [label, priceVal, currency].forEach((val,i)=>{ const td=document.createElement('td'); td.textContent=val; if(i===1 && hasPrice) td.style.textAlign='right'; td.title=rawCode; if(i===1 && !hasPrice) td.className='gobo-itinerary-soldout'; tr.appendChild(td); }); tbody.appendChild(tr); });
                    pTable.appendChild(tbody); panel.appendChild(pTable);
                    if (data.taxesAndFees != null) { const tf=document.createElement('div'); tf.className='gobo-itinerary-taxes'; const taxesAmount=typeof data.taxesAndFees==='number'? (Number(data.taxesAndFees)*2):data.taxesAndFees; const taxesText=typeof taxesAmount==='number'? taxesAmount.toFixed(2):taxesAmount; tf.textContent=`Taxes & Fees: ${taxesText} ${Object.values(data.stateroomPricing)[0]?.currency||''} (${data.taxesAndFeesIncluded? 'Included':'Additional'}) - Prices are cheapest rate in category for two guests in a double-occupancy room.`; panel.appendChild(tf); }
                }
                if (Array.isArray(data.days) && data.days.length) {
                    const dayTitle=document.createElement('h3'); dayTitle.className='gobo-itinerary-section-title'; dayTitle.textContent='Day-by-Day'; panel.appendChild(dayTitle);
                    const dTable=document.createElement('table'); dTable.className='gobo-itinerary-table'; const dh=document.createElement('thead'); const dhr=document.createElement('tr'); ['Day','Day of Week','Date','Type','Port','Arrival','Departure'].forEach(h=>{ const th=document.createElement('th'); th.textContent=h; dhr.appendChild(th); }); dh.appendChild(dhr); dTable.appendChild(dh); const db=document.createElement('tbody');
                    data.days.forEach(day=>{ try { const tr=document.createElement('tr'); let baseDateStr=data.startDate||data.sailDate||null; let computedDate=null; try { if (baseDateStr){ function utcDate(ds){ if(!ds||typeof ds!=='string') return null; const m=ds.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m){ return new Date(Date.UTC(+m[1], +m[2]-1, +m[3])); } const parsed=new Date(ds); if(isNaN(parsed.getTime())) return null; return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())); } const startUtc=utcDate(baseDateStr); if(startUtc){ const offset=(day && day.number && !isNaN(Number(day.number)))? Number(day.number)-1:0; computedDate=new Date(startUtc); computedDate.setUTCDate(computedDate.getUTCDate()+offset); } } } catch(e){}
                        const dow=computedDate? new Intl.DateTimeFormat(undefined,{ weekday:'short', timeZone:'UTC'}).format(computedDate):'';
                        const dateFmt=computedDate? new Intl.DateTimeFormat(undefined,{ year:'numeric', month:'short', day:'numeric', timeZone:'UTC'}).format(computedDate):'';
                        const ports=Array.isArray(day.ports)? day.ports:[]; let activity=''; let arrival=''; let departure=''; if(ports.length){ const p=ports[0]; activity=(p.port && p.port.name)||''; arrival=p.arrivalTime||''; departure=p.departureTime||''; }
                        const dayLabel=(day && day.number!=null)? String(day.number):'';
                        [dayLabel,dow,dateFmt,day.type||'',activity,arrival,departure].forEach(val=>{ const td=document.createElement('td'); td.textContent=val||''; tr.appendChild(td); });
                        db.appendChild(tr); } catch(inner){} });
                    dTable.appendChild(db); panel.appendChild(dTable);
                }
                if (Array.isArray(data.offerCodes) && data.offerCodes.length) { const oc=document.createElement('div'); oc.className='gobo-itinerary-offercodes'; oc.textContent='Offer Codes: ' + data.offerCodes.join(', '); panel.appendChild(oc); }
                const footer=document.createElement('div'); footer.className='gobo-itinerary-footer';
                const updatedStr=data.updatedAt? new Date(data.updatedAt).toLocaleString():'N/A';
                const hydratedStr=data.hydratedAt? new Date(data.hydratedAt).toLocaleString():updatedStr;
                footer.textContent=(data.hydratedAt && data.updatedAt && data.hydratedAt!==data.updatedAt)? `Data updated ${updatedStr} • Last refreshed ${hydratedStr}` : `Itinerary data last updated ${updatedStr}`;
                panel.appendChild(footer);
                backdrop.appendChild(panel); document.body.appendChild(backdrop);
            } catch(e){ dbg('showModal error', e); }
        }
    };
    try { window.ItineraryCache = ItineraryCache; dbg('ItineraryCache exposed'); } catch(e){}
})();

