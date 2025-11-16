// Manages stable assignment of numeric profile IDs to gobo-* profile keys.
// Once a profile key receives an ID it will never change unless the profile
// is deleted (its storage entry removed). Deleted profile IDs return to a
// free pool and may be reused by future new profiles.
(function(global){
    const STORAGE_KEY = 'goboProfileIdMap_v1';
    const FREE_KEY = 'goboProfileIdFreeIds_v1';
    const NEXT_KEY = 'goboProfileIdNext_v1';
    const DEBUG = true;
    function log(...a){ if (DEBUG) try{ console.debug('[ProfileIdManager]', ...a);}catch(e){} }
    function warn(...a){ try{ console.warn('[ProfileIdManager]', ...a);}catch(e){} }
    function err(...a){ try{ console.error('[ProfileIdManager]', ...a);}catch(e){} }
    function safeGet(k){ try { if (typeof goboStorageGet === 'function') return goboStorageGet(k); if (global.localStorage) return localStorage.getItem(k); } catch(e){ } return null; }
    function safeSet(k,v){ try { if (typeof goboStorageSet === 'function') goboStorageSet(k,v); else if (global.localStorage) localStorage.setItem(k,v);} catch(e){ } }
    function safeRemove(k){ try { if (typeof goboStorageRemove === 'function') goboStorageRemove(k); else if (global.localStorage) localStorage.removeItem(k);} catch(e){ } }

    const mgr = {
        ready:false,
        map:{},
        free:[],
        next:1,
        _deferredAssign:new Set(),
        init(){
            // If GoboStore gate exists, still hydrate immediately from raw storage so we can migrate before any allocations.
            try {
                if (typeof GoboStore !== 'undefined' && GoboStore && !GoboStore.ready) {
                    // Perform raw migration using persisted blobs even if not "ready"; then finish when ready event fires.
                    if (!this._storeGateAttached) {
                        this._hydrateFromStorage(true); // early hydrate (non-ready) then migrate
                        this._storeGateAttached = true;
                        document.addEventListener('goboStorageReady', () => { this._hydrateFromStorage(false); this.ready = true; this._finalizePostMigration(); }, { once:true });
                        return;
                    }
                }
            } catch(eGate){ /* ignore */ }
            if (this.ready) return;
            this._hydrateFromStorage(false);
            this.ready = true;
            this._finalizePostMigration();
        },
        _hydrateFromStorage(isEarly){
            // Load persisted map/free/next
            try {
                const rawMap = safeGet(STORAGE_KEY); this.map = rawMap ? JSON.parse(rawMap) : (this.map||{});
            } catch(e){ err('map parse', e); }
            try {
                const rawFree = safeGet(FREE_KEY); this.free = rawFree ? JSON.parse(rawFree) : (this.free||[]);
            } catch(e2){ err('free parse', e2); }
            try {
                const rawNext = safeGet(NEXT_KEY); if (rawNext) this.next = JSON.parse(rawNext); else {
                    const maxId = Object.values(this.map).reduce((m,v)=> v>m? v:m,0); this.next = maxId+1||1;
                }
            } catch(e3){ const maxId = Object.values(this.map).reduce((m,v)=> v>m? v:m,0); this.next = maxId+1||1; }
            // Critical: perform legacy normalization BEFORE any assignments
            this._performLegacyBrandNormalization();
            if (!isEarly) log('hydrated', { map:{...this.map}, free:[...this.free], next:this.next });
        },
        _performLegacyBrandNormalization(){
            // Find all legacy profile storage keys (no brand prefix R- or C- after gobo-)
            const legacyKeys = [];
            try {
                const ls = global.localStorage;
                if (ls) {
                    for (let i=0;i<ls.length;i++){ const k = ls.key(i); if (k && /^gobo-(?!R-|C-)[^\s]+$/.test(k)) legacyKeys.push(k); }
                }
            } catch(e){ /* ignore */ }
            if (!legacyKeys.length) return;
            let mutated = false;
            legacyKeys.forEach(legacyKey => {
                const legacyId = this.map[legacyKey];
                // If no ID yet (rare), skip; we must not assign new ID to brand version until mapping known.
                if (legacyId == null) { warn('legacy key without id encountered, skipping immediate brand migration', legacyKey); return; }
                // Determine brand by inspecting stored payload (Celebrity ships => C else R)
                let brand='R';
                try {
                    const raw = safeGet(legacyKey);
                    if (raw){
                        const pl = JSON.parse(raw); const offers = pl?.data?.offers;
                        if (Array.isArray(offers)) {
                            outer: for (const off of offers){ const sailings = off?.campaignOffer?.sailings; if (!Array.isArray(sailings)) continue; for (const s of sailings){ const sn=(s?.shipName||'').trim(); if (/^Celebrity\s/i.test(sn)){ brand='C'; break outer;} else if (sn) brand='R'; } }
                        }
                    }
                } catch(eB){ brand='R'; }
                const suffix = legacyKey.slice(5);
                const brandedKey = `gobo-${brand}-${suffix}`;
                if (brandedKey === legacyKey) return; // already correct
                const existingBrandId = this.map[brandedKey];
                if (existingBrandId != null && existingBrandId !== legacyId) {
                    // Conflict: free existing brand id, replace with legacyId
                    if (!this.free.includes(existingBrandId)) this.free.push(existingBrandId);
                    this.map[brandedKey] = legacyId;
                    delete this.map[legacyKey];
                    mutated = true;
                } else if (existingBrandId === legacyId) {
                    // Same id already mapped; just remove legacy mapping
                    delete this.map[legacyKey]; mutated = true;
                } else if (existingBrandId == null) {
                    // Create branded mapping preserving legacy id
                    this.map[brandedKey] = legacyId;
                    delete this.map[legacyKey]; mutated = true;
                }
                // Move profile payload data if branded key does not exist yet
                try {
                    const brandedRaw = safeGet(brandedKey);
                    if (!brandedRaw) {
                        const legacyRaw = safeGet(legacyKey);
                        if (legacyRaw) safeSet(brandedKey, legacyRaw);
                    }
                    // Remove legacy storage entry ALWAYS now that mapping moved
                    safeRemove(legacyKey);
                } catch(eMove){ err('payload move error', legacyKey, eMove); }
            });
            // Normalize linked accounts keys
            try {
                const rawLinked = safeGet('goboLinkedAccounts');
                if (rawLinked){
                    let arr = JSON.parse(rawLinked); if (Array.isArray(arr)) {
                        let changed=false;
                        arr = arr.map(acc => {
                            if (!acc || !acc.key || !/^gobo-/.test(acc.key) || /^gobo-(R-|C-)/.test(acc.key)) return acc;
                            const legacyId = this.map[acc.key];
                            let brand='R';
                            try { const raw = safeGet(acc.key); if (raw){ const pl = JSON.parse(raw); const offers = pl?.data?.offers; if (Array.isArray(offers)){ outer2: for (const off of offers){ const sailings=off?.campaignOffer?.sailings; if (!Array.isArray(sailings)) continue; for (const s of sailings){ const sn=(s?.shipName||'').trim(); if (/^Celebrity\s/i.test(sn)){ brand='C'; break outer2; } else if (sn) brand='R'; } } } } } catch(eL){ brand='R'; }
                            const suffix = acc.key.slice(5); const brandedKey = `gobo-${brand}-${suffix}`;
                            if (brandedKey === acc.key) return acc;
                            // If branded key not mapped yet but legacy has ID, copy mapping
                            if (legacyId != null && this.map[brandedKey] == null){ this.map[brandedKey]=legacyId; delete this.map[acc.key]; }
                            changed = true;
                            return { ...acc, key: brandedKey };
                        });
                        if (changed) safeSet('goboLinkedAccounts', JSON.stringify(arr));
                    }
                }
            } catch(eLA){ err('linked accounts normalization error', eLA); }
            if (mutated) this._persist();
        },
        ensureIds(keys){ this.init(); if (!this.ready){ (keys||[]).forEach(k => { if (/^gobo-/.test(k)) this._deferredAssign.add(k); }); return this.map; }
            return this._assign(keys); },
        _assign(keys){ const uniq=[...new Set((keys||[]).filter(k=>/^gobo-/.test(k)))]; const newly=[]; uniq.forEach(k=>{ if (this.map[k]==null){ let id; if (this.free.length){ this.free.sort((a,b)=>a-b); id=this.free.shift(); } else { id=this.next++; } this.map[k]=id; newly.push({k,id}); } }); if (newly.length) this._persist(); return this.map; },
        _finalizePostMigration(){ // process deferred assigns only AFTER normalization
            if (this._deferredAssign.size){ const arr=[...this._deferredAssign]; this._deferredAssign.clear(); this._assign(arr); }
        },
        _persist(){ if (!this.ready) return; try { safeSet(STORAGE_KEY, JSON.stringify(this.map)); safeSet(FREE_KEY, JSON.stringify(this.free)); safeSet(NEXT_KEY, JSON.stringify(this.next)); } catch(e){ err('persist fail', e); } },
        resolveKey(key){ if (/^gobo-(?!R-|C-)/.test(key)){ // attempt to find branded replacement
            const suffix=key.slice(5); const candidates=[`gobo-R-${suffix}`, `gobo-C-${suffix}`]; for (const c of candidates){ if (this.map[c]!=null) return c; } }
            return key; },
        dump(){ this.init(); return { ready:this.ready, map:{...this.map}, free:[...this.free], next:this.next }; }
    };
    global.ProfileIdManager = mgr;
    try { mgr.init(); } catch(e){ /* ignore */ }
    // Public helpers
    if (!global.resolveProfileKey) global.resolveProfileKey = k => (global.ProfileIdManager ? global.ProfileIdManager.resolveKey(k) : k);
    if (!global.dumpProfileIdState) global.dumpProfileIdState = () => (global.ProfileIdManager ? global.ProfileIdManager.dump() : null);
})(typeof window !== 'undefined' ? window : globalThis);

