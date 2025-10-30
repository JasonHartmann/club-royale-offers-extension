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
                                    // pricing-related fields added
                                    taxesAndFees: null,
                                    taxesAndFeesIncluded: null,
                                    stateroomPricing: {}, // map of stateroom class id -> { price, currency, code }
                                    bookingLink: '',
                                    startDate: '',
                                    endDate: '',
                                    updatedAt: now
                                };
                                newEntries++;
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
                                // --- Pricing enrichment start ---
                                try {
                                    if (s && typeof s === 'object') {
                                        // booking / dates
                                        if (s.bookingLink && !entry.bookingLink) entry.bookingLink = s.bookingLink;
                                        if (s.startDate) entry.startDate = s.startDate;
                                        if (s.endDate) entry.endDate = s.endDate;
                                        // taxes and fees
                                        if (s.taxesAndFees && typeof s.taxesAndFees.value === 'number') entry.taxesAndFees = s.taxesAndFees.value;
                                        if (typeof s.taxesAndFeesIncluded === 'boolean') entry.taxesAndFeesIncluded = s.taxesAndFeesIncluded;
                                        // stateroom pricing
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
        _persist() {
            try { goboStorageSet(STORAGE_KEY, JSON.stringify(this._cache)); dbg('Cache persisted', { entries: Object.keys(this._cache).length }); } catch(e) { dbg('Persist error', e); }
        },
        get(key) { this._ensureLoaded(); return this._cache[key]; },
        all() { this._ensureLoaded(); return { ...this._cache }; },
        showModal(key, sourceEl) {
            try {
                this._ensureLoaded();
                const data = this._cache[key];

                // Remove existing
                const existing = document.getElementById('gobo-itinerary-modal');
                if (existing) existing.remove();
                // Remove any previous highlight left behind
                try { document.querySelectorAll('.gobo-itinerary-highlight').forEach(el=>el.classList.remove('gobo-itinerary-highlight')); } catch(e){}

                // Determine row to highlight (prefer provided source element)
                let rowToHighlight = null;
                try {
                    if (sourceEl && sourceEl instanceof Element) {
                        rowToHighlight = sourceEl.closest ? sourceEl.closest('tr') || sourceEl : sourceEl;
                    }
                    if (!rowToHighlight) {
                        const cell = document.getElementById(key);
                        if (cell) rowToHighlight = cell.closest ? cell.closest('tr') : null;
                    }
                } catch(e) { rowToHighlight = null; }

                // Inject highlight style if not present
                try {
                    if (!document.getElementById('gobo-itinerary-highlight-style')) {
                        const style = document.createElement('style');
                        style.id = 'gobo-itinerary-highlight-style';
                        style.textContent = `
                            .gobo-itinerary-highlight { 
                                animation: gobo-itin-flash 1s ease-in-out; 
                                background: rgba(255,245,170,0.9) !important; 
                                transition: background 0.3s ease-in-out, box-shadow 0.3s ease-in-out; 
                                box-shadow: 0 0 0 3px rgba(255,230,120,0.4) inset; 
                            }
                            @keyframes gobo-itin-flash { 0% { background: rgba(255,245,170,0.0); } 30% { background: rgba(255,245,170,0.95); } 100% { background: rgba(255,245,170,0.9); } }
                        `;
                        document.head.appendChild(style);
                    }
                } catch(e) { /* ignore style injection errors */ }

                // Apply highlight and scroll into view
                // Keep highlight until user explicitly clicks a different itinerary row.
                // We still remove any previous highlight at the start of showModal so
                // clicking another row will clear the previous one.
                const applyHighlight = () => {
                    try {
                        if (rowToHighlight && rowToHighlight.classList) {
                            rowToHighlight.classList.add('gobo-itinerary-highlight');
                            try { rowToHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(e){}
                        }
                    } catch(e){}
                };
                // No auto-cleanup here. The highlight persists until a new row is clicked
                // (which triggers showModal and clears previous highlights at the top).
                if (rowToHighlight) applyHighlight();

                if (!data) {
                    dbg('showModal: no data for key', key);
                    try { if (typeof App !== 'undefined' && App.ErrorHandler && typeof App.ErrorHandler.showError === 'function') { App.ErrorHandler.showError('Itinerary details are not available for this sailing. (Ghost offer!)\nThis offer cannot be redeemed online. You will need to call to book this offer.'); } } catch(e) { /* ignore toast error */ }
                    return;
                }

                // Backdrop
                const backdrop = document.createElement('div');
                backdrop.id = 'gobo-itinerary-modal';
                backdrop.className = 'gobo-itinerary-backdrop';
                // Do not remove the highlight when the modal is closed — leave it until user clicks another row.
                backdrop.addEventListener('click', (e)=> { if (e.target === backdrop) { backdrop.remove(); } });
                // Panel
                const panel = document.createElement('div');
                panel.className = 'gobo-itinerary-panel';
                // Close button
                const closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.className = 'gobo-itinerary-close';
                closeBtn.textContent = '\u00d7';
                closeBtn.setAttribute('aria-label','Close');
                // Closing the modal should not clear the highlight — highlight stays until another row is clicked.
                closeBtn.addEventListener('click', ()=> { backdrop.remove(); });
                panel.appendChild(closeBtn);
                // Title
                const title = document.createElement('h2');
                title.className = 'gobo-itinerary-title';
                title.textContent = `${data.itineraryDescription || 'Itinerary'} (${data.totalNights || '?'} nights)`;
                panel.appendChild(title);
                // Subtitle
                const subtitle = document.createElement('div');
                subtitle.className = 'gobo-itinerary-subtitle';
                subtitle.textContent = `${data.shipName || ''} • ${data.departurePortName || ''} • ${data.sailDate || ''}`;
                panel.appendChild(subtitle);
                // Booking link
                if (data.bookingLink) {
                    const linkWrap = document.createElement('div');
                    const a = document.createElement('a');
                    const host = (function(){ try { if (App && App.Utils && typeof App.Utils.detectBrand === 'function') return App.Utils.detectBrand() === 'C' ? 'www.celebritycruises.com' : 'www.royalcaribbean.com'; } catch(e){} return 'www.royalcaribbean.com'; })();
                    a.href = `https://${host}${data.bookingLink}`;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.textContent = 'Open Retail Booking Page';
                    a.className = 'gobo-itinerary-link';
                    linkWrap.appendChild(a);
                    panel.appendChild(linkWrap);
                }
                // Pricing
                const priceKeys = Object.keys(data.stateroomPricing || {});
                if (priceKeys.length) {
                    const priceTitle = document.createElement('h3');
                    priceTitle.className = 'gobo-itinerary-section-title';
                    priceTitle.textContent = 'Stateroom Pricing';
                    panel.appendChild(priceTitle);
                    const pTable = document.createElement('table');
                    pTable.className = 'gobo-itinerary-table';
                    const thead = document.createElement('thead'); const thr = document.createElement('tr');
                    ['Class','Price','Currency'].forEach(h=>{ const th=document.createElement('th'); th.textContent=h; thr.appendChild(th); });
                    thead.appendChild(thr); pTable.appendChild(thead);
                    const tb = document.createElement('tbody');
                    // Mapping of short/various codes to friendly display names (what user sees)
                    const codeMap = {
                        I:'Interior', IN:'Interior', INT:'Interior', INSIDE:'Interior', INTERIOR:'Interior',
                        O:'Ocean View', OV:'Ocean View', OB:'Ocean View', E:'Ocean View', OCEAN:'Ocean View', OCEANVIEW:'Ocean View', OUTSIDE:'Ocean View',
                        B:'Balcony', BAL:'Balcony', BK:'Balcony', BALCONY:'Balcony',
                        D:'Suite', DLX:'Suite', DELUXE:'Suite', JS:'Suite', SU:'Suite', SUITE:'Suite'
                    };
                    // Canonical base category mapping used purely for sorting (do NOT change display names)
                    const baseCategoryMap = {
                        I:'INTERIOR', IN:'INTERIOR', INT:'INTERIOR', INSIDE:'INTERIOR', INTERIOR:'INTERIOR',
                        O:'OUTSIDE', OV:'OUTSIDE', OB:'OUTSIDE', E:'OUTSIDE', OCEAN:'OUTSIDE', OCEANVIEW:'OUTSIDE', OUTSIDE:'OUTSIDE',
                        B:'BALCONY', BAL:'BALCONY', BK:'BALCONY', BALCONY:'BALCONY',
                        D:'DELUXE', DLX:'DELUXE', DELUXE:'DELUXE', JS:'DELUXE', SU:'DELUXE', SUITE:'DELUXE'
                    };
                    function resolveDisplay(codeOrId){
                        const raw = (codeOrId||'').toString().trim();
                        const upper = raw.toUpperCase();
                        return codeMap[upper] || raw;
                    }
                    function resolveCategory(codeOrId){
                        const raw = (codeOrId||'').toString().trim();
                        const upper = raw.toUpperCase();
                        if (baseCategoryMap[upper]) return baseCategoryMap[upper];
                        if (['INTERIOR','OUTSIDE','BALCONY','DELUXE'].includes(upper)) return upper; // already canonical
                        return null;
                    }
                    const sortOrder = { INTERIOR:0, OUTSIDE:1, BALCONY:2, DELUXE:3 };
                    priceKeys.sort((a,b)=>{
                        const aRaw = data.stateroomPricing[a]?.code || a;
                        const bRaw = data.stateroomPricing[b]?.code || b;
                        const aCat = resolveCategory(aRaw);
                        const bCat = resolveCategory(bRaw);
                        const aRank = (aCat && aCat in sortOrder) ? sortOrder[aCat] : 100;
                        const bRank = (bCat && bCat in sortOrder) ? sortOrder[bCat] : 100;
                        if (aRank !== bRank) return aRank - bRank;
                        // Same rank (either same category or both unknown) -> compare display labels alphabetically
                        const aDisp = resolveDisplay(aRaw).toUpperCase();
                        const bDisp = resolveDisplay(bRaw).toUpperCase();
                        return aDisp.localeCompare(bDisp);
                    });
                    priceKeys.forEach(k=>{ const pr=data.stateroomPricing[k]; const tr=document.createElement('tr');
                        const rawCode = pr.code || k || '';
                        const classLabel = resolveDisplay(rawCode);
                        const hasPrice = (typeof pr.price === 'number');
                        // Prices returned are per-person for double occupancy; display should show total for two people.
                        const priceVal = hasPrice ? (Number(pr.price) * 2).toFixed(2) : 'Sold Out';
                        const currency = hasPrice ? (pr.currency || '') : '';
                        [classLabel, priceVal, currency].forEach((val,i)=>{ const td=document.createElement('td'); td.textContent=val; if(i===1 && hasPrice) td.style.textAlign='right'; td.title = rawCode; if(i===1 && !hasPrice) td.className='gobo-itinerary-soldout'; tr.appendChild(td); });
                        tb.appendChild(tr); });
                    pTable.appendChild(tb); panel.appendChild(pTable);
                    if (data.taxesAndFees != null) {
                        const tf = document.createElement('div');
                        tf.className = 'gobo-itinerary-taxes';
                        // Taxes/fees are per-person; show doubled amount for two people
                        const taxesAmount = (typeof data.taxesAndFees === 'number') ? (Number(data.taxesAndFees) * 2) : data.taxesAndFees;
                        const taxesText = (typeof taxesAmount === 'number') ? taxesAmount.toFixed(2) : taxesAmount;
                        tf.textContent = `Taxes & Fees: ${taxesText} ${Object.values(data.stateroomPricing)[0]?.currency || ''} (${data.taxesAndFeesIncluded? 'Included' : 'Additional'}) - Prices are cheapest rate in category for two guests in a double-occupancy room.`;
                        panel.appendChild(tf);
                    }
                }
                // Day-by-day
                if (Array.isArray(data.days) && data.days.length) {
                    const dayTitle = document.createElement('h3');
                    dayTitle.className = 'gobo-itinerary-section-title';
                    dayTitle.textContent = 'Day-by-Day';
                    panel.appendChild(dayTitle);
                    const dTable = document.createElement('table');
                    dTable.className = 'gobo-itinerary-table';
                    const dh = document.createElement('thead'); const dhr=document.createElement('tr');
                    // Add Day of Week and Date columns to show absolute calendar info for each sailing day
                    ['Day','Day of Week','Date','Type','Port','Arrival','Departure'].forEach(h=>{ const th=document.createElement('th'); th.textContent=h; dhr.appendChild(th); });
                    dh.appendChild(dhr); dTable.appendChild(dh);
                    const db = document.createElement('tbody');
                    data.days.forEach(day => { try { const tr=document.createElement('tr');
                        // Compute calendar date for this day if startDate or sailDate is available.
                        // Parse dates using the YYYY-MM-DD prefix (if present) and treat them as UTC dates
                        // so local timezone offsets don't change the calendar day.
                        let baseDateStr = data.startDate || data.sailDate || null;
                        let computedDate = null;
                        try {
                            if (baseDateStr) {
                                // Helper: construct a UTC date from a date string. Prefer the YYYY-MM-DD prefix
                                function utcDateFromDateString(ds) {
                                    if (!ds || typeof ds !== 'string') return null;
                                    const m = ds.match(/^(\d{4})-(\d{2})-(\d{2})/);
                                    if (m) {
                                        const y = parseInt(m[1], 10);
                                        const mo = parseInt(m[2], 10) - 1;
                                        const d = parseInt(m[3], 10);
                                        return new Date(Date.UTC(y, mo, d));
                                    }
                                    // Fallback: attempt to parse then normalize to the parsed date's Y/M/D in UTC
                                    const parsed = new Date(ds);
                                    if (isNaN(parsed.getTime())) return null;
                                    return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
                                }
                                const baseUtc = utcDateFromDateString(baseDateStr);
                                if (baseUtc) {
                                    // day.number is typically 1-based; subtract 1 to offset from start date
                                    const offset = (day && day.number && !isNaN(Number(day.number))) ? (Number(day.number) - 1) : 0;
                                    computedDate = new Date(baseUtc);
                                    // Use UTC methods to avoid timezone-shifts
                                    computedDate.setUTCDate(computedDate.getUTCDate() + offset);
                                }
                            }
                        } catch(e) { computedDate = null; }
                        // Use UTC-based weekday so local timezone won't change the calendar day
                        const dow = computedDate ? new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(computedDate) : '';
                        // Use UTC-based formatting to keep the calendar day consistent across timezones.
                        const dateFormatted = computedDate ? new Intl.DateTimeFormat(undefined, { year:'numeric', month:'short', day:'numeric', timeZone: 'UTC' }).format(computedDate) : '';
                        const ports = Array.isArray(day.ports)? day.ports : [];
                        let activity = ''; let arrival=''; let departure='';
                        if (ports.length) {
                            const p = ports[0];
                            activity = (p.port && p.port.name) || '';
                            arrival = p.arrivalTime || '';
                            departure = p.departureTime || '';
                        }
                        const dayLabel = (day && (day.number != null)) ? String(day.number) : '';
                        const cells = [dayLabel, dow, dateFormatted, day.type || '', activity, arrival, departure];
                        cells.forEach(c=>{ const td=document.createElement('td'); td.textContent=c==null? '' : c; tr.appendChild(td); });
                        db.appendChild(tr); } catch(inner){ /* ignore */ } });
                    dTable.appendChild(db); panel.appendChild(dTable);
                }
                // Offer codes
                if (Array.isArray(data.offerCodes) && data.offerCodes.length) {
                    const oc = document.createElement('div');
                    oc.className = 'gobo-itinerary-offercodes';
                    oc.textContent = 'Offer Codes: ' + data.offerCodes.join(', ');
                    panel.appendChild(oc);
                }
                // Footer
                const footer = document.createElement('div');
                footer.className = 'gobo-itinerary-footer';
                footer.textContent = 'Itinerary data last updated ' + (data.updatedAt ? new Date(data.updatedAt).toLocaleString() : '');
                panel.appendChild(footer);
                backdrop.appendChild(panel);
                document.body.appendChild(backdrop);
            } catch(e) { dbg('showModal error', e); }
        }
    };
    try { window.ItineraryCache = ItineraryCache; dbg('ItineraryCache exposed'); } catch(e) { /* ignore */ }
})();
