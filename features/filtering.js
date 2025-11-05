const Filtering = {
    // Debug flag (toggle below to enable/disable debug logging by editing this file)
    DEBUG: true,
    _dbg(){ if (Filtering.DEBUG && typeof console !== 'undefined') { try { console.debug('[Filtering]', ...arguments); } catch(e){} } },
    filterOffers(state, offers) {
        console.time('Filtering.filterOffers');
        console.debug('[Filtering] filterOffers ENTRY', { offersLen: Array.isArray(offers) ? offers.length : 0, advancedEnabled: !!(state && state.advancedSearch && state.advancedSearch.enabled) });
        // Reset per-run stats for numeric predicates
        Filtering._lessThanStats = { total:0, incomplete:0, invalidTarget:0, missingActual:0, passed:0, failed:0, samples:[] };
        // Hidden groups (GLOBAL)
        const hiddenGroups = Filtering.loadHiddenGroups();
        let working = offers;
        if (Array.isArray(hiddenGroups) && hiddenGroups.length > 0) {
            const labelToKey = {};
            if (Array.isArray(state.headers)) {
                state.headers.forEach(h => { if (h.label && h.key) labelToKey[h.label.toLowerCase()] = h.key; });
            }
            working = working.filter(({ offer, sailing }) => {
                for (const path of hiddenGroups) {
                    const [label, value] = path.split(':').map(s => s.trim());
                    if (!label || !value) continue;
                    const key = labelToKey[label.toLowerCase()];
                    if (!key) continue;
                    const offerColumnValue = this.getOfferColumnValue(offer, sailing, key);
                    if (offerColumnValue && offerColumnValue.toString().toUpperCase() === value.toUpperCase()) return false;
                }
                return true;
            });
        }
        // Advanced Search layer
        try {
            if (state && state.advancedSearch && state.advancedSearch.enabled) {
                // If there is a numeric suiteUpgradePrice predicate active, ensure itinerary pricing is hydrated
                try {
                    const hasSuitePred = Array.isArray(state.advancedSearch.predicates) && state.advancedSearch.predicates.some(p => p && p.fieldKey === 'suiteUpgradePrice');
                    if (hasSuitePred) {
                        Filtering._dbg && Filtering._dbg('suiteUpgradePrice predicate detected', { predicates: state.advancedSearch.predicates });
                        try { console.debug('[Filtering] suiteUpgradePrice predicate present; ensure pricing should already be hydrated (no rehydrate)'); } catch(e){}
                    }
                    // Do NOT attempt to rehydrate here: the ItineraryCache should already be populated by upstream logic.
                    // Emit a compact diagnostic so we can examine whether pricing should be present.
                    if (hasSuitePred) {
                        try {
                            const icAll = (typeof ItineraryCache !== 'undefined' && ItineraryCache && typeof ItineraryCache.all === 'function') ? ItineraryCache.all() : null;
                            const icCount = icAll && typeof icAll === 'object' ? Object.keys(icAll).length : null;
                            Filtering._dbg && Filtering._dbg('suiteUpgradePrice: skipping hydration; ItineraryCache presence', { hasItineraryCache: !!icAll, itineraryCacheSize: icCount });
                        } catch(e) { /* ignore */ }
                    }
                } catch(e) { /* ignore hydration orchestration errors */ }
                working = Filtering.applyAdvancedSearch(working, state);
                // No re-run override; trust current cached pricing and let predicates evaluate normally
            }
        } catch(e) { console.warn('[Filtering][AdvancedSearch] applyAdvancedSearch failed', e); }
        console.timeEnd('Filtering.filterOffers');
        if (Filtering.DEBUG && Filtering._lessThanStats && Filtering._lessThanStats.total) {
            try {
                const s = Filtering._lessThanStats;
                Filtering._dbg('lessThan:summary', {
                    total:s.total,
                    incomplete:s.incomplete,
                    invalidTarget:s.invalidTarget,
                    missingActual:s.missingActual,
                    passed:s.passed,
                    failed:s.failed,
                    sampleCount:s.samples.length,
                    samples:s.samples
                });
            } catch(e){ /* ignore */ }
        }
        return working;
    },
    applyAdvancedSearch(offers, state) {
        // Only apply when panel enabled
        if (!state || !state.advancedSearch || !state.advancedSearch.enabled) return offers;
        const basePreds = (state.advancedSearch && Array.isArray(state.advancedSearch.predicates)) ? state.advancedSearch.predicates : [];
        // Only include fully committed predicates (no preview inclusion)
        const committed = basePreds.filter(p=>p && p.complete && p.fieldKey && p.operator && Array.isArray(p.values) && p.values.length);
        const preds = committed;
        if (!preds.length) return offers; // nothing to do
        const labelToKey = {};
        try { (state.headers||[]).forEach(h=>{ if (h && h.label && h.key) labelToKey[h.label.toLowerCase()] = h.key; }); } catch(e){}
        return offers.filter(wrapper => Filtering.matchesAdvancedPredicates(wrapper, preds, labelToKey, state));
    },
    matchesAdvancedPredicates(wrapper, predicates, labelToKey, state) {
        try {
            return predicates.every(pred => {
                try {
                    const key = pred.fieldKey || labelToKey[pred.fieldKey?.toLowerCase()] || pred.fieldKey;
                    const rawVal = Filtering.getOfferColumnValue(wrapper.offer, wrapper.sailing, key);
                    return Filtering.evaluatePredicate(pred, rawVal, wrapper.offer, wrapper.sailing);
                } catch(e){ return false; }
            });
        } catch(e) { return true; }
    },
    evaluatePredicate(predicate, fieldValue, offer, sailing) {
        try {
            let op = (predicate.operator||'').toLowerCase();
            if (op === 'starts with') op = 'contains';
            if (op === 'less than') {
                // Initialize stats object if not present
                if (!Filtering._lessThanStats) Filtering._lessThanStats = { total:0, incomplete:0, invalidTarget:0, missingActual:0, passed:0, failed:0, samples:[] };
                const stats = Filtering._lessThanStats;
                stats.total++;
                const targetRaw = Array.isArray(predicate.values) && predicate.values.length ? predicate.values[0] : null;
                if (targetRaw == null || targetRaw === '') {
                    stats.incomplete++;
                    if (stats.samples.length < 15) stats.samples.push({reason:'incomplete', fieldValue});
                    // Avoid per-row debug spam; sample captured above
                    return true;
                }
                const targetNum = Number(targetRaw);
                if (!isFinite(targetNum)) {
                    stats.invalidTarget++;
                    if (stats.samples.length < 15) stats.samples.push({reason:'invalidTarget', targetRaw, fieldValue});
                    // Avoid per-row debug spam; sample captured above
                    return true;
                }
                const actualNum = Number(fieldValue);
                if (!isFinite(actualNum)) {
                    // Per product logic: suiteUpgradePrice should only be empty for sold-out rooms.
                    // For 'less than' comparisons we should exclude rows without a numeric value.
                    stats.missingActual++;
                    if (stats.samples.length < 15) stats.samples.push({reason:'missingActual', targetNum, rawFieldValue: fieldValue});
                    // Avoid a console.debug for every missing actual; only log a lightweight marker every 250 missing occurrences
                    Filtering._missingActualLogCounter = (Filtering._missingActualLogCounter || 0) + 1;
                    if (Filtering._missingActualLogCounter <= 5 || Filtering._missingActualLogCounter % 250 === 0) {
                        Filtering._dbg('lessThan:missingActual sample', { predicateId: predicate.id, fieldKey: predicate.fieldKey, rawFieldValue: fieldValue, targetNum, occurrence: Filtering._missingActualLogCounter });
                    }
                    return false;
                }
                const result = actualNum < targetNum;
                if (result) stats.passed++; else stats.failed++;
                if (stats.samples.length < 15) stats.samples.push({reason:'evaluated', actualNum, targetNum, passed:result});
                // small-volume per-row logging suppressed to avoid flooding; rely on aggregated summary
                return result;
            }
            // Visits field requires set membership evaluation against individual ports
            if (predicate.fieldKey === 'visits') {
                const selected = Array.isArray(predicate.values) ? predicate.values.map(v=>Filtering.normalizePredicateValue(v, 'visits')) : [];
                if (!op || !selected.length) return true; // incomplete passes
                let ports = [];
                try {
                    if (typeof AdvancedItinerarySearch !== 'undefined' && AdvancedItinerarySearch && typeof AdvancedItinerarySearch.getPortsForSailing === 'function') {
                        ports = AdvancedItinerarySearch.getPortsForSailing(sailing);
                    }
                } catch(e){ ports = []; }
                const normPorts = ports.map(p=>Filtering.normalizePredicateValue(p,'visits'));
                const portSet = new Set(normPorts);
                if (op === 'in') return selected.some(v => portSet.has(v)); // any selected port present
                if (op === 'not in') return selected.every(v => !portSet.has(v)); // none of selected ports present
                const joined = normPorts.join('|');
                if (op === 'contains') return selected.some(v => joined.includes(v)); // substring across concatenated list
                if (op === 'not contains') return selected.every(v => !joined.includes(v));
                return true;
            }
            if (op === 'date range') {
                // Expect predicate.values = [startISO, endISO] inclusive; ISO = YYYY-MM-DD
                if (!Array.isArray(predicate.values) || predicate.values.length !== 2) return true; // incomplete treated as pass
                const [startIso, endIso] = predicate.values;
                if (!startIso || !endIso) return true;
                const toEpoch = (iso) => {
                    if (!iso) return NaN; // iso expected yyyy-mm-dd
                    const parts = iso.split('-');
                    if (parts.length !== 3) return NaN;
                    const y = parseInt(parts[0],10), m=parseInt(parts[1],10)-1, d=parseInt(parts[2],10);
                    return Date.UTC(y,m,d);
                };
                const startEp = toEpoch(startIso), endEp = toEpoch(endIso);
                if (isNaN(startEp) || isNaN(endEp)) return true;
                // Determine actual field raw ISO date from offer/sailing when possible
                let rawIso = null;
                try {
                    switch (predicate.fieldKey) {
                        case 'offerDate': rawIso = offer?.campaignOffer?.startDate || null; break;
                        case 'expiration': rawIso = offer?.campaignOffer?.reserveByDate || null; break;
                        case 'sailDate': rawIso = sailing?.sailDate || null; break;
                        default: rawIso = null; break;
                    }
                } catch(e) { rawIso = null; }
                if (!rawIso) {
                    // Fallback: attempt parse of formatted MM/DD/YY string (fieldValue)
                    try {
                        const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(fieldValue || '');
                        if (m) {
                            const mm = parseInt(m[1],10), dd=parseInt(m[2],10), yy=parseInt(m[3],10);
                            const fullYear = 2000 + yy; // assume 20xx
                            rawIso = `${fullYear.toString().padStart(4,'0')}-${mm.toString().padStart(2,'0')}-${dd.toString().padStart(2,'0')}`;
                        }
                    } catch(e){ /* ignore */ }
                }
                if (!rawIso) return true; // treat unknown as pass
                // Normalize rawIso to first 10 chars (YYYY-MM-DD)
                rawIso = rawIso.split('T')[0];
                const valEp = toEpoch(rawIso);
                const inRange = !isNaN(valEp) && valEp >= startEp && valEp <= endEp;
                // Debug logging (only when AdvancedSearch debug or advdbg query param active)
                try {
                    const dbg = (typeof AdvancedSearch !== 'undefined' && AdvancedSearch._debug) || (typeof window !== 'undefined' && window.location && /[?&]advdbg=1/.test(window.location.search));
                    if (dbg) {
                        console.debug('[Filtering][DateRangeEval]', {
                            fieldKey: predicate.fieldKey,
                            startIso, endIso,
                            rawIso,
                            fieldValue,
                            startEp, endEp, valEp,
                            inRange
                        });
                    }
                } catch(logErr){ /* ignore logging errors */ }
                return inRange;
            }
            const values = Array.isArray(predicate.values) ? predicate.values.map(v=>Filtering.normalizePredicateValue(v, predicate.fieldKey)) : [];
            const fv = Filtering.normalizePredicateValue(fieldValue == null ? '' : (''+fieldValue), predicate.fieldKey);
            if (!op || !values.length) return true;
            if (op === 'in') return values.includes(fv);
            if (op === 'not in') return !values.includes(fv);
            if (op === 'contains') return values.some(v => fv.includes(v));
            if (op === 'not contains') return values.every(v => !fv.includes(v));
            return true;
        } catch(e) { return true; }
    },
    normalizePredicateValue(raw, fieldKey) {
        try { return (''+raw).trim().toUpperCase(); } catch(e){ return ''; }
    },
    getOfferColumnValue(offer, sailing, key) {
        let guestsText = sailing.isGOBO ? '1 Guest' : '2 Guests';
        if (sailing.isDOLLARSOFF && sailing.DOLLARSOFF_AMT > 0) guestsText += ` + $${sailing.DOLLARSOFF_AMT} off`;
        if (sailing.isFREEPLAY && sailing.FREEPLAY_AMT > 0) guestsText += ` + $${sailing.FREEPLAY_AMT} freeplay`;
        let room = sailing.roomType;
        if (sailing.isGTY) room = room ? room + ' GTY' : 'GTY';
        const itinerary = sailing.itineraryDescription || sailing.sailingType?.name || '-';
        const {nights, destination} = App.Utils.parseItinerary(itinerary);
        const perksStr = Utils.computePerks(offer, sailing);
        switch (key) {
            case 'offerCode':
                return offer.campaignOffer?.offerCode;
            case 'offerDate':
                return App.Utils.formatDate(offer.campaignOffer?.startDate);
            case 'expiration':
                return App.Utils.formatDate(offer.campaignOffer?.reserveByDate);
            case 'offerName':
                return offer.campaignOffer?.name || '-';
            case 'shipClass':
                return Utils.getShipClass(sailing.shipName);
            case 'ship':
                return sailing?.shipName || '-';
            case 'sailDate':
                return App.Utils.formatDate(sailing.sailDate);
            case 'departurePort':
                return sailing.departurePort?.name || '-';
            case 'nights':
                return nights;
            case 'destination':
                return destination;
            case 'category':
                return room || '-';
            case 'guests':
                return guestsText;
            case 'perks':
                return perksStr;
            case 'tradeInValue':
                return App.Utils.formatTradeValue(offer.campaignOffer?.tradeInValue);
            // Advanced-only virtual fields (not in table headers)
            case 'departureDayOfWeek': {
                try {
                    if (App && App.FilterUtils && typeof App.FilterUtils.computeDepartureDayOfWeek === 'function') {
                        return App.FilterUtils.computeDepartureDayOfWeek(sailing.sailDate);
                    }
                    // Fallback (should rarely be hit if utils_filter.js loaded)
                    const d = new Date(sailing.sailDate);
                    if (!sailing.sailDate || isNaN(d.getTime())) return '-';
                    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                    return days[d.getUTCDay()] || '-';
                } catch(e){ return '-'; }
            }
            case 'visits': {
                try {
                    const ports = AdvancedItinerarySearch.getPortsForSailing(sailing);
                    return ports && ports.length ? ports.join(', ') : '-';
                } catch(e){ return '-'; }
            }
            case 'suiteUpgradePrice': {
                try {
                    const val = App.PricingUtils.computeSuiteUpgradePrice(offer, sailing);
                    // Debugging: surface unexpected nulls so we can trace why pricing is not computed
                    try {
                        const meta = { offerCode: offer?.campaignOffer?.offerCode || null, ship: sailing?.shipName || null, sailDate: sailing?.sailDate || null };
                        // Cap unconditional console.debug to avoid flooding: first 25 nulls and first 25 computed values are logged.
                        if (val == null) {
                            Filtering._suiteNullLogCount = (Filtering._suiteNullLogCount || 0) + 1;
                            if (Filtering._suiteNullLogCount <= 25) {
                                try { console.debug('[Filtering][suiteUpgradePrice] compute returned null (sample)', meta); } catch(e){}
                            }
                            // Always capture a lightweight debug when global debug is enabled
                            try { Filtering._dbg && Filtering._dbg('[Filtering][suiteUpgradePrice] compute returned null (dbg)', meta); } catch(e){}
                        } else {
                            Filtering._suiteComputedLogCount = (Filtering._suiteComputedLogCount || 0) + 1;
                            if (Filtering._suiteComputedLogCount <= 25) {
                                try { console.debug('[Filtering][suiteUpgradePrice] computed (sample)', Object.assign({}, meta, { value: Number(val).toFixed ? Number(val).toFixed(2) : val })); } catch(e){}
                            }
                            try { Filtering._dbg && Filtering._dbg('[Filtering][suiteUpgradePrice] computed (dbg)', Object.assign({}, meta, { value: Number(val).toFixed ? Number(val).toFixed(2) : val })); } catch(e){}
                        }
                    } catch(e) { /* ignore logging errors */ }
                    if (val == null) return '-';
                    return Number(val.toFixed(2));
                } catch(e){ return '-'; }
            }
            default:
                return offer[key];
        }
    },
    // Load hidden groups (GLOBAL now). Performs one-time migration from per-profile keys.
    loadHiddenGroups() {
        const GLOBAL_KEY = 'goboHiddenGroups-global';
        try {
            const existing = (typeof goboStorageGet === 'function' ? goboStorageGet(GLOBAL_KEY) : localStorage.getItem(GLOBAL_KEY));
            if (existing) {
                try { return JSON.parse(existing) || []; } catch(e){ return []; }
            }
            const aggregated = new Set();
            const collectFromValue = (raw) => {
                if (!raw) return;
                try {
                    const arr = JSON.parse(raw);
                    if (Array.isArray(arr)) arr.forEach(v => aggregated.add(v));
                } catch(e) { /* ignore */ }
            };
            // Enumerate legacy keys from GoboStore if available
            if (typeof GoboStore !== 'undefined' && GoboStore && typeof GoboStore.listKeys === 'function') {
                try {
                    GoboStore.listKeys('goboHiddenGroups-').forEach(k => {
                        if (k !== GLOBAL_KEY) collectFromValue(goboStorageGet(k));
                    });
                } catch(e) { /* ignore */ }
            }
            // Also enumerate window.localStorage for any leftovers
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('goboHiddenGroups-') && k !== GLOBAL_KEY) {
                    collectFromValue(localStorage.getItem(k));
                }
            }
            const merged = Array.from(aggregated);
            try {
                if (typeof goboStorageSet === 'function') goboStorageSet(GLOBAL_KEY, JSON.stringify(merged)); else localStorage.setItem(GLOBAL_KEY, JSON.stringify(merged));
            } catch(e) { /* ignore */ }
            return merged;
        } catch (e) {
            return [];
        }
    },
    // Add a hidden group (GLOBAL)
    addHiddenGroup(state, group) {
        const GLOBAL_KEY = 'goboHiddenGroups-global';
        const groups = Filtering.loadHiddenGroups();
        if (!groups.includes(group)) {
            groups.push(group);
            try {
                if (typeof goboStorageSet === 'function') goboStorageSet(GLOBAL_KEY, JSON.stringify(groups)); else localStorage.setItem(GLOBAL_KEY, JSON.stringify(groups));
            } catch (e) { /* ignore */ }
        }
        this.updateHiddenGroupsList(null, document.getElementById('hidden-groups-display'), state);
        return groups;
    },
    // Delete a hidden group (GLOBAL)
    deleteHiddenGroup(state, group) {
        const GLOBAL_KEY = 'goboHiddenGroups-global';
        let groups = Filtering.loadHiddenGroups();
        groups = groups.filter(g => g !== group);
        try {
            if (typeof goboStorageSet === 'function') goboStorageSet(GLOBAL_KEY, JSON.stringify(groups)); else localStorage.setItem(GLOBAL_KEY, JSON.stringify(groups));
        } catch (e) { /* ignore */ }
        this.updateHiddenGroupsList(null, document.getElementById('hidden-groups-display'), state);
        setTimeout(() => { Spinner.hideSpinner(); }, 3000);
        return groups;
    },
    // Update the hidden groups display element (GLOBAL)
    updateHiddenGroupsList(_ignoredProfileKey, displayElement, state) {
        console.debug('[Filtering] updateHiddenGroupsList ENTRY (GLOBAL)', { displayElement, state });
        if (!displayElement) {
            console.warn('updateHiddenGroupsList: displayElement is null (GLOBAL)');
            return;
        }
        displayElement.innerHTML = '';
        displayElement.className = 'hidden-groups-display';
        const hiddenGroups = Filtering.loadHiddenGroups();
        console.debug('[Filtering] updateHiddenGroupsList loaded hiddenGroups (GLOBAL):', hiddenGroups);
        if (Array.isArray(hiddenGroups) && hiddenGroups.length > 0) {
            // Sort hidden groups alphabetically, case-insensitive
            const sortedGroups = hiddenGroups.slice().sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
            const container = document.createElement('div');
            container.className = 'hidden-groups-display';
            sortedGroups.forEach(path => {
                const row = document.createElement('div');
                row.className = 'hidden-group-row';

                const label = document.createElement('span');
                label.className = 'hidden-group-label';
                label.textContent = path;

                const removeBtn = document.createElement('span');
                removeBtn.className = 'hidden-group-remove';
                removeBtn.textContent = '✖';
                removeBtn.title = 'Remove hidden group';
                removeBtn.style.cursor = 'pointer';
                removeBtn.addEventListener('click', () => {
                    console.debug('[Filtering] Hidden Group removeBtn clicked (GLOBAL)', { path });
                    // Ensure spinner is shown immediately so the user sees feedback.
                    // Previously we only queued Spinner.showSpinner() which could be starved
                    // by subsequent synchronous work; show it synchronously and defer
                    // the heavier work to the next tick so the browser has a chance to paint.
                    try { Spinner.showSpinner(); } catch(e) { try { Spinner.showSpinner(); } catch(_){} }

                    // Defer the actual removal/storage/update work so spinner can render first.
                    setTimeout(() => {
                        let groups = Filtering.loadHiddenGroups();
                        groups = groups.filter(g => g !== path);
                        try {
                            const GLOBAL_KEY = 'goboHiddenGroups-global';
                            if (typeof goboStorageSet === 'function') goboStorageSet(GLOBAL_KEY, JSON.stringify(groups)); else localStorage.setItem(GLOBAL_KEY, JSON.stringify(groups));
                            console.debug('[Filtering] Hidden Group removed from storage (GLOBAL)', { path, groups });
                        } catch (e) {
                            console.warn('[Filtering] Error removing Hidden Group from storage (GLOBAL)', e);
                        }

                        Filtering.updateHiddenGroupsList(null, document.getElementById('hidden-groups-display'), state);
                        console.debug('[Filtering] updateHiddenGroupsList called after removal (GLOBAL)', { groups });
                        if (typeof App !== 'undefined' && App.TableRenderer && typeof App.TableRenderer.updateView === 'function') {
                            console.debug('[Filtering] Calling App.TableRenderer.updateView after hidden group removal (GLOBAL)');
                            App.TableRenderer.updateView(state);
                        }

                        setTimeout(() => {
                            Spinner.hideSpinner();
                            console.debug('[Filtering] Spinner hidden after Hidden Group removal (GLOBAL)');
                            setTimeout(() => {
                                console.debug('[Filtering] Post-spinner (GLOBAL): 500ms after spinner hidden');
                                const table = document.querySelector('table');
                                const rowCount = table ? table.rows.length : 0;
                                const visibleElements = Array.from(document.body.querySelectorAll('*')).filter(el => el.offsetParent !== null).length;
                                console.debug('[Filtering] Post-spinner: Table row count:', rowCount);
                                console.debug('[Filtering] Post-spinner: Visible DOM elements:', visibleElements);
                                if (window.performance && window.performance.memory) {
                                    console.debug('[Filtering] Post-spinner: JS Heap Size:', window.performance.memory.usedJSHeapSize, '/', window.performance.memory.totalJSHeapSize);
                                }
                                if (typeof App !== 'undefined' && App.TableRenderer && App.TableRenderer.lastState) {
                                    console.debug('[Filtering] Post-spinner: TableRenderer.lastState:', App.TableRenderer.lastState);
                                }
                            }, 500);
                        }, 3000);
                    }, 0);
                });

                row.appendChild(label);
                row.appendChild(removeBtn);
                container.appendChild(row);
            });
            displayElement.appendChild(container);
            console.debug('[Filtering] updateHiddenGroupsList DOM updated with hidden groups (GLOBAL)');
        } else {
            console.debug('[Filtering] updateHiddenGroupsList: No hidden groups to display (GLOBAL)');
        }
        console.debug('[Filtering] updateHiddenGroupsList EXIT (GLOBAL)');
    },
    // Debug helper: prints first `limit` offers (or uses state.originalOffers) with pricing diagnostics
    printSuitePricingDiagnostics(state, offers, limit = 40) {
        try {
            const source = Array.isArray(offers) ? offers : (state && (state.originalOffers || state.fullOriginalOffers || state.sortedOffers) ? (state.originalOffers || state.fullOriginalOffers || state.sortedOffers) : []);
            const list = (source || []).slice(0, limit).map((w, idx) => {
                try {
                    const offer = w && w.offer;
                    const sailing = w && w.sailing;
                    const shipCode = sailing && sailing.shipCode ? (''+sailing.shipCode).trim() : '';
                    const sailDate = sailing && sailing.sailDate ? (''+sailing.sailDate).slice(0,10) : '';
                    const key = `SD_${shipCode}_${sailDate}`;
                    const entry = (typeof ItineraryCache !== 'undefined' && ItineraryCache && typeof ItineraryCache.get === 'function') ? ItineraryCache.get(key) : null;
                    const entryExists = !!entry && entry.stateroomPricing && Object.keys(entry.stateroomPricing || {}).length > 0;
                    let computed = null;
                    try { computed = App && App.PricingUtils ? App.PricingUtils.computeSuiteUpgradePrice(offer, sailing) : null; } catch(e) { computed = `ERR:${e && e.message}`; }
                    return {
                        idx, offerCode: offer?.campaignOffer?.offerCode || null,
                        shipCode, shipName: sailing?.shipName || null, sailDate,
                        itineraryKey: key, itineraryPresent: entryExists,
                        computedSuiteUpgrade: computed
                    };
                } catch(e){ return { idx, err:true, e }; }
            });
            try { console.table(list); } catch(e){ console.debug('[Filtering.printSuitePricingDiagnostics] table', list); }
            return list;
        } catch(e) { console.warn('[Filtering.printSuitePricingDiagnostics] failed', e); return null; }
    },
};