// Stable Profile ID initialization: mirror ProfileIdManager map if available
try {
    if (typeof ProfileIdManager !== 'undefined' && ProfileIdManager) {
        ProfileIdManager.init();
        if (!window.App) window.App = {};
        if (!App.ProfileIdMap) App.ProfileIdMap = { ...ProfileIdManager.map };
    }
} catch(e){ /* ignore init errors */ }

function mergeProfiles(profileA, profileB) {
    if (!profileA && !profileB) return null;
    if (!profileA) return profileB;
    if (!profileB) return profileA;
    const celebrityOrder = ["Interior", "Ocean View", "Veranda", "Concierge"];
    const defaultOrder = ["Interior", "Ocean View", "Balcony", "Junior Suite"];
    const deepCopy = JSON.parse(JSON.stringify(profileA));
    const offersA = deepCopy.data?.offers || [];
    const offersB = profileB.data?.offers || [];
    const sailingMapB = new Map();
    offersB.forEach(offerB => {
        const codeB = offerB.campaignCode || '';
        const offerCodeB = offerB.campaignOffer?.offerCode || '';
        const categoryB = offerB.category || '';
        const guestsB = offerB.guests || '';
        const brandB = offerB.brand || offerB.campaignOffer?.brand || '';
        (offerB.campaignOffer?.sailings || []).forEach(sailingB => {
            const key = codeB + '|' + (sailingB.shipName || '') + '|' + (sailingB.sailDate || '') + '|' + String(sailingB.isGOBO);
            sailingMapB.set(key, {offerB, offerCodeB, categoryB, brandB, guestsB, sailingB});
        });
    });
    offersA.forEach((offerA) => {
        const codeA = offerA.campaignCode || '';
        const offerCodeA = offerA.campaignOffer?.offerCode || '';
        const brandA = offerA.brand || offerA.campaignOffer?.brand || '';
        const sailingsA = offerA.campaignOffer?.sailings || [];
        const offerNameA = (offerA.campaignOffer?.name || '').toLowerCase();
        offerA.campaignOffer.sailings = sailingsA.filter(sailingA => {
            const key = codeA + '|' + (sailingA.shipName || '') + '|' + (sailingA.sailDate || '') + '|' + String(sailingA.isGOBO);
            const matchObj = sailingMapB.get(key);
            if (!matchObj) return false;
            const offerNameB = (matchObj.offerB?.campaignOffer?.name || '').toLowerCase();
            if (offerNameA.includes('two room offer') || offerNameB.includes('two room offer')) return false;
            const isGOBOA = sailingA.isGOBO === true;
            const isGOBOB = matchObj.sailingB.isGOBO === true;
            // NEW: propagate GTY if either sailing is GTY
            const isGTYA = sailingA.isGTY === true;
            const isGTYB = matchObj.sailingB.isGTY === true;
            if (isGTYA || isGTYB) {
                sailingA.isGTY = true;
            }
            const roomTypeA = sailingA.roomType || '';
            const roomTypeB = matchObj.sailingB.roomType || '';
            if (isGOBOA || isGOBOB) {
                sailingA.isGOBO = false;
                offerA.guests = '2 guests';
                let isCelebrity = false;
                if ((brandA && brandA.toLowerCase().includes('celebrity')) || (matchObj.brandB && matchObj.brandB.toLowerCase().includes('celebrity'))) isCelebrity = true; else if ((offerCodeA && offerCodeA.toLowerCase().includes('celebrity')) || (matchObj.offerCodeB && matchObj.offerCodeB.toLowerCase().includes('celebrity'))) isCelebrity = true;
                const categoryOrder = isCelebrity ? celebrityOrder : defaultOrder;
                const idxA = categoryOrder.indexOf(roomTypeA);
                const idxB = categoryOrder.indexOf(roomTypeB);
                let lowestIdx = Math.min(idxA, idxB);
                let lowestRoomType = categoryOrder[lowestIdx >= 0 ? lowestIdx : 0];
                sailingA.roomType = lowestRoomType;
                offerA.category = lowestRoomType;
            } else {
                let isCelebrity = false;
                if ((brandA && brandA.toLowerCase().includes('celebrity')) || (matchObj.brandB && matchObj.brandB.toLowerCase().includes('celebrity'))) isCelebrity = true; else if ((offerCodeA && offerCodeA.toLowerCase().includes('celebrity')) || (matchObj.offerCodeB && matchObj.offerCodeB.toLowerCase().includes('celebrity'))) isCelebrity = true;
                const categoryOrder = isCelebrity ? celebrityOrder : defaultOrder;
                if (offerCodeA !== matchObj.offerCodeB) offerA.campaignOffer.offerCode = offerCodeA + ' / ' + matchObj.offerCodeB;
                const canUpgrade = !isGOBOA && !isGOBOB;
                const idxA = categoryOrder.indexOf(roomTypeA);
                const idxB = categoryOrder.indexOf(roomTypeB);
                let highestIdx = Math.max(idxA, idxB);
                let upgradedRoomType = categoryOrder[highestIdx];
                if (canUpgrade) {
                    if (highestIdx >= 0 && highestIdx < categoryOrder.length - 1) upgradedRoomType = categoryOrder[highestIdx + 1];
                }
                sailingA.roomType = upgradedRoomType;
                offerA.category = upgradedRoomType;
                offerA.guests = '2 guests';
            }
            return true;
        });
    });
    deepCopy.data.offers = offersA.filter(o => o.campaignOffer?.sailings?.length > 0);
    deepCopy.merged = true;
    deepCopy.mergedFrom = [profileA.data?.email, profileB.data?.email].filter(Boolean);
    deepCopy.savedAt = Date.now();
    return deepCopy;
}

