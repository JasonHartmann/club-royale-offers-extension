// Advanced Search feature module extracted from breadcrumbs.js
// Responsible for state management, predicate rendering, persistence, and panel scaffold.

// Safari/iOS private mode can throw on sessionStorage access; provide a guarded facade.
const __advSession = (() => {
    try {
        const testKey = '__adv_test__';
        sessionStorage.setItem(testKey, '1');
        sessionStorage.removeItem(testKey);
        return {
            getItem: (k) => { try { return sessionStorage.getItem(k); } catch(e){ return null; } },
            setItem: (k,v) => { try { sessionStorage.setItem(k,v); } catch(e){} },
            removeItem: (k) => { try { sessionStorage.removeItem(k); } catch(e){} }
        };
    } catch(e) {
        const mem = {};
        return {
            getItem: (k) => Object.prototype.hasOwnProperty.call(mem,k) ? mem[k] : null,
            setItem: (k,v) => { mem[k] = String(v); },
            removeItem: (k) => { delete mem[k]; }
        };
    }
})();

const AdvancedSearch = {
    // Debug flag (set AdvancedSearch._debug = true or window.ADV_SEARCH_DEBUG = true to enable)
    _debug: false, // default false to reduce console overhead / potential perf impact
    _logDebug(...args) {
        try {
            const enabled = AdvancedSearch && (AdvancedSearch._debug || (typeof window !== 'undefined' && window.ADV_SEARCH_DEBUG));
            if (!enabled) return;
            const ts = new Date().toISOString();
            console.debug('[AdvancedSearch][DBG][' + ts + ']', ...args);
        } catch (e) { /* ignore */ }
    },
    ensureState(state) {
        if (!state.advancedSearch || typeof state.advancedSearch !== 'object') {
            state.advancedSearch = {enabled: false, predicates: []};
        } else {
            if (!Array.isArray(state.advancedSearch.predicates)) state.advancedSearch.predicates = [];
            if (typeof state.advancedSearch.masterEnabled !== 'undefined') delete state.advancedSearch.masterEnabled; // legacy cleanup
        }
        return state.advancedSearch;
    },
    storageKey(profileKey) {
        return `advSearchPredicates::${profileKey || 'default'}`;
    },
    persistPredicates(state) {
        try {
            if (!state) return;
            if (!state.advancedSearch) return;
            const payload = {
                predicates: (state.advancedSearch.predicates || [])
                    .filter(p => p && p.fieldKey && p.operator && Array.isArray(p.values))
                    .map(p => ({
                        id: p.id,
                        fieldKey: p.fieldKey,
                        operator: p.operator,
                        values: p.values.slice(),
                        complete: !!p.complete
                    })),
                includeTaxesAndFeesInPriceFilters: state.advancedSearch.includeTaxesAndFeesInPriceFilters !== false // default true
            };
            // Use 'default' when no profile key is available so user preferences still persist
            const key = this.storageKey(state.selectedProfileKey || 'default');
            __advSession.setItem(key, JSON.stringify(payload));
            // Also persist a global unbranded flag for includeTaxes so it's truly global across brands
            try {
                // Persist under the unified SettingsStore when available
                if (typeof App !== 'undefined' && App && App.SettingsStore && typeof App.SettingsStore.setIncludeTaxesAndFeesInPriceFilters === 'function') {
                    App.SettingsStore.setIncludeTaxesAndFeesInPriceFilters(!!payload.includeTaxesAndFeesInPriceFilters);
                } else {
                    const globalFlagKey = 'advPriceIncludeTF';
                    const flagVal = payload.includeTaxesAndFeesInPriceFilters ? '1' : '0';
                    if (typeof goboStorageSet === 'function') goboStorageSet(globalFlagKey, flagVal); else localStorage.setItem(globalFlagKey, flagVal);
                }
            } catch(e) { /* ignore */ }
        } catch (e) { /* ignore persistence errors */ }
    },
    restorePredicates(state) {
        try {
            if (!state || !state.selectedProfileKey) return;
            if (!state.advancedSearch || !state.advancedSearch.enabled) return; // only when panel enabled
            state._advRestoredProfiles = state._advRestoredProfiles || new Set();
            if (state._advRestoredProfiles.has(state.selectedProfileKey)) return; // already restored
            const key = this.storageKey(state.selectedProfileKey);
            const raw = __advSession.getItem(key);
            if (!raw) {
                state._advRestoredProfiles.add(state.selectedProfileKey);
                return;
            }
            let parsed;
            try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
            if (!parsed || typeof parsed !== 'object') {
                state._advRestoredProfiles.add(state.selectedProfileKey);
                return;
            }
            // Restore includeTaxes flag (default true)
            try {
                const globalFlagKey = 'advPriceIncludeTF';
                let resolved = undefined;

                try {
                    if (typeof App !== 'undefined' && App && App.SettingsStore && typeof App.SettingsStore.getIncludeTaxesAndFeesInPriceFilters === 'function') {
                        resolved = !!App.SettingsStore.getIncludeTaxesAndFeesInPriceFilters();
                    }
                } catch (e) { /* ignore */ }

                if (typeof resolved === 'undefined') {
                    try {
                        let globalRaw = null;
                        if (typeof goboStorageGet === 'function') globalRaw = goboStorageGet(globalFlagKey);
                        else if (typeof localStorage !== 'undefined') globalRaw = localStorage.getItem(globalFlagKey);
                        if (globalRaw === '1' || globalRaw === '0') {
                            resolved = (globalRaw === '1');
                        }
                    } catch (e) { /* ignore */ }
                }

                // If still unresolved, scan legacy branded keys and migrate the first valid one we find
                if (typeof resolved === 'undefined') {
                    try {
                        const allKeys = (typeof GoboStore !== 'undefined' && GoboStore && typeof GoboStore.listKeys === 'function') ? GoboStore.listKeys() : (typeof localStorage !== 'undefined' ? Object.keys(localStorage) : []);
                        for (let i = 0; i < allKeys.length; i++) {
                            const k = allKeys[i];
                            if (!k || typeof k !== 'string') continue;
                            if (/^gobo-[A-Za-z]-advPriceIncludeTF$/.test(k) || /^gobo-advPriceIncludeTF$/.test(k)) {
                                try {
                                    const raw = (typeof goboStorageGet === 'function') ? goboStorageGet(k) : localStorage.getItem(k);
                                    if (raw === '1' || raw === '0') {
                                        resolved = (raw === '1');
                                        // migrate to unified SettingsStore or global key and remove legacy
                                        try {
                                            if (typeof App !== 'undefined' && App && App.SettingsStore && typeof App.SettingsStore.setIncludeTaxesAndFeesInPriceFilters === 'function') {
                                                App.SettingsStore.setIncludeTaxesAndFeesInPriceFilters(resolved);
                                            } else if (typeof goboStorageSet === 'function') goboStorageSet(globalFlagKey, raw); else localStorage.setItem(globalFlagKey, raw);
                                        } catch (e) { /* ignore migration write errors */ }
                                        try { if (typeof goboStorageRemove === 'function') goboStorageRemove(k); else localStorage.removeItem(k); } catch(e) {}
                                        break;
                                    }
                                } catch(e) { /* ignore single-key errors */ }
                            }
                        }
                    } catch (e) { /* ignore listing errors */ }
                }

                // Final fallback to the parsed payload (default true)
                if (typeof resolved === 'undefined') resolved = parsed.includeTaxesAndFeesInPriceFilters !== false;
                state.advancedSearch.includeTaxesAndFeesInPriceFilters = !!resolved;
            } catch (e) {
                state.advancedSearch.includeTaxesAndFeesInPriceFilters = parsed.includeTaxesAndFeesInPriceFilters !== false;
            }
            const allowedOps = new Set(['in', 'not in', 'contains', 'not contains', 'date range', 'less than', 'greater than']);
            state.advancedSearch.predicates = (Array.isArray(parsed.predicates) ? parsed.predicates
                .filter(p => p && p.fieldKey && p.operator)
                .map(p => {
                    let op = (p.operator || '').toLowerCase();
                    if (op === 'starts with') op = 'contains';
                    if (op === 'between') op = 'date range';
                    let values = Array.isArray(p.values) ? p.values.slice() : [];
                    if (op === 'date range' && values.length === 2) {
                        // Normalize ordering
                        values = values.slice().sort();
                    }
                    return {
                        id: p.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
                        fieldKey: p.fieldKey,
                        operator: op,
                        values,
                        complete: !!p.complete
                    };
                })
                .filter(p => allowedOps.has(p.operator)) : []);
            state._advRestoredProfiles.add(state.selectedProfileKey);
            setTimeout(() => {
                try {
                    this.renderPredicates(state);
                    const panel = state.advancedSearchPanel || document.getElementById('advanced-search-panel');
                    const body = panel ? panel.querySelector('.adv-search-body') : null;
                    if (panel && body) {
                        const committedCount = state.advancedSearch.predicates.filter(p => p && p.complete).length;
                        const boxCount = body.querySelectorAll('.adv-predicate-box').length;
                        if (committedCount && boxCount === 0) {
                            this.renderCommittedFallback(state, body);
                            this.ensureAddFieldDropdown(state);
                        }
                    }
                } catch (e) { /* ignore */ }
                try { TableRenderer.updateView(state); } catch (e) { /* ignore */ }
            }, 0);
        } catch (e) { /* ignore restore errors */ }
    },
    triggerVisitsHydration(state) {
        try {
            if (!state) return;
            const offersArr = state.fullOriginalOffers || state.originalOffers || [];
            if ((!offersArr || !offersArr.length) && (state._advVisitsHydrationRetries || 0) < 8) {
                state._advVisitsHydrationRetries = (state._advVisitsHydrationRetries || 0) + 1;
                setTimeout(() => { this.triggerVisitsHydration(state); }, 600 + state._advVisitsHydrationRetries * 100);
                return;
            }
            if (state._advVisitsHydrationStarted) return;
            state._advVisitsHydrationStarted = true;
            // Collect composite keys (cache across retries)
            if (!state._advHydrationKeys) {
                const keys = new Set();
                offersArr.forEach(o => {
                    try {
                        const sailings = o?.campaignOffer?.sailings || [];
                        sailings.forEach(s => {
                            const shipCode = (s?.shipCode || '').trim();
                            const sailDate = (s?.sailDate || '').trim().slice(0,10);
                            if (shipCode && sailDate) keys.add(`SD_${shipCode}_${sailDate}`);
                        });
                    } catch(e){ /* ignore */ }
                });
                state._advHydrationKeys = Array.from(keys);
            }
            try {
                if (typeof ItineraryCache !== 'undefined' && ItineraryCache && typeof ItineraryCache.hydrateIfNeeded === 'function' && state._advHydrationKeys && state._advHydrationKeys.length) {
                    ItineraryCache.hydrateIfNeeded(state._advHydrationKeys);
                }
            } catch(e){ /* ignore */ }
            setTimeout(() => {
                try {
                    const ports = (AdvancedItinerarySearch && AdvancedItinerarySearch.listAllPorts) ? AdvancedItinerarySearch.listAllPorts(state) : [];
                    if (ports && ports.length) {
                        AdvancedSearch.renderPredicates(state);
                    } else if ((state._advVisitsHydrationRetries || 0) < 8) {
                        delete state._advVisitsHydrationStarted;
                        this.triggerVisitsHydration(state);
                    }
                } catch(e){ /* ignore */ }
            }, 1200);
        } catch(e){ /* ignore */ }
    },
    getCachedFieldValues(fieldKey, state) {
        try {
            if (!fieldKey) return [];
            state._advFieldCache = state._advFieldCache || {};
            state._advFieldCacheOrder = state._advFieldCacheOrder || [];
            const pruneIfNeeded = () => {
                try {
                    const MAX_CACHE_ENTRIES = 120;
                    if (state._advFieldCacheOrder.length > MAX_CACHE_ENTRIES) {
                        const excess = state._advFieldCacheOrder.length - MAX_CACHE_ENTRIES;
                        for (let i = 0; i < excess; i++) {
                            const k = state._advFieldCacheOrder[i];
                            if (k && state._advFieldCache[k]) delete state._advFieldCache[k];
                        }
                        state._advFieldCacheOrder.splice(0, excess);
                    }
                } catch (e) { /* ignore */ }
            };
            // Hidden groups signature (exclude hidden group offers from value aggregation)
            let hiddenGroups = [];
            try { hiddenGroups = (typeof Filtering !== 'undefined' && Filtering && typeof Filtering.loadHiddenGroups === 'function') ? Filtering.loadHiddenGroups() : []; } catch(eHg){ hiddenGroups = []; }
            const hgSig = Array.isArray(hiddenGroups) && hiddenGroups.length ? hiddenGroups.slice().sort().join('|') : 'NONE';
            const filterHiddenOffers = (arr) => {
                if (!Array.isArray(hiddenGroups) || !hiddenGroups.length) return arr;
                if (!Array.isArray(arr)) return arr;
                try {
                    const labelToKey = {};
                    try { (state.headers||[]).forEach(h => { if (h && h.label && h.key) labelToKey[h.label.toLowerCase()] = h.key; }); } catch(eMap){ /* ignore */ }
                    return arr.filter(w => {
                        try {
                            const offer = w.offer; const sailing = w.sailing;
                            for (const path of hiddenGroups) {
                                if (!path || typeof path !== 'string') continue;
                                const parts = path.split(':');
                                if (parts.length < 2) continue;
                                const label = (parts[0]||'').trim(); const value = (parts.slice(1).join(':')||'').trim();
                                if (!label || !value) continue;
                                const key = labelToKey[label.toLowerCase()];
                                if (!key) continue;
                                const colVal = (Filtering && typeof Filtering.getOfferColumnValue === 'function') ? Filtering.getOfferColumnValue(offer, sailing, key) : null;
                                if (colVal != null && (''+colVal).toUpperCase() === value.toUpperCase()) return false; // exclude hidden
                            }
                        } catch(eRow){ /* ignore row error */ }
                        return true;
                    });
                } catch(eFilter){ return arr; }
            };
            if (fieldKey === 'visits') {
                // Rebuild ports list excluding offers in hidden groups so hidden group values do not contribute.
                let ports = [];
                try {
                    const baseOffers = state.fullOriginalOffers || state.originalOffers || [];
                    const visibleOffers = filterHiddenOffers(baseOffers);
                    const portMap = new Map();
                    const norm = (v) => { try { return (''+v).trim().toUpperCase(); } catch(e){ return ''; } };
                    visibleOffers.forEach(w => {
                        try {
                            const sailings = w?.campaignOffer?.sailings || (w?.sailing ? [w.sailing] : []);
                            if (!Array.isArray(sailings)) return;
                            sailings.forEach(s => {
                                try {
                                    // Names from itinerary helper (already includes regions after our modification)
                                    const list = (window.AdvancedItinerarySearch && typeof AdvancedItinerarySearch.getPortsForSailing === 'function') ? AdvancedItinerarySearch.getPortsForSailing(s) : [];
                                    if (Array.isArray(list)) {
                                        list.forEach(p => { const n = norm(p); if (n && !portMap.has(n)) portMap.set(n, (''+p).trim()); });
                                    }
                                    // Direct region injection if days present and not yet included
                                    const days = Array.isArray(s.days) ? s.days : [];
                                    days.forEach(d => {
                                        try {
                                            const pArr = Array.isArray(d.ports) ? d.ports : [];
                                            pArr.forEach(pObj => {
                                                const region = pObj?.port?.region;
                                                if (region) { const rNorm = norm(region); if (rNorm && !portMap.has(rNorm)) portMap.set(rNorm, region.trim()); }
                                            });
                                        } catch(dayErr){ /* ignore */ }
                                    });
                                } catch(ePort) { /* ignore sailing port errors */ }
                            });
                        } catch(eOffer){ /* ignore offer wrapper errors */ }
                    });
                    ports = Array.from(portMap.values()).sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));
                    // Fallback to itinerary cache aggregate (legacy behavior) if we have no ports yet (e.g., hydration pending)
                    if (!ports.length) {
                        try { ports = (window.AdvancedItinerarySearch && typeof AdvancedItinerarySearch.listAllPorts === 'function') ? AdvancedItinerarySearch.listAllPorts(state) : []; } catch(fallbackErr){ ports = []; }
                    }
                } catch(ePorts){ ports = []; }
                if (!ports || !ports.length) {
                    // Trigger hydration attempt if still empty
                    this.triggerVisitsHydration(state);
                    return [];
                }
                const cacheKey = `VISITS::${state.selectedProfileKey||'default'}::${ports.length}::${hgSig}`;
                state._advFieldCache[cacheKey] = ports.slice();
                if (!state._advFieldCacheOrder.includes(cacheKey)) state._advFieldCacheOrder.push(cacheKey);
                pruneIfNeeded();
                return ports.slice();
            }
            const committedPreds = (state.advancedSearch?.predicates || []).filter(p=>p && p.complete).length;
            // Fast path only if hidden groups unchanged
            if (committedPreds === 0 && state._advStaticFieldIndex && state._advStaticFieldIndex[fieldKey] && state._advIndexHiddenGroupsSig === hgSig) {
                return state._advStaticFieldIndex[fieldKey];
            }
            const visibleLen = Array.isArray(state.sortedOffers) ? state.sortedOffers.length : 0;
            const originalLen = Array.isArray(state.fullOriginalOffers) ? state.fullOriginalOffers.length : (Array.isArray(state.originalOffers) ? state.originalOffers.length : 0);
            let committedSig = '';
            try {
                committedSig = (state.advancedSearch?.predicates || [])
                    .filter(p => p && p.complete && p.fieldKey && p.operator && Array.isArray(p.values))
                    .map(p => `${p.fieldKey}:${p.operator}:${p.values.join(',')}`)
                    .join('|');
            } catch (e) {
                committedSig = '';
            }
            const includeTF = state.advancedSearch.includeTaxesAndFeesInPriceFilters !== false ? 'T' : 'NT';
            const cacheKey = [state.selectedProfileKey || 'default', fieldKey, originalLen, 'vis', visibleLen, committedSig, includeTF, 'HG', hgSig].join('|');
            if (state._advFieldCache[cacheKey]) return state._advFieldCache[cacheKey];
            let source;
            try {
                const useStaticIndex = !!state._advStaticFieldIndex;
                // If static index missing or currently building, avoid expensive applyAdvancedSearch and use a fast fallback
                if (!useStaticIndex || state._advIndexBuilding) {
                    source = Array.isArray(state.sortedOffers) && state.sortedOffers.length ? state.sortedOffers : (Array.isArray(state.originalOffers) && state.originalOffers.length ? state.originalOffers : (state.fullOriginalOffers || []));
                    // schedule background index build to improve subsequent interactions
                    try {
                        const schedule = () => { try { if (!state._advIndexBuilding) this.buildStaticFieldIndex(state); } catch(e){} };
                        if (typeof requestIdleCallback === 'function') requestIdleCallback(schedule, {timeout: 800}); else setTimeout(schedule, 200);
                    } catch(eSched) { /* ignore */ }
                } else {
                    const committedOnly = {...state, _advPreviewPredicateId: null};
                    const base = state.fullOriginalOffers || state.originalOffers || [];
                    // Apply advanced search committed predicates first, then hidden group filter
                    source = Filtering.applyAdvancedSearch(base, committedOnly);
                }
            } catch (e) { /* fallback below */ }
            if (!source || !Array.isArray(source) || !source.length) {
                source = Array.isArray(state.sortedOffers) && state.sortedOffers.length ? state.sortedOffers : (Array.isArray(state.originalOffers) && state.originalOffers.length ? state.originalOffers : (state.fullOriginalOffers || []));
            }
            // Exclude hidden group offers before computing unique values
            source = filterHiddenOffers(source);
            const set = new Set();
            const normSet = new Set();
            for (let i = 0; i < source.length; i++) {
                const w = source[i];
                try {
                    const raw = (Filtering.getOfferColumnValueForFiltering ? Filtering.getOfferColumnValueForFiltering(w.offer, w.sailing, fieldKey, state) : Filtering.getOfferColumnValue(w.offer, w.sailing, fieldKey));
                    if (raw == null) continue;
                    const norm = Filtering.normalizePredicateValue(raw, fieldKey);
                    if (!norm || normSet.has(norm)) continue;
                    normSet.add(norm);
                    set.add(raw);
                } catch (e) { /* ignore */ }
            }
            let arr;
            if (fieldKey === 'departureDayOfWeek') {
                const weekOrder = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                const present = new Set(Array.from(set));
                arr = weekOrder.filter(d => present.has(d));
                const extras = Array.from(present).filter(v => !weekOrder.includes(v));
                if (extras.length) arr = arr.concat(extras.sort());
            } else {
                arr = Array.from(set).sort();
            }
            state._advFieldCache[cacheKey] = arr;
            if (!state._advFieldCacheOrder.includes(cacheKey)) state._advFieldCacheOrder.push(cacheKey);
            pruneIfNeeded();
            return arr;
        } catch (e) {
            return [];
        }
    },
    enterEditMode(pred, state) {
        try {
            if (!pred || !state?.advancedSearch?.enabled) return;
            if (!pred.complete) return; // already in edit mode
            // Transition to incomplete to show operator/value editors
            pred.complete = false;
            // Schedule preview highlight
            this.schedulePreview(state, pred, true);
            // Focus predicate box after render
            state._advFocusPredicateId = pred.id;
            // Re-render UI
            this.renderPredicates(state);
            // Remove predicate from active filtering immediately (light refresh without spinner)
            try { this.lightRefresh(state, { showSpinner: false }); } catch(e){ /* ignore */ }
            // Update badge and persist new state
            this.updateBadge(state);
            this.debouncedPersist(state);
        } catch(e){ /* ignore */ }
    },
    _removePredicate(pred, state) {
        try {
            if (!pred || !state?.advancedSearch?.predicates) return;
            const idx = state.advancedSearch.predicates.findIndex(p => p.id === pred.id);
            if (idx === -1) return;
            state.advancedSearch.predicates.splice(idx, 1);
            if (state._advPreviewPredicateId === pred.id) {
                state._advPreviewPredicateId = null;
                if (state._advPreviewTimer) { clearTimeout(state._advPreviewTimer); delete state._advPreviewTimer; }
            }
            const nextIncomplete = state.advancedSearch.predicates.find(p => !p.complete);
            if (nextIncomplete) this.schedulePreview(state, nextIncomplete);
            try { this.lightRefresh(state, { showSpinner: true }); } catch (e) {}
            try { this.renderPredicates(state); } catch (e) {}
            if (state.advancedSearch.enabled && state.advancedSearch.predicates.length === 0) {
                setTimeout(() => { try { const sel = state.advancedSearchPanel?.querySelector('select.adv-add-field-select'); if (sel) sel.focus(); } catch (err) {} }, 0);
            }
            this.debouncedPersist(state);
        } catch (e) { /* ignore removal errors */ }
    },
    renderPredicateValueChips(box, pred, state) {
        const chipsWrap = document.createElement('div');
        chipsWrap.className = 'adv-value-chips'; // styling handled in CSS
        // Special handling for date range committed predicate: display a single summarized chip
        if (pred.operator === 'date range' && pred.values && pred.values.length === 2) {
            const [startIso, endIso] = pred.values;
            const fmt = (iso) => {
                if (!iso) return '?';
                const parts = iso.split('-');
                if (parts.length !== 3) return iso;
                return parts[1] + '/' + parts[2] + '/' + parts[0].slice(-2);
            };
            const chip = document.createElement('span');
            chip.className = 'adv-chip adv-chip-daterange';
            chip.textContent = fmt(startIso) + ' → ' + fmt(endIso);
            if (pred.complete) {
                chip.title = 'Click to edit this date range';
                chip.addEventListener('click', (e) => {
                    if (e.target && e.target.classList && e.target.classList.contains('adv-chip-remove')) return;
                    e.stopPropagation();
                    this.enterEditMode(pred, state);
                });
            }
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = '\u2715';
            remove.className = 'adv-chip-remove';
            remove.addEventListener('click', (e) => {
                e.stopPropagation();
                // Remove entire predicate when date range chip (only chip) is removed
                return this._removePredicate(pred, state);
            });
            chip.appendChild(remove);
            chipsWrap.appendChild(chip);
            box.appendChild(chipsWrap);
            return chipsWrap;
        }
        pred.values.forEach(val => {
            const chip = document.createElement('span');
            chip.className = 'adv-chip';
            chip.textContent = val;
            // If predicate is committed (complete), clicking the chip (not the remove button) should enter edit mode.
            if (pred.complete) {
                chip.title = 'Click to edit this filter';
                chip.addEventListener('click', (e) => {
                    if (e.target && e.target.classList && e.target.classList.contains('adv-chip-remove')) return;
                    e.stopPropagation();
                    this.enterEditMode(pred, state);
                });
            }
            // removed inline chip style
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = '\u2715';
            remove.className = 'adv-chip-remove'; // CSS targets .adv-chip button already; semantic alias
            // removed inline remove button styles
            remove.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = pred.values.indexOf(val);
                if (idx !== -1) pred.values.splice(idx, 1);
                pred.values = pred.values.slice();
                const isLast = pred.values.length === 0;
                if (isLast) { // remove entire predicate instead of leaving empty
                    return this._removePredicate(pred, state);
                }
                if (pred.complete) {
                    this.lightRefresh(state, { showSpinner: true });
                } else {
                    // Inline update for IN/NOT IN to avoid re-render scroll jump
                    if (pred.operator === 'in' || pred.operator === 'not in') {
                        try {
                            const parentBox = box.closest('.adv-predicate-box');
                            if (parentBox) {
                                // Remove this chip
                                const chipEl = e.target.closest('.adv-chip'); if (chipEl) chipEl.remove();
                                // Update commit button state
                                const commitBtn = parentBox.querySelector('button.adv-commit-btn');
                                if (commitBtn) commitBtn.disabled = !(pred.values && pred.values.length);
                                // If no values left create placeholder and remove chips container
                                if (!pred.values.length) {
                                    const chipsWrap = parentBox.querySelector('.adv-value-chips'); if (chipsWrap) chipsWrap.remove();
                                    const existingPlaceholder = parentBox.querySelector('.adv-placeholder');
                                    if (!existingPlaceholder) {
                                        const ph = document.createElement('span'); ph.textContent='No values selected'; ph.className='adv-placeholder';
                                        if (commitBtn) parentBox.insertBefore(ph, commitBtn); else parentBox.appendChild(ph);
                                    }
                                }
                            }
                        } catch(errInline){ /* ignore */ }
                    }
                    this.schedulePreview(state, pred, true);
                }
                if (pred.complete || !(pred.operator === 'in' || pred.operator === 'not in')) {
                    AdvancedSearch.renderPredicates(state);
                }
                AdvancedSearch.debouncedPersist(state);
            });
            chip.appendChild(remove);
            chipsWrap.appendChild(chip);
        });
        box.appendChild(chipsWrap);
        return chipsWrap;
    },
    attemptCommitPredicate(pred, state) {
        if (!pred || pred.complete) return;
        if (!pred.values || !pred.values.length) return;
        if (pred.operator === 'date range') {
            // Ensure exactly two values and sorted ascending
            if (pred.values.length === 2) {
                pred.values = pred.values.slice().sort();
                try { AdvancedSearch._logDebug('DateRange commit', { values: pred.values }); } catch(e){}
            } else {
                // Incomplete date range should not commit
                return;
            }
        }
        pred.complete = true;
        if (state._advPreviewPredicateId === pred.id) {
            state._advPreviewPredicateId = null;
            if (state._advPreviewTimer) {
                clearTimeout(state._advPreviewTimer);
                delete state._advPreviewTimer;
            }
        }
        try {
            this.renderPredicates(state);
        } catch (e) {
        }
        this.lightRefresh(state, { showSpinner: true });
        this.debouncedPersist(state);
    },
    schedulePreview(state, pred, fromChip) {
        // Preview should not apply filtering; only set highlight state
        try {
            if (!state.advancedSearch || !state.advancedSearch.enabled) return;
            if (!pred || pred.complete) return;
            // If predicate incomplete, mark as previewed for UI highlight only
            if (!(pred.values && pred.values.length && pred.operator && pred.fieldKey)) {
                state._advPreviewPredicateId = null;
                return;
            }
            state._advPreviewPredicateId = pred.id;
            // No lightRefresh call here (table unchanged until commit)
            // Optional: clear highlight after short delay if user stops interacting
            if (state._advPreviewTimer) { clearTimeout(state._advPreviewTimer); }
            state._advPreviewTimer = setTimeout(() => {
                if (state._advPreviewPredicateId === pred.id && !pred.complete) {
                    // keep highlight; do nothing
                }
            }, fromChip ? 200 : 400);
        } catch (e) { /* ignore */ }
    },
    renderPredicates(state) {
        try {
            // Guard against concurrent or recursive rendering
            if (state._advRendering) return;
            state._advRendering = true;
            this._logDebug('renderPredicates:start', {
                enabled: !!(state.advancedSearch && state.advancedSearch.enabled),
                predicatesLen: state.advancedSearch && state.advancedSearch.predicates ? state.advancedSearch.predicates.length : 0,
                previewId: state._advPreviewPredicateId,
                hasPanel: !!(state.advancedSearchPanel || document.getElementById('advanced-search-panel'))
            });
            this.ensureState(state);
            let panel = state.advancedSearchPanel || document.getElementById('advanced-search-panel');
            if (!panel) { state._advRendering = false; return; }
            let body = panel.querySelector('.adv-search-body');
            if (!body) {
                body = document.createElement('div');
                body.className = 'adv-search-body';
                panel.appendChild(body);
            }
            body.innerHTML = '';
            const {predicates} = state.advancedSearch;
            const headerFields = (state.headers || []).filter(h => h && h.key && h.label);
            let advOnly;
            try { advOnly = (App.FilterUtils && typeof App.FilterUtils.getAdvancedOnlyFields === 'function') ? App.FilterUtils.getAdvancedOnlyFields() : []; } catch (e) { advOnly = []; }
            if (!Array.isArray(advOnly)) advOnly = [];
            const headerKeysSet = new Set(headerFields.map(h => h.key));
            const advFiltered = advOnly.filter(f => f && f.key && f.label && !headerKeysSet.has(f.key));
            const allFields = headerFields.concat(advFiltered);
            const dateFieldKeys = new Set(['offerDate','expiration','sailDate','endDate']);
            const baseOperators = ['in', 'not in', 'contains', 'not contains'];
            const allowedOperators = baseOperators.slice();
            // Numeric pricing fields that support 'less than'
            const numericFieldKeys = new Set(['minInteriorPrice','minOutsidePrice','minBalconyPrice','minSuitePrice','nights','offerValue']);
            const headersReady = headerFields.length > 2;
            if (!headersReady) {
                this._logDebug('renderPredicates:headersNotReady', { headerCount: headerFields.length });
            }
            if (headersReady) {
                for (let i = predicates.length - 1; i >= 0; i--) {
                    if (!allFields.some(h => h.key === predicates[i].fieldKey)) predicates.splice(i, 1);
                }
            } else if (predicates.length) {
                body.setAttribute('data-deferred-prune', 'true');
            }
            // Update badge early (no dropdown recovery here to avoid recursion)
            try { this.updateBadge(state); } catch(eUpd) { /* ignore */ }
            let renderedAny = false;
            predicates.forEach(pred => {
                try {
                    const fieldMeta = allFields.find(h => h.key === pred.fieldKey);
                    const isDateField = dateFieldKeys.has(pred.fieldKey);
                    const isNumericField = numericFieldKeys.has(pred.fieldKey);
                    const opsForField = isDateField ? allowedOperators.concat(['date range']) : (isNumericField ? baseOperators.concat(['less than','greater than']) : baseOperators);
                    const box = document.createElement('div');
                    box.className = 'adv-predicate-box';
                    if (state._advPreviewPredicateId === pred.id) box.classList.add('adv-predicate-preview');
                    box.setAttribute('data-predicate-id', pred.id);
                    box.tabIndex = -1;
                    // Box click enters edit mode if predicate is complete (excluding clicks on interactive controls)
                    if (pred.complete) {
                        box.title = 'Click to edit filter';
                        box.addEventListener('click', (e) => {
                            const t = e.target;
                            if (!t) return;
                            if (t.closest('button.adv-delete-btn') || t.closest('button.adv-chip-remove')) return; // ignore delete/remove
                            e.stopPropagation();
                            this.enterEditMode(pred, state);
                        });
                    }
                    const label = document.createElement('span');
                    label.className = 'adv-predicate-field-label';
                    label.textContent = fieldMeta ? fieldMeta.label : pred.fieldKey;
                    box.appendChild(label);
                    if (!pred.complete && !pred.operator) {
                        const opSelect = document.createElement('select');
                        opSelect.className = 'adv-operator-select';
                        opSelect.setAttribute('data-pred-id', pred.id);
                        const optPlaceholder = document.createElement('option');
                        optPlaceholder.value = '';
                        optPlaceholder.textContent = 'Select…';
                        opSelect.appendChild(optPlaceholder);
                        opsForField.forEach(op => {
                            const o = document.createElement('option');
                            o.value = op; o.textContent = op; opSelect.appendChild(o);
                        });
                        opSelect.addEventListener('change', () => {
                            const raw = (opSelect.value || '').toLowerCase();
                            if (opsForField.includes(raw)) {
                                pred.operator = raw;
                                // reset range temp values if switching
                                if (raw !== 'date range') { delete pred._rangeStart; delete pred._rangeEnd; }
                                state._advFocusPredicateId = pred.id;
                                this.renderPredicates(state);
                            }
                        });
                        box.appendChild(opSelect);
                    } else if (!pred.complete && pred.operator) {
                        if (pred.operator === 'date range') {
                            this._renderDateRangeEditor(box, pred, state);
                        } else if (pred.operator === 'in' || pred.operator === 'not in') {
                            const selectWrap = document.createElement('div'); selectWrap.className = 'adv-stack-col';
                            const sel = document.createElement('select'); sel.multiple = true; sel.size = 6; sel.className = 'adv-values-multiselect';
                            const values = this.getCachedFieldValues(pred.fieldKey, state) || [];
                            if (pred.fieldKey === 'visits' && (!values || !values.length)) {
                                // Increment poll attempts
                                state._advVisitsPollAttempts = (state._advVisitsPollAttempts || 0) + 1;
                                sel.disabled = true;
                                sel.title = 'Loading itinerary ports…';
                                const optLoading = document.createElement('option'); optLoading.value=''; optLoading.textContent='Loading ports…'; sel.appendChild(optLoading);
                                selectWrap.appendChild(sel);
                                const help = document.createElement('div'); help.className='adv-help-text';
                                if (state._advVisitsPollAttempts <= 5) {
                                    help.textContent='Hydrating itinerary data to load port destinations.';
                                } else {
                                    help.textContent='Ports not available yet. Click Refresh Ports to retry hydration.';
                                    const retryBtn = document.createElement('button'); retryBtn.type='button'; retryBtn.textContent='Refresh Ports'; retryBtn.className='adv-refresh-ports-btn';
                                    retryBtn.addEventListener('click', () => {
                                        try {
                                            state._advVisitsPollAttempts = 0; // reset
                                            delete state._advVisitsHydrationStarted; // allow re-trigger
                                            this.triggerVisitsHydration(state);
                                            setTimeout(() => { try { this.renderPredicates(state); } catch(e){} }, 800);
                                        } catch(e){ /* ignore */ }
                                    });
                                    selectWrap.appendChild(retryBtn);
                                }
                                selectWrap.appendChild(help);
                                box.appendChild(selectWrap);
                                // Schedule a refresh attempt if under retry cap
                                if (state._advVisitsPollAttempts <= 5) {
                                    setTimeout(() => { try { this.renderPredicates(state); } catch(e){} }, 1200);
                                }
                            } else {
                                const alreadySelected = new Set(pred.values.map(v => Filtering.normalizePredicateValue(v, pred.fieldKey)));
                                const CHUNK_SYNC_THRESHOLD = 250, CHUNK_SIZE = 300;
                                if (values.length <= CHUNK_SYNC_THRESHOLD) {
                                    values.forEach(v => { const opt = document.createElement('option'); opt.value = v; opt.textContent = v; opt.selected = alreadySelected.has(Filtering.normalizePredicateValue(v,pred.fieldKey)); sel.appendChild(opt); });
                                } else {
                                    sel.classList.add('loading'); let idx = 0;
                                    const addChunk = () => {
                                        if (!sel.isConnected) return; const start = performance.now(); const frag = document.createDocumentFragment(); let added = 0;
                                        while (idx < values.length && added < CHUNK_SIZE) { const v = values[idx++]; const opt = document.createElement('option'); opt.value = v; opt.textContent = v; opt.selected = alreadySelected.has(Filtering.normalizePredicateValue(v,pred.fieldKey)); frag.appendChild(opt); added++; if (performance.now() - start > 12) break; }
                                        sel.appendChild(frag);
                                        if (idx < values.length) { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(addChunk); else setTimeout(addChunk, 0); } else { sel.classList.remove('loading'); }
                                    }; (typeof requestAnimationFrame === 'function') ? requestAnimationFrame(addChunk) : setTimeout(addChunk,0);
                                }
                                sel.addEventListener('change', () => {
                                    // Inline update without full render to prevent scroll jump
                                    const chosen = Array.from(sel.selectedOptions).map(o => Filtering.normalizePredicateValue(o.value, pred.fieldKey));
                                    pred.values = Array.from(new Set(chosen));
                                    this.schedulePreview(state, pred);
                                    // Update commit button enabled state
                                    let commitBtn = null;
                                    try { commitBtn = box.querySelector('button.adv-commit-btn'); if (commitBtn) commitBtn.disabled = !(pred.values && pred.values.length); } catch(e){ /* ignore */ }
                                    // Update chips inline keeping original order (chips before commit button)
                                    try {
                                        const existingChips = box.querySelector('.adv-value-chips');
                                        if (existingChips) existingChips.remove();
                                        const existingPlaceholder = box.querySelector('.adv-placeholder');
                                        if (pred.values && pred.values.length) {
                                            if (existingPlaceholder) existingPlaceholder.remove();
                                            const chipsWrap = document.createElement('div'); chipsWrap.className='adv-value-chips';
                                            pred.values.forEach(val => {
                                                const chip = document.createElement('span'); chip.className='adv-chip'; chip.textContent = val;
                                                // remove button
                                                const removeBtn = document.createElement('button'); removeBtn.type='button'; removeBtn.textContent='\u2715'; removeBtn.className='adv-chip-remove';
                                                removeBtn.addEventListener('click', (e) => {
                                                    e.stopPropagation();
                                                    const idx = pred.values.indexOf(val);
                                                    if (idx !== -1) pred.values.splice(idx,1);
                                                    pred.values = pred.values.slice();
                                                    // update preview
                                                    this.schedulePreview(state, pred, true);
                                                    // Inline update post removal
                                                    try {
                                                        chip.remove();
                                                        if (!pred.values.length) {
                                                            if (commitBtn) commitBtn.disabled = true;
                                                            const ph = document.createElement('span'); ph.textContent='No values selected'; ph.className='adv-placeholder'; box.insertBefore(ph, commitBtn || null);
                                                            chipsWrap.remove();
                                                        } else if (commitBtn) {
                                                            commitBtn.disabled = false;
                                                        }
                                                    } catch(errInline){ /* ignore */ }
                                                    // Persist without full re-render
                                                    this.debouncedPersist(state);
                                                });
                                                chip.appendChild(removeBtn);
                                                chipsWrap.appendChild(chip);
                                            });
                                            // Insert chips before commit button if present, else append at end
                                            if (commitBtn && commitBtn.parentElement === box) {
                                                box.insertBefore(chipsWrap, commitBtn);
                                            } else {
                                                box.appendChild(chipsWrap);
                                            }
                                        } else if (!existingPlaceholder) {
                                            const placeholder = document.createElement('span');
                                            placeholder.textContent = 'No values selected';
                                            placeholder.className = 'adv-placeholder';
                                            box.insertBefore(placeholder, commitBtn || null);
                                        }
                                    } catch(e){ /* ignore chip update errors */ }
                                });
                                selectWrap.appendChild(sel);
                                const help = document.createElement('div'); help.className = 'adv-help-text';
                                if (pred.fieldKey === 'visits') {
                                    help.textContent = 'Select one or more ports visited by the sailing.';
                                } else {
                                    try { const isMac = /Mac/i.test(navigator.platform || ''); const modKey = isMac ? 'Cmd' : 'Ctrl'; help.textContent = `Select one or more exact values. Use ${modKey}+Click to select or deselect multiple.`; } catch(e){ help.textContent = 'Select one or more exact values. Use Ctrl+Click to select or deselect multiple.'; }
                                }
                                selectWrap.appendChild(help); box.appendChild(selectWrap);
                            }
                        } else if (pred.operator === 'contains' || pred.operator === 'not contains') {
                            const tokenWrap = document.createElement('div'); tokenWrap.className = 'adv-stack-col';
                            const input = document.createElement('input'); input.type = 'text'; input.placeholder = 'Enter substring & press Enter';
                            const addToken = (raw) => { const norm = Filtering.normalizePredicateValue(raw, pred.fieldKey); if (!norm) return; if (!pred.values.includes(norm)) pred.values.push(norm); input.value=''; this.schedulePreview(state, pred); this.renderPredicates(state); };
                            input.addEventListener('keydown', (e) => { if (e.key==='Enter') { if (input.value.trim()) { e.preventDefault(); addToken(input.value); } else if (pred.values && pred.values.length) { e.preventDefault(); this.attemptCommitPredicate(pred,state); } } else if (e.key===',') { e.preventDefault(); addToken(input.value); } else if (e.key==='Escape') { e.preventDefault(); input.value=''; } else if (e.key==='Tab') { if (!input.value.trim() && pred.values && pred.values.length) this.attemptCommitPredicate(pred,state); } else { this.schedulePreview(state,pred); } });
                            input.addEventListener('input', () => this.schedulePreview(state,pred));
                            tokenWrap.appendChild(input);
                            const help = document.createElement('div'); help.className='adv-help-text'; help.textContent = (pred.operator==='contains'?'Add substrings; any match passes.':'Add substrings; none must appear.'); tokenWrap.appendChild(help);
                            box.appendChild(tokenWrap); setTimeout(()=>{ try{ input.focus(); }catch(e){} },0);
                        } else if ((pred.operator === 'less than' || pred.operator === 'greater than') && isNumericField) {
                            const numWrap = document.createElement('div'); numWrap.className='adv-stack-col';
                            const input = document.createElement('input'); input.type='number'; input.min='0'; input.step='0.01'; input.placeholder='Enter amount';
                            if (pred.values && pred.values.length) input.value = pred.values[0];
                            input.addEventListener('input', () => {
                                pred.values = input.value ? [input.value] : [];
                                this.schedulePreview(state, pred);
                                const commitBtn = box.querySelector('button.adv-commit-btn'); if (commitBtn) commitBtn.disabled = !(pred.values && pred.values.length);
                            });
                            input.addEventListener('keydown', (e)=>{ if (e.key==='Enter' && pred.values && pred.values.length) { e.preventDefault(); this.attemptCommitPredicate(pred,state); } });
                            numWrap.appendChild(input);
                            const help = document.createElement('div'); help.className='adv-help-text';
                            let helpMsg;
                            if (pred.operator === 'less than') helpMsg = 'Filters rows with value below this amount.'; else helpMsg = 'Filters rows with value above this amount.';
                            switch (pred.fieldKey) {
                                case 'minInteriorPrice': helpMsg = (pred.operator==='less than' ? 'Interior You Pay below this amount.' : 'Interior You Pay above this amount.'); break;
                                case 'minOutsidePrice': helpMsg = (pred.operator==='less than' ? 'Ocean View You Pay below this amount.' : 'Ocean View You Pay above this amount.'); break;
                                case 'minBalconyPrice': helpMsg = (pred.operator==='less than' ? 'Balcony You Pay below this amount.' : 'Balcony You Pay above this amount.'); break;
                                case 'minSuitePrice': helpMsg = (pred.operator==='less than' ? 'Suite You Pay below this amount.' : 'Suite You Pay above this amount.'); break;
                                case 'nights': helpMsg = (pred.operator==='less than' ? 'Sailing nights below this number.' : 'Sailing nights above this number.'); break;
                            }
                            help.textContent = helpMsg;
                            numWrap.appendChild(help);
                            box.appendChild(numWrap);
                        }
                        if (pred.operator !== 'date range') {
                            if (pred.values && pred.values.length) this.renderPredicateValueChips(box, pred, state); else { const placeholder = document.createElement('span'); placeholder.textContent='No values selected'; placeholder.className='adv-placeholder'; box.appendChild(placeholder); }
                        }
                        const commitBtn = document.createElement('button'); commitBtn.type='button'; commitBtn.textContent='\u2713'; commitBtn.title='Commit filter';
                        if (pred.operator === 'date range') {
                            commitBtn.disabled = !(pred.values && pred.values.length === 2);
                        } else {
                            commitBtn.disabled = !(pred.values && pred.values.length);
                        }
                        commitBtn.className='adv-commit-btn'; commitBtn.addEventListener('click', () => this.attemptCommitPredicate(pred,state)); box.appendChild(commitBtn);
                    } else if (pred.complete) {
                        const summary = document.createElement('span'); summary.textContent = pred.operator; summary.className='adv-summary'; box.appendChild(summary); this.renderPredicateValueChips(box,pred,state);
                    }
                    const del = document.createElement('button'); del.type='button'; del.textContent='\u2716'; del.setAttribute('aria-label','Delete filter'); del.className='adv-delete-btn'; del.addEventListener('click', (e) => { e.stopPropagation(); this._removePredicate(pred, state); }); box.appendChild(del);
                    body.appendChild(box); renderedAny = true;
                } catch(perr){ console.warn('[AdvancedSearch] predicate render error', perr); }
            });
            // hasIncomplete not used here
            if (state.advancedSearch.enabled) {
                // Inject richer Add Field control (popup + hidden select for compatibility)
                try {
                    if (window.AdvancedSearchAddField && typeof AdvancedSearchAddField.inject === 'function') {
                        AdvancedSearchAddField.inject(body, allFields.filter(h => h.key !== 'favorite'), state);
                    } else if (typeof AdvancedSearch._injectAddFieldControl === 'function') {
                        AdvancedSearch._injectAddFieldControl(body, allFields.filter(h => h.key !== 'favorite'), state);
                    }
                } catch (e) { /* ignore injection errors */ }
            }
            if (!predicates.length && state.advancedSearch.enabled) {
                const empty = document.createElement('div'); empty.className='adv-search-empty-inline'; empty.textContent = headersReady ? 'Select a field to start building a filter.' : 'Loading columns…'; body.appendChild(empty);
            } else if (!predicates.length) {
                const disabledMsg = document.createElement('div'); disabledMsg.className='adv-search-disabled-msg'; disabledMsg.textContent='Advanced Search disabled – toggle above to begin.'; body.appendChild(disabledMsg);
            }
            // Fallback summary if committed predicates exist but nothing rendered (rare)
            if (!renderedAny) {
                const committedCount = state.advancedSearch.predicates.filter(p=>p && p.complete).length;
                if (committedCount) this.renderCommittedFallback(state, body);
            }
            // Final dropdown/assertion guard (non-recursive)
            try { this.ensureAddFieldDropdown(state); } catch(eDrop) { /* ignore */ }
            setTimeout(() => {
                try {
                    if (state._advFocusOperatorId) { const sel = body.querySelector(`select.adv-operator-select[data-pred-id="${state._advFocusOperatorId}"]`); if (sel) sel.focus(); delete state._advFocusOperatorId; }
                    else if (state._advFocusPredicateId) { const box = body.querySelector(`.adv-predicate-box[data-predicate-id="${state._advFocusPredicateId}"]`); if (box) box.focus(); delete state._advFocusPredicateId; }
                } catch(focusErr){}
            },0);
        } catch (e) {
            console.warn('[AdvancedSearch] renderPredicates error', e);
            try {
                const panel = state.advancedSearchPanel || document.getElementById('advanced-search-panel');
                if (panel) {
                    let body = panel.querySelector('.adv-search-body');
                    if (!body) { body = document.createElement('div'); body.className='adv-search-body'; panel.appendChild(body); }
                    if (!panel.querySelector('select.adv-add-field-select')) {
                        // Recovery: compute available fields locally and inject our richer Add Field control
                        try {
                            const headerFields = (state.headers || []).filter(h => h && h.key && h.label);
                            let advOnly;
                            try { advOnly = (App.FilterUtils && typeof App.FilterUtils.getAdvancedOnlyFields === 'function') ? App.FilterUtils.getAdvancedOnlyFields() : []; } catch(e){ advOnly = []; }
                            const headerKeysSet = new Set(headerFields.map(h => h.key));
                            const advFiltered = advOnly.filter(f => f && f.key && f.label && !headerKeysSet.has(f.key));
                            const allFieldsLocal = headerFields.concat(advFiltered);
                            try {
                                if (window.AdvancedSearchAddField && typeof AdvancedSearchAddField.inject === 'function') {
                                    AdvancedSearchAddField.inject(body, allFieldsLocal.filter(h => h.key !== 'favorite'), state);
                                } else if (typeof AdvancedSearch._injectAddFieldControl === 'function') {
                                    AdvancedSearch._injectAddFieldControl(body, allFieldsLocal.filter(h => h.key !== 'favorite'), state);
                                }
                            } catch(injectErr2) { this._logDebug('renderPredicates:fallbackInjectError', injectErr2); }
                        } catch(injectErr) { this._logDebug('renderPredicates:fallbackInjectError', injectErr); }
                    }
                    const committedCount = state.advancedSearch.predicates.filter(p=>p && p.complete).length;
                    if (committedCount && body.querySelectorAll('.adv-predicate-box').length===0) this.renderCommittedFallback(state, body);
                }
                this.updateBadge(state);
            } catch(recErr){ /* ignore */ }
        } finally {
            try { delete state._advRendering; } catch(eClear){ /* ignore */ }
            try {
                const panel = state.advancedSearchPanel || document.getElementById('advanced-search-panel');
                const body = panel ? panel.querySelector('.adv-search-body') : null;
                const boxes = body ? body.querySelectorAll('.adv-predicate-box').length : 0;
                const dropdownPresent = !!(panel && panel.querySelector('select.adv-add-field-select'));
                const headerCount = Array.isArray(state.headers) ? state.headers.filter(h=>h && h.key && h.label).length : 0;
                this._logDebug('renderPredicates:finalSummary', { boxes, dropdownPresent, headerCount, predicatesLen: state.advancedSearch?.predicates?.length || 0 });
            } catch(summaryErr){ /* ignore */ }
        }
    },
    buildStaticFieldIndex(state) {
        try {
            if (!state) return;
            // Avoid concurrent or repeated synchronous builds which can block UI
            if (state._advIndexBuilding) {
                this._logDebug('buildStaticFieldIndex:alreadyBuilding');
                return;
            }
            state._advIndexBuilding = true;
            // Hidden groups signature collected up-front; static index excludes hidden offers
            let hiddenGroups = [];
            try { hiddenGroups = (typeof Filtering !== 'undefined' && Filtering && typeof Filtering.loadHiddenGroups === 'function') ? Filtering.loadHiddenGroups() : []; } catch(eHg){ hiddenGroups = []; }
            const hgSig = Array.isArray(hiddenGroups) && hiddenGroups.length ? hiddenGroups.slice().sort().join('|') : 'NONE';
            const baseAll = state.fullOriginalOffers || state.originalOffers || [];
            const offerCount = Array.isArray(baseAll) ? baseAll.length : 0;
            if (!offerCount) return;
            const prevCount = state._advIndexOfferCount || 0;
            // If counts similar (<5% delta) AND hidden group signature unchanged, skip rebuild
            if (state._advStaticFieldIndex && prevCount && Math.abs(prevCount - offerCount) / (prevCount || 1) < 0.05 && state._advIndexHiddenGroupsSig === hgSig) return;
            // Filter out hidden group offers prior to indexing
            const labelToKey = {};
            try { (state.headers||[]).forEach(h => { if (h && h.label && h.key) labelToKey[h.label.toLowerCase()] = h.key; }); } catch(eMap){ /* ignore */ }
            const filterHiddenOffers = (arr) => {
                if (!Array.isArray(hiddenGroups) || !hiddenGroups.length) return arr;
                if (!Array.isArray(arr)) return arr;
                return arr.filter(w => {
                    try {
                        const offer = w.offer; const sailing = w.sailing;
                        for (const path of hiddenGroups) {
                            if (!path || typeof path !== 'string') continue;
                            const parts = path.split(':');
                            if (parts.length < 2) continue;
                            const label = (parts[0]||'').trim(); const value = (parts.slice(1).join(':')||'').trim();
                            if (!label || !value) continue;
                            const key = labelToKey[label.toLowerCase()];
                            if (!key) continue;
                            const colVal = (Filtering && typeof Filtering.getOfferColumnValue === 'function') ? Filtering.getOfferColumnValue(offer, sailing, key) : null;
                            if (colVal != null && (''+colVal).toUpperCase() === value.toUpperCase()) return false;
                        }
                    } catch(eRow){ /* ignore row */ }
                    return true;
                });
            };
            try { window.__ADV_INDEX_BUILDING = true; } catch(e){}
            const base = filterHiddenOffers(baseAll);
            state._advIndexOfferCount = offerCount; // keep original count for threshold math
            const headerFields = (state.headers || []).filter(h => h && h.key && h.label);
            let advOnly;
            try { advOnly = (App.FilterUtils && typeof App.FilterUtils.getAdvancedOnlyFields === 'function') ? App.FilterUtils.getAdvancedOnlyFields() : []; } catch(e){ advOnly = []; }
            if (!Array.isArray(advOnly)) advOnly = [];
            const headerKeysSet = new Set(headerFields.map(h => h.key));
            const advFiltered = advOnly.filter(f => f && f.key && f.label && !headerKeysSet.has(f.key));
            const allFields = headerFields.concat(advFiltered);
            const priceFields = new Set(['minInteriorPrice','minOutsidePrice','minBalconyPrice','minSuitePrice','offerValue']);
            const skipFields = new Set(['visits']);
            const index = {};
            for (const f of allFields) {
                if (!f || !f.key) continue;
                const k = f.key;
                if (skipFields.has(k) || priceFields.has(k)) continue;
                const set = new Set();
                for (let i=0;i<base.length;i++) {
                    try {
                        const w = base[i];
                        const sailings = w?.campaignOffer?.sailings || [w?.sailing].filter(Boolean);
                        const sailing = Array.isArray(sailings) ? sailings[0] : w?.sailing;
                        const raw = (Filtering && (Filtering.getOfferColumnValueForFiltering ? Filtering.getOfferColumnValueForFiltering(w.offer, sailing, k, state) : Filtering.getOfferColumnValue(w.offer, sailing, k)));
                        if (raw == null) continue;
                        set.add(raw);
                    } catch(eRow){ /* ignore row */ }
                }
                if (set.size) {
                    let arr;
                    if (k === 'departureDayOfWeek') {
                        const weekOrder = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                        const present = new Set(Array.from(set));
                        arr = weekOrder.filter(d => present.has(d));
                        const extras = Array.from(present).filter(v => !weekOrder.includes(v));
                        if (extras.length) arr = arr.concat(extras.sort());
                    } else if (k === 'departureMonth') {
                        const monthOrder = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                        const present = new Set(Array.from(set));
                        arr = monthOrder.filter(m => present.has(m));
                        const extras = Array.from(present).filter(v => !monthOrder.includes(v));
                        if (extras.length) arr = arr.concat(extras.sort());
                    } else {
                        arr = Array.from(set).sort();
                    }
                    index[k] = arr;
                }
            }
            state._advStaticFieldIndex = index;
            state._advIndexHiddenGroupsSig = hgSig;
            try { window.__ADV_INDEX_BUILDING = false; } catch(e){}
            // mark build complete and schedule a light re-render to pick up the new index
            state._advIndexBuilding = false;
            this._logDebug('buildStaticFieldIndex:rebuilt', { fields: Object.keys(index).length, offerCount, hgSig });
            try {
                setTimeout(() => {
                    try { this.renderPredicates(state); } catch (e) { /* ignore */ }
                    try { this.ensureAddFieldDropdown(state); } catch (e) { /* ignore */ }
                }, 0);
            } catch (e) { /* ignore */ }
        } catch(e){ this._logDebug('buildStaticFieldIndex:error', e); }
    },
    buildToggleButton(state) {
        // Create the Advanced Search toggle button used in breadcrumbs
        this.ensureState(state);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'adv-search-button';
        const enabled = !!state.advancedSearch.enabled;
        btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        btn.textContent = enabled ? 'Advanced Search' : 'Advanced Search'; // Badge appended via updateBadge
        // Tooltip for clarity
        btn.title = enabled ? 'Disable Advanced Search filters' : 'Enable Advanced Search filters';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const prevEnabled = !!state.advancedSearch.enabled;
            this._logDebug('Toggle click received', { prevEnabled, predicateCount: state.advancedSearch.predicates.length, predicates: state.advancedSearch.predicates.map(p=>({id:p.id, fieldKey:p.fieldKey, operator:p.operator, complete:p.complete, valuesLen:Array.isArray(p.values)?p.values.length:0})) });
            // Toggle enable flag
            state.advancedSearch.enabled = !state.advancedSearch.enabled;
            const nowEnabled = state.advancedSearch.enabled;
            this._logDebug('Toggled state', { nowEnabled, prevEnabled });
            // Clear preview state when disabling so stale preview not kept
            if (!nowEnabled) {
                state._advPreviewPredicateId = null;
                if (state._advPreviewTimer) { clearTimeout(state._advPreviewTimer); delete state._advPreviewTimer; }
                this._logDebug('Disabled advanced search: cleared preview state');
            }
            // Update button pressed state
            btn.setAttribute('aria-pressed', nowEnabled ? 'true' : 'false');
            btn.title = nowEnabled ? 'Disable Advanced Search filters' : 'Enable Advanced Search filters';
            // Refresh table (filters applied or removed)
            try { this._logDebug('Calling lightRefresh after toggle', { showSpinner: true }); this.lightRefresh(state, { showSpinner: true }); } catch(e) { this._logDebug('lightRefresh error', e); }
            // If we just enabled, ensure panel exists immediately (before delayed breadcrumb rebuild) so user sees Add Field control.
            if (nowEnabled && !prevEnabled) {
                try {
                    let container = document.querySelector('.breadcrumb-container');
                    if (!container) {
                        container = document.querySelector('.breadcrumb-container') || document.getElementById('app') || document.body;
                    }
                    this._logDebug('Enable path: attempting scaffoldPanel', { containerExists: !!container });
                    if (container) {
                        const preExistingPanel = !!document.getElementById('advanced-search-panel');
                        this._logDebug('Panel existence before scaffold', { preExistingPanel });
                        this.scaffoldPanel(state, container);
                        const postPanel = !!document.getElementById('advanced-search-panel');
                        this._logDebug('Panel existence after scaffold', { postPanel });
                        const headerCountAfterScaffold = Array.isArray(state.headers) ? state.headers.filter(h=>h && h.key && h.label).length : 0;
                        this._logDebug('Header count after scaffold', { headerCountAfterScaffold });
                        // If no predicates, force render to inject Add Field dropdown right away
                        if (state.advancedSearch.predicates.length === 0) {
                            this._logDebug('No predicates post-enable: forcing renderPredicates');
                            this.renderPredicates(state);
                            this.scheduleRerenderIfColumnsPending(state);
                        }
                    } else {
                        this._logDebug('Enable path: no container found');
                    }
                } catch (scErr) { this._logDebug('Error during immediate scaffoldPanel enable path', scErr); }
            } else if (!nowEnabled) {
                // If disabling, hide panel immediately for responsiveness
                try {
                    const panel = document.getElementById('advanced-search-panel');
                    if (panel) {
                        panel.classList.add('adv-hidden');
                        this._logDebug('Disable path: panel hidden', { hadPanel: true });
                    } else {
                        this._logDebug('Disable path: no panel to hide');
                    }
                } catch(hideErr){ this._logDebug('Error hiding panel on disable', hideErr); }
            }
            // Update badge immediately to reflect active count (likely 0 on enable)
            try { this._logDebug('Updating badge post-toggle'); this.updateBadge(state); } catch(eBadge) { this._logDebug('Badge update error', eBadge); }
            // Delay breadcrumb rebuild slightly to avoid being overwritten by pending tableRenderer DOM operations
            const scheduleBreadcrumb = () => {
                this._logDebug('scheduleBreadcrumb invoked', { nowEnabled, predicateCount: state.advancedSearch.predicates.length });
                try { Breadcrumbs.updateBreadcrumb(state.groupingStack || [], state.groupKeysStack || []); this._logDebug('Breadcrumbs updated'); } catch(e) { this._logDebug('Breadcrumbs update error', e); }
                // After rebuild, if enabled and panel missing (edge race) re-scaffold
                if (nowEnabled) {
                    const existingPanel = document.getElementById('advanced-search-panel');
                    this._logDebug('Post-breadcrumb panel check', { existingPanel: !!existingPanel });
                    if (!existingPanel) {
                        try {
                            const container = document.querySelector('.breadcrumb-container') || document.body;
                            this._logDebug('Re-scaffold attempt (panel missing after breadcrumb)');
                            this.scaffoldPanel(state, container);
                        } catch(e2) { this._logDebug('Re-scaffold error', e2); }
                    } else {
                        try {
                            if (state.advancedSearch.predicates.length === 0) {
                                const addSel = existingPanel.querySelector('select.adv-add-field-select');
                                this._logDebug('Zero predicates after breadcrumb; dropdown presence', { dropdownPresent: !!addSel });
                                if (!addSel) this.renderPredicates(state);
                            }
                        } catch(e3) { this._logDebug('Render predicates after breadcrumb error', e3); }
                    }
                    // Final guard after breadcrumb rebuild
                    try { this._logDebug('Final ensureAddFieldDropdown call'); this.ensureAddFieldDropdown(state); } catch(e4) { this._logDebug('ensureAddFieldDropdown error', e4); }
                }
            };
            setTimeout(scheduleBreadcrumb, 60); // small delay allows updateView's DOM mutations to settle
        });
        // Initial badge update
        try { this.updateBadge(state); } catch(e) { /* ignore */ }
        return btn;
    },
    ensureAddFieldDropdown(state) {
        try {
            if (state._advRendering) { this._logDebug('ensureAddFieldDropdown:skipRenderingActive'); return; }
            if (!state || !state.advancedSearch || !state.advancedSearch.enabled) { this._logDebug('ensureAddFieldDropdown:skipNotEnabled'); return; }
            const panel = state.advancedSearchPanel || document.getElementById('advanced-search-panel');
            if (!panel) { this._logDebug('ensureAddFieldDropdown:noPanel'); return; }
            const body = panel.querySelector('.adv-search-body');
            if (!body) { this._logDebug('ensureAddFieldDropdown:noBody'); return; }
            const hasSelect = panel.querySelector('select.adv-add-field-select');
            const boxCount = body.querySelectorAll('.adv-predicate-box').length;
            const predsLen = Array.isArray(state.advancedSearch.predicates) ? state.advancedSearch.predicates.length : 0;
            const committedCount = state.advancedSearch.predicates.filter(p => p && p.complete).length;
            const hasIncomplete = state.advancedSearch.predicates.some(p => p && !p.complete); // FIX undefined variable leak
            this._logDebug('ensureAddFieldDropdown:state', { hasSelect: !!hasSelect, boxCount, predsLen, committedCount, hasIncomplete });
            if (committedCount && boxCount === 0) {
                this._logDebug('ensureAddFieldDropdown:renderFallbackDueToNoBoxes');
                this.renderCommittedFallback(state, body);
            }
            if (panel.querySelector('select.adv-add-field-select')) {
                this._logDebug('ensureAddFieldDropdown:selectAlreadyPresent');
                return;
            }
            // Build field list only if we are enabled and no incomplete predicates blocking
            const headerFields = (state.headers || []).filter(h => h && h.key && h.label);
            let advOnly;
            try { advOnly = (App.FilterUtils && typeof App.FilterUtils.getAdvancedOnlyFields === 'function') ? App.FilterUtils.getAdvancedOnlyFields() : []; } catch(e){ advOnly = []; }
            if (!Array.isArray(advOnly)) advOnly = [];
            const headerKeysSet = new Set(headerFields.map(h => h.key));
            const advFiltered = advOnly.filter(f => f && f.key && f.label && !headerKeysSet.has(f.key));
            const allFields = headerFields.concat(advFiltered).filter(f => f && f.key && f.label && f.key !== 'favorite');
            const wrapper = document.createElement('div');
            wrapper.className = 'adv-add-field-wrapper adv-recovery-wrapper';
            const sel = document.createElement('select');
            sel.className = 'adv-add-field-select';
            const opt = document.createElement('option'); opt.value = ''; opt.textContent = 'Add Field…'; sel.appendChild(opt);
            allFields.forEach(f => { const o=document.createElement('option'); o.value = f.key; o.textContent = f.label || f.key; sel.appendChild(o); });
            if (hasIncomplete) {
                sel.disabled = true; sel.title = 'Finish current filter to add another field'; wrapper.classList.add('adv-add-disabled'); sel.setAttribute('aria-disabled','true');
            }
            sel.addEventListener('change', () => {
                if (sel.disabled) return; const val = sel.value; if(!val) return; if (state.advancedSearch.predicates.some(p=>!p.complete)) return;
                const pred = { id: Date.now().toString(36)+Math.random().toString(36).slice(2,8), fieldKey: val, operator: null, values: [], complete: false };
                state.advancedSearch.predicates.push(pred);
                state._advFocusOperatorId = pred.id;
                this._logDebug('ensureAddFieldDropdown:newPredicateAdded', { fieldKey: val, totalPredicates: state.advancedSearch.predicates.length });
                this.renderPredicates(state);
                this.debouncedPersist(state);
            });
            wrapper.appendChild(sel);
            body.appendChild(wrapper);
            this._logDebug('ensureAddFieldDropdown:selectInjected', { totalPredicates: predsLen });
        } catch(e) { this._logDebug('ensureAddFieldDropdown:error', e); }
    },
    scheduleRerenderIfColumnsPending(state) {
        try {
            if (!state || !state.advancedSearch || !state.advancedSearch.enabled) return;
            const panel = state.advancedSearchPanel || document.getElementById('advanced-search-panel');
            if (!panel) return;
            const headerCount = Array.isArray(state.headers) ? state.headers.filter(h=>h && h.key && h.label).length : 0;
            if (headerCount > 2) { this._logDebug('scheduleRerenderIfColumnsPending:headersReadyNoAction', { headerCount }); return; }
            if (state._advRerenderPolling) { this._logDebug('scheduleRerenderIfColumnsPending:alreadyPolling'); return; }
            state._advRerenderPolling = { attempts: 0, lastHeaderCount: headerCount };
            this._logDebug('scheduleRerenderIfColumnsPending:start', { headerCount });
            const poll = () => {
                try {
                    const hc = Array.isArray(state.headers) ? state.headers.filter(h=>h && h.key && h.label).length : 0;
                    state._advRerenderPolling.lastHeaderCount = hc;
                    const done = hc > 2 || state._advRerenderPolling.attempts >= 12;
                    this._logDebug('scheduleRerenderIfColumnsPending:poll', { attempt: state._advRerenderPolling.attempts, headerCount: hc, done });
                    if (hc > 2) {
                        delete state._advRerenderPolling;
                        this.renderPredicates(state);
                        return;
                    }
                    if (done) {
                        this._logDebug('scheduleRerenderIfColumnsPending:stop', { headerCount: hc });
                        delete state._advRerenderPolling;
                        return;
                    }
                    state._advRerenderPolling.attempts++;
                    setTimeout(poll, 120);
                } catch (e) {
                    delete state._advRerenderPolling;
                }
            };
            setTimeout(poll, 120);
        } catch (e) { /* ignore */ }
    },
    lightRefresh(state, opts) {
        const showSpinner = !!(opts && opts.showSpinner);
        try {
            this._logDebug('lightRefresh:start', { showSpinner });
            if (!state) return;
            state._skipBreadcrumb = true;
            let spinnerSessionId = null;
            if (showSpinner && typeof Spinner !== 'undefined' && Spinner.showSpinner) {
                try { Spinner.showSpinner(); this._logDebug('lightRefresh:spinnerShown'); } catch(e){ this._logDebug('lightRefresh:spinnerShowError', e); }
                spinnerSessionId = Date.now().toString(36)+Math.random().toString(36).slice(2);
                AdvancedSearch._activeSpinnerSession = spinnerSessionId;
                const listener = () => {
                    try {
                        if (AdvancedSearch._activeSpinnerSession !== spinnerSessionId) return;
                        Spinner.hideSpinner && Spinner.hideSpinner();
                        AdvancedSearch._activeSpinnerSession = null;
                        document.removeEventListener('tableRenderComplete', listener);
                        this._logDebug('lightRefresh:spinnerHiddenByEvent');
                    } catch(e2){ this._logDebug('lightRefresh:spinnerEventError', e2); }
                };
                try { document.addEventListener('tableRenderComplete', listener, { once: true }); } catch(e){ /* ignore */ }
                setTimeout(() => {
                    if (AdvancedSearch._activeSpinnerSession === spinnerSessionId) {
                        try { Spinner.hideSpinner && Spinner.hideSpinner(); this._logDebug('lightRefresh:spinnerHiddenFallback'); } catch(e3){}
                        AdvancedSearch._activeSpinnerSession = null;
                    }
                }, 1500);
            }
            setTimeout(() => {
                try { TableRenderer.updateView(state); this._logDebug('lightRefresh:updateViewCalled'); } catch(e){ this._logDebug('lightRefresh:updateViewError', e); }
                try { this.updateBadge(state); } catch(e){ this._logDebug('lightRefresh:updateBadgeError', e); }
                try { this.ensureAddFieldDropdown(state); } catch(e){ this._logDebug('lightRefresh:ensureDropdownError', e); }
            }, 0);
        } catch (e) { this._logDebug('lightRefresh:errorOuter', e); }
    },
    debouncedPersist(state) {
        try {
            if (this._persistTimer) clearTimeout(this._persistTimer);
            this._persistTimer = setTimeout(() => {
                try { this.persistPredicates(state); this._logDebug('debouncedPersist:flush'); } catch(e){ this._logDebug('debouncedPersist:errorFlush', e); }
            }, 400);
            this._logDebug('debouncedPersist:scheduled');
        } catch(e){ this._logDebug('debouncedPersist:errorOuter', e); }
    },
    scaffoldPanel(state, container) {
        try {
            // Keep a reference to the last state for global utilities (e.g., Settings)
            try { AdvancedSearch._lastState = state; } catch(e){}
            this.ensureState(state);
            this._logDebug('scaffoldPanel:start', { enabled: !!state?.advancedSearch?.enabled, containerExists: !!container });
            if (!container) return;
            let panel = document.getElementById('advanced-search-panel');
            if (!panel) {
                panel = document.createElement('div');
                panel.id = 'advanced-search-panel';
                panel.className = 'advanced-search-panel';
                container.appendChild(panel);
                this._logDebug('scaffoldPanel:created');
            }
            const enabled = !!state.advancedSearch.enabled;
            panel.classList.toggle('adv-hidden', !enabled);
            panel.classList.toggle('enabled', enabled);
            let header = panel.querySelector('.adv-search-header');
            if (!header) { header = document.createElement('div'); header.className = 'adv-search-header'; panel.appendChild(header); this._logDebug('scaffoldPanel:headerCreated'); }
            header.innerHTML = '';
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button'; clearBtn.className = 'adv-search-clear-btn'; clearBtn.textContent = 'Clear All';
            clearBtn.addEventListener('click', () => {
                const hadAny = !!state.advancedSearch.predicates.length;
                if (hadAny && !confirm('Clear all filters?')) return;
                state.advancedSearch.predicates = [];
                state._advPreviewPredicateId = null;
                try { this.lightRefresh(state, { showSpinner: true }); } catch(e){}
                this.renderPredicates(state);
                this.updateBadge(state);
                try { const key = this.storageKey(state.selectedProfileKey); __advSession.removeItem(key); } catch(e){}
                setTimeout(() => { try { panel.querySelector('select.adv-add-field-select')?.focus(); } catch(e){} }, 0);
            });
            header.appendChild(clearBtn);
            // 'Include Taxes & Fees in Price Filters' has moved to Settings modal
            const committedCount = state.advancedSearch.predicates.filter(p=>p && p.complete).length;
            if (committedCount) {
                const badge = document.createElement('span'); badge.className='adv-badge'; badge.textContent = committedCount + ' active'; header.appendChild(badge);
            }
            state.advancedSearchPanel = panel;
            try {
                const scheduleBuild = () => {
                    try { this.buildStaticFieldIndex(state); } catch(eIdx){ this._logDebug('buildStaticFieldIndex scaffold error', eIdx); }
                };
                if (typeof requestIdleCallback === 'function') requestIdleCallback(scheduleBuild, {timeout: 500}); else setTimeout(scheduleBuild, 50);
            } catch(eSched) { this._logDebug('buildStaticFieldIndex:scheduleError', eSched); }
            this.renderPredicates(state);
            this._logDebug('scaffoldPanel:end', { committedCount });
        } catch(e){ this._logDebug('scaffoldPanel:error', e); }
    },
    updateBadge(state) {
        try {
            const btn = document.querySelector('button.adv-search-button');
            if (!btn || !state?.advancedSearch) return;
            const committedCount = state.advancedSearch.predicates.filter(p=>p && p.complete).length;
            btn.textContent = committedCount ? `Advanced Search (${committedCount})` : 'Advanced Search';
            btn.setAttribute('aria-label', committedCount ? `Advanced Search with ${committedCount} filters` : 'Advanced Search');
            const panel = state.advancedSearchPanel || document.getElementById('advanced-search-panel');
            if (panel) {
                const header = panel.querySelector('.adv-search-header');
                if (header) {
                    let badge = header.querySelector('.adv-badge');
                    if (badge && !committedCount) { badge.remove(); badge = null; }
                    if (!badge && committedCount) { badge = document.createElement('span'); badge.className='adv-badge'; header.appendChild(badge); }
                    if (badge) badge.textContent = committedCount + ' active';
                }
            }
            this._logDebug('updateBadge:done', { committedCount });
        } catch(e){ this._logDebug('updateBadge:error', e); }
    },
    renderCommittedFallback(state, bodyEl) {
        try {
            if (!state?.advancedSearch?.enabled) return;
            const preds = state.advancedSearch.predicates.filter(p=>p && p.complete);
            if (!preds.length) return;
            preds.forEach(p => {
                const box = document.createElement('div'); box.className='adv-predicate-box adv-fallback-box'; box.setAttribute('data-predicate-id', p.id);
                const label = document.createElement('span'); label.className='adv-predicate-field-label'; label.textContent = p.fieldKey; box.appendChild(label);
                const summary = document.createElement('span'); summary.className='adv-summary'; summary.textContent = p.operator || '(op)'; box.appendChild(summary);
                const valuesSpan = document.createElement('span'); valuesSpan.className='adv-summary-values'; valuesSpan.textContent = Array.isArray(p.values)&&p.values.length ? p.values.join(', ') : '(no values)'; box.appendChild(valuesSpan);
                bodyEl.appendChild(box);
            });
            this._logDebug('renderCommittedFallback:boxesAdded', { count: preds.length });
            this.ensureAddFieldDropdown(state);
        } catch(e){ this._logDebug('renderCommittedFallback:error', e); }
    },
    _renderDateRangeEditor(container, pred, state) {
        // Build a lightweight 2-month calendar style date range selector (flight search style)
        try {
            const wrapper = document.createElement('div');
            wrapper.className = 'adv-date-range-wrapper';
            const controls = document.createElement('div'); controls.className = 'adv-date-range-controls';
            const prevBtn = document.createElement('button'); prevBtn.type='button'; prevBtn.textContent='‹'; prevBtn.title='Previous month';
            const nextBtn = document.createElement('button'); nextBtn.type='button'; nextBtn.textContent='›'; nextBtn.title='Next month';
            controls.appendChild(prevBtn); controls.appendChild(nextBtn);
            wrapper.appendChild(controls);
            const calHost = document.createElement('div'); calHost.className='adv-date-range-cals'; wrapper.appendChild(calHost);
            const footer = document.createElement('div'); footer.className='adv-date-range-footer';
            const summary = document.createElement('div'); summary.className='adv-date-range-summary'; footer.appendChild(summary);
            const clearBtn = document.createElement('button'); clearBtn.type='button'; clearBtn.textContent='Clear'; clearBtn.addEventListener('click', () => {
                pred._rangeStart=null; pred._rangeEnd=null; pred.values=[]; this.renderPredicates(state);
            });
            footer.appendChild(clearBtn);
            wrapper.appendChild(footer);
            // Initialize base month (first month shown)
            if (typeof pred._baseMonth === 'undefined') {
                const today = new Date();
                pred._baseMonth = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
            }
            const formatISO = (d) => {
                const yr = d.getUTCFullYear(); const m = (d.getUTCMonth()+1).toString().padStart(2,'0'); const day = d.getUTCDate().toString().padStart(2,'0');
                return `${yr}-${m}-${day}`;
            };
            const fmtDisp = (iso) => {
                if (!iso) return '?';
                const [y,m,d]=iso.split('-'); return `${m}/${d}/${y.slice(-2)}`;
            };
            const renderCalendars = () => {
                calHost.innerHTML='';
                const months = [0,1];
                months.forEach(offset => {
                    const first = new Date(pred._baseMonth);
                    first.setUTCMonth(first.getUTCMonth()+offset);
                    const year = first.getUTCFullYear(); const month = first.getUTCMonth(); // use UTC consistently
                    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                    const title = document.createElement('div'); title.className='adv-cal-title'; title.textContent = monthNames[month] + ' ' + year; // UTC-safe month name
                    const grid = document.createElement('table'); grid.className='adv-cal-grid';
                    const thead = document.createElement('thead'); const hr = document.createElement('tr'); ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d=>{ const th=document.createElement('th'); th.textContent=d; hr.appendChild(th); }); thead.appendChild(hr); grid.appendChild(thead);
                    const tbody = document.createElement('tbody');
                    const firstDayDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
                    let cur = 1; const daysInMonth = new Date(Date.UTC(year, month+1, 0)).getUTCDate();
                    for (let r=0; r<6 && cur<=daysInMonth; r++) {
                        const tr = document.createElement('tr');
                        for (let c=0; c<7; c++) {
                            const td = document.createElement('td');
                            if ((r===0 && c < firstDayDow) || cur>daysInMonth) {
                                td.textContent='';
                            } else {
                                const d = new Date(Date.UTC(year, month, cur));
                                const iso = formatISO(d);
                                td.textContent = d.getUTCDate();
                                td.dataset.iso = iso;
                                td.className='adv-cal-day';
                                if (pred._rangeStart && iso === pred._rangeStart) td.classList.add('start');
                                if (pred._rangeEnd && iso === pred._rangeEnd) td.classList.add('end');
                                if (pred._rangeStart && pred._rangeEnd && iso > pred._rangeStart && iso < pred._rangeEnd) td.classList.add('in-range');
                                td.addEventListener('click', () => {
                                    if (!pred._rangeStart || (pred._rangeStart && pred._rangeEnd)) {
                                        pred._rangeStart = iso; pred._rangeEnd = null; pred.values=[]; // start new selection
                                    } else if (!pred._rangeEnd) {
                                        if (iso < pred._rangeStart) { pred._rangeEnd = pred._rangeStart; pred._rangeStart = iso; } else { pred._rangeEnd = iso; }
                                        pred.values = [pred._rangeStart, pred._rangeEnd];
                                    }
                                    summary.textContent = pred._rangeStart ? (pred._rangeEnd ? `${fmtDisp(pred._rangeStart)} → ${fmtDisp(pred._rangeEnd)}` : fmtDisp(pred._rangeStart)+' – …') : 'Select a start date';
                                    this.schedulePreview(state, pred);
                                    renderCalendars();
                                    // Re-enable commit button state
                                    const commit = container.querySelector('button.adv-commit-btn'); if (commit) commit.disabled = !(pred.values && pred.values.length===2);
                                });
                                cur++; // increment only when a day cell is placed
                            }
                            tr.appendChild(td);
                        }
                        tbody.appendChild(tr);
                    }
                    // FIX: append tbody so day numbers render
                    grid.appendChild(tbody);
                    const block = document.createElement('div'); block.className='adv-cal-block';
                    block.appendChild(title); block.appendChild(grid);
                    calHost.appendChild(block);
                });
            };
            prevBtn.addEventListener('click', () => {
                try {
                    const d = new Date(pred._baseMonth);
                    const beforeY = d.getUTCFullYear(), beforeM = d.getUTCMonth();
                    d.setUTCMonth(d.getUTCMonth()-1);
                    pred._baseMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
                    this._logDebug('[DateRange] Prev month click', { beforeY, beforeM, afterY: d.getUTCFullYear(), afterM: d.getUTCMonth(), baseMonth: pred._baseMonth });
                    renderCalendars();
                } catch(e){ this._logDebug('[DateRange] Prev month error', e); }
            });
            nextBtn.addEventListener('click', () => {
                try {
                    const d = new Date(pred._baseMonth);
                    const beforeY = d.getUTCFullYear(), beforeM = d.getUTCMonth();
                    d.setUTCMonth(d.getUTCMonth()+1);
                    pred._baseMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
                    this._logDebug('[DateRange] Next month click', { beforeY, beforeM, afterY: d.getUTCFullYear(), afterM: d.getUTCMonth(), baseMonth: pred._baseMonth });
                    renderCalendars();
                } catch(e){ this._logDebug('[DateRange] Next month error', e); }
            });
            summary.textContent = pred.values && pred.values.length===2 ? `${fmtDisp(pred.values[0])} → ${fmtDisp(pred.values[1])}` : 'Select a start date';
            container.appendChild(wrapper);
            renderCalendars();
        } catch(e) { /* ignore date range UI errors */ }
    }
};


