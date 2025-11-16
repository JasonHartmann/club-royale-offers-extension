(function () {
    const STORAGE_KEY = 'goob-itinerary-map';
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000; // renamed for clarity
    const DEBUG_ITIN = true; // toggle itinerary cache debug
    function dbg(...args) {
        if (DEBUG_ITIN) {
            try { console.debug('[ItineraryCache]', ...args); } catch (e) {}
        }
    }

    function _parseComposite(key) {
        // Returns { shipCode:null|string, sailDate:null|string } for SD_<shipCode>_<YYYY-MM-DD>
        if (typeof key !== 'string') return { shipCode: null, sailDate: null };
        if (key.startsWith('SD_')) {
            const raw = key.slice(3); // remove SD_
            const m = raw.match(/^(.*)_(\d{4}-\d{2}-\d{2})$/);
            if (!m) return { shipCode: raw, sailDate: null };
            return { shipCode: m[1], sailDate: m[2] };
        }
        return { shipCode: null, sailDate: null };
    }

    const ItineraryCache = {
        _cache: {},
        _loaded: false,
        _fetchCount: 0,
        _fetchInProgress: false,
        _shipDateIndex: {}, // { shipCode: { sailDate(YYYY-MM-DD): compositeKey } }
        _indexShipDate(shipCode, sailDate, compositeKey) {
            if (!shipCode || !sailDate || !compositeKey) return;
            shipCode = String(shipCode).trim();
            sailDate = String(sailDate).trim().slice(0, 10);
            if (!shipCode || !sailDate) return;
            let byShip = this._shipDateIndex[shipCode];
            if (!byShip) byShip = this._shipDateIndex[shipCode] = {};
            byShip[sailDate] = compositeKey;
        },
        // Add enrichment helper (was referenced but not defined) so entries become enriched and stop triggering repeated hydration
        _enrichEntryFromSailing(compositeKey, itineraryObj, sailingObj) {
            try {
                if (!compositeKey) return;
                this._ensureLoaded();
                const entry = this._cache[compositeKey];
                if (!entry) return;
                const itin = itineraryObj || {};
                const sail = sailingObj || {};
                // Taxes & fees (normalize to numeric single-guest value if object)
                try {
                    if (sail.taxesAndFees != null && entry.taxesAndFees == null) {
                        let t = sail.taxesAndFees;
                        if (t && typeof t === 'object' && t.value != null) t = t.value;
                        if (typeof t === 'string') {
                            const cleaned = t.replace(/[^0-9.\-]/g,'');
                            const num = Number(cleaned); if (isFinite(num)) t = num; else t = null;
                        }
                        if (typeof t === 'number' && isFinite(t)) entry.taxesAndFees = t; // per-person numeric
                    }
                    if (typeof sail.taxesAndFeesIncluded === 'boolean' && entry.taxesAndFeesIncluded == null) entry.taxesAndFeesIncluded = sail.taxesAndFeesIncluded;
                } catch(e){}
                // Stateroom pricing (normalize into { code:{ price, currency } })
                try {
                    const prevPricing = entry.stateroomPricing || {};
                    const prevCodes = Object.keys(prevPricing);
                    if (Array.isArray(sail.stateroomClassPricing)) {
                        if (sail.stateroomClassPricing.length) {
                            const newPricing = {};
                            sail.stateroomClassPricing.forEach(p => {
                                try {
                                    const code = (p?.stateroomClass?.content?.code || p?.stateroomClass?.id || '').toString().trim();
                                    const priceVal = p?.price?.value ?? p?.priceAmount ?? p?.price ?? null;
                                    const currency = p?.price?.currency?.code || p?.currency || '';
                                    if (!code) return;
                                    if (priceVal != null && isFinite(priceVal)) {
                                        const numeric = Number(priceVal);
                                        const existing = newPricing[code];
                                        if (!existing || (typeof existing.price === 'number' && numeric < existing.price)) {
                                            newPricing[code] = { code, price: numeric, currency };
                                        }
                                    } else {
                                        // Explicit missing price for code in current response => Sold Out
                                        if (!newPricing[code]) newPricing[code] = { code }; // no price property => Sold Out
                                    }
                                } catch (innerPrice) { /* ignore single pricing row errors */ }
                            });
                            // Any previously present codes not returned this time => Sold Out (remove stale price)
                            prevCodes.forEach(c => { if (!newPricing[c]) newPricing[c] = { code: c }; });
                            entry.stateroomPricing = newPricing;
                        } else {
                            // Empty pricing array => all previously priced categories now Sold Out
                            const soldOutMap = {};
                            prevCodes.forEach(c => { soldOutMap[c] = { code: c }; });
                            entry.stateroomPricing = soldOutMap; // remove all prices
                        }
                    }
                } catch (pricingErr) { /* ignore pricing block errors */ }
                // Enrichment of itinerary-level meta
                const daysArr = Array.isArray(itin.days) ? itin.days : null;
                if (daysArr && !entry.days) entry.days = daysArr;
                if (itin.type && !entry.type) entry.type = itin.type;
                // Mark enriched & touch hydrated timestamp
                entry.enriched = true;
                entry.hydratedAt = Date.now();
            } catch (e) { /* swallow enrichment errors */ }
        },
        getByShipDate(shipCode, sailDate) {
            this._ensureLoaded();
            if (!shipCode || !sailDate) return null;
            shipCode = String(shipCode).trim();
            sailDate = String(sailDate).trim().slice(0, 10);
            const byShip = this._shipDateIndex[shipCode];
            const key = byShip && byShip[sailDate];
            if (key && this._cache[key]) return this._cache[key];
            return null; // No auto-create from legacy ID keys anymore
        },
        listShipDates(shipCode) {
            this._ensureLoaded();
            shipCode = String(shipCode || '').trim();
            if (!shipCode || !this._shipDateIndex[shipCode]) return [];
            return Object.keys(this._shipDateIndex[shipCode]).sort();
        },
        _ensureLoaded() {
            if (this._loaded) return;
            try {
                const raw = (typeof goboStorageGet === 'function' ? goboStorageGet(STORAGE_KEY) : localStorage.getItem(STORAGE_KEY));
                if (raw) {
                    try { this._cache = JSON.parse(raw) || {}; } catch (e) { this._cache = {}; }
                    dbg('Loaded cache from storage', { entries: Object.keys(this._cache).length });
                    // Purge any legacy non-SD_ keys (IC_ or raw IDs). We only support SD_<ship>_<date> now.
                    try {
                        const legacyKeys = Object.keys(this._cache).filter(k => !k.startsWith('SD_'));
                        legacyKeys.forEach(k => delete this._cache[k]);
                        if (legacyKeys.length) dbg('Purged legacy non-SD keys', { count: legacyKeys.length });
                    } catch (purgeErr) { dbg('Legacy purge error', purgeErr); }
                    // Rebuild ship/date index
                    try {
                        this._shipDateIndex = {};
                        Object.keys(this._cache).forEach(k => {
                            if (k.startsWith('SD_')) {
                                const parsed = _parseComposite(k);
                                if (parsed.shipCode && parsed.sailDate) this._indexShipDate(parsed.shipCode, parsed.sailDate, k);
                            }
                        });
                        dbg('Rebuilt shipDate index', { ships: Object.keys(this._shipDateIndex).length });
                    } catch (idxErr) { dbg('Index rebuild error', idxErr); }
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
            if (!data || !Array.isArray(data.offers)) { dbg('buildOrUpdateFromOffers: no offers'); return; }
            this._ensureLoaded();
            const now = Date.now();
            let newEntries = 0, updatedEntries = 0, offersProcessed = 0, sailingsProcessed = 0;
            data.offers.forEach(offerObj => {
                offersProcessed++;
                try {
                    const co = offerObj && offerObj.campaignOffer;
                    if (!co || !Array.isArray(co.sailings)) return;
                    const offerCode = (co.offerCode || '').toString().trim();
                    co.sailings.forEach(s => {
                        sailingsProcessed++;
                        try {
                            const sailDate = (s && s.sailDate) ? String(s.sailDate).trim().slice(0,10) : '';
                            const shipCode = s?.shipCode ? String(s.shipCode).trim() : '';
                            if (!(shipCode && sailDate)) { dbg('Skipping sailing missing shipCode+sailDate', { sailDate, shipCode }); return; }
                            const key = `SD_${shipCode}_${sailDate}`;
                            let entry = this._cache[key];
                            if (!entry) {
                                entry = this._cache[key] = {
                                    keyType: 'SHIPDATE',
                                    itineraryCode: '',
                                    sailDate,
                                    shipCode,
                                    offerCodes: [],
                                    shipName: s.shipName || '',
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
                                    hydratedAt: now
                                };
                                newEntries++;
                            } else {
                                const beforeSnapshot = JSON.stringify({
                                    sailDate: entry.sailDate,
                                    offerCodes: [...entry.offerCodes],
                                    shipName: entry.shipName,
                                    shipCode: entry.shipCode,
                                    itineraryDescription: entry.itineraryDescription
                                });
                                updatedEntries++;
                                entry.hydratedAt = now;
                                if (!entry.shipName && s.shipName) entry.shipName = s.shipName;
                                if (!entry.shipCode && shipCode) entry.shipCode = shipCode;
                                if (!entry.itineraryDescription && s.itineraryDescription) entry.itineraryDescription = s.itineraryDescription;
                                if (offerCode && !entry.offerCodes.includes(offerCode)) entry.offerCodes.push(offerCode);
                                const afterSnapshot = JSON.stringify({
                                    sailDate: entry.sailDate,
                                    offerCodes: [...entry.offerCodes],
                                    shipName: entry.shipName,
                                    shipCode: entry.shipCode,
                                    itineraryDescription: entry.itineraryDescription
                                });
                                if (beforeSnapshot !== afterSnapshot) entry.updatedAt = now;
                            }
                            if (offerCode && !entry.offerCodes.includes(offerCode)) entry.offerCodes.push(offerCode);
                            this._indexShipDate(shipCode, sailDate, key);
                        } catch (inner) { dbg('Error processing sailing', inner); }
                    });
                } catch (e) { dbg('Error processing offer', e); }
            });
            this._persist();
            dbg('buildOrUpdateFromOffers complete', { offersProcessed, sailingsProcessed, newEntries, updatedEntries, totalCacheSize: Object.keys(this._cache).length });
        },
        async _hydrateInternal(subsetKeys, mode) {
            if (this._fetchInProgress) { dbg(`_hydrateInternal(${mode}) skipped: in progress`); return; }
            this._fetchInProgress = true;
            let targetKeys = [];
            try {
                this._ensureLoaded();
                const now = Date.now();
                const provided = (Array.isArray(subsetKeys) && subsetKeys.length ? subsetKeys : Object.keys(this._cache)).filter(k => k.startsWith('SD_'));
                if (mode === 'always') {
                    targetKeys = provided;
                    if (!targetKeys.length) { dbg('hydrateAlways: no SD_ keys'); return; }
                } else {
                    const stale = [];
                    provided.forEach(k => {
                        const e = this._cache[k];
                        if (!e) return;
                        const lastTouch = e.hydratedAt || e.updatedAt || 0;
                        if (!e.enriched || !lastTouch || (now - lastTouch) > SIX_HOURS_MS) stale.push(k);
                    });
                    dbg('hydrateIfNeeded evaluated', { providedKeys: provided.length, stale: stale.length });
                    if (!stale.length) return;
                    targetKeys = stale;
                }
                if (!targetKeys.length) return;
                // Group by shipCode and compute min/max date range per ship
                const shipGroupsMap = {};
                targetKeys.forEach(k => {
                    const parsed = _parseComposite(k);
                    if (!parsed.shipCode || !parsed.sailDate) return;
                    let g = shipGroupsMap[parsed.shipCode];
                    if (!g) g = shipGroupsMap[parsed.shipCode] = { shipCode: parsed.shipCode, keys: [], minDate: null, maxDate: null };
                    g.keys.push(k);
                    if (!g.minDate || parsed.sailDate < g.minDate) g.minDate = parsed.sailDate;
                    if (!g.maxDate || parsed.sailDate > g.maxDate) g.maxDate = parsed.sailDate;
                });
                const shipGroups = Object.values(shipGroupsMap);
                if (!shipGroups.length) { dbg('No ship groups to hydrate'); return; }
                let brandHost = 'www.royalcaribbean.com';
                try { if (typeof App !== 'undefined' && App.Utils && typeof App.Utils.detectBrand === 'function') brandHost = App.Utils.detectBrand() === 'C' ? 'www.celebritycruises.com' : 'www.royalcaribbean.com'; } catch (e) {}
                const endpoint = `https://${brandHost}/graph`;
                const query = 'query cruiseSearch_Cruises($filters:String,$qualifiers:String,$sort:CruiseSearchSort,$pagination:CruiseSearchPagination,$nlSearch:String){cruiseSearch(filters:$filters,qualifiers:$qualifiers,sort:$sort,pagination:$pagination,nlSearch:$nlSearch){results{cruises{id productViewLink masterSailing{itinerary{name code days{number type ports{activity arrivalTime departureTime port{code name region}}}departurePort{code name region}destination{code name}portSequence sailingNights ship{code name}totalNights type}}sailings{bookingLink id itinerary{code}sailDate startDate endDate taxesAndFees{value}taxesAndFeesIncluded stateroomClassPricing{price{value currency{code}}stateroomClass{id content{code}}}}}cruiseRecommendationId total}}}';
                let anyUpdated = false;
                const self = this;
                async function postFilters(filtersValue, paginationCount) {
                    let respJson = null;
                    try {
                        const body = JSON.stringify({ query, variables: { filters: filtersValue, pagination: { count: paginationCount, skip: 0 } } });
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
                    } catch (err) { return null; }
                    return respJson?.data?.cruiseSearch?.results?.cruises || [];
                }
                const promises = shipGroups.map(group => (async () => {
                    let localUpdated = false;
                    if (!group.shipCode || !group.minDate || !group.maxDate) return { localUpdated };
                    const filtersValue = `startDate:${group.minDate}~${group.maxDate}|ship:${group.shipCode}`;
                    const expectedKeysSet = new Set(group.keys);
                    const cruises = await postFilters(filtersValue, group.keys.length * 3) || [];
                    cruises.forEach(c => {
                        try {
                            const itin = c?.masterSailing?.itinerary || {};
                            const cruiseId = (c?.id || '').toString().trim();
                            const productViewLink = (c?.productViewLink || '').toString().trim();
                            const itinShipCode = (itin?.ship?.code || '').toString().trim();
                            const itinShipName = (itin?.ship?.name || '').toString().trim();
                            const itinName = (itin?.name || '').toString().trim();
                            const destinationName = (itin?.destination?.name || '').toString().trim();
                            const destinationCode = (itin?.destination?.code || '').toString().trim();
                            const departurePortName = (itin?.departurePort?.name || '').toString().trim();
                            const departurePortCode = (itin?.departurePort?.code || '').toString().trim();
                            const totalNights = (itin?.totalNights || itin?.sailingNights || null);
                            const portSequence = (itin?.portSequence || '').toString().trim();
                            (Array.isArray(c?.sailings) ? c.sailings : []).forEach(s => {
                                try {
                                    const sDate = (s?.sailDate || '').toString().trim().slice(0,10);
                                    let sShip = (s?.shipCode || itinShipCode || '').toString().trim();
                                    if (!sDate || !sShip) return;
                                    const compositeKey = `SD_${sShip}_${sDate}`;
                                    if (!self._cache[compositeKey]) {
                                        self._cache[compositeKey] = {
                                            keyType: 'SHIPDATE',
                                            cruiseId: cruiseId,
                                            productViewLink: productViewLink,
                                            itineraryCode: (s?.itinerary?.code || itin?.code || ''),
                                            sailDate: sDate,
                                            shipCode: sShip,
                                            offerCodes: [],
                                            shipName: (s?.shipName || itinShipName || ''),
                                            itineraryDescription: (s?.itineraryDescription || itinName || ''),
                                            destinationName: destinationName,
                                            destinationCode: destinationCode,
                                            departurePortName: departurePortName,
                                            departurePortCode: departurePortCode,
                                            totalNights: totalNights,
                                            days: Array.isArray(itin?.days) ? itin.days : null,
                                            type: (itin?.type || ''),
                                            portSequence: portSequence,
                                            enriched: false,
                                            taxesAndFees: null,
                                            taxesAndFeesIncluded: null,
                                            stateroomPricing: {},
                                            bookingLink: (s?.bookingLink || ''),
                                            startDate: (s?.startDate || ''),
                                            endDate: (s?.endDate || ''),
                                            updatedAt: Date.now(),
                                            hydratedAt: Date.now()
                                        };
                                    } else {
                                        const entry = self._cache[compositeKey];
                                        if (!entry.cruiseId && cruiseId) entry.cruiseId = cruiseId;
                                        if (!entry.productViewLink && productViewLink) entry.productViewLink = productViewLink;
                                        if (!entry.shipName && itinShipName) entry.shipName = itinShipName;
                                        if (!entry.itineraryDescription && itinName) entry.itineraryDescription = itinName;
                                        if (!entry.destinationName && destinationName) entry.destinationName = destinationName;
                                        if (!entry.destinationCode && destinationCode) entry.destinationCode = destinationCode;
                                        if (!entry.departurePortName && departurePortName) entry.departurePortName = departurePortName;
                                        if (!entry.departurePortCode && departurePortCode) entry.departurePortCode = departurePortCode;
                                        if (!entry.totalNights && totalNights) entry.totalNights = totalNights;
                                        if (!entry.portSequence && portSequence) entry.portSequence = portSequence;
                                        if (!entry.bookingLink && s?.bookingLink) entry.bookingLink = s.bookingLink;
                                        if (!entry.startDate && s?.startDate) entry.startDate = s.startDate;
                                        if (!entry.endDate && s?.endDate) entry.endDate = s.endDate;
                                    }
                                    self._enrichEntryFromSailing(compositeKey, itin, s);
                                    self._indexShipDate(sShip, sDate, compositeKey);
                                    localUpdated = true;
                                    expectedKeysSet.delete(compositeKey);
                                } catch (innerS) {}
                            });
                        } catch (inner) {}
                    });
                    // Mark expected keys as hydrated even if not returned (ghost offers)
                    if (expectedKeysSet.size) {
                        const ts = Date.now();
                        expectedKeysSet.forEach(mKey => {
                            const e = self._cache[mKey];
                            if (e) {
                                e.hydratedAt = ts;
                            }
                        });
                    }
                    return { localUpdated };
                })());
                const results = await Promise.all(promises);
                results.forEach(r => { if (!r) return; if (r.localUpdated) anyUpdated = true; });
                if (anyUpdated) {
                    this._persist();
                    try { document.dispatchEvent(new CustomEvent('goboItineraryHydrated', { detail: { keys: targetKeys } })); } catch (e) {}
                }
                // Prune itineraries that have no offers associated after hydration (keeps cache lean)
                try { this._pruneNoOffers(); } catch (e) { dbg('Prune after hydration error', e); }
                dbg(`Hydration complete (${mode})`, { anyUpdated, shipGroupCount: shipGroups.length, fetchCount: this._fetchCount });
            } catch (e) {
                dbg(`_hydrateInternal(${mode}) error`, e);
            } finally {
                this._fetchInProgress = false;
            }
        },
        async hydrateIfNeeded(subsetKeys) { return this._hydrateInternal(subsetKeys, 'ifNeeded'); },
        async hydrateAlways(subsetKeys) { return this._hydrateInternal(subsetKeys, 'always'); },
        _computeDerivedPricing(entry) {
            try {
                if (!entry || !entry.stateroomPricing) return;
                // Avoid recompute unless pricing changed (simple hash of keys+prices)
                const keys = Object.keys(entry.stateroomPricing);
                const sigParts = [];
                keys.forEach(k => {
                    try {
                        const pr = entry.stateroomPricing[k];
                        const priceVal = pr && typeof pr.price === 'number' ? pr.price : (pr && typeof pr.amount === 'number' ? pr.amount : null);
                        sigParts.push(`${pr && (pr.code || k)}:${priceVal}`);
                    } catch(e){}
                });
                const signature = sigParts.sort().join('|');
                if (entry._pricingDerivedSig === signature && entry.pricingDerived) return; // no changes
                // Mapping logic (reuse simplified version of popup + PricingUtils maps)
                const baseCategoryMap = { I:'INTERIOR', IN:'INTERIOR', INT:'INTERIOR', INSIDE:'INTERIOR', INTERIOR:'INTERIOR',
                    O:'OUTSIDE', OV:'OUTSIDE', OB:'OUTSIDE', E:'OUTSIDE', OCEAN:'OUTSIDE', OCEANVIEW:'OUTSIDE', 'OCEAN VIEW':'OUTSIDE', OUTSIDE:'OUTSIDE',
                    B:'BALCONY', BAL:'BALCONY', BK:'BALCONY', BALCONY:'BALCONY',
                    D:'DELUXE', DLX:'DELUXE', DELUXE:'DELUXE', JS:'DELUXE', SU:'DELUXE', SUITE:'DELUXE' };
                function resolveCat(raw){ if(!raw) return null; const up = String(raw).trim().toUpperCase(); const upCompact = up.replace(/\s+/g,''); return baseCategoryMap[up] || baseCategoryMap[upCompact] || (['INTERIOR','OUTSIDE','BALCONY','DELUXE'].includes(up)?up:null); }
                const catMin = { INTERIOR:null, OUTSIDE:null, BALCONY:null, DELUXE:null };
                const currencyCounts = {};
                keys.forEach(k => {
                    try {
                        const pr = entry.stateroomPricing[k];
                        if (!pr) return;
                        const code = pr.code || k;
                        const cat = resolveCat(code);
                        const raw = pr.price ?? pr.amount ?? pr.priceAmount;
                        if (typeof raw !== 'number') return; // assume already single guest per-person price => later always *2 like popup
                        const dual = Number(raw) * 2; // store dual occupancy baseline
                        if (cat && (catMin[cat] == null || dual < catMin[cat])) catMin[cat] = dual;
                        if (pr.currency) currencyCounts[pr.currency] = (currencyCounts[pr.currency]||0)+1;
                    } catch(e){}
                });
                const baseCurrency = Object.keys(currencyCounts).sort((a,b)=>currencyCounts[b]-currencyCounts[a])[0] || null;
                // Taxes (dual)
                let taxesDual = 0;
                try {
                    if (typeof entry.taxesAndFees === 'number') taxesDual = entry.taxesAndFees * 2;
                    else if (typeof entry.taxesAndFees === 'string') {
                        const cleaned = entry.taxesAndFees.replace(/[^0-9.\-]/g,'');
                        const t = Number(cleaned); if (isFinite(t)) taxesDual = t * 2; }
                } catch(e){}
                // Build upgrade deltas matrix (FROM -> TO additional + taxes "you pay" semantics depend on chosen offer later)
                const categories = ['INTERIOR','OUTSIDE','BALCONY','DELUXE'];
                const upgradeDelta = {};
                categories.forEach(from => {
                    upgradeDelta[from] = {};
                    categories.forEach(to => {
                        const fromVal = catMin[from];
                        const toVal = catMin[to];
                        if (fromVal == null || toVal == null) upgradeDelta[from][to] = null; else upgradeDelta[from][to] = Math.max(0, toVal - fromVal);
                    });
                });
                entry.pricingDerived = {
                    categories: { ...catMin },
                    taxesAndFeesDual: taxesDual,
                    baseCurrency,
                    upgradeDelta, // raw difference (dual occupancy) between min category prices
                    computedAt: Date.now()
                };
                entry._pricingDerivedSig = signature;
            } catch(e) { /* ignore derived pricing errors */ }
        },
        computeAllDerivedPricing() {
            try {
                this._ensureLoaded();
                Object.keys(this._cache).forEach(k => {
                    try { const e = this._cache[k]; if (e && e.stateroomPricing && Object.keys(e.stateroomPricing).length) this._computeDerivedPricing(e); } catch(inner){}
                });
                // Persist after batch to save signature state
                this._persist();
                try { document.dispatchEvent(new CustomEvent('goboItineraryPricingComputed')); } catch(e){}
            } catch(e){}
        },
        // Internal pruning: remove any SD_ itinerary entries that have zero offerCodes
        _pruneNoOffers() {
            try {
                this._ensureLoaded();
                let removed = 0;
                const now = Date.now();
                Object.keys(this._cache).forEach(k => {
                    try {
                        if (!k.startsWith('SD_')) return;
                        const e = this._cache[k];
                        const offers = e && Array.isArray(e.offerCodes) ? e.offerCodes : [];
                        if (!offers.length) {
                            // Remove from ship/date index first
                            const parsed = _parseComposite(k);
                            if (parsed.shipCode && parsed.sailDate && this._shipDateIndex[parsed.shipCode]) {
                                try { delete this._shipDateIndex[parsed.shipCode][parsed.sailDate]; } catch (idxErr) {}
                                if (Object.keys(this._shipDateIndex[parsed.shipCode]).length === 0) delete this._shipDateIndex[parsed.shipCode];
                            }
                            delete this._cache[k];
                            removed++;
                        }
                    } catch (innerPrune) { /* ignore single entry prune errors */ }
                });
                if (removed) {
                    this._persist();
                    dbg('Pruned itineraries with no offers', { removed, remaining: Object.keys(this._cache).length });
                    try { document.dispatchEvent(new CustomEvent('goboItineraryPruned', { detail: { removed, ts: now } })); } catch (evtErr) {}
                } else {
                    dbg('Prune check: no itineraries without offers to remove');
                }
            } catch (e) { dbg('Prune error', e); }
        },
        // Public wrapper if needed externally
        pruneNoOffers() { return this._pruneNoOffers(); },
        _persist() {
            try { goboStorageSet(STORAGE_KEY, JSON.stringify(this._cache)); dbg('Cache persisted', { entries: Object.keys(this._cache).length }); } catch (e) { dbg('Persist error', e); }
        },
        get(key) { this._ensureLoaded(); return this._cache[key]; },
        all() { this._ensureLoaded(); return { ...this._cache }; },
        showModal(key, sourceEl) {
            try {
                this._ensureLoaded();
                const data = this._cache[key];
                const existing = document.getElementById('gobo-itinerary-modal');
                if (existing) existing.remove();
                try { document.querySelectorAll('.gobo-itinerary-highlight').forEach(el => el.classList.remove('gobo-itinerary-highlight')); } catch (e) {}
                let rowToHighlight = null;
                try {
                    if (sourceEl && sourceEl instanceof Element) rowToHighlight = sourceEl.closest ? sourceEl.closest('tr') || sourceEl : sourceEl;
                    if (!rowToHighlight) {
                        const cell = document.getElementById(key);
                        if (cell) rowToHighlight = cell.closest ? cell.closest('tr') : null;
                    }
                } catch (e) {}
                try {
                    if (!document.getElementById('gobo-itinerary-highlight-style')) {
                        const style = document.createElement('style');
                        style.id = 'gobo-itinerary-highlight-style';
                        style.textContent = `\n                            .gobo-itinerary-highlight { animation: gobo-itin-flash 1s ease-in-out; background: rgba(255,245,170,0.9) !important; transition: background .3s, box-shadow .3s; box-shadow: 0 0 0 3px rgba(255,230,120,0.4) inset; }\n                            @keyframes gobo-itin-flash { 0% { background: rgba(255,245,170,0.0);} 30% { background: rgba(255,245,170,0.95);} 100% { background: rgba(255,245,170,0.9);} }\n                        `;
                        document.head.appendChild(style);
                    }
                } catch (e) {}
                if (rowToHighlight) {
                    try {
                        rowToHighlight.classList.add('gobo-itinerary-highlight');
                        rowToHighlight.scrollIntoView({behavior: 'smooth', block: 'center'});
                    } catch (e) {}
                }
                if (!data) {
                    dbg('showModal: no data for key', key);
                    try { if (typeof App !== 'undefined' && App.ErrorHandler && typeof App.ErrorHandler.showError === 'function') App.ErrorHandler.showError('Itinerary details are not available for this sailing. '); } catch (e) {}
                    return;
                }
                const backdrop = document.createElement('div');
                backdrop.id = 'gobo-itinerary-modal';
                backdrop.className = 'gobo-itinerary-backdrop';
                backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
                const panel = document.createElement('div');
                panel.className = 'gobo-itinerary-panel';
                const closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.className = 'gobo-itinerary-close';
                closeBtn.textContent = '\u00d7';
                closeBtn.setAttribute('aria-label', 'Close');
                closeBtn.addEventListener('click', () => backdrop.remove());
                panel.appendChild(closeBtn);
                const refreshBtn = document.createElement('button');
                refreshBtn.type = 'button';
                refreshBtn.className = 'gobo-itinerary-refresh';
                refreshBtn.textContent = '\u21bb';
                refreshBtn.setAttribute('aria-label', 'Refresh itinerary data');
                refreshBtn.title = 'Refresh itinerary data';
                refreshBtn.addEventListener('click', async (evt) => {
                    evt.preventDefault();
                    if (refreshBtn.classList.contains('loading')) return;
                    refreshBtn.classList.add('loading');
                    dbg('Manual refresh clicked', key);
                    try {
                        if (typeof ItineraryCache.hydrateAlways === 'function') {
                            await ItineraryCache.hydrateAlways([key]);
                        } else {
                            await ItineraryCache.hydrateIfNeeded([key]);
                        }
                    } catch (err) { dbg('Refresh hydrate error', err); }
                    refreshBtn.classList.remove('loading');
                    try { ItineraryCache.showModal(key, sourceEl); } catch (e) { dbg('Re-render after refresh failed', e); }
                });
                panel.appendChild(refreshBtn);
                const title = document.createElement('h2');
                title.className = 'gobo-itinerary-title';
                title.textContent = `${data.itineraryDescription || 'Itinerary'} (${data.totalNights || '?' } nights)`;
                panel.appendChild(title);
                const subtitle = document.createElement('div');
                subtitle.className = 'gobo-itinerary-subtitle';
                subtitle.textContent = `${data.shipName || ''} • ${data.departurePortName || ''} • ${data.sailDate || ''}`;
                panel.appendChild(subtitle);
                if (data.bookingLink) {
                    const linkWrap = document.createElement('div');
                    const a = document.createElement('a');
                    const host = (function () { try { if (App && App.Utils && typeof App.Utils.detectBrand === 'function') return App.Utils.detectBrand() === 'C' ? 'www.celebritycruises.com' : 'www.royalcaribbean.com'; } catch (e) {} return 'www.royalcaribbean.com'; })();
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
                    // Build flat list of pricing entries for easier lookup (defer creating header until after computations)
                    const codeMap = { I:'Interior', IN:'Interior', INT:'Interior', INSIDE:'Interior', INTERIOR:'Interior', O:'Ocean View', OV:'Ocean View', OB:'Ocean View', E:'Ocean View', OCEAN:'Ocean View', OCEANVIEW:'Ocean View', OUTSIDE:'Ocean View', B:'Balcony', BAL:'Balcony', BK:'Balcony', BALCONY:'Balcony', D:'Suite', DLX:'Suite', DELUXE:'Suite', JS:'Suite', SU:'Suite', SUITE:'Suite', JUNIOR:'Suite', 'JR':'Suite', 'JR.':'Suite', 'JR-SUITE':'Suite', 'JR SUITE':'Suite', 'JUNIOR SUITE':'Suite', 'JRSUITE':'Suite', 'JR SUITES':'Suite', 'JUNIOR SUITES':'Suite' };
                    const baseCategoryMap = { I:'INTERIOR', IN:'INTERIOR', INT:'INTERIOR', INSIDE:'INTERIOR', INTERIOR:'INTERIOR', O:'OUTSIDE', OV:'OUTSIDE', OB:'OUTSIDE', E:'OUTSIDE', OCEAN:'OUTSIDE', OCEANVIEW:'OUTSIDE', 'OCEAN VIEW':'OUTSIDE', OUTSIDE:'OUTSIDE', B:'BALCONY', BAL:'BALCONY', BK:'BALCONY', BALCONY:'BALCONY', D:'DELUXE', DLX:'DELUXE', DELUXE:'DELUXE', JS:'DELUXE', SU:'DELUXE', SUITE:'DELUXE', JUNIOR:'DELUXE', 'JR':'DELUXE', 'JR.':'DELUXE', 'JR-SUITE':'DELUXE', 'JR SUITE':'DELUXE', 'JUNIOR SUITE':'DELUXE', 'JRSUITE':'DELUXE', 'JR SUITES':'DELUXE', 'JUNIOR SUITES':'DELUXE' };
                    function resolveDisplay(raw){ raw=(raw||'').trim(); return codeMap[raw.toUpperCase()]||raw; }
                    function resolveCategory(raw){ raw=(raw||'').trim(); const up=raw.toUpperCase(); const upCompact = up.replace(/\s+/g,''); if (baseCategoryMap[up]) return baseCategoryMap[up]; if (baseCategoryMap[upCompact]) return baseCategoryMap[upCompact]; if (['INTERIOR','OUTSIDE','BALCONY','DELUXE'].includes(up)) return up; return null; }
                    const sortOrder = {INTERIOR:0, OUTSIDE:1, BALCONY:2, DELUXE:3};

                    // Robust taxes parsing (per-person) then convert to dual occupancy
                    let taxesPerPerson = null;
                    try {
                        let tRaw = data.taxesAndFees;
                        if (tRaw && typeof tRaw === 'object' && tRaw.value != null) tRaw = tRaw.value;
                        if (typeof tRaw === 'number') taxesPerPerson = isFinite(tRaw) ? Number(tRaw) : null;
                        else if (typeof tRaw === 'string') {
                            const cleaned = tRaw.replace(/[^0-9.\-]/g,''); const num = Number(cleaned); if (isFinite(num)) taxesPerPerson = num; }
                    } catch(e) { taxesPerPerson = null; }
                    const taxesNumber = (taxesPerPerson != null) ? taxesPerPerson * 2 : 0;

                    const priceEntries = priceKeys.map(k => { const pr = data.stateroomPricing[k] || {}; return { key:k, code:(pr.code||k||'').toString().trim(), priceNum:(typeof pr.price==='number')?Number(pr.price)*2:null, currency: pr.currency||'' }; });
                    const pricedEntries = priceEntries.filter(pe=>pe.priceNum!=null);
                    const currencyFallback = pricedEntries[0]?.currency || '';

                    // Offer category detection (same logic as before)
                    let offerCategoryRaw = '';
                    try { if (sourceEl && sourceEl instanceof Element) offerCategoryRaw = String(sourceEl.dataset && sourceEl.dataset.offerCategory ? sourceEl.dataset.offerCategory : '').trim(); } catch(e){}
                    if (!offerCategoryRaw) {
                        try {
                            const row = sourceEl && sourceEl.closest ? sourceEl.closest('tr') : null;
                            if (row) {
                                const tds = Array.from(row.querySelectorAll('td'));
                                for (let td of tds) {
                                    const txt=(td.textContent||'').trim();
                                    if (!txt) continue;
                                    if (resolveCategory(txt) !== null) { offerCategoryRaw = txt; break; }
                                }
                            }
                        } catch(e){}
                    }
                    // Store original resolved awarded category separately for UI highlight (even if sold out)
                    const originalAwardCategoryResolved = resolveCategory(offerCategoryRaw);

                    // Detect 1 Guest offer
                    let isOneGuestOffer = false;
                    try {
                        if (sourceEl instanceof Element) {
                            const row = sourceEl.closest ? sourceEl.closest('tr') : null;
                            if (row) {
                                const tds = row.querySelectorAll('td');
                                for (let i = 0; i < tds.length; i++) {
                                    const txt = (tds[i].textContent || '').trim();
                                    if (/^1\s+Guest\b/i.test(txt)) { isOneGuestOffer = true; break; }
                                }
                            }
                        }
                    } catch (e) {}

                    // Determine awarded category price entry with lower-category fallback when sold out
                    function findAwardedOrLower(rawCat){
                        if(!rawCat) return null;
                        const order=['INTERIOR','OUTSIDE','BALCONY','DELUXE'];
                        const targetCat=resolveCategory(rawCat);
                        // Build minima map
                        const minima={};
                        priceEntries.forEach(pe=>{ const cat=resolveCategory(pe.code); if(cat && pe.priceNum!=null){ if(minima[cat]==null || pe.priceNum<minima[cat]) minima[cat]=pe.priceNum; }});
                        if(targetCat){
                            if(minima[targetCat]!=null) return { priceNum:minima[targetCat], category:targetCat };
                            const idx=order.indexOf(targetCat);
                            if(idx>0){ for(let i=idx-1;i>=0;i--){ const c=order[i]; if(minima[c]!=null) return { priceNum:minima[c], category:c, fallback:true }; }}
                            return { priceNum:null, category:targetCat, soldOut:true };
                        }
                        // If targetCat not resolved, try any category by original raw code first
                        const direct=priceEntries.find(pe=>pe.code.toUpperCase()===rawCat.toUpperCase() && pe.priceNum!=null);
                        if(direct) return { priceNum:direct.priceNum, category:resolveCategory(direct.code)||direct.code };
                        // fallback cheapest overall
                        const cheapestCat = order.find(c=>minima[c]!=null);
                        if(cheapestCat) return { priceNum:minima[cheapestCat], category:cheapestCat, fallbackAny:true };
                        return { priceNum:null };
                    }
                    const awardedInfo = findAwardedOrLower(offerCategoryRaw);
                    const effectiveOfferPriceNum = (awardedInfo && typeof awardedInfo.priceNum==='number') ? Number(awardedInfo.priceNum) : null;
                    // New rule flag: awarded category and all lower categories sold out (no fallback pricing)
                    const scenarioAllLowerSoldOut = !!(awardedInfo && awardedInfo.soldOut && !awardedInfo.fallback && !awardedInfo.fallbackAny && effectiveOfferPriceNum == null && originalAwardCategoryResolved);

                    // Single-guest offer value computation (with assumed $200 discount)
                    const SINGLE_GUEST_DISCOUNT_ASSUMED = 200;
                    let singleGuestOfferValue = null; // offerValue = personFare - discount
                    if (isOneGuestOffer) {
                        if (effectiveOfferPriceNum != null) {
                            const baseOfferPriceNum = effectiveOfferPriceNum; // dual occupancy price for awarded or fallback lower category
                            const T = Number(taxesNumber);
                            const numerator = baseOfferPriceNum + SINGLE_GUEST_DISCOUNT_ASSUMED - T;
                            const ov = numerator / 1.4 - SINGLE_GUEST_DISCOUNT_ASSUMED;
                            singleGuestOfferValue = (isFinite(ov) && ov > 0) ? ov : 0;
                        } else {
                            singleGuestOfferValue = 0; // awarded + lower sold out
                        }
                    }

                    // Dual-guest (regular) offer value: difference between base category price and You Pay (which is taxesNumber for that category in dual occupancy logic)
                    let dualGuestOfferValue = null;
                    if (!isOneGuestOffer) {
                        if (effectiveOfferPriceNum != null) {
                            const diff = effectiveOfferPriceNum - Number(taxesNumber);
                            dualGuestOfferValue = isFinite(diff) && diff > 0 ? diff : 0;
                        } else {
                            // awarded and all lower categories sold out => value zero
                            dualGuestOfferValue = 0;
                        }
                    }

                    // Now create header and inject Offer Value span for either scenario
                    const priceTitle = document.createElement('h3');
                    priceTitle.className = 'gobo-itinerary-section-title';
                    priceTitle.textContent = 'Stateroom Pricing';
                    if ((isOneGuestOffer && singleGuestOfferValue != null) || (!isOneGuestOffer && dualGuestOfferValue != null)) {
                        try {
                            const offerValueEl = document.createElement('span');
                            offerValueEl.className = 'gobo-itinerary-offervalue';
                            offerValueEl.style.cssText = 'float:right;font-weight:normal;font-size:0.85em;';
                            const valNum = isOneGuestOffer ? singleGuestOfferValue : dualGuestOfferValue;
                            const label = isOneGuestOffer ? 'Offer Value (est.)' : 'Offer Value';
                            offerValueEl.textContent = `${label}: ${valNum.toFixed(2)} ${currencyFallback}`;
                            offerValueEl.title = isOneGuestOffer ? 'Estimated single-guest offer value derived from base price, assumed $200 discount, and taxes.' : 'Difference between base category price (dual occupancy) and estimated You Pay.';
                            priceTitle.appendChild(offerValueEl);
                        } catch(e) { dbg('OfferValue span inject error', e); }
                    }
                    panel.appendChild(priceTitle);

                    // Proceed to build table
                    // REPLACED: build aggregated category entries with synthetic Sold Out rows for missing categories
                    const orderCats = ['INTERIOR','OUTSIDE','BALCONY','DELUXE'];
                    // Track if any entry already exists for a category (either priced or unpriced)
                    const existingCatSet = new Set();
                    priceEntries.forEach(pe => { const cat=resolveCategory(pe.code); if(cat) existingCatSet.add(cat); });
                    // Synthetic entries for missing broad categories
                    orderCats.forEach(cat => { if (!existingCatSet.has(cat)) { priceEntries.push({ key:'__SYN_'+cat, code:cat, priceNum:null, currency:'' }); existingCatSet.add(cat); } });
                    // Deduplicate by choosing cheapest priced entry per category plus any additional non-priced entries are ignored
                    const bestByCat = {};
                    priceEntries.forEach(pe => {
                        const cat = resolveCategory(pe.code);
                        if (!cat) return;
                        if (bestByCat[cat] == null) { bestByCat[cat] = pe; }
                        else if (pe.priceNum != null && (bestByCat[cat].priceNum == null || pe.priceNum < bestByCat[cat].priceNum)) {
                            bestByCat[cat] = pe;
                        }
                    });
                    const displayEntries = orderCats.map(cat => bestByCat[cat]).filter(Boolean);
                    // Sort (already in orderCats sequence) then render
                    const pTable = document.createElement('table'); pTable.className='gobo-itinerary-table';
                    const thead = document.createElement('thead'); const thr=document.createElement('tr'); ['Class','Retail Price','You Pay (ESTIMATED)','Currency'].forEach((h,i)=>{ const th=document.createElement('th'); th.textContent=h; if(i===1||i===2) th.style.textAlign='right'; thr.appendChild(th); }); thead.appendChild(thr); pTable.appendChild(thead);
                    const tbody = document.createElement('tbody');
                    displayEntries.forEach(entry => {
                        const tr=document.createElement('tr');
                        const rawCode=entry.code||'';
                        const label=resolveDisplay(rawCode);
                        const hasPrice=entry.priceNum!=null && isFinite(entry.priceNum);
                        const priceVal=hasPrice?Number(entry.priceNum).toFixed(2):'Sold Out';
                        const currency=hasPrice?(entry.currency||currencyFallback||''):(currencyFallback||'');
                        const thisCat = resolveCategory(rawCode);
                        let youPayDisplay='';
                        if(!hasPrice) { youPayDisplay='Sold Out'; }
                        else {
                            const currentPriceNum=Number(entry.priceNum); let estimatedNum=0;
                            const awardIdx = originalAwardCategoryResolved ? orderCats.indexOf(originalAwardCategoryResolved) : -1;
                            const thisIdx = thisCat ? orderCats.indexOf(thisCat) : -1;
                            if (scenarioAllLowerSoldOut && awardIdx >= 0 && thisIdx > awardIdx) {
                                // All lower tiers including awarded are sold out; unknown discount => You Pay equals base price
                                estimatedNum = currentPriceNum;
                            } else if(isOneGuestOffer && singleGuestOfferValue!=null){
                                let calc = currentPriceNum - singleGuestOfferValue;
                                if(!isFinite(calc) || calc < Number(taxesNumber)) calc = Number(taxesNumber);
                                estimatedNum = calc;
                            } else if(effectiveOfferPriceNum!=null){
                                const currentMatchesAward = (thisCat && awardedInfo && thisCat===awardedInfo.category);
                                if(currentMatchesAward){ estimatedNum=taxesNumber; } else {
                                    let diff=currentPriceNum - effectiveOfferPriceNum; if(isNaN(diff)||diff<0) diff=0; estimatedNum=diff + taxesNumber; }
                            } else {
                                estimatedNum=taxesNumber;
                            }
                            youPayDisplay = typeof estimatedNum==='number'?Number(estimatedNum).toFixed(2):String(estimatedNum);
                        }
                        try { const resolvedTarget = originalAwardCategoryResolved ? originalAwardCategoryResolved.toUpperCase() : (awardedInfo && awardedInfo.category ? awardedInfo.category.toUpperCase() : null); if (resolvedTarget && thisCat && thisCat.toUpperCase()===resolvedTarget) tr.classList.add('gobo-itinerary-current-category'); } catch(e){}
                        const vals=[label,priceVal,youPayDisplay,currency];
                        vals.forEach((val,i)=>{ const td=document.createElement('td'); td.textContent=val; if(i===1||i===2) td.style.textAlign='right'; td.title=rawCode; if(i===1&&!hasPrice) td.className='gobo-itinerary-soldout'; if(i===2&&val==='Sold Out') td.className='gobo-itinerary-soldout'; tr.appendChild(td); });
                        tbody.appendChild(tr);
                    });
                    pTable.appendChild(tbody); panel.appendChild(pTable);
                    // END REPLACED BLOCK
                }
                if (data.taxesAndFees != null) {
                    const tf = document.createElement('div'); tf.className='gobo-itinerary-taxes';
                    let perPerson = data.taxesAndFees;
                    if (perPerson && typeof perPerson === 'object' && perPerson.value != null) perPerson = perPerson.value;
                    if (typeof perPerson === 'string') {
                        const cleaned = perPerson.replace(/[^0-9.\-]/g,''); const num = Number(cleaned); if (isFinite(num)) perPerson = num; }
                    let dual = (typeof perPerson === 'number' && isFinite(perPerson)) ? perPerson * 2 : null;
                    const taxesText = dual != null ? dual.toFixed(2) : '-';
                    const currency = (function(){ try { const first = Object.values(data.stateroomPricing||{})[0]; return first && first.currency ? first.currency : (first && first.currencyCode ? first.currencyCode : ''); } catch(e){ return ''; } })();
                    tf.textContent = `Taxes & Fees: ${taxesText} ${currency} (${data.taxesAndFeesIncluded?'Included':'Additional'}) - Prices reflect cheapest dual-occupancy category rates.`;
                    panel.appendChild(tf);
                }
                if (Array.isArray(data.days) && data.days.length) {
                    const dayTitle = document.createElement('h3'); dayTitle.className='gobo-itinerary-section-title'; dayTitle.textContent='Day-by-Day'; panel.appendChild(dayTitle);
                    const dTable = document.createElement('table'); dTable.className='gobo-itinerary-table';
                    // Removed 'Type' column; new order: Day, Day of Week, Date, Port, Arrival, Departure
                    const dh = document.createElement('thead'); const dhr=document.createElement('tr'); ['Day','Day of Week','Date','Port','Arrival','Departure'].forEach((h,i)=>{ const th=document.createElement('th'); th.textContent=h; if(i===1) th.style.textAlign='left'; if(i===2) th.style.textAlign='right'; dhr.appendChild(th); }); dh.appendChild(dhr); dTable.appendChild(dh);
                    const db=document.createElement('tbody');
                    data.days.forEach(day=>{
                        try {
                            const tr=document.createElement('tr');
                            let baseDateStr = data.startDate || data.sailDate || null; let computedDate=null;
                            try {
                                if (baseDateStr) {
                                    function utcDate(ds){ if(!ds||typeof ds!=='string') return null; const m=ds.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return new Date(Date.UTC(+m[1],+m[2]-1,+m[3])); const parsed=new Date(ds); if(isNaN(parsed.getTime())) return null; return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())); }
                                    const startUtc=utcDate(baseDateStr); if (startUtc){ const offset=(day&&day.number&&!isNaN(Number(day.number)))?Number(day.number)-1:0; computedDate=new Date(startUtc); computedDate.setUTCDate(computedDate.getUTCDate()+offset); }
                                }
                            } catch(e){}
                            const dow = computedDate? new Intl.DateTimeFormat(undefined,{weekday:'short', timeZone:'UTC'}).format(computedDate):'';
                            const dateFmt = computedDate? new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric', timeZone:'UTC'}).format(computedDate):'';
                            const ports = Array.isArray(day.ports)?day.ports:[]; let activity='', arrival='', departure='';
                            if (ports.length){ const p=ports[0];
                                let portName = (p.port && p.port.name ? String(p.port.name).trim() : '');
                                let portRegion = (p.port && p.port.region ? String(p.port.region).trim() : '');
                                // Avoid duplicating when region equals name (case-insensitive)
                                if (portName && portRegion && portRegion.toUpperCase() === portName.toUpperCase()) portRegion='';
                                // Build combined display
                                activity = portRegion ? (portName ? portName + ', ' + portRegion : portRegion) : portName;
                                arrival=p.arrivalTime||''; departure=p.departureTime||''; }
                            const dayLabel = (day&&day.number!=null)?String(day.number):'';
                            // Build row values without Type column
                            [dayLabel,dow,dateFmt,activity,arrival,departure].forEach((val,i)=>{ const td=document.createElement('td'); td.textContent=val||''; if(i===1) td.style.textAlign='left'; if(i===2) td.style.textAlign='right'; tr.appendChild(td); });
                            db.appendChild(tr);
                        } catch(inner){}
                    });
                    dTable.appendChild(db); panel.appendChild(dTable);
                }
                if (Array.isArray(data.offerCodes) && data.offerCodes.length) {
                    const oc=document.createElement('div'); oc.className='gobo-itinerary-offercodes'; oc.textContent='Offer Codes: '+data.offerCodes.join(', '); panel.appendChild(oc);
                }
                const footer=document.createElement('div'); footer.className='gobo-itinerary-footer'; const updatedStr=data.updatedAt?new Date(data.updatedAt).toLocaleString():'N/A'; const hydratedStr=data.hydratedAt?new Date(data.hydratedAt).toLocaleString():updatedStr; footer.textContent=(data.hydratedAt&&data.updatedAt&&data.hydratedAt!==data.updatedAt)?`Data updated ${updatedStr} • Last refreshed ${hydratedStr}`:`Itinerary data last updated ${updatedStr}`; panel.appendChild(footer);
                backdrop.appendChild(panel);
                document.body.appendChild(backdrop);
            } catch (e) { dbg('showModal error', e); }
        }
    };
    try { window['ItineraryCache'] = ItineraryCache; dbg('ItineraryCache exposed'); } catch (e) {}
})();
