// Advanced Search feature module extracted from breadcrumbs.js
// Responsible for state management, predicate rendering, persistence, and panel scaffold.

const AdvancedSearch = {
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
            try {
                parsed = JSON.parse(raw);
            } catch (e) {
                parsed = null;
            }
            if (!parsed || typeof parsed !== 'object') {
                state._advRestoredProfiles.add(state.selectedProfileKey);
                return;
            }
            const allowedOps = new Set(['in', 'not in', 'contains', 'not contains']);
            const restored = Array.isArray(parsed.predicates) ? parsed.predicates
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
                .filter(p => allowedOps.has(p.operator)) : [];
            state.advancedSearch.predicates = restored;
            state._advRestoredProfiles.add(state.selectedProfileKey);
            setTimeout(() => {
                try {
                    this.renderPredicates(state);
                } catch (e) {
                }
                try {
                    TableRenderer.updateView(state);
                } catch (e) {
                }
            }, 0);
        } catch (e) { /* ignore restore errors */
        }
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
                    set.add(norm);
                } catch (e) { /* ignore row errors */
                }
            });
            const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
            state._advFieldCache[cacheKey] = arr;
            return arr;
        } catch (e) {
            return [];
        }
    },
    renderPredicateValueChips(box, pred, state) {
        const chipsWrap = document.createElement('div');
        chipsWrap.className = 'adv-value-chips'; // styling handled in CSS
        // removed inline flex styles
        pred.values.forEach(val => {
            const chip = document.createElement('span');
            chip.className = 'adv-chip';
            chip.textContent = val;
            // removed inline chip style
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = '\u2715';
            remove.className = 'adv-chip-remove'; // CSS targets .adv-chip button already; semantic alias
            // removed inline remove button styles
            remove.addEventListener('click', () => {
                const idx = pred.values.indexOf(val);
                if (idx !== -1) pred.values.splice(idx, 1);
                pred.values = pred.values.slice();
                if (pred.complete) {
                    if (!pred.values.length) pred.complete = false;
                    // Committed predicate changed: refresh with spinner
                    this.lightRefresh(state, { showSpinner: true });
                } else {
                    // Only update highlight; no table refresh
                    this.schedulePreview(state, pred, true);
                }
                AdvancedSearch.renderPredicates(state);
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
            this.ensureState(state);
            let panel = state.advancedSearchPanel || document.getElementById('advanced-search-panel');
            if (!panel) return; // panel not yet built
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
            try {
                advOnly = (App.FilterUtils && typeof App.FilterUtils.getAdvancedOnlyFields === 'function') ? App.FilterUtils.getAdvancedOnlyFields() : [];
            } catch (e) {
                advOnly = [];
            }
            if (!Array.isArray(advOnly)) advOnly = [];
            const headerKeysSet = new Set(headerFields.map(h => h.key));
            const advFiltered = advOnly.filter(f => f && f.key && f.label && !headerKeysSet.has(f.key));
            const allFields = headerFields.concat(advFiltered);
            const allowedOperators = ['in', 'not in', 'contains', 'not contains'];
            for (let i = predicates.length - 1; i >= 0; i--) {
                if (!allFields.some(h => h.key === predicates[i].fieldKey)) predicates.splice(i, 1);
            }
            predicates.forEach(pred => {
                const fieldMeta = allFields.find(h => h.key === pred.fieldKey);
                const box = document.createElement('div');
                box.className = 'adv-predicate-box';
                if (state._advPreviewPredicateId === pred.id) box.classList.add('adv-predicate-preview');
                box.setAttribute('data-predicate-id', pred.id);
                box.tabIndex = -1;
                const label = document.createElement('span');
                label.className = 'adv-predicate-field-label';
                label.textContent = fieldMeta ? fieldMeta.label : pred.fieldKey;
                box.appendChild(label);
                if (!pred.complete && !pred.operator) {
                    const opSelect = document.createElement('select');
                    opSelect.className = 'adv-operator-select';
                    // removed inline background/color styles
                    const optPlaceholder = document.createElement('option');
                    optPlaceholder.value = '';
                    optPlaceholder.textContent = 'Select\u2026';
                    opSelect.appendChild(optPlaceholder);
                    allowedOperators.forEach(op => {
                        const o = document.createElement('option');
                        o.value = op;
                        o.textContent = op;
                        opSelect.appendChild(o);
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
                        const selectWrap = document.createElement('div');
                        selectWrap.className = 'adv-stack-col';
                        const sel = document.createElement('select');
                        sel.multiple = true;
                        sel.size = 6;
                        sel.className = 'adv-values-multiselect';
                        // removed inline background/color styles
                        const values = this.getCachedFieldValues(pred.fieldKey, state) || [];
                        const alreadySelected = new Set(pred.values.map(v => Filtering.normalizePredicateValue(v, pred.fieldKey)));
                        const CHUNK_SYNC_THRESHOLD = 250;
                        const CHUNK_SIZE = 300;
                        if (values.length <= CHUNK_SYNC_THRESHOLD) {
                            values.forEach(v => {
                                const opt = document.createElement('option');
                                opt.value = v;
                                opt.textContent = v;
                                opt.selected = alreadySelected.has(v);
                                sel.appendChild(opt);
                            });
                        } else {
                            sel.classList.add('loading');
                            let idx = 0;
                            const addChunk = () => {
                                if (!sel.isConnected) return;
                                const start = performance.now();
                                const frag = document.createDocumentFragment();
                                let added = 0;
                                while (idx < values.length && added < CHUNK_SIZE) {
                                    const v = values[idx++];
                                    const opt = document.createElement('option');
                                    opt.value = v;
                                    opt.textContent = v;
                                    opt.selected = alreadySelected.has(v);
                                    frag.appendChild(opt);
                                    added++;
                                    if (performance.now() - start > 12) break;
                                }
                                sel.appendChild(frag);
                                if (idx < values.length) {
                                    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(addChunk); else setTimeout(addChunk, 0);
                                } else {
                                    sel.classList.remove('loading');
                                }
                            };
                            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(addChunk); else setTimeout(addChunk, 0);
                        }
                        sel.addEventListener('change', () => {
                            const chosen = Array.from(sel.selectedOptions).map(o => Filtering.normalizePredicateValue(o.value, pred.fieldKey));
                            pred.values = Array.from(new Set(chosen));
                            this.schedulePreview(state, pred);
                            this.renderPredicates(state);
                        });
                        sel.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (pred.values && pred.values.length) this.attemptCommitPredicate(pred, state);
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                this.renderPredicates(state);
                            } else if (e.key === 'Tab') {
                                if (pred.values && pred.values.length) {
                                    this.attemptCommitPredicate(pred, state);
                                }
                            }
                        });
                        selectWrap.appendChild(sel);
                        const help = document.createElement('div');
                        help.className = 'adv-help-text';
                        try {
                            const isMac = /Mac/i.test(navigator.platform || '');
                            const modKey = isMac ? 'Cmd' : 'Ctrl';
                            help.textContent = `Select one or more exact values. Use ${modKey}+Click to select or deselect multiple.`;
                        } catch (e) {
                            help.textContent = 'Select one or more exact values. Use Ctrl+Click to select or deselect multiple.';
                        }
                        selectWrap.appendChild(help);
                        box.appendChild(selectWrap);
                    } else if (pred.operator === 'contains' || pred.operator === 'not contains') {
                        const tokenWrap = document.createElement('div');
                        tokenWrap.className = 'adv-stack-col';
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.placeholder = (pred.operator === 'contains' ? 'Enter substring & press Enter' : 'Enter substring & press Enter');
                        // removed inline input background/color styles
                        const addToken = (raw) => {
                            const norm = Filtering.normalizePredicateValue(raw, pred.fieldKey);
                            if (!norm) return;
                            if (!pred.values.includes(norm)) pred.values.push(norm);
                            input.value = '';
                            this.schedulePreview(state, pred);
                            this.renderPredicates(state);
                        };
                        input.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') {
                                if (input.value.trim()) {
                                    e.preventDefault();
                                    addToken(input.value);
                                } else if (pred.values && pred.values.length) {
                                    e.preventDefault();
                                    this.attemptCommitPredicate(pred, state);
                                }
                            } else if (e.key === ',') {
                                e.preventDefault();
                                addToken(input.value);
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                input.value = '';
                            } else if (e.key === 'Tab') {
                                if (!input.value.trim() && pred.values && pred.values.length) {
                                    this.attemptCommitPredicate(pred, state);
                                }
                            } else {
                                this.schedulePreview(state, pred);
                            }
                        });
                        input.addEventListener('input', () => {
                            this.schedulePreview(state, pred);
                        });
                        tokenWrap.appendChild(input);
                        const help = document.createElement('div');
                        help.className = 'adv-help-text';
                        help.textContent = (pred.operator === 'contains' ? 'Add substrings; any match passes.' : 'Add substrings; none must appear.');
                        tokenWrap.appendChild(help);
                        box.appendChild(tokenWrap);
                        setTimeout(() => { try { input.focus(); } catch(e){} }, 0);
                    }
                    if (pred.values && pred.values.length) this.renderPredicateValueChips(box, pred, state); else {
                        const placeholder = document.createElement('span');
                        placeholder.textContent = 'No values selected';
                        placeholder.className = 'adv-placeholder';
                        box.appendChild(placeholder);
                    }
                    const commitBtn = document.createElement('button');
                    commitBtn.type = 'button';
                    commitBtn.textContent = '\u2713';
                    commitBtn.title = 'Commit filter';
                    commitBtn.disabled = !(pred.values && pred.values.length);
                    commitBtn.className = 'adv-commit-btn'; // rely on CSS
                    commitBtn.addEventListener('click', () => { this.attemptCommitPredicate(pred, state); });
                    box.appendChild(commitBtn);
                } else if (pred.complete) {
                    const summary = document.createElement('span');
                    summary.textContent = pred.operator;
                    summary.className = 'adv-summary';
                    box.appendChild(summary);
                    this.renderPredicateValueChips(box, pred, state);
                }
                const del = document.createElement('button');
                del.type = 'button';
                del.textContent = '\u2716';
                del.setAttribute('aria-label', 'Delete filter');
                del.className = 'adv-delete-btn';
                del.addEventListener('click', () => {
                    const idx = state.advancedSearch.predicates.findIndex(p => p.id === pred.id);
                    if (idx !== -1) state.advancedSearch.predicates.splice(idx, 1);
                    if (state._advPreviewPredicateId === pred.id) {
                        state._advPreviewPredicateId = null;
                        if (state._advPreviewTimer) { clearTimeout(state._advPreviewTimer); delete state._advPreviewTimer; }
                    }
                    const nextIncomplete = state.advancedSearch.predicates.find(p => !p.complete);
                    if (nextIncomplete) { this.schedulePreview(state, nextIncomplete); }
                    try { this.lightRefresh(state, { showSpinner: true }); } catch(e){}
                    try { this.renderPredicates(state); } catch(e){}
                    if (state.advancedSearch.enabled && state.advancedSearch.predicates.length === 0) {
                        setTimeout(() => { try { const sel = state.advancedSearchPanel?.querySelector('select.adv-add-field-select'); if (sel) sel.focus(); } catch(e){} }, 0);
                    }
                    this.debouncedPersist(state);
                });
                box.appendChild(del);
                body.appendChild(box);
            });
            const hasIncomplete = predicates.some(p => !p.complete);
            if (state.advancedSearch.enabled && !hasIncomplete) {
                const addWrapper = document.createElement('div');
                addWrapper.className = 'adv-add-field-wrapper';
                const select = document.createElement('select');
                select.className = 'adv-add-field-select';
                const defaultOpt = document.createElement('option');
                defaultOpt.value = '';
                defaultOpt.textContent = 'Add Field\u2026';
                select.appendChild(defaultOpt);
                allFields.filter(h => h.key !== 'favorite').forEach(h => {
                    const opt = document.createElement('option');
                    opt.value = h.key;
                    opt.textContent = h.label;
                    select.appendChild(opt);
                });
                select.addEventListener('change', () => {
                    const val = select.value;
                    if (!val) return;
                    const existingIncomplete = state.advancedSearch.predicates.some(p => !p.complete);
                    if (existingIncomplete) return;
                    const pred = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), fieldKey: val, operator: null, values: [], complete: false };
                    state.advancedSearch.predicates.push(pred);
                    state._advFocusOperatorId = pred.id;
                    this.renderPredicates(state);
                    this.debouncedPersist(state);
                });
                addWrapper.appendChild(select);
                body.appendChild(addWrapper);
            }
            if (!predicates.length && state.advancedSearch.enabled) {
                const empty = document.createElement('div');
                empty.className = 'adv-search-empty-inline';
                empty.textContent = 'Select a field to start building a filter.';
                body.appendChild(empty);
            } else if (!predicates.length) {
                const disabledMsg = document.createElement('div');
                disabledMsg.className = 'adv-search-disabled-msg';
                disabledMsg.textContent = 'Advanced Search disabled \u2013 toggle above to begin.';
                body.appendChild(disabledMsg);
            }
            setTimeout(() => {
                try {
                    if (state._advFocusOperatorId) {
                        const sel = body.querySelector(`select.adv-operator-select[data-pred-id="${state._advFocusOperatorId}"]`);
                        if (sel) sel.focus();
                        delete state._advFocusOperatorId;
                    } else if (state._advFocusPredicateId) {
                        const box = body.querySelector(`.adv-predicate-box[data-predicate-id="${state._advFocusPredicateId}"]`);
                        if (box) box.focus();
                        delete state._advFocusPredicateId;
                    }
                } catch (e) {}
            }, 0);
        } catch (e) {
            console.warn('[AdvancedSearch] renderPredicates error', e);
        }
    },
    scaffoldPanel(state, container) {
        try {
            this.ensureState(state);
            let advPanel = document.getElementById('advanced-search-panel');
            if (!advPanel) {
                advPanel = document.createElement('div');
                advPanel.id = 'advanced-search-panel';
                advPanel.className = 'advanced-search-panel adv-initial-hide';
                container.appendChild(advPanel);
            } else if (advPanel.parentElement !== container) {
                advPanel.classList.add('advanced-search-panel');
                container.appendChild(advPanel);
            }
            // Replace inline display style with class toggle
            const enabled = !!(state.advancedSearch && state.advancedSearch.enabled);
            advPanel.classList.toggle('adv-hidden', !enabled);
            advPanel.classList.toggle('enabled', enabled);
            let header = advPanel.querySelector('.adv-search-header');
            if (!header) {
                header = document.createElement('div');
                header.className = 'adv-search-header';
                advPanel.appendChild(header);
            }
            header.innerHTML = '';
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'adv-search-clear-btn';
            clearBtn.textContent = 'Clear All';
            clearBtn.addEventListener('click', () => {
                const hadAny = !!state.advancedSearch.predicates.length;
                if (hadAny && !confirm('Clear all filters?')) return;
                state.advancedSearch.predicates = [];
                state._advPreviewPredicateId = null;
                if (state._advPreviewTimer) { clearTimeout(state._advPreviewTimer); delete state._advPreviewTimer; }
                state._advFieldCache = {};
                if (state.advancedSearch && state.advancedSearch.enabled !== true) state.advancedSearch.enabled = true;
                try { AdvancedSearch.lightRefresh(state, { showSpinner: true }); } catch(e){}
                AdvancedSearch.renderPredicates(state);
                AdvancedSearch.updateBadge(state);
                try { const key = AdvancedSearch.storageKey(state.selectedProfileKey); sessionStorage.removeItem(key); } catch(e){}
                setTimeout(() => { try { const sel = state.advancedSearchPanel?.querySelector('select.adv-add-field-select'); if (sel) sel.focus(); } catch(e){} }, 0);
            });
            header.appendChild(clearBtn);
            const committedCount = state.advancedSearch.predicates.filter(p => p && p.complete).length;
            if (committedCount) {
                const badge = document.createElement('span');
                badge.className = 'adv-badge';
                badge.textContent = committedCount + ' active';
                header.appendChild(badge);
            }
            this.renderPredicates(state);
            state.advancedSearchPanel = advPanel;
            setTimeout(() => { try { advPanel.classList.remove('adv-initial-hide'); } catch(e){} }, 0);
        } catch (e) { console.warn('[AdvancedSearch] panel scaffold error', e); }
    },
    updateBadge(state) {
        try {
            const btn = document.querySelector('button.adv-search-button');
            if (!btn || !state || !state.advancedSearch) return;
            const committedCount = state.advancedSearch.predicates.filter(p => p && p.complete).length;
            btn.textContent = committedCount ? `Advanced Search (${committedCount})` : 'Advanced Search';
            btn.setAttribute('aria-label', committedCount ? `Advanced Search with ${committedCount} filters` : 'Advanced Search');
            const panel = state.advancedSearchPanel || document.getElementById('advanced-search-panel');
            if (panel) {
                const header = panel.querySelector('.adv-search-header');
                if (header) {
                    let badge = header.querySelector('.adv-badge');
                    if (badge && !committedCount) badge.remove();
                    else if (!badge && committedCount) {
                        badge = document.createElement('span');
                        badge.className = 'adv-badge';
                        header.appendChild(badge);
                    }
                    if (badge) badge.textContent = committedCount + ' active';
                }
            }
        } catch (e) { /* ignore */
        }
    },
    lightRefresh(state, opts) {
        const showSpinner = !!(opts && opts.showSpinner);
        try {
            state._skipBreadcrumb = true;
            state._suppressLogs = true;
            let spinnerSessionId = null;
            let renderListener = null;
            let fallbackTimer = null;
            if (showSpinner && typeof Spinner !== 'undefined' && Spinner.showSpinner) {
                try { Spinner.showSpinner(); } catch(e) { /* ignore */ }
                spinnerSessionId = Date.now().toString(36) + Math.random().toString(36).slice(2);
                AdvancedSearch._activeSpinnerSession = spinnerSessionId;
                // Attach one-time listener for completion
                renderListener = (ev) => {
                    try {
                        // Ensure this session is still the active one
                        if (AdvancedSearch._activeSpinnerSession !== spinnerSessionId) return;
                        // Optional: match token if available
                        const evtToken = ev && ev.detail && ev.detail.token;
                        const currentToken = state && state._rowRenderToken;
                        if (evtToken && currentToken && evtToken !== currentToken) return; // different render cycle
                        if (typeof Spinner !== 'undefined' && Spinner.hideSpinner) {
                            Spinner.hideSpinner();
                        }
                        if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
                        document.removeEventListener('tableRenderComplete', renderListener, { capture:false });
                        if (AdvancedSearch._activeSpinnerSession === spinnerSessionId) {
                            AdvancedSearch._activeSpinnerSession = null;
                        }
                    } catch(e) { /* ignore */ }
                };
                try { document.addEventListener('tableRenderComplete', renderListener, { capture:false }); } catch(e) { /* ignore */ }
                // Fallback timeout in case event doesn't fire (token abort or error)
                fallbackTimer = setTimeout(() => {
                    try {
                        if (AdvancedSearch._activeSpinnerSession === spinnerSessionId) {
                            if (typeof Spinner !== 'undefined' && Spinner.hideSpinner) Spinner.hideSpinner();
                            AdvancedSearch._activeSpinnerSession = null;
                        }
                        if (renderListener) document.removeEventListener('tableRenderComplete', renderListener, { capture:false });
                    } catch(e) { /* ignore */ }
                }, 2000);
            }
            // Defer updateView so spinner can paint first
            setTimeout(() => {
                try {
                    TableRenderer.updateView(state);
                } catch(e) { /* ignore */ }
                // If we are not showing spinner, just update badge and cleanup
                if (!showSpinner) {
                    try { this.updateBadge(state); } catch(e) { /* ignore */ }
                    try { delete state._suppressLogs; } catch(e) { /* ignore */ }
                } else {
                    // Badge update after view; spinner hidden by event listener
                    try { this.updateBadge(state); } catch(e) { /* ignore */ }
                    try { delete state._suppressLogs; } catch(e) { /* ignore */ }
                }
            }, 0);
        } catch (e) { /* ignore */ }
    },
    debouncedPersist(state) {
        try {
            if (this._persistTimer) clearTimeout(this._persistTimer);
            this._persistTimer = setTimeout(() => {
                try {
                    this.persistPredicates(state);
                } catch (e) {
                }
            }, 500);
        } catch (e) { /* ignore */
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
            // Toggle enable flag
            state.advancedSearch.enabled = !state.advancedSearch.enabled;
            // Clear preview state when disabling so stale preview not kept
            if (!state.advancedSearch.enabled) {
                state._advPreviewPredicateId = null;
                if (state._advPreviewTimer) { clearTimeout(state._advPreviewTimer); delete state._advPreviewTimer; }
            }
            // Update button pressed state
            btn.setAttribute('aria-pressed', state.advancedSearch.enabled ? 'true' : 'false');
            btn.title = state.advancedSearch.enabled ? 'Disable Advanced Search filters' : 'Enable Advanced Search filters';
            // Refresh table (filters applied or removed)
            try { this.lightRefresh(state, { showSpinner: true }); } catch(e) { /* ignore */ }
            // Rebuild breadcrumb region so panel shows/hides appropriately
            try { Breadcrumbs.updateBreadcrumb(state.groupingStack || [], state.groupKeysStack || []); } catch(e) { /* ignore */ }
        });
        // Initial badge update
        try { this.updateBadge(state); } catch(e) { /* ignore */ }
        return btn;
    },
};
