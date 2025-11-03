(function () {
    const STORAGE_KEY = 'goob-itinerary-map';
    const TWELVE_HOURS_MS = 6 * 60 * 60 * 1000;
    const DEBUG_ITIN = true; // toggle itinerary cache debug
    const DEBUG_SINGLE_FETCH = true; // TEMP: limit hydration to a single GraphQL call while debugging rate issues
    const HARD_SINGLE_FETCH_LIMIT = true; // HARD CAP: absolutely restrict to one network fetch per session while debugging
    function dbg(...args) {
        if (DEBUG_ITIN) {
            try {
                console.debug('[ItineraryCache]', ...args);
            } catch (e) {
            }
        }
    }

    function _parseComposite(key) {
        // Returns { type:'ITIN'|'SHIPDATE'|null, itineraryCode:null|string, shipCode:null|string, sailDate:null|string }
        if (typeof key !== 'string') return {type: null, itineraryCode: null, shipCode: null, sailDate: null};
        if (key.startsWith('IC_')) {
            const raw = key.slice(3); // remove IC_
            // Find terminal YYYY-MM-DD pattern
            const m = raw.match(/(\d{4}-\d{2}-\d{2})$/);
            if (!m) return {type: 'ITIN', itineraryCode: raw, shipCode: null, sailDate: null};
            const sailDate = m[1];
            const itineraryCode = raw.slice(0, raw.length - sailDate.length - 1); // remove underscore before date
            return {type: 'ITIN', itineraryCode, shipCode: null, sailDate};
        } else if (key.startsWith('SD_')) {
            const raw = key.slice(3); // remove SD_
            const m = raw.match(/(\d{4}-\d{2}-\d{2})$/);
            if (!m) return {type: 'SHIPDATE', itineraryCode: null, shipCode: raw, sailDate: null};
            const sailDate = m[1];
            const shipCode = raw.slice(0, raw.length - sailDate.length - 1);
            return {type: 'SHIPDATE', itineraryCode: null, shipCode, sailDate};
        }
        return {type: null, itineraryCode: null, shipCode: null, sailDate: null};
    }

    const ItineraryCache = {
        _cache: {},
        _loaded: false,
        _fetchCount: 0, // counts successful attempted fetches this session
        _fetchInProgress: false, // single-flight guard
        _ensureLoaded() {
            if (this._loaded) return;
            try {
                const raw = (typeof goboStorageGet === 'function' ? goboStorageGet(STORAGE_KEY) : localStorage.getItem(STORAGE_KEY));
                if (raw) {
                    try {
                        this._cache = JSON.parse(raw) || {};
                    } catch (e) {
                        this._cache = {};
                    }
                    dbg('Loaded cache from storage', {entries: Object.keys(this._cache).length});
                    // Backward compatibility key normalization: convert legacy composite keys <itineraryCode>_<sailDate> lacking prefix
                    try {
                        const legacyKeys = Object.keys(this._cache).filter(k => !k.startsWith('IC_') && !k.startsWith('SD_') && k.includes('_'));
                        legacyKeys.forEach(oldKey => {
                            const entry = this._cache[oldKey];
                            if (!entry) return;
                            // Heuristic: last 3 parts might form YYYY-MM-DD (allow underscores elsewhere inside itineraryCode if any)
                            const dateMatch = oldKey.match(/(\d{4}-\d{2}-\d{2})$/);
                            if (dateMatch && entry && entry.sailDate) {
                                const sailDate = entry.sailDate || dateMatch[1];
                                const itinCode = entry.itineraryCode || oldKey.replace('_' + sailDate, '');
                                const shipCode = entry.shipCode || '';
                                let newKey = null;
                                let keyType = null;
                                if (itinCode) {
                                    newKey = `IC_${itinCode}_${sailDate}`;
                                    keyType = 'ITIN';
                                } else if (shipCode) {
                                    newKey = `SD_${shipCode}_${sailDate}`;
                                    keyType = 'SHIPDATE';
                                }
                                if (newKey && !this._cache[newKey]) {
                                    entry.keyType = keyType;
                                    this._cache[newKey] = entry;
                                    delete this._cache[oldKey];
                                    dbg('Migrated legacy key', {oldKey, newKey});
                                }
                            }
                        });
                    } catch (migErr) {
                        dbg('Legacy key migration error', migErr);
                    }
                } else {
                    dbg('No existing cache found in storage');
                }
            } catch (e) {
                this._cache = {};
                dbg('Error loading cache', e);
            }
            this._loaded = true;
        },
        buildOrUpdateFromOffers(data) {
            if (!data || !Array.isArray(data.offers)) {
                dbg('buildOrUpdateFromOffers: no offers in payload');
                return;
            }
            this._ensureLoaded();
            const now = Date.now();
            let newEntries = 0;
            let updatedEntries = 0;
            let offersProcessed = 0;
            let sailingsProcessed = 0;
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
                            const shipCode = s?.shipCode ? String(s.shipCode).trim() : '';
                            let key = null;
                            let keyType = 'UNKNOWN';
                            if (rawId) {
                                key = rawId;
                                keyType = 'ID';
                            } else if (itineraryCode && sailDate) {
                                key = `IC_${itineraryCode}_${sailDate}`;
                                keyType = 'ITIN';
                            } else if (shipCode && sailDate) {
                                key = `SD_${shipCode}_${sailDate}`;
                                keyType = 'SHIPDATE';
                            }
                            if (!key) {
                                dbg('Skipping sailing missing id/composites', {itineraryCode, sailDate, shipCode});
                                return;
                            }
                            let entry = this._cache[key];
                            if (!entry) {
                                entry = this._cache[key] = {
                                    keyType,
                                    itineraryCode,
                                    sailDate,
                                    shipCode,
                                    offerCodes: [],
                                    shipName: s.shipName || s.ship?.name || '',
                                    itineraryDescription: s.itineraryDescription || '',
                                    destinationName: '',
                                    departurePortName: '',
                                    totalNights: null,
                                    days: null,
                                    type: '',
                                    enriched: false,
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
                                if (!entry.keyType) entry.keyType = keyType;
                                if (!entry.itineraryCode && itineraryCode) entry.itineraryCode = itineraryCode;
                                if (!entry.sailDate && sailDate) entry.sailDate = sailDate;
                                if (!entry.shipName && (s.shipName || s.ship?.name)) entry.shipName = s.shipName || s.ship?.name;
                                if (!entry.shipCode && shipCode) entry.shipCode = shipCode;
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
                        } catch (inner) {
                            dbg('Error processing sailing', inner);
                        }
                    });
                } catch (e) {
                    dbg('Error processing offer', e);
                }
            });
            this._persist();
            dbg('buildOrUpdateFromOffers complete', {
                offersProcessed,
                sailingsProcessed,
                newEntries,
                updatedEntries,
                totalCacheSize: Object.keys(this._cache).length
            });
        },
        async _hydrateInternal(subsetKeys, mode) {
            // mode: 'ifNeeded' or 'always'
            if (this._fetchInProgress) {
                dbg(`_hydrateInternal(${mode}) skipped: fetch already in progress`);
                return;
            }
            this._fetchInProgress = true;
            let targetKeys = [];
            try {
                this._ensureLoaded();
                const now = Date.now();
                if (mode === 'always') {
                    targetKeys = Array.isArray(subsetKeys) && subsetKeys.length ? subsetKeys : [];
                    if (!targetKeys.length) {
                        dbg('hydrateAlways: no keys provided');
                        return;
                    }
                } else { // ifNeeded
                    const provided = Array.isArray(subsetKeys) && subsetKeys.length ? subsetKeys : Object.keys(this._cache);
                    const stale = [];
                    provided.forEach(k => {
                        const e = this._cache[k];
                        if (!e) return;
                        const lastTouch = e.hydratedAt || e.updatedAt || 0;
                        if (!e.enriched || !lastTouch || (now - lastTouch) > TWELVE_HOURS_MS) stale.push(k);
                    });
                    dbg('hydrateIfNeeded evaluated keys', {providedKeys: provided.length, stale: stale.length});
                    if (!stale.length) return; // nothing to do
                    targetKeys = stale;
                }
                // Brand host detection
                let brandHost = 'www.royalcaribbean.com';
                try {
                    if (typeof App !== 'undefined' && App.Utils && typeof App.Utils.detectBrand === 'function') brandHost = App.Utils.detectBrand() === 'C' ? 'www.celebritycruises.com' : 'www.royalcaribbean.com';
                } catch (e) {
                }
                const endpoint = `https://${brandHost}/graph`;
                const query = 'query cruiseSearch_Cruises($filters:String,$qualifiers:String,$sort:CruiseSearchSort,$pagination:CruiseSearchPagination,$nlSearch:String){cruiseSearch(filters:$filters,qualifiers:$qualifiers,sort:$sort,pagination:$pagination,nlSearch:$nlSearch){results{cruises{id productViewLink masterSailing{itinerary{name code days{number type ports{activity arrivalTime departureTime port{code name region}}}departurePort{code name region}destination{code name}portSequence sailingNights ship{code name}totalNights type}}sailings{bookingLink id itinerary{code}sailDate startDate endDate taxesAndFees{value}taxesAndFeesIncluded stateroomClassPricing{price{value currency{code}}stateroomClass{id content{code}}}}}cruiseRecommendationId total}}}';
                const idKeys = [];
                const itinKeys = [];
                const shipDateKeys = [];
                targetKeys.forEach(k => {
                    if (k.startsWith('IC_')) itinKeys.push(k); else if (k.startsWith('SD_')) shipDateKeys.push(k); else idKeys.push(k);
                });
                // Single fetch throttle logic
                if (DEBUG_SINGLE_FETCH) {
                    let chosen = null;
                    if (idKeys.length) chosen = idKeys[0]; else if (itinKeys.length) chosen = itinKeys[1]; else if (shipDateKeys.length) chosen = shipDateKeys[1];
                    if (chosen) {
                        dbg(`DEBUG_SINGLE_FETCH active (${mode})`, {chosen});
                        if (idKeys.includes(chosen)) {
                            idKeys.splice(0, idKeys.length, chosen);
                            itinKeys.length = 0;
                            shipDateKeys.length = 0;
                        } else if (itinKeys.includes(chosen)) {
                            itinKeys.splice(0, itinKeys.length, chosen);
                            idKeys.length = 0;
                            shipDateKeys.length = 0;
                        } else if (shipDateKeys.includes(chosen)) {
                            shipDateKeys.splice(0, shipDateKeys.length, chosen);
                            idKeys.length = 0;
                            itinKeys.length = 0;
                        }
                    }
                }
                // ID chunking
                const CHUNK_SIZE = 30;
                const idChunks = [];
                for (let i = 0; i < idKeys.length; i += CHUNK_SIZE) idChunks.push(idKeys.slice(i, i + CHUNK_SIZE));
                if (DEBUG_SINGLE_FETCH && idChunks.length > 1) idChunks.splice(10);
                let anyUpdated = false;
                const self = this;

                // Helper for POST
                async function postFilters(filtersValue, paginationCount) {
                    let respJson = null;
                    try {
                        const body = JSON.stringify({
                            query,
                            variables: {filters: filtersValue, pagination: {count: paginationCount, skip: 0}}
                        });
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
                        if (!resp.ok) return null;
                        respJson = await resp.json();
                        self._fetchCount++;
                    } catch (err) {
                        return null;
                    }
                    return respJson?.data?.cruiseSearch?.results?.cruises || [];
                }

                // ID hydration promises
                const idPromises = idChunks.map(chunk => (async () => {
                    let localAnyUpdated = false;
                    if (HARD_SINGLE_FETCH_LIMIT && self._fetchCount >= 1) {
                        dbg(`HARD_SINGLE_FETCH_LIMIT: skipping additional id fetch (${mode})`);
                        return {localAnyUpdated};
                    }
                    const cruises = await postFilters('id:' + chunk.join(','), CHUNK_SIZE * 2) || [];
                    cruises.forEach(c => {
                        try {
                            const itin = c?.masterSailing?.itinerary || {};
                            (Array.isArray(c?.sailings) ? c.sailings : []).forEach(s => {
                                const key = s?.id?.trim();
                                if (!key || !self._cache[key]) return;
                                self._enrichEntryFromSailing(key, itin, s);
                                localAnyUpdated = true;
                            });
                        } catch (inner) {
                        }
                    });
                    return {localAnyUpdated};
                })());
                // Composite itinerary promises
                const itinPromises = (!DEBUG_SINGLE_FETCH || idKeys.length === 0) ? itinKeys.map(compKey => (async () => {
                    const parsed = _parseComposite(compKey);
                    let localUpdated = false;
                    if (!parsed.itineraryCode || !parsed.sailDate) return {localUpdated};
                    if (HARD_SINGLE_FETCH_LIMIT && self._fetchCount >= 1) {
                        dbg(`HARD_SINGLE_FETCH_LIMIT: skipping additional itinerary fetch (${mode})`);
                        return {localUpdated};
                    }
                    const filtersValue = mode === 'ifNeeded' ? `itineraryCode:${parsed.itineraryCode},startDate:${parsed.sailDate}` : `itineraryCode:${parsed.itineraryCode},sailDate:${parsed.sailDate}`;
                    const cruises = await postFilters(filtersValue, 10) || [];
                    cruises.forEach(c => {
                        try {
                            const itin = c?.masterSailing?.itinerary || {};
                            (Array.isArray(c?.sailings) ? c.sailings : []).forEach(s => {
                                const sDate = s?.sailDate || '';
                                const sCode = s?.itinerary?.code || '';
                                if (sDate === parsed.sailDate && sCode === parsed.itineraryCode) {
                                    self._enrichEntryFromSailing(compKey, itin, s);
                                    const newId = s?.id?.trim();
                                    if (newId && !self._cache[newId]) self._cache[newId] = {
                                        ...self._cache[compKey],
                                        keyType: 'ID'
                                    };
                                    localUpdated = true;
                                }
                            });
                        } catch (inner) {
                        }
                    });
                    if (!localUpdated) {
                        const e = self._cache[compKey];
                        if (e) e.hydratedAt = Date.now();
                    }
                    return {localUpdated};
                })()) : [];
                // Composite ship-date promises
                const shipPromises = (!DEBUG_SINGLE_FETCH || (idKeys.length === 0 && itinKeys.length === 0)) ? shipDateKeys.map(compKey => (async () => {
                    const parsed = _parseComposite(compKey);
                    let localUpdated = false;
                    if (!parsed.shipCode || !parsed.sailDate) return {localUpdated};
                    if (HARD_SINGLE_FETCH_LIMIT && self._fetchCount >= 1) {
                        dbg(`HARD_SINGLE_FETCH_LIMIT: skipping additional shipDate fetch (${mode})`);
                        return {localUpdated};
                    }
                    const filtersValue = mode === 'ifNeeded' ? `ship:${parsed.shipCode}|startDate:${parsed.sailDate}~${parsed.sailDate}` : `shipCode:${parsed.shipCode},sailDate:${parsed.sailDate}`;
                    const cruises = await postFilters(filtersValue, 10) || [];
                    cruises.forEach(c => {
                        try {
                            const itin = c?.masterSailing?.itinerary || {};
                            (Array.isArray(c?.sailings) ? c.sailings : []).forEach(s => {
                                const sDate = s?.sailDate || '';
                                const sShip = (s?.shipCode || s?.ship?.code || '');
                                if (sDate === parsed.sailDate && sShip === parsed.shipCode) {
                                    self._enrichEntryFromSailing(compKey, itin, s);
                                    const newId = s?.id?.trim();
                                    if (newId && !self._cache[newId]) self._cache[newId] = {
                                        ...self._cache[compKey],
                                        keyType: 'ID'
                                    };
                                    localUpdated = true;
                                }
                            });
                        } catch (inner) {
                        }
                    });
                    if (!localUpdated) {
                        const e = self._cache[compKey];
                        if (e) e.hydratedAt = Date.now();
                    }
                    return {localUpdated};
                })()) : [];
                const results = await Promise.all([...idPromises, ...itinPromises, ...shipPromises]);
                results.forEach(r => {
                    if (!r) return;
                    if (r.localAnyUpdated || r.localUpdated) anyUpdated = true;
                });
                if (anyUpdated) {
                    this._persist();
                    try {
                        const detailKeys = mode === 'ifNeeded' ? targetKeys : targetKeys;
                        document.dispatchEvent(new CustomEvent('goboItineraryHydrated', {detail: {keys: detailKeys}}));
                    } catch (e) {
                    }
                }
                dbg(`Hydration complete (${mode}, possibly throttled)`, {
                    anyUpdated,
                    idCount: idKeys.length,
                    itinCount: itinKeys.length,
                    shipDateCount: shipDateKeys.length,
                    throttled: DEBUG_SINGLE_FETCH,
                    fetchCount: this._fetchCount
                });
                return results;
            } catch (e) {
                dbg(`_hydrateInternal(${mode}) error`, e);
            } finally {
                this._fetchInProgress = false;
            }
        },
        async hydrateIfNeeded(subsetKeys) {
            // Delegates to shared internal implementation (stale evaluation)
            return this._hydrateInternal(subsetKeys, 'ifNeeded');
        },
        async hydrateAlways(subsetKeys) {
            // Delegates to shared internal implementation (force hydration on provided keys)
            return this._hydrateInternal(subsetKeys, 'always');
        },
        _enrichEntryFromSailing(key, itin, s) {
            try {
                const entry = this._cache[key];
                if (!entry) return;
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
                entry.shipName = itin.shipName || entry.shipName;
                entry.shipCode = itin.shipCode || entry.shipCode || '';
                entry.itineraryDescription = itin.name || entry.itineraryDescription;
                entry.destinationName = itin.destination?.name || entry.destinationName || '';
                entry.departurePortName = itin.departurePort?.name || entry.departurePortName || '';
                entry.totalNights = itin.totalNights || itin.sailingNights || entry.totalNights;
                entry.days = Array.isArray(itin.days) ? itin.days : entry.days;
                entry.type = itin.type || entry.type || '';
                entry.enriched = true;
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
                                    entry.stateroomPricing[classId] = {
                                        price: priceVal,
                                        currency: currencyCode,
                                        code: simpleCode
                                    };
                                } catch (innerP) {
                                }
                            });
                        }
                    }
                } catch (priceErr) {
                    dbg('Pricing enrichment error', priceErr);
                }
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
                if (beforeSnapshot !== afterSnapshot) entry.updatedAt = entry.hydratedAt;
            } catch (e) {
                dbg('_enrichEntryFromSailing error', e);
            }
        },
        _persist() {
            try {
                goboStorageSet(STORAGE_KEY, JSON.stringify(this._cache));
                dbg('Cache persisted', {entries: Object.keys(this._cache).length});
            } catch (e) {
                dbg('Persist error', e);
            }
        },
        get(key) {
            this._ensureLoaded();
            return this._cache[key];
        },
        all() {
            this._ensureLoaded();
            return {...this._cache};
        },
        showModal(key, sourceEl) {
            try {
                this._ensureLoaded();
                const data = this._cache[key];
                const existing = document.getElementById('gobo-itinerary-modal');
                if (existing) existing.remove();
                try {
                    document.querySelectorAll('.gobo-itinerary-highlight').forEach(el => el.classList.remove('gobo-itinerary-highlight'));
                } catch (e) {
                }
                let rowToHighlight = null;
                try {
                    if (sourceEl && sourceEl instanceof Element) rowToHighlight = sourceEl.closest ? sourceEl.closest('tr') || sourceEl : sourceEl;
                    if (!rowToHighlight) {
                        const cell = document.getElementById(key);
                        if (cell) rowToHighlight = cell.closest ? cell.closest('tr') : null;
                    }
                } catch (e) {
                }
                try {
                    if (!document.getElementById('gobo-itinerary-highlight-style')) {
                        const style = document.createElement('style');
                        style.id = 'gobo-itinerary-highlight-style';
                        style.textContent = `\n                            .gobo-itinerary-highlight { animation: gobo-itin-flash 1s ease-in-out; background: rgba(255,245,170,0.9) !important; transition: background .3s, box-shadow .3s; box-shadow: 0 0 0 3px rgba(255,230,120,0.4) inset; }\n                            @keyframes gobo-itin-flash { 0% { background: rgba(255,245,170,0.0);} 30% { background: rgba(255,245,170,0.95);} 100% { background: rgba(255,245,170,0.9);} }\n                        `;
                        document.head.appendChild(style);
                    }
                } catch (e) {
                }
                if (rowToHighlight) {
                    try {
                        rowToHighlight.classList.add('gobo-itinerary-highlight');
                        rowToHighlight.scrollIntoView({behavior: 'smooth', block: 'center'});
                    } catch (e) {
                    }
                }
                if (!data) {
                    dbg('showModal: no data for key', key);
                    try {
                        if (typeof App !== 'undefined' && App.ErrorHandler && typeof App.ErrorHandler.showError === 'function') App.ErrorHandler.showError('Itinerary details are not available for this sailing. (Ghost offer!)\nThis offer cannot be redeemed online. You will need to call to book this offer.');
                    } catch (e) {
                    }
                    return;
                }
                const backdrop = document.createElement('div');
                backdrop.id = 'gobo-itinerary-modal';
                backdrop.className = 'gobo-itinerary-backdrop';
                backdrop.addEventListener('click', (e) => {
                    if (e.target === backdrop) backdrop.remove();
                });
                const panel = document.createElement('div');
                panel.className = 'gobo-itinerary-panel';
                const closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.className = 'gobo-itinerary-close';
                closeBtn.textContent = '\\u00d7';
                closeBtn.setAttribute('aria-label', 'Close');
                closeBtn.addEventListener('click', () => backdrop.remove());
                panel.appendChild(closeBtn);
                const refreshBtn = document.createElement('button');
                refreshBtn.type = 'button';
                refreshBtn.className = 'gobo-itinerary-refresh';
                refreshBtn.textContent = '\\u21bb';
                refreshBtn.setAttribute('aria-label', 'Refresh itinerary data');
                refreshBtn.title = 'Refresh itinerary data';
                refreshBtn.addEventListener('click', async (evt) => {
                    evt.preventDefault();
                    if (refreshBtn.classList.contains('loading')) return;
                    refreshBtn.classList.add('loading');
                    console.log('[ItineraryCache] refresh clicked', key);
                    try {
                        if (typeof ItineraryCache.hydrateAlways === 'function') {
                            await ItineraryCache.hydrateAlways([key]);
                        } else {
                            await ItineraryCache.hydrateIfNeeded([key]);
                        }
                    } catch (err) {
                        dbg('Refresh hydrate error', err);
                        console.log('[ItineraryCache] refresh error', err);
                    }
                    refreshBtn.classList.remove('loading');
                    try {
                        ItineraryCache.showModal(key, sourceEl);
                    } catch (e) {
                        dbg('Re-render after refresh failed', e);
                    }
                });
                panel.appendChild(refreshBtn);
                const title = document.createElement('h2');
                title.className = 'gobo-itinerary-title';
                title.textContent = `${data.itineraryDescription || 'Itinerary'} (${data.totalNights || '?'} nights)`;
                panel.appendChild(title);
                const subtitle = document.createElement('div');
                subtitle.className = 'gobo-itinerary-subtitle';
                subtitle.textContent = `${data.shipName || ''} • ${data.departurePortName || ''} • ${data.sailDate || ''}`;
                panel.appendChild(subtitle);
                if (data.bookingLink) {
                    const linkWrap = document.createElement('div');
                    const a = document.createElement('a');
                    const host = (function () {
                        try {
                            if (App && App.Utils && typeof App.Utils.detectBrand === 'function') return App.Utils.detectBrand() === 'C' ? 'www.celebritycruises.com' : 'www.royalcaribbean.com';
                        } catch (e) {
                        }
                        return 'www.royalcaribbean.com';
                    })();
                    a.href = `https://${host}${data.bookingLink}`;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.textContent = 'Open Retail Booking Page';
                    a.className = 'gobo-itinerary-link';
                    linkWrap.appendChild(a);
                    panel.appendChild(linkWrap);
                }
                const priceKeys = Object.keys(data.stateroomPricing || {});
                if (priceKeys.length) {
                    const priceTitle = document.createElement('h3');
                    priceTitle.className = 'gobo-itinerary-section-title';
                    priceTitle.textContent = 'Stateroom Pricing';
                    panel.appendChild(priceTitle);
                    const pTable = document.createElement('table');
                    pTable.className = 'gobo-itinerary-table';
                    const thead = document.createElement('thead');
                    const thr = document.createElement('tr');
                    ['Class', 'Price', 'Currency'].forEach(h => {
                        const th = document.createElement('th');
                        th.textContent = h;
                        thr.appendChild(th);
                    });
                    thead.appendChild(thr);
                    pTable.appendChild(thead);
                    const tbody = document.createElement('tbody');
                    const codeMap = {
                        I: 'Interior',
                        IN: 'Interior',
                        INT: 'Interior',
                        INSIDE: 'Interior',
                        INTERIOR: 'Interior',
                        O: 'Ocean View',
                        OV: 'Ocean View',
                        OB: 'Ocean View',
                        E: 'Ocean View',
                        OCEAN: 'Ocean View',
                        OCEANVIEW: 'Ocean View',
                        OUTSIDE: 'Ocean View',
                        B: 'Balcony',
                        BAL: 'Balcony',
                        BK: 'Balcony',
                        BALCONY: 'Balcony',
                        D: 'Suite',
                        DLX: 'Suite',
                        DELUXE: 'Suite',
                        JS: 'Suite',
                        SU: 'Suite',
                        SUITE: 'Suite'
                    };
                    const baseCategoryMap = {
                        I: 'INTERIOR',
                        IN: 'INTERIOR',
                        INT: 'INTERIOR',
                        INSIDE: 'INTERIOR',
                        INTERIOR: 'INTERIOR',
                        O: 'OUTSIDE',
                        OV: 'OUTSIDE',
                        OB: 'OUTSIDE',
                        E: 'OUTSIDE',
                        OCEAN: 'OUTSIDE',
                        OCEANVIEW: 'OUTSIDE',
                        OUTSIDE: 'OUTSIDE',
                        B: 'BALCONY',
                        BAL: 'BALCONY',
                        BK: 'BALCONY',
                        BALCONY: 'BALCONY',
                        D: 'DELUXE',
                        DLX: 'DELUXE',
                        DELUXE: 'DELUXE',
                        JS: 'DELUXE',
                        SU: 'DELUXE',
                        SUITE: 'DELUXE'
                    };

                    function resolveDisplay(raw) {
                        raw = (raw || '').toString().trim();
                        return codeMap[raw.toUpperCase()] || raw;
                    }

                    function resolveCategory(raw) {
                        raw = (raw || '').toString().trim();
                        const up = raw.toUpperCase();
                        if (baseCategoryMap[up]) return baseCategoryMap[up];
                        if (['INTERIOR', 'OUTSIDE', 'BALCONY', 'DELUXE'].includes(up)) return up;
                        return null;
                    }

                    const sortOrder = {INTERIOR: 0, OUTSIDE: 1, BALCONY: 2, DELUXE: 3};
                    priceKeys.sort((a, b) => {
                        const aRaw = data.stateroomPricing[a]?.code || a;
                        const bRaw = data.stateroomPricing[b]?.code || b;
                        const aCat = resolveCategory(aRaw);
                        const bCat = resolveCategory(bRaw);
                        const aRank = aCat != null && aCat in sortOrder ? sortOrder[aCat] : 100;
                        const bRank = bCat != null && bCat in sortOrder ? sortOrder[bCat] : 100;
                        if (aRank !== bRank) return aRank - bRank;
                        return resolveDisplay(aRaw).toUpperCase().localeCompare(resolveDisplay(bRaw).toUpperCase());
                    });
                    priceKeys.forEach(k => {
                        const pr = data.stateroomPricing[k];
                        const tr = document.createElement('tr');
                        const rawCode = pr.code || k || '';
                        const label = resolveDisplay(rawCode);
                        const hasPrice = typeof pr.price === 'number';
                        const priceVal = hasPrice ? (Number(pr.price) * 2).toFixed(2) : 'Sold Out';
                        const currency = hasPrice ? (pr.currency || '') : '';
                        [label, priceVal, currency].forEach((val, i) => {
                            const td = document.createElement('td');
                            td.textContent = val;
                            if (i === 1 && hasPrice) td.style.textAlign = 'right';
                            td.title = rawCode;
                            if (i === 1 && !hasPrice) td.className = 'gobo-itinerary-soldout';
                            tr.appendChild(td);
                        });
                        tbody.appendChild(tr);
                    });
                    pTable.appendChild(tbody);
                    panel.appendChild(pTable);
                    if (data.taxesAndFees != null) {
                        const tf = document.createElement('div');
                        tf.className = 'gobo-itinerary-taxes';
                        const taxesAmount = typeof data.taxesAndFees === 'number' ? (Number(data.taxesAndFees) * 2) : data.taxesAndFees;
                        const taxesText = typeof taxesAmount === 'number' ? taxesAmount.toFixed(2) : taxesAmount;
                        tf.textContent = `Taxes & Fees: ${taxesText} ${Object.values(data.stateroomPricing)[0]?.currency || ''} (${data.taxesAndFeesIncluded ? 'Included' : 'Additional'}) - Prices are cheapest rate in category for two guests in a double-occupancy room.`;
                        panel.appendChild(tf);
                    }
                }
                if (Array.isArray(data.days) && data.days.length) {
                    const dayTitle = document.createElement('h3');
                    dayTitle.className = 'gobo-itinerary-section-title';
                    dayTitle.textContent = 'Day-by-Day';
                    panel.appendChild(dayTitle);
                    const dTable = document.createElement('table');
                    dTable.className = 'gobo-itinerary-table';
                    const dh = document.createElement('thead');
                    const dhr = document.createElement('tr');
                    ['Day', 'Day of Week', 'Date', 'Type', 'Port', 'Arrival', 'Departure'].forEach(h => {
                        const th = document.createElement('th');
                        th.textContent = h;
                        dhr.appendChild(th);
                    });
                    dh.appendChild(dhr);
                    dTable.appendChild(dh);
                    const db = document.createElement('tbody');
                    data.days.forEach(day => {
                        try {
                            const tr = document.createElement('tr');
                            let baseDateStr = data.startDate || data.sailDate || null;
                            let computedDate = null;
                            try {
                                if (baseDateStr) {
                                    function utcDate(ds) {
                                        if (!ds || typeof ds !== 'string') return null;
                                        const m = ds.match(/^(\d{4})-(\d{2})-(\d{2})/);
                                        if (m) {
                                            return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
                                        }
                                        const parsed = new Date(ds);
                                        if (isNaN(parsed.getTime())) return null;
                                        return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
                                    }

                                    const startUtc = utcDate(baseDateStr);
                                    if (startUtc) {
                                        const offset = (day && day.number && !isNaN(Number(day.number))) ? Number(day.number) - 1 : 0;
                                        computedDate = new Date(startUtc);
                                        computedDate.setUTCDate(computedDate.getUTCDate() + offset);
                                    }
                                }
                            } catch (e) {
                            }
                            const dow = computedDate ? new Intl.DateTimeFormat(undefined, {
                                weekday: 'short',
                                timeZone: 'UTC'
                            }).format(computedDate) : '';
                            const dateFmt = computedDate ? new Intl.DateTimeFormat(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                timeZone: 'UTC'
                            }).format(computedDate) : '';
                            const ports = Array.isArray(day.ports) ? day.ports : [];
                            let activity = '';
                            let arrival = '';
                            let departure = '';
                            if (ports.length) {
                                const p = ports[0];
                                activity = (p.port && p.port.name) || '';
                                arrival = p.arrivalTime || '';
                                departure = p.departureTime || '';
                            }
                            const dayLabel = (day && day.number != null) ? String(day.number) : '';
                            [dayLabel, dow, dateFmt, day.type || '', activity, arrival, departure].forEach(val => {
                                const td = document.createElement('td');
                                td.textContent = val || '';
                                tr.appendChild(td);
                            });
                            db.appendChild(tr);
                        } catch (inner) {
                        }
                    });
                    dTable.appendChild(db);
                    panel.appendChild(dTable);
                }
                if (Array.isArray(data.offerCodes) && data.offerCodes.length) {
                    const oc = document.createElement('div');
                    oc.className = 'gobo-itinerary-offercodes';
                    oc.textContent = 'Offer Codes: ' + data.offerCodes.join(', ');
                    panel.appendChild(oc);
                }
                const footer = document.createElement('div');
                footer.className = 'gobo-itinerary-footer';
                const updatedStr = data.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'N/A';
                const hydratedStr = data.hydratedAt ? new Date(data.hydratedAt).toLocaleString() : updatedStr;
                footer.textContent = (data.hydratedAt && data.updatedAt && data.hydratedAt !== data.updatedAt) ? `Data updated ${updatedStr} • Last refreshed ${hydratedStr}` : `Itinerary data last updated ${updatedStr}`;
                panel.appendChild(footer);
                backdrop.appendChild(panel);
                document.body.appendChild(backdrop);
            } catch (e) {
                dbg('showModal error', e);
            }
        }
    };
    try {
        window.ItineraryCache = ItineraryCache;
        dbg('ItineraryCache exposed');
    } catch (e) {
    }
})();
