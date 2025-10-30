// Breadcrumbs / Tabs / Hidden Groups / Advanced Search rendering module
// Extracted from TableRenderer.updateBreadcrumb for modularity.
// Responsible for rebuilding the breadcrumb container (tabs row + crumbs row + auxiliary panels).

const Breadcrumbs = {
  // Ensure advancedSearch state structure exists
  _ensureAdvancedSearchState(state) {
    if (!state.advancedSearch || typeof state.advancedSearch !== 'object') {
      state.advancedSearch = { enabled: false, predicates: [] };
    } else {
      if (!Array.isArray(state.advancedSearch.predicates)) state.advancedSearch.predicates = [];
      // masterEnabled concept removed; always applied when panel enabled
      if (typeof state.advancedSearch.masterEnabled !== 'undefined') delete state.advancedSearch.masterEnabled;
    }
    return state.advancedSearch;
  },
  _advStorageKey(profileKey){ return `advSearchPredicates::${profileKey||'default'}`; },
  _persistAdvancedPredicates(state){
    try {
      if (!state || !state.selectedProfileKey) return; if (!state.advancedSearch) return;
      const payload = {
        predicates: (state.advancedSearch.predicates||[])
          .filter(p=>p && p.fieldKey && p.operator && Array.isArray(p.values))
          .map(p=>({ id:p.id, fieldKey:p.fieldKey, operator:p.operator, values:p.values.slice(), complete: !!p.complete }))
      };
      const key = this._advStorageKey(state.selectedProfileKey);
      sessionStorage.setItem(key, JSON.stringify(payload));
    } catch(e){ /* ignore persistence errors */ }
  },
  _restoreAdvancedPredicates(state){
    try {
      if (!state || !state.selectedProfileKey) return; if (!state.advancedSearch || !state.advancedSearch.enabled) return; // only when panel enabled
      state._advRestoredProfiles = state._advRestoredProfiles || new Set();
      if (state._advRestoredProfiles.has(state.selectedProfileKey)) return; // already restored
      const key = this._advStorageKey(state.selectedProfileKey);
      const raw = sessionStorage.getItem(key);
      if (!raw) { state._advRestoredProfiles.add(state.selectedProfileKey); return; }
      let parsed; try { parsed = JSON.parse(raw); } catch(e){ parsed=null; }
      if (!parsed || typeof parsed !== 'object') { state._advRestoredProfiles.add(state.selectedProfileKey); return; }
      const allowedOps = new Set(['in','not in','contains','not contains']);
      const restored = Array.isArray(parsed.predicates) ? parsed.predicates
        .filter(p=>p && p.fieldKey && p.operator)
        .map(p=>{ let op=(p.operator||'').toLowerCase(); if (op==='starts with') op='contains'; return { id: p.id || (Date.now().toString(36)+Math.random().toString(36).slice(2,8)), fieldKey: p.fieldKey, operator: op, values: Array.isArray(p.values)? p.values.slice():[], complete: !!p.complete }; })
        .filter(p=> allowedOps.has(p.operator)) : [];
      state.advancedSearch.predicates = restored;
      state._advRestoredProfiles.add(state.selectedProfileKey);
      setTimeout(()=>{ try { this._renderAdvancedPredicates(state); } catch(e){} try { TableRenderer.updateView(state); } catch(e){} },0);
    } catch(e){ /* ignore restore errors */ }
  },
  // Build & cache distinct field values (uppercase normalized) for multi-select predicates
  _getCachedFieldValues(fieldKey, state) {
    try {
      if (!fieldKey) return [];
      const visibleLen = Array.isArray(state.sortedOffers) ? state.sortedOffers.length : 0;
      const originalLen = Array.isArray(state.fullOriginalOffers) ? state.fullOriginalOffers.length : (Array.isArray(state.originalOffers) ? state.originalOffers.length : 0);
      // Build a cache key that is STABLE during preview typing so we avoid recomputing
      // large distinct-value sets on every keystroke. Only committed predicates influence
      // available distinct values (preview predicate excluded for performance).
      let committedSig = '';
      try {
        committedSig = (state.advancedSearch?.predicates||[])
          .filter(p=>p && p.complete && p.fieldKey && p.operator && Array.isArray(p.values))
          .map(p=>`${p.fieldKey}:${p.operator}:${p.values.join(',')}`)
          .join('|');
      } catch(e){ committedSig=''; }
      const cacheKey = [state.selectedProfileKey || 'default', fieldKey, originalLen, 'vis', visibleLen, committedSig].join('|');
      state._advFieldCache = state._advFieldCache || {};
      if (state._advFieldCache[cacheKey]) return state._advFieldCache[cacheKey];
      let source;
      // Derive source from committed predicates (exclude preview) so list remains stable while typing.
      try {
        const committedOnly = { ...state, _advPreviewPredicateId: null };
        const base = state.fullOriginalOffers || state.originalOffers || [];
        source = Filtering.applyAdvancedSearch(base, committedOnly);
      } catch(e){ /* fallback below */ }
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
        } catch(e){ /* ignore row errors */ }
      });
      const arr = Array.from(set).sort((a,b)=>a.localeCompare(b));
      state._advFieldCache[cacheKey] = arr;
      return arr;
    } catch(e){ return []; }
  },
  _renderPredicateValueChips(box, pred, state) {
    const chipsWrap = document.createElement('div');
    chipsWrap.className = 'adv-value-chips';
    chipsWrap.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px;';
    pred.values.forEach(val => {
      const chip = document.createElement('span');
      chip.className = 'adv-chip';
      chip.textContent = val;
      chip.style.cssText = 'background:#e5e7eb; color:#1f2937; padding:2px 6px; border-radius:12px; font-size:11px; display:inline-flex; align-items:center; gap:4px;';
      const remove = document.createElement('button');
      remove.type='button'; remove.textContent='✕';
      remove.style.cssText='border:none; background:transparent; color:#374151; cursor:pointer; font-size:11px;';
      remove.addEventListener('click', () => {
        const idx = pred.values.indexOf(val);
        if (idx !== -1) pred.values.splice(idx,1);
        pred.values = pred.values.slice();
        if (pred.complete) {
          if (!pred.values.length) pred.complete = false;
          this._lightRefresh(state);
        } else {
          this._schedulePreview(state, pred, true);
        }
        Breadcrumbs._renderAdvancedPredicates(state);
      });
      chip.appendChild(remove);
      chipsWrap.appendChild(chip);
    });
    box.appendChild(chipsWrap);
    return chipsWrap;
  },
  _attemptCommitPredicate(pred, state) {
    if (!pred || pred.complete) return;
    if (!pred.values || !pred.values.length) return;
    pred.complete = true;
    if (state._advPreviewPredicateId === pred.id) {
      state._advPreviewPredicateId = null;
      if (state._advPreviewTimer) { clearTimeout(state._advPreviewTimer); delete state._advPreviewTimer; }
    }
    try { this._renderAdvancedPredicates(state); } catch(e){}
    this._lightRefresh(state);
    this._debouncedPersist(state);
  },
  _schedulePreview(state, pred, fromChip) {
    try {
      if (!state.advancedSearch || !state.advancedSearch.enabled) return;
      // masterEnabled flag removed
      if (!pred || pred.complete) return;
      if (!(pred.values && pred.values.length && pred.operator && pred.fieldKey)) {
        if (state._advPreviewPredicateId === pred.id) {
          state._advPreviewPredicateId = null; if (state._advPreviewTimer) { clearTimeout(state._advPreviewTimer); delete state._advPreviewTimer; }
          this._lightRefresh(state);
        }
        return;
      }
      state._advPreviewPredicateId = pred.id;
      if (state._advPreviewTimer) { clearTimeout(state._advPreviewTimer); }
      state._advPreviewTimer = setTimeout(() => {
        const still = state.advancedSearch.predicates.find(p=>p.id===pred.id && !p.complete);
        if (!still || state._advPreviewPredicateId !== pred.id) return;
        this._lightRefresh(state);
      }, fromChip ? 50 : 250);
    } catch(e){ }
  },
  _ensureStylesInjected() { /* deprecated after migration to advanced-search.css */ },
  // Render predicate boxes + Add Field control (lightweight incremental re-render)
  _renderAdvancedPredicates(state) {
    try {
      this._ensureAdvancedSearchState(state);
      let panel = state.advancedSearchPanel || document.getElementById('advanced-search-panel');
      if (!panel) return; // panel not yet built
      // removed disabled state toggling (always active when enabled)
      let body = panel.querySelector('.adv-search-body');
      if (!body) {
        body = document.createElement('div');
        body.className = 'adv-search-body';
        panel.appendChild(body);
      }
      body.innerHTML = '';
      const { predicates } = state.advancedSearch;
      const headers = (state.headers || []).filter(h => h && h.key && h.label);
      const allowedOperators = ['in','not in','contains','not contains'];
      for (let i = predicates.length -1; i>=0; i--) {
        if (!headers.some(h=>h.key===predicates[i].fieldKey)) predicates.splice(i,1);
      }
      predicates.forEach(pred => {
        const header = headers.find(h => h.key === pred.fieldKey);
        const box = document.createElement('div');
        box.className = 'adv-predicate-box';
        if (state._advPreviewPredicateId === pred.id) box.classList.add('adv-predicate-preview');
        box.setAttribute('data-predicate-id', pred.id);
        box.tabIndex = -1;
        const label = document.createElement('span');
        label.className = 'adv-predicate-field-label';
        label.textContent = header ? header.label : pred.fieldKey;
        box.appendChild(label);
        if (!pred.complete && !pred.operator) {
          const opSelect = document.createElement('select');
          opSelect.className = 'adv-operator-select';
          opSelect.setAttribute('data-pred-id', pred.id);
          const optPlaceholder = document.createElement('option'); optPlaceholder.value=''; optPlaceholder.textContent='Select…'; opSelect.appendChild(optPlaceholder);
          allowedOperators.forEach(op => { const o=document.createElement('option'); o.value=op; o.textContent=op; opSelect.appendChild(o); });
          opSelect.addEventListener('change', () => {
            const raw = (opSelect.value||'').toLowerCase();
            if (allowedOperators.includes(raw)) {
              pred.operator = raw;
              state._advFocusPredicateId = pred.id;
              this._renderAdvancedPredicates(state);
            }
          });
          box.appendChild(opSelect);
        } else if (!pred.complete && pred.operator) {
          if (pred.operator === 'in' || pred.operator === 'not in') {
            const selectWrap = document.createElement('div');
            selectWrap.className = 'adv-stack-col';
            const sel = document.createElement('select');
            sel.multiple = true; sel.size = 6; sel.className='adv-values-multiselect';
            const values = this._getCachedFieldValues(pred.fieldKey, state);
            values.forEach(v => { const opt = document.createElement('option'); opt.value = v; opt.textContent = v; opt.selected = pred.values.includes(v); sel.appendChild(opt); });
            sel.addEventListener('change', () => {
              const chosen = Array.from(sel.selectedOptions).map(o=>Filtering.normalizePredicateValue(o.value, pred.fieldKey));
              pred.values = Array.from(new Set(chosen));
              this._schedulePreview(state, pred);
              this._renderAdvancedPredicates(state);
            });
            sel.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') { e.preventDefault(); if (pred.values && pred.values.length) this._attemptCommitPredicate(pred, state); }
              else if (e.key === 'Escape') { e.preventDefault(); this._renderAdvancedPredicates(state); }
              else if (e.key === 'Tab') { if (pred.values && pred.values.length) { this._attemptCommitPredicate(pred, state); } }
            });
            selectWrap.appendChild(sel);
            const help = document.createElement('div'); help.className='adv-help-text';
            // Updated help text to instruct on multi-select using Ctrl/Cmd+Click
            try {
              const isMac = /Mac/i.test(navigator.platform || '');
              const modKey = isMac ? 'Cmd' : 'Ctrl';
              help.textContent = `Select one or more exact values. Use ${modKey}+Click to select or deselect multiple.`;
            } catch(e){ help.textContent='Select one or more exact values. Use Ctrl+Click to select or deselect multiple.'; }
            selectWrap.appendChild(help);
            box.appendChild(selectWrap);
          } else if (pred.operator === 'contains' || pred.operator === 'not contains') {
            const tokenWrap = document.createElement('div'); tokenWrap.className='adv-stack-col';
            const input = document.createElement('input'); input.type='text'; input.placeholder = (pred.operator==='contains' ? 'Enter substring & press Enter' : 'Enter substring & press Enter');
            const addToken = (raw) => { const norm = Filtering.normalizePredicateValue(raw, pred.fieldKey); if (!norm) return; if (!pred.values.includes(norm)) pred.values.push(norm); input.value=''; this._schedulePreview(state, pred); this._renderAdvancedPredicates(state); };
            input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') { if (input.value.trim()) { e.preventDefault(); addToken(input.value); } else if (pred.values && pred.values.length) { e.preventDefault(); this._attemptCommitPredicate(pred, state); } }
              else if (e.key === ',') { e.preventDefault(); addToken(input.value); }
              else if (e.key === 'Escape') { e.preventDefault(); input.value=''; }
              else if (e.key === 'Tab') { if (!input.value.trim() && pred.values && pred.values.length) { this._attemptCommitPredicate(pred, state); } }
              else { this._schedulePreview(state, pred); }
            });
            input.addEventListener('input', () => { this._schedulePreview(state, pred); });
            tokenWrap.appendChild(input);
            const help = document.createElement('div'); help.className='adv-help-text'; help.textContent = (pred.operator==='contains' ? 'Add substrings; any match passes.' : 'Add substrings; none must appear.'); tokenWrap.appendChild(help);
            box.appendChild(tokenWrap); setTimeout(()=>{ try { input.focus(); } catch(e){} },0);
          }
          if (pred.values && pred.values.length) this._renderPredicateValueChips(box, pred, state); else { const placeholder = document.createElement('span'); placeholder.textContent = 'No values selected'; placeholder.className='adv-placeholder'; box.appendChild(placeholder); }
          const commitBtn = document.createElement('button'); commitBtn.type='button'; commitBtn.textContent='\u2713'; commitBtn.title='Commit filter'; commitBtn.disabled = !(pred.values && pred.values.length); commitBtn.className='adv-commit-btn'; commitBtn.addEventListener('click', () => { this._attemptCommitPredicate(pred, state); }); box.appendChild(commitBtn);
        } else if (pred.complete) {
          const summary = document.createElement('span'); summary.textContent = pred.operator; summary.style.fontWeight='500'; box.appendChild(summary); this._renderPredicateValueChips(box, pred, state);
        }
        const del = document.createElement('button'); del.type = 'button'; del.textContent = '\u2716'; del.setAttribute('aria-label', 'Delete filter'); del.className='adv-delete-btn'; del.addEventListener('click', () => {
          const idx = state.advancedSearch.predicates.findIndex(p => p.id === pred.id);
          if (idx !== -1) state.advancedSearch.predicates.splice(idx, 1);
          if (state._advPreviewPredicateId === pred.id) {
            state._advPreviewPredicateId = null;
            if (state._advPreviewTimer) { clearTimeout(state._advPreviewTimer); delete state._advPreviewTimer; }
          }
          const nextIncomplete = state.advancedSearch.predicates.find(p=>!p.complete);
          if (nextIncomplete) { this._schedulePreview(state, nextIncomplete); }
          try { this._lightRefresh(state); } catch(e){}
          try { this._renderAdvancedPredicates(state); } catch(e){}
          // If no filters remain, focus Add Field select for convenience
          if (state.advancedSearch.enabled && state.advancedSearch.predicates.length === 0) {
            setTimeout(()=>{ try { const sel = state.advancedSearchPanel?.querySelector('select.adv-add-field-select'); if (sel) sel.focus(); } catch(e){} },0);
          }
          this._debouncedPersist(state);
        }); box.appendChild(del); body.appendChild(box);
      });
      const hasIncomplete = predicates.some(p => !p.complete);
      // Add Field control (only if enabled and no incomplete predicate existing)
      if (state.advancedSearch.enabled && !hasIncomplete) {
        const addWrapper = document.createElement('div'); addWrapper.className = 'adv-add-field-wrapper';
        const select = document.createElement('select'); select.className = 'adv-add-field-select';
        const defaultOpt = document.createElement('option'); defaultOpt.value = ''; defaultOpt.textContent = 'Add Field…'; select.appendChild(defaultOpt);
        headers.filter(h => h.key !== 'favorite').forEach(h => { const opt = document.createElement('option'); opt.value = h.key; opt.textContent = h.label; select.appendChild(opt); });
        select.addEventListener('change', () => {
          const val = select.value; if (!val) return; const existingIncomplete = state.advancedSearch.predicates.some(p => !p.complete); if (existingIncomplete) return; const pred = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), fieldKey: val, operator: null, values: [], complete: false }; state.advancedSearch.predicates.push(pred); state._advFocusOperatorId = pred.id; this._renderAdvancedPredicates(state);
          this._debouncedPersist(state);
        });
        addWrapper.appendChild(select); body.appendChild(addWrapper);
      }
      // Empty placeholder
      if (!predicates.length && state.advancedSearch.enabled) {
        const empty = document.createElement('div'); empty.className = 'adv-search-empty-inline'; empty.textContent = 'Select a field to start building a filter.'; body.appendChild(empty);
      } else if (!predicates.length) { const disabledMsg = document.createElement('div'); disabledMsg.className = 'adv-search-disabled-msg'; disabledMsg.textContent = 'Advanced Search disabled – toggle above to begin.'; body.appendChild(disabledMsg); }
      // Post-render focus management
      setTimeout(() => { try { if (state._advFocusOperatorId) { const sel = body.querySelector(`select.adv-operator-select[data-pred-id="${state._advFocusOperatorId}"]`); if (sel) sel.focus(); delete state._advFocusOperatorId; } else if (state._advFocusPredicateId) { const box = body.querySelector(`.adv-predicate-box[data-predicate-id="${state._advFocusPredicateId}"]`); if (box) box.focus(); delete state._advFocusPredicateId; } } catch(e) { /* ignore */ } }, 0);
    } catch (e) {
      console.warn('[AdvancedSearch] _renderAdvancedPredicates error', e);
    }
  },
  updateBreadcrumb(groupingStack, groupKeysStack) {
    console.log('[breadcrumbs] updateBreadcrumb ENTRY', { groupingStack, groupKeysStack });
    if (typeof GoboStore !== 'undefined' && GoboStore && !GoboStore.ready) {
      console.debug('[breadcrumbs] GoboStore not ready; deferring breadcrumb render until goboStorageReady');
      const retry = () => { try { Breadcrumbs.updateBreadcrumb(groupingStack, groupKeysStack); } catch(e) {/* ignore */} };
      document.addEventListener('goboStorageReady', retry, { once: true });
      return;
    }
    const state = App.TableRenderer.lastState;
    if (!state) return;
    const container = document.querySelector('.breadcrumb-container');
    if (!container) return;
    container.innerHTML = '';
    const tabsRow = document.createElement('div');
    tabsRow.className = 'breadcrumb-tabs-row';
    tabsRow.style.cssText = 'display:block; margin-bottom:8px; overflow:hidden;';
    const crumbsRow = document.createElement('div');
    crumbsRow.className = 'breadcrumb-crumb-row';
    crumbsRow.style.cssText = 'display:flex; align-items:center; gap:8px; flex-wrap:wrap;';
    container.appendChild(tabsRow); container.appendChild(crumbsRow);

    // Build tabs
    try {
      const profiles = [];
      try { if (window.Favorites && Favorites.ensureProfileExists) Favorites.ensureProfileExists(); } catch(e) {/* ignore */}
      let profileKeys = [];
      try {
        if (typeof GoboStore !== 'undefined' && GoboStore && typeof GoboStore.getAllProfileKeys === 'function') profileKeys = GoboStore.getAllProfileKeys();
        else {
          for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('gobo-')) profileKeys.push(k); }
        }
      } catch(e) {/* ignore */}
      try { const favRaw = (typeof goboStorageGet === 'function' ? goboStorageGet('goob-favorites') : localStorage.getItem('goob-favorites')); if (favRaw) profileKeys.push('goob-favorites'); } catch(e) {/* ignore */}
      profileKeys = Array.from(new Set(profileKeys));
      profileKeys.forEach(k => { try { const payload = JSON.parse((typeof goboStorageGet === 'function' ? goboStorageGet(k) : localStorage.getItem(k))); if (payload && payload.data && payload.savedAt) { profiles.push({ key:k, label: k==='goob-favorites' ? 'Favorites' : k.replace(/^gobo-/,'').replace(/_/g,'@'), savedAt: k==='goob-favorites'? null : payload.savedAt }); } } catch(e){/* ignore */} });
      if (profiles.length) {
        try { if (typeof ProfileIdManager !== 'undefined' && ProfileIdManager) { ProfileIdManager.ensureIds(profiles.filter(p=>/^gobo-/.test(p.key)).map(p=>p.key)); App.ProfileIdMap = { ...ProfileIdManager.map }; } } catch(e){/* ignore */}
        let currentKey = null; try { const raw = localStorage.getItem('persist:session'); if (raw) { const parsed = JSON.parse(raw); const user = parsed.user ? JSON.parse(parsed.user) : null; if (user) { const rawKey = String(user.username || user.userName || user.email || user.name || user.accountId || ''); const usernameKey = rawKey.replace(/[^a-zA-Z0-9-_.]/g,'_'); currentKey = `gobo-${usernameKey}`; } } } catch(e) {/* ignore */}
        profiles.sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
        let favoritesEntry=null; const favIdx = profiles.findIndex(p=>p.key==='goob-favorites'); if (favIdx!==-1) favoritesEntry = profiles.splice(favIdx,1)[0];
        if (currentKey) { const idx = profiles.findIndex(p=>p.key===currentKey); if (idx>0) profiles.unshift(profiles.splice(idx,1)[0]); }
        // Add combined offers tab placeholder
        try { const linked = getLinkedAccounts(); profiles.push({ key:'goob-combined-linked', label:'Combined Offers', isCombined:true, linkedEmails: linked.map(acc=>acc.email) }); } catch(e) {/* ignore */}
        if (favoritesEntry) profiles.push(favoritesEntry);
        const tabs = document.createElement('div'); tabs.className = 'profile-tabs';
        const tabsScroll = document.createElement('div'); tabsScroll.className='profile-tabs-scroll'; tabsScroll.style.cssText='overflow-x:auto; width:100%; -webkit-overflow-scrolling:touch;';
        tabs.style.cssText='display:inline-flex; flex-direction:row; gap:8px; flex-wrap:nowrap;';
        let activeKey = (App.CurrentProfile && App.CurrentProfile.key) ? App.CurrentProfile.key : state.selectedProfileKey;
        if (TableRenderer._initialOpenPending && !TableRenderer.hasSelectedDefaultTab && profiles.length) { activeKey = profiles[0].key; state.selectedProfileKey = activeKey; TableRenderer.hasSelectedDefaultTab = true; TableRenderer._initialOpenPending = false; }
        const profileKeysArr = profiles.map(p=>p.key);
        if (!profileKeysArr.includes(activeKey)) activeKey = profileKeysArr.includes(state.selectedProfileKey) ? state.selectedProfileKey : (profileKeysArr[0] || null);
        state.selectedProfileKey = activeKey;
        TableRenderer.TabKeyMap = {};
        profiles.forEach((p, idx) => {
          const storageKey = p.key;
          if (!TableRenderer.TabKeyMap[storageKey]) TableRenderer.TabKeyMap[storageKey] = { count:0 }; else TableRenderer.TabKeyMap[storageKey].count++;
            const domKey = TableRenderer.TabKeyMap[storageKey].count === 0 ? storageKey : `${storageKey}#${TableRenderer.TabKeyMap[storageKey].count}`;
          const btn = document.createElement('button'); btn.className='profile-tab'; btn.setAttribute('data-key', domKey); btn.setAttribute('data-storage-key', storageKey);
          let loyaltyId=null; try { const storedRaw = (typeof goboStorageGet==='function' ? goboStorageGet(storageKey):localStorage.getItem(storageKey)); if (storedRaw) { const storedPayload = JSON.parse(storedRaw); loyaltyId = storedPayload?.data?.loyaltyId || null; } } catch(e){/* ignore */}
          let labelDiv = document.createElement('div'); labelDiv.className='profile-tab-label'; labelDiv.textContent = p.label || storageKey;
          if (storageKey==='goob-favorites') {
            labelDiv.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;line-height:1.05;">'+
              '<span style="font-weight:600;">Favorites</span>' +
              '<span aria-hidden="true" style="color:#f5c518;font-size:27px;margin-top:2px;">★</span>' +
              '</div>';
          } else if (storageKey==='goob-combined-linked') {
            const wrapper = document.createElement('div'); wrapper.style.display='flex'; wrapper.style.alignItems='center';
            let badgeText='C'; let badgeClass='profile-id-badge-combined';
            try { const linked = getLinkedAccounts(); if (linked.length>=2) { const ids = linked.slice(0,2).map(acc=>App.ProfileIdMap?.[acc.key] || 0); badgeText = `${ids[0]}+${ids[1]}`; badgeClass += ` profile-id-badge-combined-${ids[0]+ids[1]}`; } } catch(e){}
            const badge = document.createElement('span'); badge.className=badgeClass; badge.textContent=badgeText; badge.style.marginRight='6px';
            wrapper.appendChild(badge); wrapper.appendChild(labelDiv); labelDiv = wrapper;
          }
          if (/^gobo-/.test(storageKey)) {
            try { const pid = App.ProfileIdMap ? App.ProfileIdMap[storageKey] : null; if (pid) { const badge = document.createElement('span'); badge.className=`profile-id-badge profile-id-badge-${pid}`; badge.textContent=pid; badge.style.marginRight='6px'; const wrapper = document.createElement('div'); wrapper.style.display='flex'; wrapper.style.alignItems='center'; wrapper.appendChild(badge); wrapper.appendChild(labelDiv); labelDiv = wrapper; } } catch(e){/* ignore */}
          }
          const loyaltyDiv = document.createElement('div'); loyaltyDiv.className='profile-tab-loyalty'; loyaltyDiv.textContent = loyaltyId ? `${loyaltyId}` : '';
          let refreshedDiv=null; if (p.savedAt) { refreshedDiv=document.createElement('div'); refreshedDiv.className='profile-tab-refreshed'; refreshedDiv.textContent=`Last Refreshed: ${formatTimeAgo(p.savedAt)}`; try { btn.title = new Date(p.savedAt).toLocaleString(); } catch(e){} }
          const labelContainer = document.createElement('div'); labelContainer.className='profile-tab-label-container'; labelContainer.appendChild(labelDiv); labelContainer.appendChild(loyaltyDiv); if (refreshedDiv) labelContainer.appendChild(refreshedDiv);
          btn.innerHTML=''; btn.appendChild(labelContainer);
          if (!p.isCombined && storageKey !== 'goob-favorites') {
            const iconContainer = document.createElement('div'); iconContainer.style.display='flex'; iconContainer.style.flexDirection='column'; iconContainer.style.alignItems='center'; iconContainer.style.gap='2px'; iconContainer.style.marginLeft='4px';
            const linkIcon = document.createElement('span'); const isLinked = getLinkedAccounts().some(acc=>acc.key===storageKey); linkIcon.innerHTML = isLinked ? `<img src="${getAssetUrl('images/link.png')}" width="16" height="16" alt="Linked" style="vertical-align:middle;" />` : `<img src="${getAssetUrl('images/link_off.png')}" width="16" height="16" alt="Unlinked" style="vertical-align:middle;" />`; linkIcon.style.cursor='pointer'; linkIcon.title = isLinked ? 'Unlink account' : 'Link account'; linkIcon.style.marginBottom='2px';
            linkIcon.addEventListener('click',(e)=>{ e.stopPropagation(); let updated=getLinkedAccounts(); if (isLinked) { updated = updated.filter(acc=>acc.key!==storageKey); if (updated.length<2) { try { if (typeof goboStorageRemove==='function') goboStorageRemove('goob-combined'); else localStorage.removeItem('goob-combined'); if (App.ProfileCache && App.ProfileCache['goob-combined-linked']) delete App.ProfileCache['goob-combined-linked']; } catch(err){} } } else { if (updated.length>=2) return; let email=p.label; try { const payload=JSON.parse((typeof goboStorageGet==='function'? goboStorageGet(storageKey):localStorage.getItem(storageKey))); if (payload?.data?.email) email=payload.data.email; } catch(e2){} updated.push({ key:storageKey, email }); if (updated.length===2) { try { const raw1=(typeof goboStorageGet==='function'? goboStorageGet(updated[0].key):localStorage.getItem(updated[0].key)); const raw2=(typeof goboStorageGet==='function'? goboStorageGet(updated[1].key):localStorage.getItem(updated[1].key)); const profile1=raw1?JSON.parse(raw1):null; const profile2=raw2?JSON.parse(raw2):null; const merged=mergeProfiles(profile1, profile2); if (typeof goboStorageSet==='function') goboStorageSet('goob-combined', JSON.stringify(merged)); else localStorage.setItem('goob-combined', JSON.stringify(merged)); } catch(e3){} } }
              setLinkedAccounts(updated); try { if (typeof updateCombinedOffersCache==='function') updateCombinedOffersCache(); if (App.ProfileCache && App.ProfileCache['goob-combined-linked']) delete App.ProfileCache['goob-combined-linked']; } catch(e4){}
              Breadcrumbs.updateBreadcrumb(App.TableRenderer.lastState.groupingStack, App.TableRenderer.lastState.groupKeysStack);
              setTimeout(()=>btn.click(),0);
            });
            iconContainer.appendChild(linkIcon);
            const trashIcon = document.createElement('span'); trashIcon.innerHTML='<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 2V1.5C6 1.22 6.22 1 6.5 1H9.5C9.78 1 10 1.22 10 1.5V2M2 4H14M12.5 4V13.5C12.5 13.78 12.28 14 12 14H4C3.72 14 3.5 13.78 3.5 13.5V4M5.5 7V11M8 7V11M10.5 7V11" stroke="#888" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            trashIcon.style.cursor='pointer'; trashIcon.style.marginTop='4px'; trashIcon.title='Delete profile';
            trashIcon.addEventListener('click',(e)=>{ e.stopPropagation(); if (!confirm('Are you sure you want to delete this saved profile? This action cannot be undone.')) return; try { let linked = getLinkedAccounts(); if (linked.some(acc=>acc.key===storageKey)) { linked = linked.filter(acc=>acc.key!==storageKey); setLinkedAccounts(linked); if (linked.length<2) { try { if (typeof goboStorageRemove==='function') goboStorageRemove('goob-combined'); else localStorage.removeItem('goob-combined'); if (App.ProfileCache && App.ProfileCache['goob-combined-linked']) delete App.ProfileCache['goob-combined-linked']; } catch(err){} } } if (typeof goboStorageRemove==='function') goboStorageRemove(storageKey); else localStorage.removeItem(storageKey); try { if (typeof ProfileIdManager!=='undefined' && ProfileIdManager && /^gobo-/.test(storageKey)) { ProfileIdManager.removeKeys([storageKey]); App.ProfileIdMap = { ...ProfileIdManager.map }; } } catch(reId){} if (storageKey==='goob-combined-linked' && App.ProfileCache && App.ProfileCache['goob-combined-linked']) delete App.ProfileCache['goob-combined-linked']; const wasActive = btn.classList.contains('active'); btn.remove(); if (App.ProfileCache) delete App.ProfileCache[storageKey]; Breadcrumbs.updateBreadcrumb(App.TableRenderer.lastState.groupingStack, App.TableRenderer.lastState.groupKeysStack); if (wasActive) setTimeout(()=>{ const newTabs=document.querySelectorAll('.profile-tab'); if (newTabs.length) newTabs[0].click(); },0); } catch(err2){ App.ErrorHandler.showError('Failed to delete profile.'); } });
            iconContainer.appendChild(trashIcon); btn.appendChild(iconContainer);
          }
          if (p.isCombined) {
            const emailsDiv = document.createElement('div'); emailsDiv.className='profile-tab-linked-emails'; emailsDiv.style.fontSize='11px'; emailsDiv.style.marginTop='2px'; emailsDiv.style.color='#2a7'; emailsDiv.style.textAlign='left';
            let lines; if (p.linkedEmails && p.linkedEmails.length) { lines = p.linkedEmails.slice(0,2); while(lines.length<2) lines.push('&nbsp;'); } else { lines=['&nbsp;','&nbsp;']; }
            emailsDiv.innerHTML = lines.map(e=>`<div>${e}</div>`).join(''); labelContainer.appendChild(emailsDiv);
          }
          if (storageKey === activeKey) { btn.classList.add('active'); btn.setAttribute('aria-pressed','true'); } else { btn.setAttribute('aria-pressed','false'); }
          btn.addEventListener('click', () => {
            const clickedStorageKey = btn.getAttribute('data-storage-key') || storageKey; try { if (App.TableRenderer.lastState) App.TableRenderer.lastState.selectedProfileKey = clickedStorageKey; } catch(e){}
            state.selectedProfileKey = clickedStorageKey;
            if (typeof Spinner !== 'undefined' && Spinner.showSpinner) {
              Spinner.showSpinner(); setTimeout(()=>{
                if (clickedStorageKey === 'goob-combined-linked') {
                  try { const raw = (typeof goboStorageGet==='function'? goboStorageGet('goob-combined'):localStorage.getItem('goob-combined')); if (!raw) { App.ErrorHandler.showError('Link two accounts to view combined offers.'); Spinner.hideSpinner(); return; } const payload=JSON.parse(raw); if (payload?.data) { App.TableRenderer.loadProfile('goob-combined-linked', payload); Spinner.hideSpinner(); } else { App.ErrorHandler.showError('Combined Offers data is malformed.'); Spinner.hideSpinner(); } } catch(err){ App.ErrorHandler.showError('Failed to load Combined Offers.'); Spinner.hideSpinner(); }
                } else if (clickedStorageKey === 'goob-favorites') {
                  try { const raw=(typeof goboStorageGet==='function'? goboStorageGet('goob-favorites'):localStorage.getItem('goob-favorites')); const payload = raw ? JSON.parse(raw) : { data:{ offers: [] }, savedAt: Date.now() }; App.TableRenderer.loadProfile('goob-favorites', payload); } catch(err){ App.ErrorHandler.showError('Failed to load Favorites profile.'); } Spinner.hideSpinner();
                } else {
                  try { const raw=(typeof goboStorageGet==='function'? goboStorageGet(clickedStorageKey):localStorage.getItem(clickedStorageKey)); if (!raw) { App.ErrorHandler.showError('Selected profile is no longer available.'); Spinner.hideSpinner(); return; } let payload=JSON.parse(raw); if (!payload || typeof payload!=='object') payload={ data:{ offers:[] }, savedAt: Date.now() }; if (!payload.data || typeof payload.data!=='object') payload.data={ offers:[] }; if (!Array.isArray(payload.data.offers)) payload.data.offers=[]; const cached=App.ProfileCache && App.ProfileCache[clickedStorageKey]; try { const dataSavedAt=Number(payload.savedAt||payload.data?.savedAt||0); const domCachedAt = cached && cached.scrollContainer ? Number(cached.scrollContainer._cachedAt||0) : 0; if (dataSavedAt>domCachedAt) { try { if (App.ProfileCache && App.ProfileCache[clickedStorageKey]) delete App.ProfileCache[clickedStorageKey]; } catch(e){} } } catch(e){} if (payload?.data) { App.TableRenderer.loadProfile(clickedStorageKey, payload); Spinner.hideSpinner(); } else { App.ErrorHandler.showError('Profile data malformed.'); Spinner.hideSpinner(); } } catch(err){ App.ErrorHandler.showError('Failed to load profile.'); Spinner.hideSpinner(); }
                }
              },0);
            } else {
              try { const raw=(typeof goboStorageGet==='function'? goboStorageGet(clickedStorageKey):localStorage.getItem(clickedStorageKey)); if (!raw) { App.ErrorHandler.showError('Selected profile is no longer available.'); return; } let payload=JSON.parse(raw); if (!payload || typeof payload!=='object') payload={ data:{ offers:[] }, savedAt: Date.now() }; if (!payload.data || typeof payload.data!=='object') payload.data={ offers:[] }; if (!Array.isArray(payload.data.offers)) payload.data.offers=[]; if (payload?.data) App.TableRenderer.loadProfile(clickedStorageKey, payload); else App.ErrorHandler.showError('Saved profile data is malformed.'); } catch(err){ App.ErrorHandler.showError('Failed to load saved profile.'); }
            }
          });
          tabs.appendChild(btn);
        });
        tabsScroll.appendChild(tabs); tabsRow.appendChild(tabsScroll);
      }
    } catch(e) { console.warn('[breadcrumbs] Failed to render profile tabs', e); }

    // All Offers crumb
    const all = document.createElement('span'); all.className='breadcrumb-link'; all.textContent='All Offers'; all.addEventListener('click', () => {
      state.viewMode='table'; state.groupingStack=[]; state.groupKeysStack=[]; state.groupSortStates={}; state.openGroups=new Set();
      if (state.baseSortColumn) { state.currentSortColumn=state.baseSortColumn; state.currentSortOrder=state.baseSortOrder; } else { state.currentSortColumn='offerDate'; state.currentSortOrder='desc'; }
      state.currentGroupColumn=null;
      if (typeof Spinner !== 'undefined' && Spinner.showSpinner) {
        Spinner.showSpinner(); setTimeout(()=>{ try { App.TableRenderer.updateView(state); } finally { try { Spinner.hideSpinner&&Spinner.hideSpinner(); } catch(e){} } },0);
      } else { App.TableRenderer.updateView(state); }
    }); crumbsRow.appendChild(all);

    container.classList.toggle('accordion-view', groupingStack.length>0);
    for (let i=0;i<groupingStack.length;i++) {
      const arrowToCol = document.createElement('span'); arrowToCol.className='breadcrumb-arrow'; crumbsRow.appendChild(arrowToCol);
      const colKey = groupingStack[i]; const colLabel = state.headers.find(h=>h.key===colKey)?.label || colKey;
      const colCrumb = document.createElement('span'); colCrumb.className='breadcrumb-crumb breadcrumb-col'; colCrumb.textContent=colLabel; crumbsRow.appendChild(colCrumb);
      if (i < groupKeysStack.length) {
        const arrowToVal = document.createElement('span'); arrowToVal.className='breadcrumb-arrow'; crumbsRow.appendChild(arrowToVal);
        const valCrumb = document.createElement('span'); valCrumb.className='breadcrumb-crumb breadcrumb-val'; valCrumb.textContent=groupKeysStack[i]; crumbsRow.appendChild(valCrumb);
      }
    }

    // Hidden Groups + Advanced Search cluster
    const hiddenGroupsPanel = document.createElement('div'); hiddenGroupsPanel.className='tier-filter-toggle'; hiddenGroupsPanel.style.marginLeft='auto';
    // Advanced Search toggle with badge
    this._ensureAdvancedSearchState(state);
    const committedCount = state.advancedSearch.predicates.filter(p=>p && p.complete).length;
    const advButton = document.createElement('button'); advButton.type='button'; advButton.className='b2b-search-button adv-search-button'; advButton.textContent= committedCount? `Advanced Search (${committedCount})` : 'Advanced Search'; advButton.setAttribute('aria-label', committedCount? `Advanced Search with ${committedCount} filters` : 'Advanced Search');
    advButton.setAttribute('aria-pressed', state.advancedSearch.enabled ? 'true':'false');
    advButton.addEventListener('click', (ev)=>{ if (ev && ev.isTrusted===false) return; try { state.advancedSearch.enabled = !state.advancedSearch.enabled; advButton.setAttribute('aria-pressed', state.advancedSearch.enabled ? 'true':'false'); if (state.advancedSearchPanel) { state.advancedSearchPanel.style.display = state.advancedSearch.enabled ? 'block':'none'; state.advancedSearchPanel.classList.toggle('enabled', state.advancedSearch.enabled); }
      if (state.advancedSearch.enabled) { Breadcrumbs._restoreAdvancedPredicates(state); }
      Breadcrumbs._renderAdvancedPredicates(state); } catch(e){} });

    // B2B button
    const b2bButton = document.createElement('button'); b2bButton.type='button'; b2bButton.className='b2b-search-button'; b2bButton.textContent='Back-to-Back Search'; b2bButton.addEventListener('click',(ev)=>{ try { if (!ev || ev.isTrusted !== true) return; const tgt=ev.target||null; if (!tgt || !(b2bButton===tgt || b2bButton.contains(tgt))) return; if (App && App.Modal && typeof App.Modal.showBackToBackModal==='function') App.Modal.showBackToBackModal(); } catch(e){} });

    const hiddenGroupsLabel = document.createElement('span'); hiddenGroupsLabel.textContent='Hidden Groups:'; hiddenGroupsLabel.style.marginLeft='16px';
    const hiddenGroupsDisplay = document.createElement('div'); hiddenGroupsDisplay.id='hidden-groups-display';
    try { const profileKey = (state.selectedProfileKey || (App.CurrentProfile && App.CurrentProfile.key)) || 'default'; Filtering.updateHiddenGroupsList(profileKey, hiddenGroupsDisplay, state); } catch(e){}
    hiddenGroupsPanel.appendChild(advButton); hiddenGroupsPanel.appendChild(b2bButton); hiddenGroupsPanel.appendChild(hiddenGroupsLabel); hiddenGroupsPanel.appendChild(hiddenGroupsDisplay); crumbsRow.appendChild(hiddenGroupsPanel);

    // What's New button (unchanged truncated)
    try { if (!document.getElementById('gobo-whatsnew-btn')) { const wnBtn=document.createElement('button'); wnBtn.id='gobo-whatsnew-btn'; wnBtn.type='button'; wnBtn.textContent="What's New"; wnBtn.className='b2b-search-button'; wnBtn.style.background='#f59e0b'; wnBtn.style.marginLeft='8px'; wnBtn.style.padding='8px 10px'; wnBtn.style.borderRadius='6px'; wnBtn.addEventListener('click',()=>{ try { if (window.WhatsNew) WhatsNew.start(true); } catch(e){} }); crumbsRow.appendChild(wnBtn); try { const footerLeft=document.getElementById('gobo-footer-left'); if (footerLeft) footerLeft.appendChild(wnBtn); } catch(relErr){} } } catch(e){}

    // Advanced Search panel scaffold
    try {
      let advPanel = document.getElementById('advanced-search-panel');
      if (!advPanel) { advPanel = document.createElement('div'); advPanel.id = 'advanced-search-panel'; advPanel.className = 'advanced-search-panel'; container.appendChild(advPanel); } else if (advPanel.parentElement !== container) { container.appendChild(advPanel); }
      advPanel.style.display = state.advancedSearch && state.advancedSearch.enabled ? 'block' : 'none';
      advPanel.classList.toggle('enabled', !!(state.advancedSearch && state.advancedSearch.enabled));
      // master toggle removed
      let header = advPanel.querySelector('.adv-search-header');
      if (!header) { header = document.createElement('div'); header.className='adv-search-header'; advPanel.appendChild(header); }
      header.innerHTML='';
      // Only Clear All + badge now
      const clearBtn = document.createElement('button'); clearBtn.type='button'; clearBtn.className='adv-search-clear-btn'; clearBtn.textContent='Clear All'; clearBtn.addEventListener('click', ()=>{
        const hadAny = !!state.advancedSearch.predicates.length;
        if (hadAny && !confirm('Clear all filters?')) return;
        state.advancedSearch.predicates = [];
        state._advPreviewPredicateId=null;
        if (state._advPreviewTimer) { clearTimeout(state._advPreviewTimer); delete state._advPreviewTimer; }
        state._advFieldCache = {};
        if (state.advancedSearch && state.advancedSearch.enabled !== true) state.advancedSearch.enabled = true;
        try { Breadcrumbs._lightRefresh(state); } catch(e){}
        Breadcrumbs._renderAdvancedPredicates(state);
        // Light badge/text update instead of full breadcrumb rebuild
        Breadcrumbs._updateAdvBadge(state);
        try { const key = Breadcrumbs._advStorageKey(state.selectedProfileKey); sessionStorage.removeItem(key); } catch(e){}
        setTimeout(()=>{ try { const sel = state.advancedSearchPanel?.querySelector('select.adv-add-field-select'); if (sel) sel.focus(); } catch(e){} },0);
      }); header.appendChild(clearBtn);
      const committedCount = state.advancedSearch.predicates.filter(p=>p && p.complete).length;
      if (committedCount) { const badge = document.createElement('span'); badge.className='adv-badge'; badge.textContent = committedCount + ' active'; header.appendChild(badge); }
      this._renderAdvancedPredicates(state);
      state.advancedSearchPanel = advPanel;
    } catch(e){ console.warn('[AdvancedSearch] panel scaffold error', e); }

    try { const intended = (App.CurrentProfile && App.CurrentProfile.key) || state.selectedProfileKey; if (intended) TableRenderer._applyActiveTabHighlight(intended); } catch(e){}
    try { if (window.WhatsNew) WhatsNew.maybeAutoStart(); } catch(e){}
  },
  _updateAdvBadge(state){
    try {
      const btn = document.querySelector('button.adv-search-button');
      if (!btn || !state || !state.advancedSearch) return;
      const committedCount = state.advancedSearch.predicates.filter(p=>p && p.complete).length;
      btn.textContent = committedCount ? `Advanced Search (${committedCount})` : 'Advanced Search';
      btn.setAttribute('aria-label', committedCount ? `Advanced Search with ${committedCount} filters` : 'Advanced Search');
      // Panel header badge
      const panel = state.advancedSearchPanel || document.getElementById('advanced-search-panel');
      if (panel) {
        const header = panel.querySelector('.adv-search-header');
        if (header) {
          let badge = header.querySelector('.adv-badge');
            if (badge && !committedCount) badge.remove();
            else if (!badge && committedCount) { badge = document.createElement('span'); badge.className='adv-badge'; header.appendChild(badge); }
            if (badge) badge.textContent = committedCount + ' active';
        }
      }
    } catch(e){ /* ignore */ }
  },
  _lightRefresh(state){
    try {
      state._skipBreadcrumb = true; state._suppressLogs = true;
      TableRenderer.updateView(state);
    } catch(e) { /* ignore light refresh errors */ }
    finally { try { delete state._suppressLogs; } catch(e){} this._updateAdvBadge(state); }
  },
  // Debounced persistence helper (was previously missing causing repeated errors & sync storage churn)
  _debouncedPersist(state){
    try {
      if (this._persistTimer) clearTimeout(this._persistTimer);
      this._persistTimer = setTimeout(()=>{ try { this._persistAdvancedPredicates(state); } catch(e){} }, 500);
    } catch(e){ /* ignore */ }
  },
};