function preserveSelectedProfileKey(state, prevState) {
    let selectedProfileKey = state.selectedProfileKey || (prevState && prevState.selectedProfileKey);
    if (!selectedProfileKey) {
        const activeTab = document.querySelector('.profile-tab.active');
        if (activeTab) selectedProfileKey = activeTab.getAttribute('data-storage-key') || activeTab.getAttribute('data-key');
    }
    return { ...state, selectedProfileKey: selectedProfileKey || null };
}

function getLinkedAccounts() {
    try {
        const raw = (typeof goboStorageGet === 'function' ? goboStorageGet('goboLinkedAccounts') : localStorage.getItem('goboLinkedAccounts'));
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function setLinkedAccounts(arr) {
    try {
        if (typeof goboStorageSet === 'function') goboStorageSet('goboLinkedAccounts', JSON.stringify(arr)); else localStorage.setItem('goboLinkedAccounts', JSON.stringify(arr));
    } catch (e) {
    }
}

function formatTimeAgo(savedAt) {
    const now = Date.now();
    const diffMs = now - savedAt;
    const minute = 60000, hour = 60 * minute, day = 24 * hour, week = 7 * day, month = 30 * day;
    if (diffMs < minute) return 'just now';
    if (diffMs < hour) return `${Math.floor(diffMs / minute)} minute${Math.floor(diffMs / minute) === 1 ? '' : 's'} ago`;
    if (diffMs < day) return `${Math.floor(diffMs / hour)} hour${Math.floor(diffMs / hour) === 1 ? '' : 's'} ago`;
    if (diffMs < week) return `${Math.floor(diffMs / day)} day${Math.floor(diffMs / day) === 1 ? '' : 's'} ago`;
    if (diffMs < month) return `${Math.floor(diffMs / week)} week${Math.floor(diffMs / week) === 1 ? '' : 's'} ago`;
    return `${Math.floor(diffMs / month)} month${Math.floor(diffMs / month) === 1 ? '' : 's'} ago`;
}

function updateCombinedOffersCache() {
    const linkedAccounts = getLinkedAccounts();
    if (!linkedAccounts || linkedAccounts.length < 2) return;
    const profiles = linkedAccounts.map(acc => {
        const raw = (typeof goboStorageGet === 'function' ? goboStorageGet(acc.key) : localStorage.getItem(acc.key));
        return raw ? JSON.parse(raw) : null;
    }).filter(Boolean);
    if (profiles.length < 2) return;
    const merged = mergeProfiles(profiles[0], profiles[1]);
    if (typeof goboStorageSet === 'function') goboStorageSet('goob-combined', JSON.stringify(merged)); else localStorage.setItem('goob-combined', JSON.stringify(merged));
    if (App.ProfileCache && App.ProfileCache['goob-combined-linked']) delete App.ProfileCache['goob-combined-linked'];
}

function getAssetUrl(path) {
    if (typeof browser !== 'undefined' && browser.runtime?.getURL) return browser.runtime.getURL(path);
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) return chrome.runtime.getURL(path);
    return path;
}
