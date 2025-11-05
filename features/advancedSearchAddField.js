// Advanced Search Add Field injector module
// - Provides AdvancedSearchAddField.inject(body, allFields, state)
// - Attaches to AdvancedSearch._injectAddFieldControl when available
// Matches project module pattern (top-level const exported and attached to window)

const AdvancedSearchAddField = {
    _log(...args) { try { if (window.AdvancedSearch && window.AdvancedSearch._logDebug) window.AdvancedSearch._logDebug(...args); else console.debug('[AdvAddField]', ...args); } catch(e){} },

    inject(body, allFields, state) {
        try {
            if (!body) return null;
            allFields = Array.isArray(allFields) ? allFields.slice() : [];
            // friendly mapping
            const descMap = {
                offerDate: { title: 'Received Date', hint: 'Date the offer was received' },
                expiration: { title: 'Reserve By', hint: 'Offer reserve-by / expiration date' },
                sailDate: { title: 'Sail Date', hint: 'Departure date for the sailing' },
                suiteUpgradePrice: { title: 'Suite Upgrade Price', hint: 'Estimated suite upgrade price (computed)' },
                visits: { title: 'Ports Visited', hint: 'Ports for the sailing itinerary (computed)' },
                favorite: { title: 'Favorite', hint: 'Favorite flag' }
            };

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
            popup.style.position = 'absolute'; popup.style.left = '0'; popup.style.top = 'calc(100% + 6px)'; popup.style.minWidth = '260px';
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
                        if (state && state.advancedSearch && Array.isArray(state.advancedSearch.predicates) && state.advancedSearch.predicates.some(p=>!p.complete)) return;
                        const pred = { id: Date.now().toString(36)+Math.random().toString(36).slice(2,8), fieldKey: val, operator: null, values: [], complete: false };
                        state.advancedSearch = state.advancedSearch || { enabled: true, predicates: [] };
                        state.advancedSearch.predicates.push(pred);
                        state._advFocusOperatorId = pred.id;
                        try { AdvancedSearchAddField._log('injectAddField:added', { fieldKey: val }); } catch(e){}
                        try { if (window.AdvancedSearch && typeof window.AdvancedSearch.renderPredicates === 'function') window.AdvancedSearch.renderPredicates(state); } catch(e){}
                        try { if (window.AdvancedSearch && typeof window.AdvancedSearch.debouncedPersist === 'function') window.AdvancedSearch.debouncedPersist(state); } catch(e){}
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

            const openPopup = ()=>{ popup.style.display='block'; btn.setAttribute('aria-expanded','true'); setTimeout(()=>{ const first = popup.querySelector('.adv-add-field-item'); if (first) first.focus(); }, 10); };
            const closePopup = ()=>{ popup.style.display='none'; btn.setAttribute('aria-expanded','false'); };
            let onDocClick;
            btn.addEventListener('click', (e)=>{ e.stopPropagation(); if (popup.style.display==='block'){ closePopup(); } else { openPopup(); onDocClick = (ev)=>{ if (!wrapper.contains(ev.target)) { closePopup(); document.removeEventListener('click', onDocClick); } }; document.addEventListener('click', onDocClick); } });
            btn.addEventListener('keydown', (e)=>{ if (e.key==='ArrowDown' || e.key==='Enter' || e.key===' ') { e.preventDefault(); openPopup(); } else if (e.key==='Escape') { closePopup(); } });

            const hasIncomplete = state && state.advancedSearch && Array.isArray(state.advancedSearch.predicates) && state.advancedSearch.predicates.some(p=>!p.complete);
            if (hasIncomplete) { btn.disabled = true; btn.title = 'Finish current filter to add another field'; hiddenSel.disabled = true; }

            const observer = new MutationObserver(()=>{ if (!document.body.contains(wrapper)) { try{ document.removeEventListener('click', onDocClick); } catch(e){} observer.disconnect(); } });
            observer.observe(document.body, { childList: true, subtree: true });

            return wrapper;
        } catch (e) { AdvancedSearchAddField._log('_injectAddFieldControl:error', e); return null; }
    }
};

// Expose globally
window.AdvancedSearchAddField = AdvancedSearchAddField;

// Try to attach to AdvancedSearch if it already exists, otherwise poll briefly
try {
    if (window.AdvancedSearch) {
        window.AdvancedSearch._injectAddFieldControl = AdvancedSearchAddField.inject;
        AdvancedSearchAddField._log('Attached addField injector to AdvancedSearch');
    } else {
        let attempts = 0;
        const timer = setInterval(()=>{
            attempts++;
            if (window.AdvancedSearch) {
                window.AdvancedSearch._injectAddFieldControl = AdvancedSearchAddField.inject;
                AdvancedSearchAddField._log('Attached addField injector to AdvancedSearch (delayed)');
                clearInterval(timer);
            } else if (attempts > 30) {
                clearInterval(timer);
                AdvancedSearchAddField._log('AdvancedSearch not found after polling; addField injector available as AdvancedSearchAddField.inject');
            }
        }, 200);
    }
} catch(e){ /* ignore */ }
