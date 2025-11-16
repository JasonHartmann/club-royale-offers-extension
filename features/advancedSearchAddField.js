// Advanced Search Add Field injector module
// - Provides AdvancedSearchAddField.inject(body, allFields, state)
// - Attaches to AdvancedSearch._injectAddFieldControl when available
// Matches project module pattern (top-level const exported and attached to window)

const AdvancedSearchAddField = {
    _log(...args) { try { if (window.AdvancedSearch && window.AdvancedSearch._logDebug) window.AdvancedSearch._logDebug(...args); else console.debug('[DEBUG][AdvAddField]', ...args); } catch(e){} },

    inject(body, allFields, state) {
        try {
            if (!body) return null;
            allFields = Array.isArray(allFields) ? allFields.slice() : [];
            // friendly mapping
            const descMap = {
                offerDate: { title: 'Received Date', hint: 'Date the offer was received' },
                expiration: { title: 'Reserve By', hint: 'Offer reserve-by / expiration date' },
                sailDate: { title: 'Sail Date', hint: 'Departure date for the sailing' },
                visits: { title: 'Ports Visited', hint: 'Ports for the sailing itinerary (computed)' },
                favorite: { title: 'Favorite', hint: 'Favorite flag' },
                minInteriorPrice: { title: 'Interior Price', hint: 'You Pay amount for Interior vs offer category' },
                minOutsidePrice: { title: 'Ocean View Price', hint: 'You Pay amount for Ocean View' },
                minBalconyPrice: { title: 'Balcony Price', hint: 'You Pay amount for Balcony' },
                minSuitePrice: { title: 'Suite Price', hint: 'You Pay amount for Suite' }
            };

            // Exclude removed upgrade-to-suite filters entirely from add-field options
            const removedKeys = new Set(['upgradeInteriorToSuite','upgradeOutsideToSuite','upgradeBalconyToSuite']);
            allFields = allFields.filter(f => !removedKeys.has(f.key));

            // cleanup prior wrapper
            const prev = body.querySelector('.adv-popup-wrapper'); if (prev) prev.remove();

            const headerKeys = new Set((state && Array.isArray(state.headers) ? state.headers.map(h=>h && h.key).filter(Boolean) : []));
            const computed = [], columns = [];
            allFields.forEach(f=>{ if (!f || !f.key) return; if (headerKeys.has(f.key)) columns.push(f); else computed.push(f); });

            const wrapper = document.createElement('div'); wrapper.className = 'adv-popup-wrapper';

            // hidden compatibility select
            const hiddenSel = document.createElement('select'); hiddenSel.className = 'adv-add-field-select'; hiddenSel.style.display = 'none';
            const opt = document.createElement('option'); opt.value=''; opt.textContent = 'Add Field…'; hiddenSel.appendChild(opt);
            allFields.forEach(f => { const o=document.createElement('option'); o.value = f.key; o.textContent = f.label || (descMap[f.key] && descMap[f.key].title) || f.key; hiddenSel.appendChild(o); });
            wrapper.appendChild(hiddenSel);

            const btn = document.createElement('button'); btn.type='button'; btn.className = 'adv-add-field-btn'; btn.setAttribute('aria-haspopup','menu'); btn.setAttribute('aria-expanded','false'); btn.textContent = 'Add Field…\u25BE';
            wrapper.appendChild(btn);

            const popup = document.createElement('div'); popup.className = 'adv-add-field-popup';
            popup.style.position = 'absolute'; popup.style.left = '0'; popup.style.top = 'calc(100% + 6px)'; popup.style.minWidth = '390px';
            popup.style.background = '#fff'; popup.style.border = '1px solid #e5e7eb'; popup.style.boxShadow = '0 6px 18px rgba(15,23,42,0.08)'; popup.style.padding = '8px'; popup.style.borderRadius = '8px'; popup.style.zIndex = 9999; popup.style.display = 'none';

            const buildSection = (title, items, sectionClass) => {
                const sec = document.createElement('div'); sec.className = 'adv-add-section' + (sectionClass? ' '+sectionClass : '');
                if (title) { const h = document.createElement('div'); h.className = 'adv-add-section-title'; h.textContent = title; sec.appendChild(h); }
                if (!items.length) { const none = document.createElement('div'); none.className = 'adv-add-field-item'; none.textContent = 'No fields'; none.style.opacity = '.6'; sec.appendChild(none); return sec; }
                const grid = document.createElement('div'); grid.className = 'adv-add-grid';
                items.forEach(item => {
                    const it = document.createElement('div'); it.className = 'adv-add-field-item'; it.tabIndex = 0; it.dataset.key = item.key;
                    it.textContent = (descMap[item.key] && descMap[item.key].title) || item.label || item.key;
                    const hint = (descMap[item.key] && descMap[item.key].hint) || (item.description || item.hint || item.label || item.key);
                    if (hint) it.title = hint;
                    it.addEventListener('click', (e)=>{
                        e.stopPropagation();
                        const val = item.key; if (!val) return;
                        // Decide on the authoritative state object
                        const liveState = (typeof App !== 'undefined' && App && App.TableRenderer && App.TableRenderer.lastState) ? App.TableRenderer.lastState : null;
                        const s = (state && state.advancedSearch) ? state : (liveState && liveState.advancedSearch) ? liveState : (state || liveState);
                        try { AdvancedSearchAddField._log('injectAddField:click', { fieldKey: val, injectedStateHasPreds: !!(state && state.advancedSearch && Array.isArray(state.advancedSearch.predicates)), liveStateHasPreds: !!(liveState && liveState.advancedSearch && Array.isArray(liveState.advancedSearch.predicates)) }); } catch(e){}
                        if (s && s.advancedSearch && Array.isArray(s.advancedSearch.predicates) && s.advancedSearch.predicates.some(p=>!p.complete)) {
                            try { AdvancedSearchAddField._log('injectAddField:blockedByIncomplete', { preds: s.advancedSearch.predicates }); } catch(e){}
                            return;
                        }
                        const pred = { id: Date.now().toString(36)+Math.random().toString(36).slice(2,8), fieldKey: val, operator: null, values: [], complete: false };
                        s.advancedSearch = s.advancedSearch || { enabled: true, predicates: [] };
                        s.advancedSearch.predicates.push(pred);
                        s._advFocusOperatorId = pred.id;
                        try { AdvancedSearchAddField._log('injectAddField:added', { fieldKey: val, predId: pred.id, totalPreds: s.advancedSearch.predicates.length }); } catch(e){}
                        // Trigger UI refresh (prefer window.AdvancedSearch, then AdvancedSearch, then TableRenderer/App.TableRenderer)
                        try {
                            if (window && window.AdvancedSearch && typeof window.AdvancedSearch.renderPredicates === 'function') { AdvancedSearchAddField._log('injectAddField:usingWindowAdvancedSearch.renderPredicates'); window.AdvancedSearch.renderPredicates(s); }
                            else if (typeof AdvancedSearch !== 'undefined' && typeof AdvancedSearch.renderPredicates === 'function') { AdvancedSearchAddField._log('injectAddField:usingAdvancedSearch.renderPredicates'); AdvancedSearch.renderPredicates(s); }
                            else if (typeof TableRenderer !== 'undefined' && typeof TableRenderer.updateView === 'function') { AdvancedSearchAddField._log('injectAddField:usingTableRenderer.updateView'); TableRenderer.updateView(s); }
                            else if (liveState && App && App.TableRenderer && typeof App.TableRenderer.updateView === 'function') { AdvancedSearchAddField._log('injectAddField:usingApp.TableRenderer.updateView'); App.TableRenderer.updateView(s); }
                        } catch(e){ AdvancedSearchAddField._log('injectAddField:refreshError', e); }
                        try {
                            if (window && window.AdvancedSearch && typeof window.AdvancedSearch.debouncedPersist === 'function') { window.AdvancedSearch.debouncedPersist(s); AdvancedSearchAddField._log('injectAddField:calledWindow.debouncedPersist'); }
                            else if (typeof AdvancedSearch !== 'undefined' && typeof AdvancedSearch.debouncedPersist === 'function') { AdvancedSearch.debouncedPersist(s); AdvancedSearchAddField._log('injectAddField:calledAdvancedSearch.debouncedPersist'); }
                        } catch(e){ AdvancedSearchAddField._log('injectAddField:persistError', e); }
                        closePopup();
                    });
                    it.addEventListener('keydown', (e)=>{
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); it.click(); }
                        else if (e.key === 'ArrowDown') { e.preventDefault(); const next = it.nextElementSibling || it.parentElement.firstElementChild; if (next) next.focus(); }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); const prev = it.previousElementSibling || it.parentElement.lastElementChild; if (prev) prev.focus(); }
                        else if (e.key === 'Escape') { e.preventDefault(); closePopup(); btn.focus(); }
                    });
                    grid.appendChild(it);
                });
                sec.appendChild(grid);
                return sec;
            };

            if (computed.length) popup.appendChild(buildSection('Computed Filters', computed, 'computed'));
            if (columns.length) popup.appendChild(buildSection('Table Columns', columns));

            wrapper.appendChild(popup);
            body.appendChild(wrapper);

            // Open popup; only focus first item when requested (keyboard open)
            const openPopup = (focusFirst) => {
                popup.style.display = 'block';
                btn.setAttribute('aria-expanded', 'true');
                if (focusFirst) {
                    setTimeout(() => {
                        const first = popup.querySelector('.adv-add-field-item');
                        if (first) first.focus();
                    }, 10);
                }
            };
            const closePopup = () => { popup.style.display = 'none'; btn.setAttribute('aria-expanded', 'false'); };
            let onDocClick;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (popup.style.display === 'block') { closePopup(); }
                else {
                    openPopup(false);
                    onDocClick = (ev) => { if (!wrapper.contains(ev.target)) { closePopup(); document.removeEventListener('click', onDocClick); } };
                    document.addEventListener('click', onDocClick);
                }
            });
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault(); openPopup(true);
                } else if (e.key === 'Escape') { closePopup(); }
            });

            const hasIncomplete = state && state.advancedSearch && Array.isArray(state.advancedSearch.predicates) && state.advancedSearch.predicates.some(p=>!p.complete);
            if (hasIncomplete) { btn.disabled = true; btn.title = 'Finish current filter to add another field'; hiddenSel.disabled = true; }

            const observer = new MutationObserver(()=>{ if (!document.body.contains(wrapper)) { try{ document.removeEventListener('click', onDocClick); } catch(e){} observer.disconnect(); } });
            observer.observe(document.body, { childList: true, subtree: true });

            // Ensure offerValue field appears (headers supply it; fallback injection if custom list used)
            if (typeof AdvancedSearchAddField !== 'undefined' && AdvancedSearchAddField && Array.isArray(AdvancedSearchAddField._extraFields)) {
                if (!AdvancedSearchAddField._extraFields.some(f => f && f.key === 'offerValue')) {
                    AdvancedSearchAddField._extraFields.push({ key:'offerValue', label:'Value' });
                }
            }

            return wrapper;
        } catch (e) { AdvancedSearchAddField._log('_injectAddFieldControl:error', e); return null; }
    }
};

// Expose globally
window.AdvancedSearchAddField = AdvancedSearchAddField;

// Note: Do not attach to AdvancedSearch directly. Consumers should call AdvancedSearchAddField.inject(body, allFields, state) when needed.
