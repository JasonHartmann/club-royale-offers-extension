// Advanced Search feature module extracted from breadcrumbs.js
// Responsible for state management, predicate rendering, persistence, and panel scaffold.

const AdvancedSearch = {
    // Debug flag (set AdvancedSearch._debug = true or window.ADV_SEARCH_DEBUG = true to enable)
    _debug: true,
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
            if (!state || !state.selectedProfileKey) return;
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
                    }))
            };
            const key = this.storageKey(state.selectedProfileKey);
            sessionStorage.setItem(key, JSON.stringify(payload));
        } catch (e) { /* ignore persistence errors */
        }
    },
    restorePredicates(state) {
        try {
            if (!state || !state.selectedProfileKey) return;
            if (!state.advancedSearch || !state.advancedSearch.enabled) return; // only when panel enabled
            state._advRestoredProfiles = state._advRestoredProfiles || new Set();
            if (state._advRestoredProfiles.has(state.selectedProfileKey)) return; // already restored
            const key = this.storageKey(state.selectedProfileKey);
            const raw = sessionStorage.getItem(key);
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
            const allowedOps = new Set(['in', 'not in', 'contains', 'not contains']);
            state.advancedSearch.predicates = (Array.isArray(parsed.predicates) ? parsed.predicates
                .filter(p => p && p.fieldKey && p.operator)
                .map(p => {
                    let op = (p.operator || '').toLowerCase();
                    if (op === 'starts with') op = 'contains';
                    return {
                        id: p.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
                        fieldKey: p.fieldKey,
                        operator: op,
                        values: Array.isArray(p.values) ? p.values.slice() : [],
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
    getCachedFieldValues(fieldKey, state) {
        try {
            if (!fieldKey) return [];
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
            const cacheKey = [state.selectedProfileKey || 'default', fieldKey, originalLen, 'vis', visibleLen, committedSig].join('|');
            state._advFieldCache = state._advFieldCache || {};
            if (state._advFieldCache[cacheKey]) return state._advFieldCache[cacheKey];
            let source;
            try {
                const committedOnly = {...state, _advPreviewPredicateId: null};
                const base = state.fullOriginalOffers || state.originalOffers || [];
                source = Filtering.applyAdvancedSearch(base, committedOnly);
            } catch (e) { /* fallback below */
            }
            if (!source || !Array.isArray(source) || !source.length) {
                source = Array.isArray(state.sortedOffers) && state.sortedOffers.length ? state.sortedOffers : (Array.isArray(state.originalOffers) && state.originalOffers.length ? state.originalOffers : (state.fullOriginalOffers || []));
            }
            const set = new Set();
            source.forEach(w => {
                try {
                    const raw = Filtering.getOfferColumnValue(w.offer, w.sailing, fieldKey);
                    if (raw == null) return;
                    const norm = Filtering.normalizePredicateValue(raw, fieldKey);
                    if (!norm) return;
                    // Use original (raw) casing for display, but dedupe by normalized form
                    // If an equivalent (case-insensitive) already present, skip adding duplicate display variant
                    if (![...set].some(existing => Filtering.normalizePredicateValue(existing, fieldKey) === norm)) {
                        set.add(raw);
                    }
                } catch (e) { /* ignore row errors */ }
            });
            let arr;
            if (fieldKey === 'departureDayOfWeek') {
                // Natural week ordering instead of default alphabetical
                const weekOrder = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                const present = new Set(Array.from(set));
                arr = weekOrder.filter(d => present.has(d));
                // Any unexpected tokens (e.g., '-') appended at end, stable alphabetical for those only
                const extras = Array.from(present).filter(v => !weekOrder.includes(v));
                if (extras.length) arr = arr.concat(extras.sort((a,b)=>a.localeCompare(b)));
            } else {
                arr = Array.from(set).sort((a, b) => a.localeCompare(b));
            }
            state._advFieldCache[cacheKey] = arr;
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
    renderPredicateValueChips(box, pred, state) {
        const chipsWrap = document.createElement('div');
        chipsWrap.className = 'adv-value-chips'; // styling handled in CSS
        // removed inline flex styles
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
                e.stopPropagation(); // prevent parent chip or box click from triggering edit mode
                const idx = pred.values.indexOf(val);
                if (idx !== -1) pred.values.splice(idx, 1);
                pred.values = pred.values.slice();
                if (pred.complete) {
                    if (!pred.values.length) pred.complete = false; // becomes editable if all values removed
                    // Committed predicate changed: refresh with spinner
                    this.lightRefresh(state, { showSpinner: true });
                } else {
                    // Only update highlight; no table refresh
                    this.schedulePreview(state, pred, true);
                }
                AdvancedSearch.renderPredicates(state);
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
            let advOnly = [];
            try { advOnly = (App.FilterUtils && typeof App.FilterUtils.getAdvancedOnlyFields === 'function') ? App.FilterUtils.getAdvancedOnlyFields() : []; } catch (e) { advOnly = []; }
            if (!Array.isArray(advOnly)) advOnly = [];
            const headerKeysSet = new Set(headerFields.map(h => h.key));
            const advFiltered = advOnly.filter(f => f && f.key && f.label && !headerKeysSet.has(f.key));
            const allFields = headerFields.concat(advFiltered);
            const allowedOperators = ['in', 'not in', 'contains', 'not contains'];
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
                        allowedOperators.forEach(op => {
                            const o = document.createElement('option');
                            o.value = op; o.textContent = op; opSelect.appendChild(o);
                        });
                        opSelect.addEventListener('change', () => {
                            const raw = (opSelect.value || '').toLowerCase();
                            if (allowedOperators.includes(raw)) {
                                pred.operator = raw;
                                state._advFocusPredicateId = pred.id;
                                this.renderPredicates(state);
                            }
                        });
                        box.appendChild(opSelect);
                    } else if (!pred.complete && pred.operator) {
                        if (pred.operator === 'in' || pred.operator === 'not in') {
                            const selectWrap = document.createElement('div'); selectWrap.className = 'adv-stack-col';
                            const sel = document.createElement('select'); sel.multiple = true; sel.size = 6; sel.className = 'adv-values-multiselect';
                            const values = this.getCachedFieldValues(pred.fieldKey, state) || [];
                            const alreadySelected = new Set(pred.values.map(v => Filtering.normalizePredicateValue(v, pred.fieldKey)));
                            const CHUNK_SYNC_THRESHOLD = 250, CHUNK_SIZE = 300;
                            if (values.length <= CHUNK_SYNC_THRESHOLD) {
                                values.forEach(v => { const opt = document.createElement('option'); opt.value = v; opt.textContent = v; opt.selected = alreadySelected.has(v); sel.appendChild(opt); });
                            } else {
                                sel.classList.add('loading'); let idx = 0;
                                const addChunk = () => {
                                    if (!sel.isConnected) return; const start = performance.now(); const frag = document.createDocumentFragment(); let added = 0;
                                    while (idx < values.length && added < CHUNK_SIZE) { const v = values[idx++]; const opt = document.createElement('option'); opt.value = v; opt.textContent = v; opt.selected = alreadySelected.has(v); frag.appendChild(opt); added++; if (performance.now() - start > 12) break; }
                                    sel.appendChild(frag);
                                    if (idx < values.length) { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(addChunk); else setTimeout(addChunk, 0); } else sel.classList.remove('loading');
                                }; (typeof requestAnimationFrame === 'function') ? requestAnimationFrame(addChunk) : setTimeout(addChunk,0);
                            }
                            sel.addEventListener('change', () => { const chosen = Array.from(sel.selectedOptions).map(o => Filtering.normalizePredicateValue(o.value, pred.fieldKey)); pred.values = Array.from(new Set(chosen)); this.schedulePreview(state, pred); this.renderPredicates(state); });
                            sel.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (pred.values && pred.values.length) this.attemptCommitPredicate(pred, state); } else if (e.key === 'Escape') { e.preventDefault(); this.renderPredicates(state); } else if (e.key === 'Tab' && pred.values && pred.values.length) { this.attemptCommitPredicate(pred, state); } });
                            selectWrap.appendChild(sel);
                            const help = document.createElement('div'); help.className = 'adv-help-text';
                            try { const isMac = /Mac/i.test(navigator.platform || ''); const modKey = isMac ? 'Cmd' : 'Ctrl'; help.textContent = `Select one or more exact values. Use ${modKey}+Click to select or deselect multiple.`; } catch(e){ help.textContent = 'Select one or more exact values. Use Ctrl+Click to select or deselect multiple.'; }
                            selectWrap.appendChild(help); box.appendChild(selectWrap);
                        } else if (pred.operator === 'contains' || pred.operator === 'not contains') {
                            const tokenWrap = document.createElement('div'); tokenWrap.className = 'adv-stack-col';
                            const input = document.createElement('input'); input.type = 'text'; input.placeholder = 'Enter substring & press Enter';
                            const addToken = (raw) => { const norm = Filtering.normalizePredicateValue(raw, pred.fieldKey); if (!norm) return; if (!pred.values.includes(norm)) pred.values.push(norm); input.value=''; this.schedulePreview(state, pred); this.renderPredicates(state); };
                            input.addEventListener('keydown', (e) => { if (e.key==='Enter') { if (input.value.trim()) { e.preventDefault(); addToken(input.value); } else if (pred.values && pred.values.length) { e.preventDefault(); this.attemptCommitPredicate(pred,state); } } else if (e.key===',') { e.preventDefault(); addToken(input.value); } else if (e.key==='Escape') { e.preventDefault(); input.value=''; } else if (e.key==='Tab') { if (!input.value.trim() && pred.values && pred.values.length) this.attemptCommitPredicate(pred,state); } else { this.schedulePreview(state,pred); } });
                            input.addEventListener('input', () => this.schedulePreview(state,pred));
                            tokenWrap.appendChild(input);
                            const help = document.createElement('div'); help.className='adv-help-text'; help.textContent = (pred.operator==='contains'?'Add substrings; any match passes.':'Add substrings; none must appear.'); tokenWrap.appendChild(help);
                            box.appendChild(tokenWrap); setTimeout(()=>{ try{ input.focus(); }catch(e){} },0);
                        }
                        if (pred.values && pred.values.length) this.renderPredicateValueChips(box, pred, state); else { const placeholder = document.createElement('span'); placeholder.textContent='No values selected'; placeholder.className='adv-placeholder'; box.appendChild(placeholder); }
                        const commitBtn = document.createElement('button'); commitBtn.type='button'; commitBtn.textContent='\u2713'; commitBtn.title='Commit filter'; commitBtn.disabled = !(pred.values && pred.values.length); commitBtn.className='adv-commit-btn'; commitBtn.addEventListener('click', () => this.attemptCommitPredicate(pred,state)); box.appendChild(commitBtn);
                    } else if (pred.complete) {
                        const summary = document.createElement('span'); summary.textContent = pred.operator; summary.className='adv-summary'; box.appendChild(summary); this.renderPredicateValueChips(box,pred,state);
                    }
                    const del = document.createElement('button'); del.type='button'; del.textContent='\u2716'; del.setAttribute('aria-label','Delete filter'); del.className='adv-delete-btn'; del.addEventListener('click', (e) => { e.stopPropagation(); const idx = state.advancedSearch.predicates.findIndex(p=>p.id===pred.id); if (idx!==-1) state.advancedSearch.predicates.splice(idx,1); if (state._advPreviewPredicateId===pred.id){ state._advPreviewPredicateId=null; if(state._advPreviewTimer){ clearTimeout(state._advPreviewTimer); delete state._advPreviewTimer; } } const nextIncomplete = state.advancedSearch.predicates.find(p=>!p.complete); if (nextIncomplete) this.schedulePreview(state,nextIncomplete); try{ this.lightRefresh(state,{showSpinner:true}); }catch(e){} try{ this.renderPredicates(state);}catch(e){} if (state.advancedSearch.enabled && state.advancedSearch.predicates.length===0){ setTimeout(()=>{ try{ const sel = state.advancedSearchPanel?.querySelector('select.adv-add-field-select'); if (sel) sel.focus(); }catch(err){} },0);} this.debouncedPersist(state); }); box.appendChild(del);
                    body.appendChild(box); renderedAny = true;
                } catch(perr){ console.warn('[AdvancedSearch] predicate render error', perr); }
            });
            const hasIncomplete = predicates.some(p => !p.complete);
            if (state.advancedSearch.enabled) {
                const addWrapper = document.createElement('div'); addWrapper.className='adv-add-field-wrapper';
                const select = document.createElement('select'); select.className='adv-add-field-select';
                const defaultOpt = document.createElement('option'); defaultOpt.value=''; defaultOpt.textContent='Add Field…'; select.appendChild(defaultOpt);
                allFields.filter(h=>h.key!=='favorite').forEach(h => { const opt=document.createElement('option'); opt.value=h.key; opt.textContent=h.label; select.appendChild(opt); });
                if (hasIncomplete) { select.disabled=true; select.title='Finish current filter to add another field'; select.setAttribute('aria-disabled','true'); addWrapper.classList.add('adv-add-disabled'); } else { select.removeAttribute('aria-disabled'); }
                select.addEventListener('change', () => { if (select.disabled) return; const val = select.value; if(!val) return; if (state.advancedSearch.predicates.some(p=>!p.complete)) return; const pred = { id: Date.now().toString(36)+Math.random().toString(36).slice(2,8), fieldKey: val, operator: null, values: [], complete:false }; state.advancedSearch.predicates.push(pred); state._advFocusOperatorId = pred.id; this.renderPredicates(state); this.debouncedPersist(state); });
                addWrapper.appendChild(select); body.appendChild(addWrapper);
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
                        const fallback = document.createElement('div'); fallback.className='adv-add-field-wrapper adv-error-fallback';
                        const sel = document.createElement('select'); sel.className='adv-add-field-select';
                        const opt = document.createElement('option'); opt.value=''; opt.textContent='Add Field…'; sel.appendChild(opt);
                        sel.addEventListener('change', () => { const val = sel.value; if(!val) return; const pred = { id: Date.now().toString(36)+Math.random().toString(36).slice(2,8), fieldKey: val, operator:null, values:[], complete:false }; state.advancedSearch.predicates.push(pred); this.renderPredicates(state); this.debouncedPersist(state); });
                        fallback.appendChild(sel); body.appendChild(fallback);
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
            this._logDebug('ensureAddFieldDropdown:state', { hasSelect: !!hasSelect, boxCount, predsLen, committedCount });
            if (committedCount && boxCount === 0) {
                this._logDebug('ensureAddFieldDropdown:renderFallbackDueToNoBoxes');
                this.renderCommittedFallback(state, body);
            }
            if (panel.querySelector('select.adv-add-field-select')) {
                this._logDebug('ensureAddFieldDropdown:selectAlreadyPresent');
                return;
            }
            // Build field list only if we are enabled and no incomplete predicates blocking
            const hasIncomplete = state.advancedSearch.predicates.some(p => !p.complete);
            const headerFields = (state.headers || []).filter(h => h && h.key && h.label);
            let advOnly = [];
            try { advOnly = (App.FilterUtils && typeof App.FilterUtils.getAdvancedOnlyFields === 'function') ? App.FilterUtils.getAdvancedOnlyFields() : []; } catch(e){ advOnly = []; }
            if (!Array.isArray(advOnly)) advOnly = [];
            const headerKeysSet = new Set(headerFields.map(h => h.key));
            const advFiltered = advOnly.filter(f => f && f.key && f.label && !headerKeysSet.has(f.key));
            const allFields = headerFields.concat(advFiltered).filter(f => f && f.key && f.label && f.key !== 'favorite');
            const wrapper = document.createElement('div');
            wrapper.className = 'adv-add-field-wrapper adv-recovery-wrapper';
            const sel = document.createElement('select');
            sel.className = 'adv-add-field-select';
            const opt = document.createElement('option'); opt.value=''; opt.textContent='Add Field…'; sel.appendChild(opt);
            allFields.forEach(f => { const o = document.createElement('option'); o.value=f.key; o.textContent=f.label; sel.appendChild(o); });
            if (hasIncomplete) {
                sel.disabled = true; sel.title = 'Finish current filter to add another field'; wrapper.classList.add('adv-add-disabled'); sel.setAttribute('aria-disabled','true');
            }
            sel.addEventListener('change', () => {
                if (sel.disabled) return; const val = sel.value; if(!val) return; if (state.advancedSearch.predicates.some(p=>!p.complete)) return;
                const pred = { id: Date.now().toString(36)+Math.random().toString(36).slice(2,8), fieldKey: val, operator: null, values: [], complete:false };
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
    _attachRenderCompleteHookOnce() {
        if (AdvancedSearch._renderCompleteHookAttached) return;
        try {
            document.addEventListener('tableRenderComplete', () => {
                try {
                    const state = App?.TableRenderer?.lastState;
                    if (!state || !state.advancedSearch || !state.advancedSearch.enabled) return;
                    const panel = state.advancedSearchPanel || document.getElementById('advanced-search-panel');
                    if (!panel) return;
                    const dropdownPresent = !!panel.querySelector('select.adv-add-field-select');
                    const headerCount = Array.isArray(state.headers) ? state.headers.filter(h=>h && h.key && h.label).length : 0;
                    AdvancedSearch._logDebug('renderCompleteHook:event', { dropdownPresent, headerCount });
                    if (!dropdownPresent) {
                        AdvancedSearch.renderPredicates(state);
                        if (!panel.querySelector('select.adv-add-field-select')) AdvancedSearch.scheduleRerenderIfColumnsPending(state);
                    }
                } catch (e) { /* ignore */ }
            });
            AdvancedSearch._renderCompleteHookAttached = true;
            AdvancedSearch._logDebug('_attachRenderCompleteHookOnce:attached');
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
                try { const key = this.storageKey(state.selectedProfileKey); sessionStorage.removeItem(key); } catch(e){}
                setTimeout(() => { try { panel.querySelector('select.adv-add-field-select')?.focus(); } catch(e){} }, 0);
            });
            header.appendChild(clearBtn);
            const committedCount = state.advancedSearch.predicates.filter(p=>p && p.complete).length;
            if (committedCount) {
                const badge = document.createElement('span'); badge.className='adv-badge'; badge.textContent = committedCount + ' active'; header.appendChild(badge);
            }
            state.advancedSearchPanel = panel;
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
    }
};
// Attach render completion hook early
try { AdvancedSearch._attachRenderCompleteHookOnce(); } catch(e) { /* ignore */ }
try { if (typeof window !== 'undefined' && window.location && window.location.search && /[?&]advdbg=1/.test(window.location.search)) { AdvancedSearch._debug = true; console.info('[AdvancedSearch] Debug auto-enabled via advdbg=1 query param'); } } catch(e) { /* ignore */ }
