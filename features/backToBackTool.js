(function(){
    const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const DOW_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });
    const DEBUG = false;
    // Dev-only toggle: set to true to always print in-code B2B chain diagnostics when opening builder
    const DEV_B2B_DEBUG = false;
    function _dbg() { if (!DEBUG) return; try { if (window && window.console && window.console.debug) console.debug('[B2B]', ...arguments); } catch(e){} }

    function normalizeIso(value) {
        if (!value) return '';
        const str = String(value).trim();
        if (!str) return '';
        if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
        const d = new Date(str);
        if (isNaN(d)) return '';
        return d.toISOString().slice(0, 10);
    }

    function addDays(iso, delta) {
        if (!iso) return '';
        const d = new Date(iso + 'T00:00:00Z');
        if (isNaN(d)) return iso;
        d.setUTCDate(d.getUTCDate() + delta);
        return d.toISOString().slice(0, 10);
    }
    function diffDays(next, prev) {
        if (!(next && prev)) return null;
        const a = new Date(next + 'T00:00:00Z');
        const b = new Date(prev + 'T00:00:00Z');
        if (isNaN(a) || isNaN(b)) return null;
        return Math.round((a.getTime() - b.getTime()) / 86400000);
    }

    function formatDateLabel(iso, includeDow) {
        if (!iso) return 'Date TBA';
        try {
            const d = new Date(iso + 'T00:00:00Z');
            if (isNaN(d)) return iso;
            const base = DATE_FMT.format(d);
            return includeDow ? `${DOW_FMT.format(d)} ${base}` : base;
        } catch (e) {
            return iso;
        }
    }

    function formatRange(meta) {
        if (!meta) return 'Dates TBA';
        const start = formatDateLabel(meta.startISO, true);
        const end = formatDateLabel(meta.endISO || meta.startISO, true);
        const nights = Number.isFinite(meta.nights) ? `${meta.nights} night${meta.nights === 1 ? '' : 's'}` : '';
        return nights ? `${start} → ${end} (${nights})` : `${start} → ${end}`;
    }

    function normalizePortName(value) {
        if (!value) return '';
        return String(value).trim();
    }

    function safeOfferCode(entry) {
        try {
            return (entry && entry.offer && entry.offer.campaignOffer && entry.offer.campaignOffer.offerCode) ? entry.offer.campaignOffer.offerCode : '';
        } catch (e) {
            return '';
        }
    }

    function getPerks(entry) {
        try {
            if (window.App && App.Utils && typeof App.Utils.computePerks === 'function') {
                return App.Utils.computePerks(entry.offer, entry.sailing) || '';
            }
        } catch (e) {}
        try {
            if (window.Utils && typeof Utils.computePerks === 'function') {
                return Utils.computePerks(entry.offer, entry.sailing) || '';
            }
        } catch (e) {}
        return '';
    }

    function escapeSelector(value) {
        if (!value) return '';
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
        return String(value).replace(/([ #.;?+*~':"!^$\[\]()=>|\/])/g, '\\$1');
    }

    function lookupItineraryRecord(sailing) {
        if (!sailing) return null;
        const shipCode = (sailing.shipCode || '').toString().trim();
        const sailDate = normalizeIso(sailing.sailDate);
        if (!shipCode || !sailDate) return null;
        const cache = (window.App && App.ItineraryCache) ? App.ItineraryCache : (typeof ItineraryCache !== 'undefined' ? ItineraryCache : null);
        if (cache && typeof cache.getByShipDate === 'function') {
            try { return cache.getByShipDate(shipCode, sailDate) || null; } catch (e) { return null; }
        }
        return null;
    }

    function parseNights(entry, itineraryRecord) {
        const sailing = entry && entry.sailing ? entry.sailing : {};
        const sources = [sailing.totalNights, sailing.sailingNights, sailing.lengthOfStay, itineraryRecord && itineraryRecord.totalNights];
        for (let i = 0; i < sources.length; i++) {
            const val = sources[i];
            if (val == null) continue;
            const num = parseInt(val, 10);
            if (!isNaN(num) && num > 0 && num < 80) return num;
        }
        try {
            const description = sailing.itineraryDescription || '';
            if (description) {
                const parsed = (window.App && App.Utils && typeof App.Utils.parseItinerary === 'function')
                    ? App.Utils.parseItinerary(description)
                    : (window.Utils && typeof Utils.parseItinerary === 'function' ? Utils.parseItinerary(description) : null);
                if (parsed && parsed.nights) {
                    const num = parseInt(parsed.nights, 10);
                    if (!isNaN(num)) return num;
                }
                const quickMatch = description.match(/(\d+)\s+Night/i);
                if (quickMatch && quickMatch[1]) {
                    const num = parseInt(quickMatch[1], 10);
                    if (!isNaN(num)) return num;
                }
            }
        } catch (e) {}
        return null;
    }

    function buildTimeline(itineraryRecord, sailing) {
        const days = itineraryRecord && Array.isArray(itineraryRecord.days) ? itineraryRecord.days : [];
        if (!days.length) {
            const summary = (sailing && sailing.itineraryDescription) ? sailing.itineraryDescription : '';
            return summary ? [{ day: 'Itinerary', label: summary }] : [];
        }
        // Helper to get DOW from ISO date
        function getDOW(iso, offset) {
            if (!iso) return '';
            try {
                const d = new Date(iso + 'T00:00:00Z');
                d.setUTCDate(d.getUTCDate() + offset);
                return DOW_FMT.format(d);
            } catch (e) { return ''; }
        }
        function getShortDate(iso, offset) {
            if (!iso) return '';
            try {
                const d = new Date(iso + 'T00:00:00Z');
                d.setUTCDate(d.getUTCDate() + offset);
                return DATE_FMT.format(d);
            } catch (e) { return ''; }
        }
        let baseISO = null;
        if (sailing && sailing.sailDate) baseISO = String(sailing.sailDate).slice(0, 10);
        return days.map((day, i) => {
            let dateLabel = '';
            let dow = '';
            if (baseISO) {
                dateLabel = getShortDate(baseISO, i);
                dow = getDOW(baseISO, i);
            }
            let label = '';
            try {
                const primaryPort = Array.isArray(day.ports) && day.ports.length ? day.ports[0] : null;
                if (primaryPort && primaryPort.port) {
                    const portName = primaryPort.port.name || primaryPort.port.code || day.type || 'Port Day';
                    const region = primaryPort.port.region || '';
                    label = region && portName ? `${portName}, ${region}` : portName;
                } else {
                    label = day.type || 'Sea Day';
                }
            } catch (e) {
                label = day && day.type ? day.type : 'Port Day';
            }
            return { day: dateLabel, label: label || 'Port Day', dow };
        });
    }

    const BackToBackTool = {
        _context: { rows: [], rowMap: new Map(), allowSideBySide: true, stateKey: null },
        _metaCache: new Map(),
        _activeSession: null,
        _selectedRowId: null, // persist the currently selected row for B2B highlighting

        _scheduleWithSpinner(task) {
            if (typeof task !== 'function') return;
            const spinner = (typeof Spinner !== 'undefined' && Spinner && typeof Spinner.showSpinner === 'function' && typeof Spinner.hideSpinner === 'function') ? Spinner : null;
            if (!spinner) {
                task();
                return;
            }
            try { spinner.showSpinner(); } catch (e) {}
            const run = () => {
                try {
                    task();
                } finally {
                    try { spinner.hideSpinner(); } catch (e) {}
                }
            };
            setTimeout(run, 0);
        },

        registerEnvironment(opts) {
            if (!opts) return;
            let rows = Array.isArray(opts.rows) ? opts.rows : [];
            try {
                // Emit a lightweight diagnostic about hidden-row stores to help debug
                const stateObj = (opts && opts._state) || (App && App.TableRenderer && App.TableRenderer.lastState) || null;
                let stateStoreSize = null;
                let globalStoreSize = null;
                try { if (stateObj && stateObj._hiddenGroupRowKeys instanceof Set) stateStoreSize = stateObj._hiddenGroupRowKeys.size; } catch(e){}
                try { if (Filtering && Filtering._globalHiddenRowKeys instanceof Set) globalStoreSize = Filtering._globalHiddenRowKeys.size; } catch(e){}
                try { console.debug('[B2B][REG] DIAG hiddenRowStores', { stateStoreSize, globalStoreSize, hasRows: Array.isArray(rows) ? rows.length : 0 }); } catch(e){}
            } catch(e){}
            // Defensive: ensure only Hidden Groups are excluded from the B2B context.
            // Do NOT apply advanced or accordion filters here. Consult hidden-row
            // stores directly to avoid invoking higher-level predicates.
            try {
                if (window.Filtering) {
                    const stateObj = (opts && opts._state) || (App && App.TableRenderer && App.TableRenderer.lastState) || null;
                    const beforeCount = Array.isArray(rows) ? rows.length : 0;
                    let filtered = rows;
                    try {
                        const globalHidden = (typeof Filtering !== 'undefined' && Filtering._globalHiddenRowKeys instanceof Set) ? Filtering._globalHiddenRowKeys : null;
                        const stateHidden = (stateObj && stateObj._hiddenGroupRowKeys instanceof Set) ? stateObj._hiddenGroupRowKeys : null;
                        filtered = (rows || []).filter(r => {
                            try {
                                if (!r) return false;
                                const code = (r.offer && r.offer.campaignOffer && r.offer.campaignOffer.offerCode) ? String(r.offer.campaignOffer.offerCode).trim().toUpperCase() : '';
                                const ship = (r.sailing && (r.sailing.shipCode || r.sailing.shipName)) ? String(r.sailing.shipCode || r.sailing.shipName).trim().toUpperCase() : '';
                                const sail = (r.sailing && r.sailing.sailDate) ? String(r.sailing.sailDate).trim().slice(0,10) : '';
                                const key = (code || '') + '|' + (ship || '') + '|' + (sail || '');
                                if ((globalHidden && globalHidden.has(key)) || (stateHidden && stateHidden.has(key))) return false;
                                return true;
                            } catch(e) { return true; }
                        });
                    } catch(e) { /* fall back to original rows on error */ }
                    const afterCount = Array.isArray(filtered) ? filtered.length : 0;
                    if (window && window.GOBO_DEBUG_ENABLED) {
                        try {
                            const removed = beforeCount - afterCount;
                            const sampleRemoved = [];
                            if (removed > 0) {
                                for (let i = 0; i < Math.min(8, rows.length); i++) {
                                    const r = rows[i];
                                    const code = (r && r.offer && r.offer.campaignOffer && r.offer.campaignOffer.offerCode) ? String(r.offer.campaignOffer.offerCode).trim() : '';
                                    if (code && filtered.findIndex(ff => (ff && ff.offer && ff.offer.campaignOffer && String(ff.offer.campaignOffer.offerCode).trim()) === code) === -1) sampleRemoved.push(code);
                                }
                            }
                            try {
                                const sampleCodes = (filtered || []).slice(0,6).map(r => (r && r.offer && r.offer.campaignOffer && r.offer.campaignOffer.offerCode) ? String(r.offer.campaignOffer.offerCode).trim() : null).filter(Boolean);
                                let stateStoreSize = null;
                                let globalStoreSize = null;
                                try {
                                    const st = (opts && opts._state) || (App && App.TableRenderer && App.TableRenderer.lastState) || null;
                                    if (st && st._hiddenGroupRowKeys instanceof Set) stateStoreSize = st._hiddenGroupRowKeys.size;
                                    if (Filtering && Filtering._globalHiddenRowKeys instanceof Set) globalStoreSize = Filtering._globalHiddenRowKeys.size;
                                } catch(e) { /* ignore */ }
                                console.debug('[B2B][REG] registerEnvironment filtered', { beforeCount, afterCount, removed, sampleRemoved, sampleCodes, stateStoreSize, globalStoreSize, hiddenGroups: (Filtering && typeof Filtering.loadHiddenGroups === 'function') ? Filtering.loadHiddenGroups() : null });
                            } catch (dbgErr) { console.debug('[B2B][REG] registerEnvironment filtered - debug error', dbgErr); }
                        } catch(e) { /* ignore logging errors */ }
                    }
                    rows = filtered;
                }
            } catch (e) { /* ignore filtering errors, fall back to original rows */ }
            const allowSideBySide = opts.allowSideBySide !== false;
            const rowMap = new Map();
            rows.forEach((entry, idx) => {
                if (!entry || !entry.sailing) return;
                if (!entry.sailing.__b2bRowId) {
                    const rawParts = [safeOfferCode(entry), entry.sailing.shipCode, entry.sailing.shipName, normalizeIso(entry.sailing.sailDate)];
                    const baseParts = rawParts.filter(p => p !== undefined && p !== null && String(p).trim() !== '').map(p => String(p).trim().replace(/[^a-zA-Z0-9_-]/g, '_'));
                    if (baseParts.length) {
                        entry.sailing.__b2bRowId = `b2b-${baseParts.join('-')}`;
                    } else {
                        entry.sailing.__b2bRowId = `b2b-${idx}`;
                    }
                }
                rowMap.set(entry.sailing.__b2bRowId, entry);
            });
            this._context = { rows, rowMap, allowSideBySide, stateKey: opts.stateKey || null, state: opts._state || (App && App.TableRenderer && App.TableRenderer.lastState) || null };
            this._metaCache.clear();
        },

        attachToCell(cell, context) {
            if (!cell) return;
            const pill = cell.querySelector('.b2b-chevrons');
            if (!pill) return;
            const sailing = context && context.sailing;
            const rowId = sailing && sailing.__b2bRowId;
            if (!rowId) return;
            // try { console.debug('[B2B] attachToCell binding', { rowId }); } catch(e){}
            pill.classList.add('b2b-pill-button');
            pill.setAttribute('role', 'button');
            pill.setAttribute('tabindex', '0');
            pill.dataset.b2bRowId = rowId;
            if (pill.dataset.b2bBound === 'true') return;
            const handler = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                this.openByRowId(rowId);
            };
            pill.addEventListener('click', handler, true);
            pill.addEventListener('pointerdown', handler, true);
            pill.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    handler(ev);
                }
            }, true);
            pill.dataset.b2bBound = 'true';
        },

        // Debugging helper: capture-phase listener to detect clicks that never reach our handlers
        _installGlobalDebugCapture() {
            try {
                if (typeof window === 'undefined' || !window.GOBO_DEBUG_ENABLED) return;
                if (this._debugCaptureInstalled) return;
                const dbg = (ev) => {
                    try {
                        const t = ev.target;
                        const pill = t.closest && t.closest('.b2b-chevrons');
                        const cell = t.closest && t.closest('.b2b-depth-cell');
                        if (pill || cell) {
                                try { console.debug('[B2B] capture click', { target: t.tagName, hasPill: !!pill, hasCell: !!cell, className: (t.className||'') }); } catch(e){}
                        }
                    } catch(e) {}
                };
                // Defensive auto-open: in debug mode, if click reaches capture phase but our handlers didn't run,
                // attempt to open the B2B modal using nearest data-b2b-row-id. This helps diagnose/mitigate
                // other site scripts that may block propagation or swap DOM nodes.
                const autoOpen = (ev) => {
                    try {
                        const t = ev.target;
                        const pill = t.closest && t.closest('.b2b-chevrons');
                        const cell = t.closest && t.closest('.b2b-depth-cell');
                        const el = pill || cell;
                        if (!el) return;
                        // Prefer dataset on pill, then cell, then nearest tr
                        let rowId = el.dataset && el.dataset.b2bRowId ? el.dataset.b2bRowId : null;
                        if (!rowId) {
                            const tr = el.closest && el.closest('tr');
                            if (tr && tr.dataset && tr.dataset.b2bRowId) rowId = tr.dataset.b2bRowId;
                        }
                        if (!rowId) return;
                        // If BackToBackTool exists and openByRowId available, call it. Don't prevent other handlers.
                        if (window.BackToBackTool && typeof BackToBackTool.openByRowId === 'function') {
                            try { console.debug('[B2B] autoOpen attempt', { rowId }); } catch(e){}
                            try { BackToBackTool.openByRowId(rowId); } catch(e) { try { console.debug('[B2B] autoOpen error', e); } catch(ee){} }
                        }
                    } catch(e) {}
                };
                document.addEventListener('click', dbg, true);
                document.addEventListener('pointerdown', dbg, true);
                document.addEventListener('click', autoOpen, true);
                document.addEventListener('pointerdown', autoOpen, true);
                // Also install a delegated handler to ensure clicks on B2B pills
                // from table or accordion views open the builder regardless of
                // how the DOM was constructed by the page.
                const delegatedHandler = (ev) => {
                    try {
                        const t = ev.target;
                        const pill = t.closest && t.closest('.b2b-chevrons');
                        const cell = t.closest && t.closest('.b2b-depth-cell');
                        const el = pill || cell;
                        if (!el) return;
                        // If event came from a nested interactive element (like a button inside),
                        // allow native handling but also attempt to open B2B.
                        let rowId = el.dataset && el.dataset.b2bRowId ? el.dataset.b2bRowId : null;
                        if (!rowId) {
                            const tr = el.closest && el.closest('tr');
                            if (tr && tr.dataset && tr.dataset.b2bRowId) rowId = tr.dataset.b2bRowId;
                        }
                        if (!rowId) return;
                        if (window.BackToBackTool && typeof BackToBackTool.openByRowId === 'function') {
                            try { BackToBackTool.openByRowId(rowId); } catch(e) { /* ignore open errors */ }
                        }
                    } catch(e) {}
                };
                document.addEventListener('click', delegatedHandler, false);
                document.addEventListener('keydown', (ev) => {
                    try {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                            const t = ev.target;
                            const pill = t.closest && t.closest('.b2b-chevrons');
                            const cell = t.closest && t.closest('.b2b-depth-cell');
                            const el = pill || cell;
                            if (el) {
                                ev.preventDefault();
                                ev.stopPropagation();
                                let rowId = el.dataset && el.dataset.b2bRowId ? el.dataset.b2bRowId : null;
                                if (!rowId) {
                                    const tr = el.closest && el.closest('tr');
                                    if (tr && tr.dataset && tr.dataset.b2bRowId) rowId = tr.dataset.b2bRowId;
                                }
                                if (rowId && window.BackToBackTool && typeof BackToBackTool.openByRowId === 'function') {
                                    try { BackToBackTool.openByRowId(rowId); } catch(e) {}
                                }
                            }
                        }
                    } catch(e) {}
                }, false);
                    this._debugCaptureInstalled = true;
                } catch(e) { try { console.debug('[B2B] installGlobalDebugCapture failed', e); } catch(e){} }
        },

        openByRowId(rowId) {
            try { console.debug('[B2B] openByRowId called', { rowId, hasMap: !!this._context.rowMap.has(rowId) }); } catch(e){}
            if (!rowId) return;
            this._scheduleWithSpinner(() => {
                if (!this._context.rowMap.has(rowId)) {
                    try { console.debug('[B2B] row not found in rowMap, attempting DOM reconstruction', rowId); } catch(e){}
                    try {
                        const sel = `[data-b2b-row-id="${escapeSelector(rowId)}"]`;
                        const el = document.querySelector(sel);
                        if (el) {
                            const tr = el.closest && el.closest('tr') ? el.closest('tr') : el;
                            const sailing = {
                                __b2bRowId: rowId,
                                shipCode: tr.dataset ? tr.dataset.shipCode : (el.dataset ? el.dataset.shipCode : ''),
                                shipName: tr.dataset ? tr.dataset.shipName : (el.dataset ? el.dataset.shipName : ''),
                                sailDate: tr.dataset ? tr.dataset.sailDate : (el.dataset ? el.dataset.sailDate : '')
                            };
                            const offer = { campaignOffer: { offerCode: (tr.dataset && tr.dataset.offerCode) ? tr.dataset.offerCode : '' } };
                            const entry = { offer, sailing };
                            this._context.rowMap.set(rowId, entry);
                            if (Array.isArray(this._context.rows)) this._context.rows.push(entry);
                            try { console.debug('[B2B] reconstructed entry from DOM', { rowId }); } catch(e){}
                        } else {
                            try { console.debug('[B2B] DOM element not found for rowId', rowId); } catch(e){}
                            return;
                        }
                    } catch(e) { try { console.debug('[B2B] DOM reconstruction error', e); } catch(e){}; return; }
                }
                try {
                    // Apply persistent highlight to the corresponding table row so the
                    // user can see which sailing was used to open the B2B tool. Keep
                    // the highlight after the B2B overlay is closed.
                    try {
                        // Remove any existing B2B-selected marker so there is at most one
                        // visible selected row at a time.
                        document.querySelectorAll('.gobo-b2b-selected').forEach(el => el.classList.remove('gobo-b2b-selected'));
                        const sel = `[data-b2b-row-id="${escapeSelector(rowId)}"]`;
                        // Add selection to all matching elements (cells and rows) so both
                        // table and accordion renderings receive the highlight.
                        try {
                            const matches = Array.from(document.querySelectorAll(sel));
                            if (matches && matches.length) {
                                matches.forEach(m => {
                                    try {
                                        // If element is a table cell, prefer adding class to its row as well
                                        if (m.closest && typeof m.closest === 'function') {
                                            const tr = m.closest('tr');
                                            if (tr) tr.classList.add('gobo-b2b-selected');
                                        }
                                        // Also add class directly to the matched element so accordion cells
                                        // or other custom markup receive styling when appropriate.
                                        m.classList.add('gobo-b2b-selected');
                                    } catch(e) {}
                                });
                            } else {
                                // Fallback: try single-element query
                                const el = document.querySelector(sel);
                                if (el) {
                                    const tr = el.closest && el.closest('tr') ? el.closest('tr') : el;
                                    tr.classList.add('gobo-b2b-selected');
                                }
                            }
                        } catch(e) {
                            try { const el = document.querySelector(sel); if (el) { const tr = el.closest && el.closest('tr') ? el.closest('tr') : el; tr.classList.add('gobo-b2b-selected'); } } catch(e2) {}
                        }
                        // persist selection across renders/overlay lifecycle
                        try { this._selectedRowId = rowId; } catch(e) { /* ignore */ }
                    } catch (e) { /* non-fatal - proceed with opening */ }
                    // Diagnostic logging: compute B2B depths and longest chain for clicked row
                    try {
                        const rows = (this._context && Array.isArray(this._context.rows)) ? this._context.rows.slice() : ((App && App.TableRenderer && App.TableRenderer.lastState && Array.isArray(App.TableRenderer.lastState.rows)) ? App.TableRenderer.lastState.rows.slice() : []);
                        let clickedIdx = -1;
                        for (let i = 0; i < rows.length; i++) {
                            const r = rows[i];
                            if (!r) continue;
                            if (r.sailing && r.sailing.__b2bRowId === rowId) { clickedIdx = i; break; }
                            if (r.rowId && String(r.rowId) === String(rowId)) { clickedIdx = i; break; }
                        }
                        const b2bOpts = { allowSideBySide: !!(this._context && this._context.allowSideBySide) };
                        // Dev diagnostic: print both table and builder chains for the clicked idx/rowId
                        try {
                            if (DEV_B2B_DEBUG && typeof B2BUtils !== 'undefined' && typeof B2BUtils.debugChainFor === 'function') {
                                try {
                                    const tableRows = (App && App.TableRenderer && App.TableRenderer.lastState && Array.isArray(App.TableRenderer.lastState.sortedOffers)) ? App.TableRenderer.lastState.sortedOffers : null;
                                    const b2bRows = (this._context && this._context.rowMap) ? Array.from(this._context.rowMap.values()) : null;
                                    if (tableRows) {
                                        const t = B2BUtils.debugChainFor({ rows: tableRows, idx: clickedIdx });
                                        console.debug && console.debug('[B2B DEV] tableRows chain', t);
                                    }
                                    if (b2bRows) {
                                        const b = B2BUtils.debugChainFor({ rows: b2bRows, idx: clickedIdx });
                                        console.debug && console.debug('[B2B DEV] b2bRows chain', b);
                                    }
                                } catch(e) { console.debug && console.debug('[B2B DEV] debugChainFor error', e); }
                            }
                        } catch(e) {}
                        try {
                            // IMPORTANT: Do NOT propagate advanced/table-level filter predicates
                            // into B2B computations. Only exclude rows that belong to Hidden
                            // Groups. Build a predicate that consults the hidden-group stores
                            // (global and state) and nothing else.
                            const ctxState = (this._context && this._context.state) || (App && App.TableRenderer && App.TableRenderer.lastState) || null;
                            b2bOpts.filterPredicate = (row) => {
                                try {
                                    if (!row) return false;
                                    const code = (row.offer && row.offer.campaignOffer && row.offer.campaignOffer.offerCode) ? String(row.offer.campaignOffer.offerCode).trim().toUpperCase() : '';
                                    const ship = (row.sailing && (row.sailing.shipCode || row.sailing.shipName)) ? String(row.sailing.shipCode || row.sailing.shipName).trim().toUpperCase() : '';
                                    const sail = (row.sailing && row.sailing.sailDate) ? String(row.sailing.sailDate).trim().slice(0,10) : '';
                                    const key = (code || '') + '|' + (ship || '') + '|' + (sail || '');
                                    const globalHidden = (typeof Filtering !== 'undefined' && Filtering._globalHiddenRowKeys instanceof Set) ? Filtering._globalHiddenRowKeys : null;
                                    const stateHidden = (ctxState && ctxState._hiddenGroupRowKeys instanceof Set) ? ctxState._hiddenGroupRowKeys : null;
                                    if ((globalHidden && globalHidden.has(key)) || (stateHidden && stateHidden.has(key))) return false;
                                    return true;
                                } catch(e) { return true; }
                            };
                        } catch(e) {}
                        let depthMap = null;
                        let longest = null;
                        try {
                            // Avoid heavy diagnostics for very large row sets unless debugging explicitly enabled
                            const doHeavyDiag = (typeof window !== 'undefined' && window.GOBO_DEBUG_ENABLED) || (Array.isArray(rows) && rows.length <= 500);
                            // The B2B tool always computes diagnostics regardless of any table-level autorun flag.
                            const autoRunB2B = true;
                            if (typeof window !== 'undefined' && window.B2BUtils && typeof window.B2BUtils.computeB2BDepth === 'function') {
                                depthMap = window.B2BUtils.computeB2BDepth(rows, b2bOpts) || new Map();
                            }
                            if (doHeavyDiag && typeof window !== 'undefined' && window.B2BUtils && typeof window.B2BUtils.computeLongestChainFromIndex === 'function') {
                                longest = window.B2BUtils.computeLongestChainFromIndex(rows, b2bOpts, clickedIdx) || [];
                            }
                        } catch(e) { if (typeof console !== 'undefined' && console.debug) console.debug('[B2B] diagnostic compute error', e); }
                        try {
                            console.groupCollapsed && console.groupCollapsed('[B2B DIAG] rowId=' + rowId + ' idx=' + clickedIdx);
                            console.log('rowsCount', rows.length);
                            console.log('clickedIdx', clickedIdx);
                            try { console.log('depthForClicked', depthMap && depthMap.get(clickedIdx)); } catch(e) {}
                            try { console.log('longestChainForClicked', longest); } catch(e) {}
                            // sample meta for first 200 rows
                            try {
                                const sample = (rows || []).slice(0, 200).map((rr, ii) => ({ idx: ii, rowId: rr && rr.sailing && rr.sailing.__b2bRowId ? rr.sailing.__b2bRowId : (rr && rr.rowId), offerCode: (rr && rr.offer && rr.offer.campaignOffer && rr.offer.campaignOffer.offerCode) ? rr.offer.campaignOffer.offerCode : '', startISO: (rr && rr.sailing && rr.sailing.sailDate) ? String(rr.sailing.sailDate).slice(0,10) : null, endISO: (rr && rr.sailing && (rr.sailing.endDate || rr.sailing.disembarkDate)) ? String(rr.sailing.endDate || rr.sailing.disembarkDate).slice(0,10) : null }));
                                console.log('metaSample', sample);
                            } catch(e) {}
                            console.groupEnd && console.groupEnd();
                        } catch(e) {}
                    } catch(e) { console.debug('[B2B] diagnostic outer error', e); }
                    this._startSession(rowId);
                } catch(e) { try { console.debug('[B2B] _startSession error', e); } catch(ee){} }
            });
        },

        _startSession(rowId) {
            this._closeOverlay();
            this._activeSession = {
                chain: [rowId],
                rootRowId: rowId,
                allowSideBySide: !!this._context.allowSideBySide,
                bannerTimeout: null,
                ui: null,
                keyHandler: null
            };
            this._renderOverlay();
        },

        _renderOverlay() {
            if (!this._activeSession) return;
            const overlay = document.createElement('div');
            overlay.className = 'b2b-visualizer-overlay';
            const modal = document.createElement('div');
            modal.className = 'b2b-visualizer-modal';

            const header = document.createElement('div');
            header.className = 'b2b-visualizer-header';
            const headText = document.createElement('div');
            const title = document.createElement('h2');
            title.className = 'b2b-visualizer-title';
            title.textContent = 'Back-to-Back Builder';
            const subtitle = document.createElement('p');
            subtitle.className = 'b2b-visualizer-subtitle';
            const rootMeta = this._getMeta(this._activeSession.rootRowId);
            const allowMsg = this._activeSession.allowSideBySide ? 'Side-by-side sailings are allowed.' : 'Side-by-side sailings are disabled.';
            subtitle.textContent = rootMeta
                ? `${rootMeta.shipName || rootMeta.shipCode || 'Ship'} - ${formatRange(rootMeta)} - ${allowMsg}`
                : allowMsg;
            headText.appendChild(title);
            headText.appendChild(subtitle);
            const closeBtn = document.createElement('button');
            closeBtn.className = 'b2b-visualizer-close';
            closeBtn.setAttribute('aria-label', 'Close Back-to-Back Builder');
            closeBtn.innerHTML = '&times;';
            closeBtn.addEventListener('click', () => this._closeOverlay());
            header.appendChild(headText);
            header.appendChild(closeBtn);
            modal.appendChild(header);

            const body = document.createElement('div');
            body.className = 'b2b-visualizer-body';

            const chainColumn = document.createElement('div');
            chainColumn.className = 'b2b-chain-column';
            const chainTitle = document.createElement('h3');
            chainTitle.className = 'b2b-section-title';
            chainTitle.innerHTML = '<span>Selected Sailings</span><small>Build your chain</small>';
            const chainCards = document.createElement('div');
            chainCards.className = 'b2b-chain-cards';
            chainColumn.appendChild(chainTitle);
            chainColumn.appendChild(chainCards);

            const optionColumn = document.createElement('div');
            optionColumn.className = 'b2b-option-column';
            const optionTitle = document.createElement('h3');
            optionTitle.className = 'b2b-section-title';
            optionTitle.innerHTML = '<span>Next Connections</span><small>Matches by port & dates</small>';
            const optionList = document.createElement('div');
            optionList.className = 'b2b-option-list';
            optionColumn.appendChild(optionTitle);
            optionColumn.appendChild(optionList);

            body.appendChild(chainColumn);
            body.appendChild(optionColumn);
            modal.appendChild(body);

            const banner = document.createElement('div');
            banner.className = 'b2b-banner';
            const statusSpan = document.createElement('span');
            statusSpan.className = 'b2b-banner-status';
            const messageSpan = document.createElement('span');
            messageSpan.className = 'b2b-banner-message';
            banner.appendChild(statusSpan);
            banner.appendChild(messageSpan);
            modal.appendChild(banner);

            const actions = document.createElement('div');
            actions.className = 'b2b-actions';
            const resetBtn = document.createElement('button');
            resetBtn.className = 'b2b-action-btn secondary';
            resetBtn.textContent = 'Back to Root';
            resetBtn.addEventListener('click', () => this._clearChain());
            const saveBtn = document.createElement('button');
            saveBtn.className = 'b2b-action-btn primary';
            saveBtn.textContent = 'Save Chain to Favorites';
            saveBtn.addEventListener('click', () => this._saveChain());
            actions.appendChild(resetBtn);
            actions.appendChild(saveBtn);
            modal.appendChild(actions);

            overlay.appendChild(modal);
            // Hide overlay until initial content is rendered to avoid showing stale/incorrect data briefly
            overlay.style.visibility = 'hidden';
            document.body.appendChild(overlay);

            // Detect platforms (like Safari on macOS) where scrollbars overlay content instead of
            // reserving layout space. Apply a fallback padding to each scrollable section.
            let _cachedScrollbarWidth = null;
            const _measureScrollbarWidth = () => {
                if (_cachedScrollbarWidth != null) return _cachedScrollbarWidth;
                try {
                    const outer = document.createElement('div');
                    outer.style.visibility = 'hidden';
                    outer.style.width = '120px';
                    outer.style.msOverflowStyle = 'scrollbar';
                    outer.style.overflow = 'scroll';
                    document.body.appendChild(outer);
                    const inner = document.createElement('div');
                    inner.style.width = '100%';
                    outer.appendChild(inner);
                    _cachedScrollbarWidth = Math.max(0, outer.offsetWidth - outer.clientWidth);
                    outer.remove();
                } catch (e) {
                    _cachedScrollbarWidth = 0;
                }
                return _cachedScrollbarWidth;
            };

            const _applyScrollbarFallback = (el) => {
                try {
                    if (!el) return;
                    const hasVScroll = Math.ceil(el.scrollHeight) - Math.ceil(el.clientHeight) > 1;
                    const reservesSpace = (el.offsetWidth - el.clientWidth) > 1;
                    if (hasVScroll && !reservesSpace) {
                        const gapPx = Math.max(12, Math.round((_measureScrollbarWidth() || 0) + 6));
                        el.style.setProperty('--b2b-scrollbar-gap', gapPx + 'px');
                        el.classList.add('b2b-scrollbar-overlap');
                    } else {
                        el.classList.remove('b2b-scrollbar-overlap');
                        el.style.removeProperty('--b2b-scrollbar-gap');
                    }
                } catch (e) {
                    /* best-effort, ignore per-element errors */
                }
            };

            const _runScrollbarDetection = () => {
                _applyScrollbarFallback(overlay);
                _applyScrollbarFallback(chainCards);
                _applyScrollbarFallback(optionList);
            };

            const keyHandler = (ev) => {
                if (ev.key === 'Escape') this._closeOverlay();
            };
            overlay.addEventListener('click', (ev) => {
                if (ev.target === overlay) this._closeOverlay();
            });
            document.addEventListener('keydown', keyHandler);

            this._activeSession.ui = {
                overlay,
                modal,
                chainCards,
                optionList,
                banner,
                statusSpan,
                messageSpan,
                saveBtn,
                resetBtn
            };

            try {
                this._activeSession.ui._runScrollbarDetection = _runScrollbarDetection;
                _runScrollbarDetection();
            } catch (e) { /* ignore */ }

            // Diagnostic helper: capture current layout metrics to help debug
            // unexpected document growth. Left enabled but guarded by DEV_B2B_DEBUG.
            this._logLayoutState = () => {
                try {
                    if (!DEV_B2B_DEBUG) return;
                    const doc = document.documentElement || document.body;
                    const overlayRect = overlay.getBoundingClientRect ? overlay.getBoundingClientRect() : { width: 0, height: 0, top: 0 };
                    const modalRect = modal.getBoundingClientRect ? modal.getBoundingClientRect() : { width: 0, height: 0, top: 0 };
                    const bodyScroll = { scrollHeight: document.body ? document.body.scrollHeight : null, clientHeight: document.body ? document.body.clientHeight : null };
                    const docScroll = { scrollHeight: doc ? doc.scrollHeight : null, clientHeight: doc ? doc.clientHeight : null };
                    const chainCardsMetrics = { scrollHeight: chainCards.scrollHeight, clientHeight: chainCards.clientHeight };
                    const optionListMetrics = { scrollHeight: optionList.scrollHeight, clientHeight: optionList.clientHeight };
                    console.debug('[B2B-LAYOUT]', {
                        bodyScroll,
                        docScroll,
                        overlayRect,
                        modalRect,
                        chainCardsMetrics,
                        optionListMetrics,
                        windowInner: { innerWidth: window.innerWidth, innerHeight: window.innerHeight }
                    });
                } catch (e) { try { console.debug('[B2B-LAYOUT] log error', e); } catch(_){} }
            };
            // Install a debounced resize handler so card heights remain normalized
            try {
                const normalize = () => {
                    try { this._normalizeOptionCardHeights(); } catch(e){}
                    try {
                        if (this._activeSession && this._activeSession.ui && typeof this._activeSession.ui._runScrollbarDetection === 'function') {
                            this._activeSession.ui._runScrollbarDetection();
                        }
                    } catch (err) { /* ignore */ }
                };
                this._activeSession.ui._b2bResizeTimer = null;
                this._activeSession.ui._b2bResizeHandler = () => {
                    try { clearTimeout(this._activeSession.ui._b2bResizeTimer); } catch(e){}
                    this._activeSession.ui._b2bResizeTimer = setTimeout(normalize, 120);
                };
                window.addEventListener('resize', this._activeSession.ui._b2bResizeHandler);
            } catch (e) { /* ignore resize handler install errors */ }
            this._activeSession.keyHandler = keyHandler;
            // Render content then reveal overlay so there is no brief flash of wrong sailing
            try {
                this._renderChain();
                this._renderOptions();
            } finally {
                try {
                    // reveal overlay and emit a diagnostic snapshot immediately and after a short delay
                    requestAnimationFrame(() => {
                        try { overlay.style.visibility = ''; } catch(e){}
                        try { this._logLayoutState && this._logLayoutState(); } catch(e){}
                        // also capture a delayed snapshot after layout settles
                        setTimeout(() => { try { this._logLayoutState && this._logLayoutState(); } catch(e){} }, 220);
                    });
                } catch (e) {
                    try { overlay.style.visibility = ''; } catch(e){}
                    try { this._logLayoutState && this._logLayoutState(); } catch(e){}
                }
            }
        },

        _getEntry(rowId) {
            return this._context && this._context.rowMap ? this._context.rowMap.get(rowId) : null;
        },

        _getMeta(rowId) {
            if (this._metaCache.has(rowId)) return this._metaCache.get(rowId);
            const entry = this._getEntry(rowId);
            if (!entry) return null;
            const itineraryRecord = lookupItineraryRecord(entry.sailing);
            const startISO = normalizeIso(entry.sailing && entry.sailing.sailDate);
            const nights = parseNights(entry, itineraryRecord);
            const explicitEnd = normalizeIso((entry.sailing && (entry.sailing.endDate || entry.sailing.disembarkDate)) || '');
            const computedEnd = (!explicitEnd && startISO && Number.isFinite(nights)) ? addDays(startISO, nights) : explicitEnd || startISO;
            const departurePort = normalizePortName(
                (entry.sailing && entry.sailing.departurePort && entry.sailing.departurePort.name)
                || (itineraryRecord && itineraryRecord.departurePortName)
            );
            const arrivalPort = normalizePortName(
                (entry.sailing && entry.sailing.arrivalPort && entry.sailing.arrivalPort.name)
                || (entry.sailing && entry.sailing.returnPort && entry.sailing.returnPort.name)
                || (itineraryRecord && (itineraryRecord.arrivalPortName || itineraryRecord.returnPortName))
                || departurePort
            );
            const destinationLabel = normalizePortName(
                (entry.sailing && entry.sailing.destinationPort && entry.sailing.destinationPort.name)
                || (entry.sailing && entry.sailing.destination && entry.sailing.destination.name)
                || (itineraryRecord && itineraryRecord.destinationName)
            );
            const timeline = buildTimeline(itineraryRecord, entry.sailing);
            const perks = getPerks(entry);
            const meta = {
                rowId,
                offerCode: safeOfferCode(entry),
                offerName: entry.offer && entry.offer.campaignOffer ? entry.offer.campaignOffer.name : '',
                shipName: (entry.sailing && entry.sailing.shipName) || (itineraryRecord && itineraryRecord.shipName) || '',
                shipCode: (entry.sailing && entry.sailing.shipCode) || (itineraryRecord && itineraryRecord.shipCode) || '',
                shipKey: ((entry.sailing && (entry.sailing.shipCode || entry.sailing.shipName)) || '').toString().trim().toLowerCase(),
                startISO,
                endISO: computedEnd,
                nights,
                embarkPort: departurePort,
                disembarkPort: arrivalPort,
                destinationLabel,
                itineraryName: (entry.sailing && entry.sailing.itineraryDescription) || (itineraryRecord && itineraryRecord.itineraryDescription) || '',
                timeline,
                perksLabel: perks,
                guestsLabel: entry.sailing && entry.sailing.isGOBO ? '1 Guest' : '2 Guests',
                roomLabel: entry.sailing && entry.sailing.roomType ? entry.sailing.roomType : '',
                entry
            };
            this._metaCache.set(rowId, meta);
            return meta;
        },

        _formatRoute(meta) {
            if (!meta) return 'Route TBA';
            const origin = normalizePortName(meta.embarkPort) || 'Embark TBA';
            const destination = normalizePortName(meta.destinationLabel);
            const returnPort = normalizePortName(meta.disembarkPort) || 'Return TBA';
            const hasMiddle = destination && destination.toLowerCase() !== origin.toLowerCase() && destination.toLowerCase() !== returnPort.toLowerCase();
            return hasMiddle ? `${origin} → ${destination} → ${returnPort}` : `${origin} → ${returnPort}`;
        },

        _renderChain() {
            if (!this._activeSession || !this._activeSession.ui) return;
            const container = this._activeSession.ui.chainCards;
            container.innerHTML = '';
            this._activeSession.chain.forEach((rowId, idx) => {
                const meta = this._getMeta(rowId);
                if (!meta) return;
                const card = document.createElement('div');
                card.className = 'b2b-chain-card' + (idx === 0 ? ' is-root' : '');
                card.dataset.rowId = rowId;
                const head = document.createElement('div');
                head.className = 'b2b-chain-step-head';
                const title = document.createElement('h4');
                    title.innerHTML = `<strong>${meta.shipName}</strong>`;
                const step = document.createElement('span');
                step.textContent = idx === 0 ? 'Root sailing' : `Leg ${idx + 1}`;
                head.appendChild(title);
                head.appendChild(step);
                card.appendChild(head);

                const metaBlock = document.createElement('div');
                metaBlock.className = 'b2b-chain-meta';
                // Only show perks when it's meaningful (not a lone dash '-')
                const perksHtml = (meta.perksLabel && String(meta.perksLabel).trim() !== '-') ? `<span>${meta.perksLabel}</span>` : '';
                // NOTE: removed short itinerary summary line (routeLabel) - redundant in this view
                metaBlock.innerHTML = `
                    <strong>${formatRange(meta)}</strong>
                    <span><strong>Offer ${meta.offerCode || 'TBA'} - ${meta.guestsLabel}${meta.roomLabel ? ` - ${meta.roomLabel}` : ''}</strong></span>
                    ${perksHtml}
                `;
                card.appendChild(metaBlock);

                if (meta.timeline && meta.timeline.length) {
                    const table = document.createElement('table');
                    table.className = 'b2b-timeline-table';
                    const tbody = document.createElement('tbody');
                    meta.timeline.forEach(item => {
                        const tr = document.createElement('tr');
                        const dayTd = document.createElement('td');
                        dayTd.className = 'b2b-timeline-day';
                        dayTd.textContent = item.day;
                        const dowTd = document.createElement('td');
                        dowTd.className = 'b2b-timeline-dow';
                        dowTd.textContent = item.dow;
                        const labelTd = document.createElement('td');
                        labelTd.className = 'b2b-timeline-label';
                        labelTd.textContent = item.label;
                        tr.appendChild(dayTd);
                        tr.appendChild(dowTd);
                        tr.appendChild(labelTd);
                        tbody.appendChild(tr);
                    });
                    table.appendChild(tbody);
                    card.appendChild(table);
                }

                // Only the last non-root sailing should show the remove button
                const isRemovable = idx > 0 && idx === (this._activeSession.chain.length - 1);
                if (isRemovable) {
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'b2b-chain-remove';
                    removeBtn.type = 'button';
                    removeBtn.setAttribute('aria-label', 'Remove sailing from chain');
                    removeBtn.textContent = 'x';
                    removeBtn.addEventListener('click', () => this._removeFromChain(rowId));
                    card.appendChild(removeBtn);
                }

                container.appendChild(card);
            });
            const canSave = this._activeSession.chain.length >= 2;
            this._activeSession.ui.saveBtn.disabled = !canSave;
            this._activeSession.ui.resetBtn.disabled = this._activeSession.chain.length <= 1;
            this._setStatusText();
            // Ensure the selected sailings viewport scrolls to show the most recently added sailing
            try { this._scrollChainToBottom(); } catch (e) { /* ignore scroll errors */ }
            try {
                if (this._activeSession && this._activeSession.ui && typeof this._activeSession.ui._runScrollbarDetection === 'function') {
                    this._activeSession.ui._runScrollbarDetection();
                }
            } catch (e) { /* ignore */ }
        },

        _scrollChainToBottom() {
            try {
                if (!this._activeSession || !this._activeSession.ui) return;
                const container = this._activeSession.ui.chainCards;
                if (!container) return;
                // Prefer smooth scrolling when available
                try {
                    const maxScrollTop = container.scrollHeight - container.clientHeight;
                    if (typeof container.scrollTo === 'function') {
                        container.scrollTo({ top: maxScrollTop >= 0 ? maxScrollTop : 0, behavior: 'smooth' });
                    } else {
                        container.scrollTop = maxScrollTop >= 0 ? maxScrollTop : 0;
                    }
                } catch (e) {
                    // Fallback assignment
                    container.scrollTop = container.scrollHeight;
                }
            } catch (e) { /* ignore */ }
        },

        _setStatusText() {
            if (!this._activeSession || !this._activeSession.ui) return;
            const depth = this._activeSession.chain.length;
            const status = `Depth: ${depth} sailing${depth === 1 ? '' : 's'} - Side-by-side ${this._activeSession.allowSideBySide ? 'Allowed' : 'Disabled'}`;
            this._activeSession.ui.statusSpan.textContent = status;
        },

        _flashMessage(text, tone) {
            if (!this._activeSession || !this._activeSession.ui) return;
            const banner = this._activeSession.ui.banner;
            const messageEl = this._activeSession.ui.messageSpan;
            banner.style.background = tone === 'success' ? '#dcfce7' : (tone === 'warn' ? '#fee2e2' : '#e2e8f0');
            banner.style.color = tone === 'success' ? '#064e3b' : (tone === 'warn' ? '#991b1b' : '#0f172a');
            messageEl.textContent = text;
            if (this._activeSession.bannerTimeout) clearTimeout(this._activeSession.bannerTimeout);
            this._activeSession.bannerTimeout = setTimeout(() => {
                messageEl.textContent = '';
                banner.style.background = '#e2e8f0';
                banner.style.color = '#0f172a';
            }, 3200);
        },

        _computeNextOptions() {
                        _dbg('_computeNextOptions rowMap keys:', Array.from(this._context.rowMap.keys()));
                        _dbg('_computeNextOptions current chain:', this._activeSession ? this._activeSession.chain : []);
            if (!this._activeSession) return [];
            const chain = this._activeSession.chain;
            const lastId = chain[chain.length - 1];
            const lastMeta = this._getMeta(lastId);
            if (!lastMeta) return [];
            const allowSideBySide = this._activeSession.allowSideBySide;
            const usedOfferCodes = new Set(chain.map(id => {
                const meta = this._getMeta(id);
                return meta && meta.offerCode ? meta.offerCode : null;
            }).filter(Boolean));
            const options = [];
            this._context.rowMap.forEach((entry, rowId) => {
                if (chain.includes(rowId)) return;
                const candidateMeta = this._getMeta(rowId);
                if (!candidateMeta) return;
                if (candidateMeta.offerCode && usedOfferCodes.has(candidateMeta.offerCode)) return;
                const linkable = this._isLinkable(lastMeta, candidateMeta, allowSideBySide);
                if (!linkable) {
                    _dbg('Not linkable: isLinkable returned false', { from: lastMeta, to: candidateMeta });
                    return;
                }
                const lag = diffDays(candidateMeta.startISO, lastMeta.endISO) || 0;
                options.push({
                    rowId,
                    meta: candidateMeta,
                    isSideBySide: lastMeta.shipKey && candidateMeta.shipKey && lastMeta.shipKey !== candidateMeta.shipKey,
                    lag
                });
            });
            // Advanced sort:
            // 1) Perfect matches: same ship, same room category, same guests as last sailing
            // 2) Same-ship options (non side-by-side) ordered by room category (best first)
            // 3) Side-by-side options ordered by room category (best first)
            // 4) Tie-breaker: startISO ascending
            try {
                const rankForCategory = (cat) => {
                    if (!cat) return 0;
                    const map = { 'DELUXE': 4, 'BALCONY': 3, 'OUTSIDE': 2, 'INTERIOR': 1 };
                    return map[String(cat).toUpperCase()] || 0;
                };
                const classify = (label) => {
                    try {
                        if (typeof window !== 'undefined' && window.RoomCategoryUtils && typeof window.RoomCategoryUtils.classifyBroad === 'function') {
                            return window.RoomCategoryUtils.classifyBroad(label);
                        }
                    } catch (e) {}
                    try {
                        // fallback to util if available in scope
                        if (typeof RoomCategoryUtils !== 'undefined' && typeof RoomCategoryUtils.classifyBroad === 'function') return RoomCategoryUtils.classifyBroad(label);
                    } catch (e) {}
                    return null;
                };
                const lastRoom = lastMeta && lastMeta.roomLabel ? String(lastMeta.roomLabel).trim() : '';
                const lastGuests = lastMeta && lastMeta.guestsLabel ? String(lastMeta.guestsLabel).trim() : '';
                const lastShipKey = lastMeta && lastMeta.shipKey ? String(lastMeta.shipKey).trim() : '';

                options.sort((a, b) => {
                    try {
                        const aMeta = a.meta || {};
                        const bMeta = b.meta || {};
                        const aRoom = aMeta.roomLabel ? String(aMeta.roomLabel).trim() : '';
                        const bRoom = bMeta.roomLabel ? String(bMeta.roomLabel).trim() : '';
                        const aGuests = aMeta.guestsLabel ? String(aMeta.guestsLabel).trim() : '';
                        const bGuests = bMeta.guestsLabel ? String(bMeta.guestsLabel).trim() : '';
                        const aShip = aMeta.shipKey ? String(aMeta.shipKey).trim() : '';
                        const bShip = bMeta.shipKey ? String(bMeta.shipKey).trim() : '';

                        const aSameRoom = lastRoom && aRoom && aRoom === lastRoom;
                        const bSameRoom = lastRoom && bRoom && bRoom === lastRoom;
                        const aSameGuests = lastGuests && aGuests && aGuests === lastGuests;
                        const bSameGuests = lastGuests && bGuests && bGuests === lastGuests;
                        const aSameShip = lastShipKey && aShip && lastShipKey === aShip && !a.isSideBySide;
                        const bSameShip = lastShipKey && bShip && lastShipKey === bShip && !b.isSideBySide;

                        const aPerfect = aSameShip && aSameRoom && aSameGuests;
                        const bPerfect = bSameShip && bSameRoom && bSameGuests;
                        if (aPerfect !== bPerfect) return aPerfect ? -1 : 1;

                        // Prefer same-ship (non side-by-side) over side-by-side
                        if (aSameShip !== bSameShip) return aSameShip ? -1 : 1;

                        // Both same-ship or both not; rank by room category if possible
                        const aCat = classify(aRoom) || classify(aMeta.roomLabel) || null;
                        const bCat = classify(bRoom) || classify(bMeta.roomLabel) || null;
                        const aRank = rankForCategory(aCat);
                        const bRank = rankForCategory(bCat);
                        if (aRank !== bRank) return bRank - aRank; // higher rank first

                        // If one is side-by-side and the other not, prefer non side-by-side (already handled by aSameShip)
                        if (a.isSideBySide !== b.isSideBySide) return a.isSideBySide ? 1 : -1;

                        // final tie-breaker: start date ascending
                        if (a.meta && b.meta && a.meta.startISO === b.meta.startISO) return 0;
                        return a.meta.startISO < b.meta.startISO ? -1 : 1;
                    } catch (e) {
                        try { if (a.meta.startISO === b.meta.startISO) return 0; } catch(e){}
                        return a.meta.startISO < b.meta.startISO ? -1 : 1;
                    }
                });
            } catch (e) {
                // fallback to date sort on error
                options.sort((a, b) => {
                    if (a.meta.startISO === b.meta.startISO) return 0;
                    return a.meta.startISO < b.meta.startISO ? -1 : 1;
                });
            }
            return options;
        },

        _computeImmediateCount(rowId, simulateAddRowId) {
            const list = this._listImmediateCandidates ? this._listImmediateCandidates(rowId, simulateAddRowId) : [];
            try {
                try { console.debug('[B2B][IMMED] immediate-count', { root: rowId, simulate: simulateAddRowId || null, immediate: list.length }); } catch(e){}
            } catch(e) {}
            return Array.isArray(list) ? list.length : 0;
        },

        _listImmediateCandidates(rowId, simulateAddRowId) {
            if (!rowId || !this._context || !this._context.rowMap) return [];
            const lastMeta = this._getMeta(rowId);
            if (!lastMeta) return [];
            const allowSideBySide = this._activeSession ? this._activeSession.allowSideBySide : this._context.allowSideBySide;
            const chain = (this._activeSession && Array.isArray(this._activeSession.chain)) ? this._activeSession.chain : [];
            const usedOfferCodes = new Set(chain.map(id => {
                const m = this._getMeta(id);
                return m && m.offerCode ? m.offerCode : null;
            }).filter(Boolean));
            if (simulateAddRowId) {
                const simMeta = this._getMeta(simulateAddRowId);
                if (simMeta && simMeta.offerCode) usedOfferCodes.add(simMeta.offerCode);
            }
            const ctxState = this._context ? this._context.state : null;
            const isVisibleRow = (r) => {
                try {
                    if (!r) return false;
                    const rowId = r.sailing && r.sailing.__b2bRowId ? r.sailing.__b2bRowId : null;
                    if (rowId && this._visibilityCache && this._visibilityCache.has(rowId)) return this._visibilityCache.get(rowId);
                    if (window.Filtering && typeof Filtering.wasRowHidden === 'function') {
                        const res = !Filtering.wasRowHidden(r, ctxState);
                        if (rowId && this._visibilityCache) this._visibilityCache.set(rowId, res);
                        return res;
                    }
                    if (window.Filtering && typeof Filtering.isRowHidden === 'function') {
                        const res = !Filtering.isRowHidden(r, ctxState);
                        if (rowId && this._visibilityCache) this._visibilityCache.set(rowId, res);
                        return res;
                    }
                    return true;
                } catch(e) { return true; }
            };
            const candidates = [];
            this._context.rowMap.forEach((entry, rId) => {
                if (rId === rowId || chain.includes(rId) || (simulateAddRowId && rId === simulateAddRowId)) return;
                if (!isVisibleRow(entry)) return;
                const candidateMeta = this._getMeta(rId);
                if (!candidateMeta) return;
                if (candidateMeta.offerCode && usedOfferCodes.has(candidateMeta.offerCode)) return;
                if (this._isLinkable(lastMeta, candidateMeta, allowSideBySide)) candidates.push(rId);
            });
            return candidates;
        },

        _isLinkable(currentMeta, nextMeta, allowSideBySide) {
            if (!(currentMeta && nextMeta)) {
                _dbg('Not linkable: missing meta', { currentMeta, nextMeta });
                return false;
            }
            if (!(currentMeta.endISO && nextMeta.startISO)) {
                _dbg('Not linkable: missing endISO/startISO', { currentMeta, nextMeta });
                return false;
            }
            const lag = diffDays(nextMeta.startISO, currentMeta.endISO);
            // Only same-day connections allowed (lag must be exactly 0)
            if (lag == null || lag !== 0) {
                _dbg('Not linkable: not same-day', { lag, currentMeta, nextMeta });
                return false;
            }
            const currentPort = (currentMeta.disembarkPort || '').toLowerCase();
            const nextPort = (nextMeta.embarkPort || nextMeta.disembarkPort || '').toLowerCase();
            if (currentPort && nextPort && currentPort !== nextPort) {
                _dbg('Not linkable: port mismatch', { currentPort, nextPort, currentMeta, nextMeta });
                return false;
            }
            if (!allowSideBySide) {
                if (currentMeta.shipKey && nextMeta.shipKey && currentMeta.shipKey !== nextMeta.shipKey) {
                    _dbg('Not linkable: ship mismatch', { currentMeta, nextMeta });
                    return false;
                }
            }
            return true;
        },

        _renderOptions() {
            if (!this._activeSession || !this._activeSession.ui) return;
            // reset diagnostic emission counter for this render and collect mismatches
            try { this._diagEmitCount = 0; } catch(e) { this._diagEmitCount = 0; }
            const diagMismatches = [];
            const list = this._activeSession.ui.optionList;
            list.innerHTML = '';
            const options = this._computeNextOptions();
            if (!options.length) {
                const empty = document.createElement('div');
                empty.className = 'b2b-empty-state';
                const suggestion = this._activeSession.allowSideBySide
                    ? ' Try enabling side-by-side connections, or pick a different starting offer.'
                    : ' Side-by-side connections are disabled. Re-enable them from the breadcrumb toggle or pick a different starting offer.';
                empty.innerHTML = `<strong>No matching sailings found</strong>${suggestion}`;
                list.appendChild(empty);
                return;
            }
            // Compute B2B depths deterministically per candidate option using the same utility that the main table uses.
            // The builder tool ignores the table-level autorun preference and always computes per-option depths.
            const autoRunB2B = true;
            let precomputed = null;
            let rowIndexById = null;
            let visibilityCache = null;
            let rows = null;
            let filterPredicate = null;
            let sessionUsedOfferCodes = null;
            try {
                if (window.B2BUtils && typeof B2BUtils.computeB2BDepth === 'function' && this._context && Array.isArray(this._context.rows)) {
                    // Use the authoritative rowMap values so indices align with rowIds
                    rows = (this._context && this._context.rowMap) ? Array.from(this._context.rowMap.values()) : (this._context.rows || []);
                    const ctxState = this._context.state || null;
                    visibilityCache = new Map();
                    this._visibilityCache = visibilityCache;
                    filterPredicate = (row) => {
                        try {
                            if (!row) return false;
                            const rowId = row.sailing && row.sailing.__b2bRowId ? row.sailing.__b2bRowId : null;
                            if (rowId && visibilityCache.has(rowId)) return visibilityCache.get(rowId);
                            let allow = true;
                            if (window.Filtering && typeof Filtering.wasRowHidden === 'function') {
                                allow = !Filtering.wasRowHidden(row, ctxState);
                            } else if (window.Filtering && typeof Filtering.isRowHidden === 'function') {
                                allow = !Filtering.isRowHidden(row, ctxState);
                            }
                            if (rowId) visibilityCache.set(rowId, allow);
                            return allow;
                        } catch (e) { return true; }
                    };

                    // Map rowId -> index for quick lookup
                    rowIndexById = new Map();
                    rows.forEach((entry, idx) => { if (entry && entry.sailing && entry.sailing.__b2bRowId) rowIndexById.set(entry.sailing.__b2bRowId, idx); });

                    // Precompute the session's used offer codes (excluded globally for the depth calculation)
                    sessionUsedOfferCodes = (this._activeSession && Array.isArray(this._activeSession.chain)) ? this._activeSession.chain.map(id => { const m = this._getMeta(id); return m && m.offerCode ? m.offerCode : null; }).filter(Boolean) : [];

                    // For each option, compute depth by seeding the computeB2BDepth with the session's used codes plus the candidate's offer code.
                    // If autorun is disabled we set `force: true` to ensure the candidate-level compute runs.
                    options.forEach(o => {
                        try {
                            const optMeta = o.meta || this._getMeta(o.rowId) || {};
                            const candidateOffer = optMeta.offerCode || null;
                            const initialUsedOfferCodes = sessionUsedOfferCodes.slice();
                            if (candidateOffer) initialUsedOfferCodes.push(candidateOffer);
                            const b2bOpts = { allowSideBySide: this._context.allowSideBySide, filterPredicate, initialUsedOfferCodes };
                            // Tool always computes depths for options; ensure compute is forced
                            b2bOpts.force = true;
                            const depthsMap = B2BUtils.computeB2BDepth(rows, b2bOpts) || new Map();
                            const idx = rowIndexById.get(o.rowId);
                            const depth = (typeof idx === 'number' && depthsMap && typeof depthsMap.has === 'function' && depthsMap.has(idx)) ? depthsMap.get(idx) : 1;
                            o.depth = (typeof depth === 'number' && Number.isFinite(depth)) ? depth : 1;
                        } catch (inner) { o.depth = 1; }
                    });
                }
            } catch (e) { /* ignore depth compute errors */ }

            // Sort options by descendant count (depth-1) descending, then by start date (asc)
            options.sort((a, b) => {
                const da = (typeof a.depth === 'number') ? Math.max(0, a.depth - 1) : 0;
                const db = (typeof b.depth === 'number') ? Math.max(0, b.depth - 1) : 0;
                if (db !== da) return db - da; // larger descendant counts first
                if (a.meta.startISO === b.meta.startISO) return 0;
                return a.meta.startISO < b.meta.startISO ? -1 : 1;
            });

            options.forEach(opt => {
                const card = document.createElement('div');
                card.className = 'b2b-option-card' + (opt.isSideBySide ? ' b2b-side-by-side' : '');
                const metaBlock = document.createElement('div');
                metaBlock.className = 'b2b-option-meta';
                // Build header with ship name and badge on same line
                const headerDiv = document.createElement('div');
                headerDiv.className = 'b2b-option-card-header';
                const shipTitle = document.createElement('strong');
                shipTitle.textContent = opt.meta.shipName || opt.meta.shipCode || 'Ship';
                const badge = document.createElement('div');
                badge.className = 'badge';
                badge.textContent = opt.isSideBySide ? 'Side-by-side' : 'Same ship';
                headerDiv.appendChild(shipTitle);
                headerDiv.appendChild(badge);

                // Compute route including intermediate regions from timeline
                let routeLabel = '';
                try {
                    const timeline = Array.isArray(opt.meta.timeline) ? opt.meta.timeline : [];
                    // Build stops with port and region parsed from label (label format: "Port, Region")
                    const stops = timeline.map(item => {
                        const lbl = item && item.label ? String(item.label) : '';
                        const parts = lbl.split(',');
                        const portName = (parts[0] || '').trim();
                        const region = (parts[1] || '').trim();
                        return { portName: portName || '', region: region || '' };
                    }).filter(s => {
                        if (!s) return false;
                        const p = (s.portName || '').toLowerCase();
                        const r = (s.region || '').toLowerCase();
                        if (p === 'cruising' || r === 'cruising') return false;
                        return Boolean(s.portName || s.region);
                    });

                    const origin = (stops[0] && stops[0].portName) || opt.meta.embarkPort || 'Embark TBA';
                    const dest = (stops[stops.length - 1] && stops[stops.length - 1].portName) || opt.meta.disembarkPort || 'Return TBA';

                    const midParts = [];
                    if (stops.length > 1) {
                        // remember last region to collapse consecutive duplicate regions
                        // start empty so origin-region does not suppress the first intermediate region
                        let lastRegion = null;
                        // iterate stops excluding first and last
                        for (let i = 1; i < stops.length - 1; i++) {
                            const stop = stops[i];
                            const prev = stops[i - 1] || {};
                            const base = stop.region || stop.portName || '';
                            const baseLower = String(base).toLowerCase();
                            if (stop.portName && prev.portName && stop.portName === prev.portName) {
                                // same port visited twice in a row -> show region (Overnight)
                                midParts.push((base) + ' (Overnight)');
                                lastRegion = baseLower;
                            } else {
                                // different port: collapse duplicate consecutive regions
                                if (base && baseLower === lastRegion) {
                                    // skip duplicate region
                                    continue;
                                }
                                midParts.push(base);
                                if (base) lastRegion = baseLower;
                            }
                        }
                    }

                    if (midParts.length) {
                        routeLabel = `${origin} → ${midParts.join(' → ')} → ${dest}`;
                    } else {
                        // No intermediate stops: if stops length === 2 we may still want to show any non-origin region
                        if (stops.length === 2) {
                            const middle = stops[1];
                            const maybeRegion = middle && middle.region ? middle.region : null;
                            if (maybeRegion && maybeRegion.toLowerCase() !== (stops[0] && stops[0].region || '').toLowerCase()) {
                                routeLabel = `${origin} → ${maybeRegion} → ${dest}`;
                            } else {
                                routeLabel = `${origin} → ${dest}`;
                            }
                        } else {
                            routeLabel = `${origin} → ${dest}`;
                        }
                    }
                } catch (e) { routeLabel = this._formatRoute(opt.meta); }

                // Offer info: show offer code, guests and room like selected cards and bold whole line
                const offerCode = opt.meta.offerCode || 'TBA';
                const roomLabel = opt.meta.roomLabel || '';
                const guestsLabel = opt.meta.guestsLabel || '';
                const offerText = `Offer ${offerCode} - ${guestsLabel}${roomLabel ? ` - ${roomLabel}` : ''}`;
                // If candidate room equals the last selected sailing's room, color green
                let offerInfo = `<strong>${offerText}</strong>`;
                try {
                    const chain = (this._activeSession && Array.isArray(this._activeSession.chain)) ? this._activeSession.chain : [];
                    const lastChainId = chain.length ? chain[chain.length - 1] : null;
                    const lastMeta = lastChainId ? this._getMeta(lastChainId) : null;
                    const lastRoom = lastMeta && lastMeta.roomLabel ? String(lastMeta.roomLabel).trim() : '';
                    const lastShipKey = lastMeta && lastMeta.shipKey ? String(lastMeta.shipKey).trim() : '';
                    const thisShipKey = opt.meta && opt.meta.shipKey ? String(opt.meta.shipKey).trim() : '';
                    const sameRoom = lastRoom && roomLabel && String(roomLabel).trim() === lastRoom;
                    const sameShip = lastShipKey && thisShipKey && lastShipKey === thisShipKey;
                    if (sameRoom && sameShip) {
                        offerInfo = `<strong><span style="color: #059669">${offerText}</span></strong>`; // green-600
                    }
                } catch (e) { /* ignore matching errors */ }

                metaBlock.innerHTML = `
                    ${headerDiv.outerHTML}
                    <span>${formatRange(opt.meta)}</span>
                    <span>${routeLabel}</span>
                    <span>${offerInfo}</span>
                `;
                const selectBtn = document.createElement('button');
                selectBtn.className = 'b2b-option-select';
                selectBtn.type = 'button';
                selectBtn.textContent = 'Add to chain';
                // Depth pill (render inside the Add button on the right)
                try {
                    // Prefer immediate next-candidate count so we show 'No more' when there are none,
                    // even if further descendants exist.
                    const immediateCount = this._computeImmediateCount(opt.rowId, opt.rowId);
                    const descendantDepth = (typeof opt.depth === 'number') ? opt.depth : (opt.meta && opt.meta.sailing && typeof opt.meta.sailing.__b2bDepth === 'number' ? opt.meta.sailing.__b2bDepth : 1);
                    try {
                        const ocode = opt.meta && opt.meta.offerCode ? opt.meta.offerCode : safeOfferCode(opt.entry || {});
                        try {
                            const flag = (Number(immediateCount) !== Number(descendantDepth)) ? '!' : '';
                            const m = opt.meta || {};
                            if (flag || (typeof window !== 'undefined' && window.GOBO_DEBUG_VERBOSE)) {
                                const sISO = m.startISO || '';
                                const eISO = m.endISO || '';
                                const sPort = (m.embarkPort || '').replace(/\s+/g,' ');
                                const ePort = (m.disembarkPort || '').replace(/\s+/g,' ');
                                const ship = m.shipKey || '';
                                const offer = m.offerCode || '';
                                // collect a compact mismatch record (no console flood)
                                diagMismatches.push({ rowId: opt.rowId, offer: offer || ocode || 'TBA', immediate: Number(immediateCount), total: Number(descendantDepth), sISO, eISO, sPort, ePort, ship });
                            }
                        } catch(e){}
                    } catch(e) {}
                    const immedList = (this._listImmediateCandidates ? this._listImmediateCandidates(opt.rowId, opt.rowId) : []);
                    // Prefer showing the total descendant depth (excluding the candidate itself)
                    // so the pill represents how many additional connections will follow if selected.
                    let childCount = Math.max(0, Number(descendantDepth) - 1);
                    // Fallback: if descendantDepth suggests no further connections but there
                    // are immediate candidates, attempt a forced per-option compute to
                    // ensure we show the real depth when autorun is disabled or precompute missed it.
                    if (childCount === 0 && Array.isArray(immedList) && immedList.length > 0) {
                        try {
                            if (window.B2BUtils && typeof B2BUtils.computeB2BDepth === 'function') {
                                const rowsLocal = rows || ((this._context && this._context.rowMap) ? Array.from(this._context.rowMap.values()) : (this._context.rows || []));
                                const ctxState = this._context.state || null;
                                const filterPredLocal = filterPredicate || ((row) => { try { if (!row) return false; if (window.Filtering && typeof Filtering.wasRowHidden === 'function') return !Filtering.wasRowHidden(row, ctxState); if (window.Filtering && typeof Filtering.isRowHidden === 'function') return !Filtering.isRowHidden(row, ctxState); return true; } catch(e){ return true; } });
                                const sessionCodes = sessionUsedOfferCodes || ((this._activeSession && Array.isArray(this._activeSession.chain)) ? this._activeSession.chain.map(id => { const m = this._getMeta(id); return m && m.offerCode ? m.offerCode : null; }).filter(Boolean) : []);
                                const optMeta = opt.meta || this._getMeta(opt.rowId) || {};
                                const candidateOffer = optMeta.offerCode || null;
                                const initialUsed = sessionCodes.slice(); if (candidateOffer) initialUsed.push(candidateOffer);
                                const b2bOpts = { allowSideBySide: this._context.allowSideBySide, filterPredicate: filterPredLocal, initialUsedOfferCodes: initialUsed, force: true };
                                const depthsMap = B2BUtils.computeB2BDepth(rowsLocal, b2bOpts) || new Map();
                                const rowIdx = (rowIndexById && rowIndexById.has(opt.rowId)) ? rowIndexById.get(opt.rowId) : null;
                                const forcedDepth = (typeof rowIdx === 'number' && depthsMap && typeof depthsMap.has === 'function' && depthsMap.has(rowIdx)) ? depthsMap.get(rowIdx) : null;
                                if (forcedDepth && Number.isFinite(forcedDepth) && forcedDepth > 1) {
                                    descendantDepth = forcedDepth;
                                    childCount = Math.max(0, Number(descendantDepth) - 1);
                                    // update stored option depth for later use
                                    try { o.depth = descendantDepth; } catch(e) {}
                                }
                            }
                        } catch(e) { /* ignore fallback errors */ }
                    }
                    let depthMarkup = null;
                    if (typeof TableRenderer !== 'undefined' && typeof TableRenderer.getB2BDepthBadgeMarkup === 'function') {
                        depthMarkup = TableRenderer.getB2BDepthBadgeMarkup(childCount);
                    } else if (typeof App !== 'undefined' && App.TableRenderer && typeof App.TableRenderer.getB2BDepthBadgeMarkup === 'function') {
                        depthMarkup = App.TableRenderer.getB2BDepthBadgeMarkup(childCount);
                    }
                    const depthDiv = document.createElement('div');
                    depthDiv.className = 'b2b-depth-pill';
                    if (childCount > 0) {
                        if (depthMarkup) {
                            depthDiv.innerHTML = depthMarkup;
                            try {
                                const innerText = depthDiv.textContent || '';
                                if (innerText.trim() === String(childCount)) depthDiv.textContent = `${childCount} more >>`;
                            } catch(e) {}
                        } else {
                            depthDiv.textContent = `${childCount} more`;
                        }
                        // Also expose descendant depth in tooltip for context
                        try { depthDiv.setAttribute('title', `${descendantDepth} total depth including descendants`); } catch(e){}
                        try { depthDiv.setAttribute('aria-label', `Additional connections ${childCount}`); } catch(e){}
                    } else {
                        // No more connections available — show explicit 'No more' pill
                        depthDiv.textContent = 'No more';
                        depthDiv.classList.add('b2b-depth-pill-empty');
                        try { depthDiv.setAttribute('aria-label', `No additional connections`); } catch(e){}
                    }
                    // If immediate list differs from descendant depth, emit compact sample of rowIds
                    try {
                        if (Number(immedList.length) !== Number(descendantDepth)) {
                            try { if (!this._diagEmitCount) this._diagEmitCount = 0; } catch(e) { this._diagEmitCount = 0; }
                            const MAX_DIAG = 6;
                            if (this._diagEmitCount < MAX_DIAG) {
                                this._diagEmitCount++;
                                const sampleImmed = immedList.slice(0,4);
                                let sampleDesc = [];
                                try {
                                    if (window.B2BUtils && typeof B2BUtils.computeB2BDepth === 'function' && this._context && Array.isArray(this._context.rows)) {
                                        const rows = this._context.rows || [];
                                        const initialUsedOfferCodes = (this._activeSession && Array.isArray(this._activeSession.chain)) ? this._activeSession.chain.map(id => { const m = this._getMeta(id); return m && m.offerCode ? m.offerCode : null; }).filter(Boolean) : [];
                                        const b2bOpts = { allowSideBySide: this._context.allowSideBySide, filterPredicate: null, initialUsedOfferCodes };
                                        const depthsMap = B2BUtils.computeB2BDepth(rows, b2bOpts) || new Map();
                                        const idxs = [];
                                        depthsMap.forEach((d, idx) => { if (d > 1) idxs.push(idx); });
                                        for (let i = 0; i < Math.min(4, idxs.length); i++) {
                                            const entry = rows[idxs[i]];
                                            if (entry && entry.sailing && entry.sailing.__b2bRowId) sampleDesc.push(entry.sailing.__b2bRowId);
                                        }
                                    }
                                } catch(e) {}
                                diagMismatches.push({ rowId: opt.rowId, immedSample: sampleImmed, descSample: sampleDesc });
                            }
                        }
                    } catch(e) {}
                    // place pill inside the select button to the right
                    selectBtn.appendChild(depthDiv);
                    // Attach direct handler; tool precomputes depths so no on-demand logic required here
                    try {
                        selectBtn.addEventListener('click', () => this._selectOption(opt.rowId), false);
                    } catch(e) { /* ignore */ }
                } catch (e) { /* ignore depth badge errors */ }
                card.appendChild(metaBlock);
                card.appendChild(selectBtn);
                list.appendChild(card);
            });
            // Emit a single-line JSON summary of any mismatches collected during this render
            try {
                if (Array.isArray(diagMismatches) && diagMismatches.length) {
                    const summary = { tag: 'B2B_MISMATCH_SUMMARY', count: diagMismatches.length, samples: diagMismatches.slice(0,6) };
                    try { console.debug(JSON.stringify(summary)); } catch(e){}
                }
            } catch(e) {}
            // Normalize card heights so cards in the same grid row share the same vertical size
            try { this._normalizeOptionCardHeights(); } catch(e) {}
            try {
                if (this._activeSession && this._activeSession.ui && typeof this._activeSession.ui._runScrollbarDetection === 'function') {
                    this._activeSession.ui._runScrollbarDetection();
                }
            } catch (e) { /* ignore */ }
        },

        _selectOption(rowId) {
            if (!this._activeSession || !rowId) return;
            if (this._activeSession.chain.includes(rowId)) {
                this._flashMessage('That sailing is already in your chain.', 'warn');
                return;
            }
            this._scheduleWithSpinner(() => {
                try { this._logLayoutState && this._logLayoutState(); } catch(e){}
                this._activeSession.chain.push(rowId);
                this._renderChain();
                try { this._scrollChainToBottom(); } catch(e) {}
                this._renderOptions();
                // Snapshot after mutation to detect what changed the document
                try { this._logLayoutState && this._logLayoutState(); } catch(e){}
                const meta = this._getMeta(rowId);
                this._flashMessage(meta ? `Added ${meta.shipName || meta.shipCode || 'sailing'}` : 'Sailing added.', 'info');
            });
        },

        _removeFromChain(rowId) {
            if (!this._activeSession) return;
            const idx = this._activeSession.chain.indexOf(rowId);
            if (idx <= 0) return; // never remove root via this path
            this._scheduleWithSpinner(() => {
                try { this._logLayoutState && this._logLayoutState(); } catch(e){}
                this._activeSession.chain.splice(idx, 1);
                this._renderChain();
                try { this._scrollChainToBottom(); } catch(e) {}
                this._renderOptions();
                try { this._logLayoutState && this._logLayoutState(); } catch(e){}
                this._flashMessage('Removed sailing from chain.', 'info');
            });
        },

        _clearChain() {
            if (!this._activeSession) return;
            this._scheduleWithSpinner(() => {
                this._activeSession.chain = [this._activeSession.rootRowId];
                this._renderChain();
                try { this._scrollChainToBottom(); } catch(e) {}
                this._renderOptions();
                this._flashMessage('Chain reset to root sailing.', 'info');
            });
        },

        _saveChain() {
            if (!this._activeSession) return;
            const chain = this._activeSession.chain;
            if (chain.length < 2) {
                this._flashMessage('Add at least one connecting sailing first.', 'warn');
                return;
            }
            if (!(window.Favorites && typeof Favorites.addFavorite === 'function')) {
                this._flashMessage('Favorites module is unavailable.', 'warn');
                return;
            }
            try { if (Favorites.ensureProfileExists) Favorites.ensureProfileExists(); } catch (e) {}
            const profileId = this._currentProfileId();
            const depth = chain.length;
            // Generate a short human-friendly chain ID to tag saved sailings
            function _generateChainId() {
                try {
                    const rootMeta = this._getMeta(chain[0]) || {};
                    // Prefer alphabetic seed from offerCode or shipName
                    let seed = (rootMeta.offerCode || rootMeta.shipName || 'B2B').toString().toUpperCase().replace(/[^A-Z]/g, '');
                    seed = (seed || 'B2B').slice(0,3).padEnd(3, 'X');
                    const num = Math.floor(Math.random() * 100); // 00-99
                    const suffix = String(num).padStart(2, '0');
                    return `${seed}-${suffix}`;
                } catch (e) { return 'B2B-00'; }
            }
            let chainId = _generateChainId.call(this);
            // Ensure chainId is unique among saved favorites (try a few times)
            try {
                if (typeof Favorites.loadProfileObject === 'function') {
                    const snap = Favorites.loadProfileObject() || { data: { offers: [] } };
                    const existingIds = new Set();
                    (snap.data.offers || []).forEach(o => {
                        (o.campaignOffer && Array.isArray(o.campaignOffer.sailings) ? o.campaignOffer.sailings : []).forEach(s => {
                            if (s && s.__b2bChainId) existingIds.add(String(s.__b2bChainId));
                        });
                    });
                    let attempts = 0;
                    while (existingIds.has(chainId) && attempts < 6) {
                        chainId = _generateChainId.call(this);
                        attempts++;
                    }
                }
            } catch(e) { /* ignore uniqueness check errors */ }
            let saved = 0;
            try {
                if (typeof Favorites.bulkAddFavorites === 'function') {
                    const items = chain.map(rowId => {
                        const entry = this._getEntry(rowId);
                        if (!entry) return null;
                        const clonedOffer = JSON.parse(JSON.stringify(entry.offer || {}));
                        const clonedSailing = Object.assign(JSON.parse(JSON.stringify(entry.sailing || {})), { __b2bDepth: depth, __b2bChainId: chainId });
                        return { offer: clonedOffer, sailing: clonedSailing };
                    }).filter(Boolean);
                    if (items.length) {
                        try {
                            if (window && window.console && window.console.debug) {
                                window.console.debug('[B2B] bulk saving favorites items', items.map(i => ({ ship: i.sailing.shipName, sailDate: i.sailing.sailDate })));
                            }
                        } catch(e){}
                        Favorites.bulkAddFavorites(items, profileId);
                        saved = items.length;
                        try {
                            if (window && window.console && window.console.debug) {
                                const snap = (typeof Favorites.loadProfileObject === 'function') ? Favorites.loadProfileObject() : null;
                                try { console.debug('[B2B] post-save favorites snapshot', { snapOffers: snap && snap.data && snap.data.offers ? snap.data.offers.length : null, snapSailings: snap && snap.data && snap.data.offers ? snap.data.offers.reduce((acc,o)=>acc + (o.campaignOffer && Array.isArray(o.campaignOffer.sailings) ? o.campaignOffer.sailings.length : 0), 0) : null }); } catch(e){}
                            }
                        } catch(e){}
                    }
                } else {
                    chain.forEach(rowId => {
                        const entry = this._getEntry(rowId);
                        if (!entry) return;
                        try {
                            const clonedOffer = JSON.parse(JSON.stringify(entry.offer || {}));
                            const clonedSailing = JSON.parse(JSON.stringify(entry.sailing || {}));
                            clonedSailing.__b2bDepth = depth;
                            Favorites.addFavorite(clonedOffer, clonedSailing, profileId);
                            saved++;
                        } catch (e) {
                            console.warn('[BackToBackTool] Unable to save favorite', e);
                        }
                    });
                }
            } catch (e) {
                console.warn('[BackToBackTool] bulk save failed, falling back', e);
            }
            if (saved) {
                this._applyDepthToDom(chain, depth, chainId);
                this._flashMessage('Saved chain to Favorites. View it under the Favorites tab.', 'success');
                setTimeout(() => this._closeOverlay(), 900);
            } else {
                this._flashMessage('Nothing was saved. Please try again.', 'warn');
            }
        },

        _applyDepthToDom(rowIds, depth, chainId) {
            const useChainId = (typeof App !== 'undefined' && App.CurrentProfile && App.CurrentProfile.key === 'goob-favorites');
            rowIds.forEach(rowId => {
                const selector = `tr[data-b2b-row-id="${escapeSelector(rowId)}"] .b2b-depth-cell`;
                document.querySelectorAll(selector).forEach(cell => {
                    try {
                        if (window.App && App.TableRenderer && typeof App.TableRenderer.updateB2BDepthCell === 'function') {
                            // Only pass chainId through when viewing Favorites
                            try {
                                App.TableRenderer.updateB2BDepthCell(cell, depth, useChainId ? chainId : null);
                                return;
                            } catch(e) {}
                            App.TableRenderer.updateB2BDepthCell(cell, depth);
                            return;
                        }
                        // Default rendering: only show chainId pill when viewing Favorites and chainId present
                        if (useChainId && chainId && cell) {
                            cell.innerHTML = '';
                            const wrapper = document.createElement('div');
                            wrapper.style.display = 'flex';
                            wrapper.style.flexDirection = 'column';
                            wrapper.style.alignItems = 'center';
                            wrapper.style.gap = '4px';
                            const idSpan = document.createElement('span');
                            idSpan.className = 'b2b-chain-id-badge';
                            idSpan.textContent = chainId;
                            idSpan.title = `Chain ID: ${chainId}`;
                            idSpan.style.fontSize = '12px';
                            idSpan.style.padding = '2px 8px';
                            idSpan.style.borderRadius = '12px';
                            try {
                                const c = (typeof TableRenderer !== 'undefined' && typeof TableRenderer.getChainColor === 'function') ? TableRenderer.getChainColor(chainId) : { background: '#eef2ff', color: '#3730a3' };
                                idSpan.style.background = c.background;
                                idSpan.style.color = c.color;
                                idSpan.style.border = '1px solid rgba(0,0,0,0.08)';
                            } catch(e) {
                                idSpan.style.background = '#eef2ff';
                                idSpan.style.color = '#3730a3';
                                idSpan.style.border = '1px solid #c7d2fe';
                            }
                            wrapper.appendChild(idSpan);
                            const depthSpan = document.createElement('span');
                            depthSpan.className = 'b2b-depth-number';
                            depthSpan.textContent = String(depth);
                            depthSpan.style.fontSize = '11px';
                            depthSpan.style.color = '#374151';
                            wrapper.appendChild(depthSpan);
                            cell.appendChild(wrapper);
                        } else if (cell) {
                            cell.textContent = String(depth);
                        }
                    } catch (e) {}
                });
            });
        },

        _normalizeOptionCardHeights() {
            // Make cards shrink to their content then set equal heights per visual row.
            // Strategy:
            // 1. Find all option cards in the current UI list.
            // 2. Clear any explicit height so they can measure natural content height.
            // 3. Group by top offset (rounded) to infer rows, compute max height per row.
            // 4. Apply the max height to all cards in that row.
            try {
                if (!this._activeSession || !this._activeSession.ui || !this._activeSession.ui.optionList) return;
                const list = this._activeSession.ui.optionList;
                const cards = Array.from(list.querySelectorAll('.b2b-option-card'));
                if (!cards.length) return;
                // Reset heights so natural measurement is possible
                cards.forEach(c => { c.style.height = ''; c.style.minHeight = ''; });
                // Force a reflow to get accurate offsets
                // eslint-disable-next-line no-unused-expressions
                list.offsetHeight;
                const rows = new Map();
                cards.forEach(c => {
                    const rect = c.getBoundingClientRect();
                    const top = Math.round(rect.top);
                    const h = Math.round(rect.height);
                    if (!rows.has(top)) rows.set(top, []);
                    rows.get(top).push({ el: c, h });
                });
                rows.forEach(group => {
                    let maxH = 0;
                    group.forEach(item => { if (item.h > maxH) maxH = item.h; });
                    // Clamp the applied height to a fraction of the viewport so cards
                    // cannot grow the modal beyond the visible area. Use 60% of
                    // the viewport height as a sensible capped value.
                    try {
                        const cap = Math.max(200, Math.round(window.innerHeight * 0.6));
                        const applied = Math.min(maxH, cap);
                        group.forEach(item => {
                            item.el.style.height = `${applied}px`;
                            item.el.style.minHeight = `${applied}px`;
                        });
                    } catch (e) {
                        // Fallback to original behavior on error
                        group.forEach(item => { item.el.style.height = `${maxH}px`; item.el.style.minHeight = `${maxH}px`; });
                    }
                });
            } catch (e) { /* best-effort */ }
        },

        _currentProfileId() {
            try {
                if (window.App && App.CurrentProfile && App.CurrentProfile.state && App.CurrentProfile.state.profileId != null) {
                    return App.CurrentProfile.state.profileId;
                }
            } catch (e) {}
            return null;
        },

        _closeOverlay() {
            if (!this._activeSession) return;
            if (this._activeSession.bannerTimeout) {
                clearTimeout(this._activeSession.bannerTimeout);
                this._activeSession.bannerTimeout = null;
            }
            if (this._activeSession.keyHandler) {
                document.removeEventListener('keydown', this._activeSession.keyHandler);
            }
            try {
                if (this._activeSession.ui) {
                    if (this._activeSession.ui._b2bResizeHandler) {
                        try { window.removeEventListener('resize', this._activeSession.ui._b2bResizeHandler); } catch(e){}
                        try { clearTimeout(this._activeSession.ui._b2bResizeTimer); } catch(e){}
                    }
                    if (this._activeSession.ui.overlay) this._activeSession.ui.overlay.remove();
                }
            } catch(e) { try { if (this._activeSession.ui && this._activeSession.ui.overlay) this._activeSession.ui.overlay.remove(); } catch(ee){} }
            this._activeSession = null;
        }
    };

    window.BackToBackTool = BackToBackTool;
    // Auto-install capture-phase debug helpers when debug enabled
    try { BackToBackTool._installGlobalDebugCapture(); } catch(e) { /* ignore */ }
})();
