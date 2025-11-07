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
                dbg(`Hydration complete (${mode})`, { anyUpdated, shipGroupCount: shipGroups.length, fetchCount: this._fetchCount });
            } catch (e) {
                dbg(`_hydrateInternal(${mode}) error`, e);
            } finally {
                this._fetchInProgress = false;
            }
        },
        async hydrateIfNeeded(subsetKeys) { return this._hydrateInternal(subsetKeys, 'ifNeeded'); },
        async hydrateAlways(subsetKeys) { return this._hydrateInternal(subsetKeys, 'always'); },
        _enrichEntryFromSailing(key, itin, s) {
            try {
                const entry = this._cache[key];
                if (!entry) return;
                const beforeSnapshot = JSON.stringify({
                    shipName: entry.shipName,
                    shipCode: entry.shipCode,
                    itineraryDescription: entry.itineraryDescription,
                    destinationName: entry.destinationName,
                    destinationCode: entry.destinationCode,
                    departurePortName: entry.departurePortName,
                    departurePortCode: entry.departurePortCode,
                    totalNights: entry.totalNights,
                    days: entry.days,
                    type: entry.type,
                    portSequence: entry.portSequence,
                    cruiseId: entry.cruiseId,
                    productViewLink: entry.productViewLink,
                    bookingLink: entry.bookingLink,
                    startDate: entry.startDate,
                    endDate: entry.endDate,
                    taxesAndFees: entry.taxesAndFees,
                    taxesAndFeesIncluded: entry.taxesAndFeesIncluded,
                    stateroomPricing: entry.stateroomPricing
                });
                const itinShipObj = itin?.ship || {};
                if (itinShipObj.name && !entry.shipName) entry.shipName = itinShipObj.name;
                if (itinShipObj.code && !entry.shipCode) entry.shipCode = itinShipObj.code;
                if (itin?.name && !entry.itineraryDescription) entry.itineraryDescription = itin.name;
                if (itin?.destination?.name && !entry.destinationName) entry.destinationName = itin.destination.name;
                if (itin?.destination?.code && !entry.destinationCode) entry.destinationCode = itin.destination.code;
                if (itin?.departurePort?.name && !entry.departurePortName) entry.departurePortName = itin.departurePort.name;
                if (itin?.departurePort?.code && !entry.departurePortCode) entry.departurePortCode = itin.departurePort.code;
                if ((itin?.totalNights || itin?.sailingNights) && !entry.totalNights) entry.totalNights = itin.totalNights || itin.sailingNights;
                if (Array.isArray(itin?.days) && !entry.days) entry.days = itin.days;
                if (itin?.type && !entry.type) entry.type = itin.type;
                if (itin?.portSequence && !entry.portSequence) entry.portSequence = itin.portSequence;
                entry.enriched = true;
                try {
                    if (s && typeof s === 'object') {
                        if (s.bookingLink && !entry.bookingLink) entry.bookingLink = s.bookingLink;
                        if (s.startDate && !entry.startDate) entry.startDate = s.startDate;
                        if (s.endDate && !entry.endDate) entry.endDate = s.endDate;
                        if (s.taxesAndFees && typeof s.taxesAndFees.value === 'number') entry.taxesAndFees = s.taxesAndFees.value;
                        if (typeof s.taxesAndFeesIncluded === 'boolean') entry.taxesAndFeesIncluded = s.taxesAndFeesIncluded;
                        if (Array.isArray(s.stateroomClassPricing)) {
                            entry.stateroomPricing = entry.stateroomPricing || {};
                            s.stateroomClassPricing.forEach(p => {
                                try {
                                    const classId = p?.stateroomClass?.id || p?.stateroomClass?.content?.code;
                                    if (!classId) return;
                                    const priceVal = (p?.price && typeof p.price.value === 'number') ? p.price.value : null;
                                    const currencyCode = p?.price?.currency?.code || null;
                                    const simpleCode = p?.stateroomClass?.content?.code || null;
                                    if (!entry.stateroomPricing[classId] || (priceVal !== null && entry.stateroomPricing[classId].price == null)) {
                                        entry.stateroomPricing[classId] = { price: priceVal, currency: currencyCode, code: simpleCode };
                                    }
                                } catch (innerP) {}
                            });
                        }
                    }
                } catch (priceErr) { dbg('Pricing enrichment error', priceErr); }
                entry.hydratedAt = Date.now();
                const afterSnapshot = JSON.stringify({
                    shipName: entry.shipName,
                    shipCode: entry.shipCode,
                    itineraryDescription: entry.itineraryDescription,
                    destinationName: entry.destinationName,
                    destinationCode: entry.destinationCode,
                    departurePortName: entry.departurePortName,
                    departurePortCode: entry.departurePortCode,
                    totalNights: entry.totalNights,
                    days: entry.days,
                    type: entry.type,
                    portSequence: entry.portSequence,
                    cruiseId: entry.cruiseId,
                    productViewLink: entry.productViewLink,
                    bookingLink: entry.bookingLink,
                    startDate: entry.startDate,
                    endDate: entry.endDate,
                    taxesAndFees: entry.taxesAndFees,
                    taxesAndFeesIncluded: entry.taxesAndFeesIncluded,
                    stateroomPricing: entry.stateroomPricing
                });
                if (beforeSnapshot !== afterSnapshot) entry.updatedAt = entry.hydratedAt;
                if (entry.keyType === 'SHIPDATE') this._indexShipDate(entry.shipCode, entry.sailDate, key);
            } catch (e) { dbg('_enrichEntryFromSailing error', e); }
        },
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
                    const codeMap = { I:'Interior', IN:'Interior', INT:'Interior', INSIDE:'Interior', INTERIOR:'Interior', O:'Ocean View', OV:'Ocean View', OB:'Ocean View', E:'Ocean View', OCEAN:'Ocean View', OCEANVIEW:'Ocean View', OUTSIDE:'Ocean View', B:'Balcony', BAL:'Balcony', BK:'Balcony', BALCONY:'Balcony', D:'Suite', DLX:'Suite', DELUXE:'Suite', JS:'Suite', SU:'Suite', SUITE:'Suite' };
                    const baseCategoryMap = { I:'INTERIOR', IN:'INTERIOR', INT:'INTERIOR', INSIDE:'INTERIOR', INTERIOR:'INTERIOR', O:'OUTSIDE', OV:'OUTSIDE', OB:'OUTSIDE', E:'OUTSIDE', OCEAN:'OUTSIDE', OCEANVIEW:'OUTSIDE', OUTSIDE:'OUTSIDE', B:'BALCONY', BAL:'BALCONY', BK:'BALCONY', BALCONY:'BALCONY', D:'DELUXE', DLX:'DELUXE', DELUXE:'DELUXE', JS:'DELUXE', SU:'DELUXE', SUITE:'DELUXE' };
                    function resolveDisplay(raw){ raw=(raw||'').trim(); return codeMap[raw.toUpperCase()]||raw; }
                    function resolveCategory(raw){ raw=(raw||'').trim(); const up=raw.toUpperCase(); if (baseCategoryMap[up]) return baseCategoryMap[up]; if (['INTERIOR','OUTSIDE','BALCONY','DELUXE'].includes(up)) return up; return null; }
                    const sortOrder = {INTERIOR:0, OUTSIDE:1, BALCONY:2, DELUXE:3};

                    const taxesNumber = (typeof data.taxesAndFees === 'number') ? Number(data.taxesAndFees) * 2 : 0;
                    const priceEntries = priceKeys.map(k => { const pr = data.stateroomPricing[k] || {}; return { key:k, code:(pr.code||k||'').toString().trim(), priceNum:(typeof pr.price==='number')?Number(pr.price)*2:null, currency: pr.currency||'' }; });

                    // Offer category detection (same logic as before)
                    let offerCategoryRaw = '';
                    try { if (sourceEl && sourceEl instanceof Element) offerCategoryRaw = String(sourceEl.dataset && sourceEl.dataset.offerCategory ? sourceEl.dataset.offerCategory : '').trim(); } catch(e){}
                    if (!offerCategoryRaw) {
                        try { const row = sourceEl && sourceEl.closest ? sourceEl.closest('tr') : null; if (row) { const tds = Array.from(row.querySelectorAll('td')); for (let td of tds) { const txt=(td.textContent||'').trim(); if (!txt) continue; if (resolveCategory(txt) !== null) { offerCategoryRaw = txt; break; } } } } catch(e){}
                    }

                    // Detect 1 Guest offer
                    let isOneGuestOffer = false;
                    try { if (sourceEl && sourceEl instanceof Element) { const row = sourceEl.closest ? sourceEl.closest('tr') : null; if (row) { for (let td of Array.from(row.querySelectorAll('td'))) { const txt=(td.textContent||'').trim(); if (/^1\s+Guest\b/i.test(txt)) { isOneGuestOffer = true; break; } } } } } catch(e){}

                    function findOfferPriceEntry(rawCat){ if(!rawCat) return null; const target=rawCat.toString().trim().toUpperCase(); let exact = priceEntries.find(pe => (pe.code||'').toString().trim().toUpperCase()===target); if(exact) return exact; exact = priceEntries.find(pe => (resolveDisplay(pe.code||'')||'').toUpperCase()===target); if(exact) return exact; const bucketCat = resolveCategory(rawCat); if(!bucketCat) return null; const bucket = priceEntries.filter(pe => resolveCategory(pe.code)===bucketCat && pe.priceNum!=null); if(!bucket.length) return null; bucket.sort((a,b)=>a.priceNum-b.priceNum); return bucket[0]; }
                    const offerPriceEntry = findOfferPriceEntry(offerCategoryRaw);
                    const currencyFallback = Object.values(data.stateroomPricing)[0]?.currency || '';
                    const effectiveOfferPriceNum = (offerPriceEntry && typeof offerPriceEntry.priceNum === 'number') ? Number(offerPriceEntry.priceNum) : null;

                    // Single-guest offer value computation (with assumed $200 discount)
                    const SINGLE_GUEST_DISCOUNT_ASSUMED = 200;
                    let singleGuestOfferValue = null; // offerValue = personFare - discount
                    if (isOneGuestOffer && offerPriceEntry && typeof offerPriceEntry.priceNum === 'number') {
                        const baseOfferPriceNum = Number(offerPriceEntry.priceNum); // B_offer
                        const T = Number(taxesNumber); // dual-occupancy taxes total
                        // Derivation:
                        // B_cat = 1.4 * P_cat - discount1 + T
                        // offerValue_cat = P_cat - discount1
                        // From B_cat: P_cat = (B_cat + discount1 - T)/1.4
                        // Thus offerValue_cat = (B_cat + discount1 - T)/1.4 - discount1
                        const numerator = baseOfferPriceNum + SINGLE_GUEST_DISCOUNT_ASSUMED - T;
                        const ov = numerator / 1.4 - SINGLE_GUEST_DISCOUNT_ASSUMED;
                        if (isFinite(ov) && ov > 0) singleGuestOfferValue = ov;
                    }

                    // Dual-guest (regular) offer value: difference between base category price and You Pay (which is taxesNumber for that category in dual occupancy logic)
                    let dualGuestOfferValue = null;
                    if (!isOneGuestOffer && offerPriceEntry && typeof offerPriceEntry.priceNum === 'number' && isFinite(taxesNumber)) {
                        const diff = Number(offerPriceEntry.priceNum) - Number(taxesNumber);
                        dualGuestOfferValue = isFinite(diff) && diff > 0 ? diff : 0;
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
                    priceKeys.sort((a,b)=>{ const aRaw=data.stateroomPricing[a]?.code||a; const bRaw=data.stateroomPricing[b]?.code||b; const aCat=resolveCategory(aRaw); const bCat=resolveCategory(bRaw); const aRank=aCat!=null&&aCat in sortOrder?sortOrder[aCat]:100; const bRank=bCat!=null&&bCat in sortOrder?sortOrder[bCat]:100; if (aRank!==bRank) return aRank-bRank; return resolveDisplay(aRaw).toUpperCase().localeCompare(resolveDisplay(bRaw).toUpperCase()); });
                    const pTable = document.createElement('table'); pTable.className='gobo-itinerary-table';
                    const thead = document.createElement('thead'); const thr=document.createElement('tr'); ['Class','Price','You Pay (ESTIMATED)','Currency'].forEach((h,i)=>{ const th=document.createElement('th'); th.textContent=h; if(i===1||i===2) th.style.textAlign='right'; thr.appendChild(th); }); thead.appendChild(thr); pTable.appendChild(thead);
                    const tbody = document.createElement('tbody');

                    priceKeys.forEach(k=>{
                        const pr=data.stateroomPricing[k];
                        const tr=document.createElement('tr');
                        const rawCode=pr.code||k||'';
                        const label=resolveDisplay(rawCode);
                        const hasPrice=typeof pr.price==='number';
                        const priceVal=hasPrice?(Number(pr.price)*2).toFixed(2):'Sold Out';
                        const currency=hasPrice?(pr.currency||''):(currencyFallback||'');
                        try { const resolvedThis=resolveCategory(rawCode)||resolveDisplay(rawCode||''); const resolvedTarget=resolveCategory(offerCategoryRaw)||(offerCategoryRaw||'').toUpperCase(); if (resolvedTarget && (String(resolvedThis).toUpperCase()===String(resolvedTarget).toUpperCase() || resolveDisplay(rawCode).toUpperCase()===(offerCategoryRaw||'').toUpperCase())) tr.classList.add('gobo-itinerary-current-category'); } catch(e){}
                        let youPayDisplay='';
                        if(!hasPrice) { youPayDisplay='Sold Out'; } else {
                            const currentPriceNum=Number(pr.price)*2; let estimatedNum=0;
                            if(isOneGuestOffer && singleGuestOfferValue!=null){
                                // Reverted single-guest estimation: use base category derived offerValue and subtract from each category base price.
                                // estimated single guest price for category = max(taxesNumber, currentPriceNum - singleGuestOfferValue)
                                let calc = currentPriceNum - singleGuestOfferValue;
                                if(!isFinite(calc) || calc < Number(taxesNumber)) calc = Number(taxesNumber);
                                estimatedNum = calc;
                            }
                            else if(effectiveOfferPriceNum!=null){ const currentMatchesOffer=(offerPriceEntry && ((offerPriceEntry.key===k)||((offerPriceEntry.code||'').toString().trim().toUpperCase()===(rawCode||'').toString().trim().toUpperCase()) || (resolveCategory(offerPriceEntry.code)&&resolveCategory(offerPriceEntry.code)===resolveCategory(rawCode)))); if(currentMatchesOffer){ estimatedNum=taxesNumber; } else { let diff=currentPriceNum - effectiveOfferPriceNum; if(isNaN(diff)||diff<0) diff=0; estimatedNum=diff + taxesNumber; } }
                            else { estimatedNum=taxesNumber; }
                            youPayDisplay = typeof estimatedNum==='number'?estimatedNum.toFixed(2):String(estimatedNum);
                        }
                        const vals=[label,priceVal,youPayDisplay,currency];
                        vals.forEach((val,i)=>{ const td=document.createElement('td'); td.textContent=val; if((i===1&&hasPrice)||(i===2&&val!=='Sold Out')) td.style.textAlign='right'; td.title=rawCode; if(i===1&&!hasPrice) td.className='gobo-itinerary-soldout'; if(i===2&&val==='Sold Out') td.className='gobo-itinerary-soldout'; tr.appendChild(td); });
                        tbody.appendChild(tr);
                    });
                    pTable.appendChild(tbody); panel.appendChild(pTable);
                }
                if (data.taxesAndFees != null) {
                    const tf = document.createElement('div'); tf.className='gobo-itinerary-taxes'; const taxesAmount = typeof data.taxesAndFees==='number'?(Number(data.taxesAndFees)*2):data.taxesAndFees; const taxesText = typeof taxesAmount==='number'?taxesAmount.toFixed(2):taxesAmount; tf.textContent = `Taxes & Fees: ${taxesText} ${Object.values(data.stateroomPricing)[0]?.currency||''} (${data.taxesAndFeesIncluded?'Included':'Additional'}) - Prices are cheapest rate in category for two guests in a double-occupancy room.`; panel.appendChild(tf);
                }
                if (Array.isArray(data.days) && data.days.length) {
                    const dayTitle = document.createElement('h3'); dayTitle.className='gobo-itinerary-section-title'; dayTitle.textContent='Day-by-Day'; panel.appendChild(dayTitle);
                    const dTable = document.createElement('table'); dTable.className='gobo-itinerary-table';
                    const dh = document.createElement('thead'); const dhr=document.createElement('tr'); ['Day','Day of Week','Date','Type','Port','Arrival','Departure'].forEach(h=>{ const th=document.createElement('th'); th.textContent=h; dhr.appendChild(th); }); dh.appendChild(dhr); dTable.appendChild(dh);
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
                            if (ports.length){ const p=ports[0]; activity=(p.port&&p.port.name)||''; arrival=p.arrivalTime||''; departure=p.departureTime||''; }
                            const dayLabel = (day&&day.number!=null)?String(day.number):'';
                            [dayLabel,dow,dateFmt,day.type||'',activity,arrival,departure].forEach(val=>{ const td=document.createElement('td'); td.textContent=val||''; tr.appendChild(td); });
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
    try { window.ItineraryCache = ItineraryCache; dbg('ItineraryCache exposed'); } catch (e) {}
})();
