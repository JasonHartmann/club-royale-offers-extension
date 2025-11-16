// Manages stable assignment of numeric profile IDs to gobo-* profile keys.
// Once a profile key receives an ID it will never change unless the profile
// is deleted (its storage entry removed). Deleted profile IDs return to a
// free pool and may be reused by future new profiles.
(function(global){
    const STORAGE_KEY = 'goboProfileIdMap_v1';
    const FREE_KEY = 'goboProfileIdFreeIds_v1';
    const NEXT_KEY = 'goboProfileIdNext_v1';
    const DEBUG = true; // Toggle verbose debug logging

    function debugLog(...args){ if (DEBUG) { try { console.debug('[ProfileIdManager]', ...args); } catch(e){} } }
    function warnLog(...args){ try { console.warn('[ProfileIdManager]', ...args); } catch(e){} }
    function errorLog(...args){ try { console.error('[ProfileIdManager]', ...args); } catch(e){} }

    function loadJson(key, def){
        try {
            const raw = (typeof goboStorageGet === 'function' ? goboStorageGet(key) : (global.localStorage ? localStorage.getItem(key) : null));
            if (!raw) { debugLog('loadJson: no value for', key); return def; }
            const parsed = JSON.parse(raw);
            debugLog('loadJson: loaded', key, parsed);
            return parsed;
        } catch(e){ errorLog('loadJson: failed to load/parse', key, e); return def; }
    }
    function saveJson(key, val){
        try {
            const serialized = JSON.stringify(val);
            if (typeof goboStorageSet === 'function') goboStorageSet(key, serialized);
            else if (global.localStorage) localStorage.setItem(key, serialized);
            debugLog('saveJson: persisted', key, val);
        } catch(e){ errorLog('saveJson: persistence error for', key, e, 'value:', val); }
    }

    // Helper to remove a raw profile storage entry (non-mapping) – used during migration
    function removeProfileStorageKey(rawKey){
        try {
            if (typeof goboStorageRemove === 'function') {
                goboStorageRemove(rawKey);
            } else if (global.localStorage) {
                localStorage.removeItem(rawKey);
            }
            debugLog('removeProfileStorageKey: removed legacy storage key', rawKey);
        } catch(e){ errorLog('removeProfileStorageKey: failed removing legacy storage key', rawKey, e); }
    }

    const mgr = {
        ready: false,
        map: {},          // { profileKey: number }
        free: [],         // [number]
        next: 1,          // next auto-increment id when free list empty
        _storeDeferred: false,
        _pendingAssignKeys: new Set(),
        _pendingRemoveKeys: new Set(),
        _pendingMigrations: [], // [{ legacyKey, newKey, options }]
        init(){
            // Defer initialization until GoboStore is hydrated to avoid losing persisted mapping
            try {
                if (typeof GoboStore !== 'undefined' && GoboStore && !GoboStore.ready) {
                    if (!this._storeDeferred) {
                        this._storeDeferred = true;
                        debugLog('init: GoboStore not ready; deferring ProfileIdManager initialization');
                        const handler = () => {
                            try { this._rehydrateAndFinalize(); } catch(e){ errorLog('deferred init failed', e); }
                        };
                        if (typeof document !== 'undefined') document.addEventListener('goboStorageReady', handler, { once: true });
                    } else {
                        debugLog('init: still waiting for GoboStore readiness');
                    }
                    return; // Do not mark ready yet
                }
            } catch(e){ /* ignore */ }
            if (this.ready) { debugLog('init: already ready'); return; }
            this._rehydrateAndFinalize();
        },
        _rehydrateAndFinalize(){
            // Load persisted state now that storage is (or assumed) available
            this.map = loadJson(STORAGE_KEY, this.map || {});
            this.free = loadJson(FREE_KEY, this.free || []);
            this.next = loadJson(NEXT_KEY, this.next == null ? null : this.next);
            if (this.next === null) {
                const maxId = Object.values(this.map).reduce((m,v)=> v>m? v : m, 0);
                this.next = maxId + 1 || 1;
                debugLog('_rehydrateAndFinalize: derived next from map', { maxId, next: this.next });
            }
            this.ready = true;
            this._storeDeferred = false;
            debugLog('_rehydrateAndFinalize: ready with persisted state', { map: { ...this.map }, free: [...this.free], next: this.next });
            // Apply queued removals before queued assignments (so freed IDs are available)
            if (this._pendingRemoveKeys.size) {
                const toRemove = Array.from(this._pendingRemoveKeys);
                this._pendingRemoveKeys.clear();
                debugLog('_rehydrateAndFinalize: processing queued removals', toRemove);
                this.removeKeys(toRemove);
            }
            // Process queued migrations (do BEFORE queued assignments so new keys retain legacy IDs without churn)
            if (this._pendingMigrations.length) {
                const migs = [...this._pendingMigrations];
                this._pendingMigrations = [];
                debugLog('_rehydrateAndFinalize: processing queued migrations', migs);
                migs.forEach(m => this._migrateLegacyInternal(m.legacyKey, m.newKey, m.options));
            }
            if (this._pendingAssignKeys.size) {
                const toAssign = Array.from(this._pendingAssignKeys);
                this._pendingAssignKeys.clear();
                debugLog('_rehydrateAndFinalize: processing queued assignments', toAssign);
                this._assignKeysInternal(toAssign);
            }
        },
        _assignKeysInternal(profileKeys){
            const normalized = Array.from(new Set((profileKeys || []).filter(k => /^gobo-/.test(k))));
            const assigned = [];
            normalized.forEach(k => {
                if (this.map[k] == null) {
                    let id;
                    if (this.free.length) {
                        this.free.sort((a,b)=>a-b);
                        id = this.free.shift();
                        debugLog('_assignKeysInternal: reused freed id', id, 'for key', k);
                    } else {
                        id = this.next++;
                        debugLog('_assignKeysInternal: allocated new id', id, 'for key', k);
                    }
                    this.map[k] = id;
                    assigned.push({ key: k, id, source: 'assign' });
                }
            });
            if (assigned.length) debugLog('_assignKeysInternal: newly assigned', assigned);
            if (assigned.length) this.persist();
            return this.map;
        },
        // Ensure IDs exist for provided profile keys; DO NOT reclaim implicitly to avoid churn.
        ensureIds(profileKeys){
            this.init();
            if (!this.ready) {
                // Queue keys for assignment after hydration; do NOT assign ephemeral IDs to avoid flicker / reassignment
                (profileKeys || []).forEach(k => { if (/^gobo-/.test(k)) this._pendingAssignKeys.add(k); });
                debugLog('ensureIds: deferred (storage not ready), queued keys', Array.from(this._pendingAssignKeys));
                return this.map; // likely empty until hydration
            }
            return this._assignKeysInternal(profileKeys);
        },
        removeKeys(keys){
            this.init();
            if (!this.ready) {
                (keys||[]).forEach(k => { if (/^gobo-/.test(k)) this._pendingRemoveKeys.add(k); });
                debugLog('removeKeys: deferred (storage not ready), queued removals', Array.from(this._pendingRemoveKeys));
                return;
            }
            const removed = [];
            (keys||[]).forEach(k => {
                if (this.map[k] != null) {
                    const id = this.map[k];
                    delete this.map[k];
                    if (!this.free.includes(id)) this.free.push(id);
                    removed.push({ key: k, id });
                }
            });
            if (removed.length) {
                debugLog('removeKeys: reclaimed', removed, 'free pool now', [...this.free]);
                this.persist();
            }
        },
        // INTERNAL: perform migration after ready
        _migrateLegacyInternal(legacyKey, newKey, options){
            options = options || { copyData: true, removeLegacyStorage: true };
            if (!legacyKey || !newKey || legacyKey === newKey) return;
            const legacyId = this.map[legacyKey];
            if (legacyId == null) {
                debugLog('_migrateLegacyInternal: legacy key has no ID; skipping', { legacyKey, newKey });
                return;
            }
            if (this.map[newKey] != null) {
                // Conflict: new key already mapped to different ID – MUST preserve legacyId and move it to newKey
                if (this.map[newKey] !== legacyId) {
                    const existingBrandId = this.map[newKey];
                    debugLog('_migrateLegacyInternal: conflict; reassigning brand key to legacyId and freeing previous brand id', { legacyKey, newKey, legacyId, existingBrandId });
                    // Free previous brand id (if distinct and not already free)
                    if (existingBrandId != null && existingBrandId !== legacyId && !this.free.includes(existingBrandId)) {
                        this.free.push(existingBrandId);
                    }
                    // Assign legacyId to brand key
                    this.map[newKey] = legacyId;
                    // Remove legacy key mapping WITHOUT freeing legacyId
                    delete this.map[legacyKey];
                    // Migrate/copy data then remove legacy storage
                    try {
                        if (options.copyData) {
                            const raw = (typeof goboStorageGet === 'function' ? goboStorageGet(legacyKey) : (typeof localStorage !== 'undefined' ? localStorage.getItem(legacyKey) : null));
                            const newRaw = (typeof goboStorageGet === 'function' ? goboStorageGet(newKey) : (typeof localStorage !== 'undefined' ? localStorage.getItem(newKey) : null));
                            if (raw && !newRaw) {
                                if (typeof goboStorageSet === 'function') goboStorageSet(newKey, raw); else if (typeof localStorage !== 'undefined') localStorage.setItem(newKey, raw);
                            }
                        }
                        if (options.removeLegacyStorage) removeProfileStorageKey(legacyKey);
                    } catch(e){ errorLog('_migrateLegacyInternal: storage reassignment error', e); }
                    this.persist();
                    return;
                }
                // Same ID – just remove legacy key & storage if requested
                debugLog('_migrateLegacyInternal: new key already mapped to same ID; removing legacy only', { legacyKey, newKey, id: legacyId });
                delete this.map[legacyKey];
                if (options.removeLegacyStorage) removeProfileStorageKey(legacyKey);
                this.persist();
                return;
            }
            // Assign same numeric ID to new key
            this.map[newKey] = legacyId;
            delete this.map[legacyKey]; // Do NOT release ID to free list
            debugLog('_migrateLegacyInternal: migrated legacy -> brand key preserving ID', { legacyKey, newKey, id: legacyId });
            // Move/copy stored profile data
            try {
                if (options.copyData) {
                    const raw = (typeof goboStorageGet === 'function' ? goboStorageGet(legacyKey) : (global.localStorage ? localStorage.getItem(legacyKey) : null));
                    if (raw && (!(typeof goboStorageGet === 'function' ? goboStorageGet(newKey) : (global.localStorage ? localStorage.getItem(newKey) : null)))) {
                        if (typeof goboStorageSet === 'function') goboStorageSet(newKey, raw); else if (global.localStorage) localStorage.setItem(newKey, raw);
                        debugLog('_migrateLegacyInternal: copied profile data to new key');
                    }
                }
                if (options.removeLegacyStorage) removeProfileStorageKey(legacyKey);
            } catch(e){ errorLog('_migrateLegacyInternal: storage migration error', e); }
            this.persist();
        },
        // PUBLIC: Migrate a legacy profile key to a brand-specific key without changing numeric ID.
        migrateLegacyProfile(legacyKey, newKey, options){
            this.init();
            if (!/^gobo-/.test(legacyKey) || !/^gobo-/.test(newKey)) {
                warnLog('migrateLegacyProfile: keys must start with gobo-', { legacyKey, newKey });
                return;
            }
            if (!this.ready) {
                this._pendingMigrations.push({ legacyKey, newKey, options });
                debugLog('migrateLegacyProfile: deferred (storage not ready), queued migration', { legacyKey, newKey });
                return;
            }
            this._migrateLegacyInternal(legacyKey, newKey, options);
        },
        getId(profileKey){
            this.init();
            if (!this.ready) return null; // cannot guarantee mapping yet
            const id = this.map[profileKey] || null;
            debugLog('getId:', profileKey, '=>', id);
            return id;
        },
        persist(){
            if (!this.ready) { debugLog('persist: skipped (not ready)'); return; }
            debugLog('persist: writing state');
            saveJson(STORAGE_KEY, this.map);
            saveJson(FREE_KEY, this.free);
            saveJson(NEXT_KEY, this.next);
            debugLog('persist: complete');
        },
        dump(){
            this.init();
            if (!this.ready) { debugLog('dump: not ready (deferred)'); return { deferred:true, pendingAssign:Array.from(this._pendingAssignKeys), pendingRemove:Array.from(this._pendingRemoveKeys), pendingMigrations:[...this._pendingMigrations] }; }
            debugLog('dump: current in-memory state', { map: { ...this.map }, free: [...this.free], next: this.next });
            try {
                const rawMap = goboStorageGet ? goboStorageGet(STORAGE_KEY) : null;
                const rawFree = goboStorageGet ? goboStorageGet(FREE_KEY) : null;
                const rawNext = goboStorageGet ? goboStorageGet(NEXT_KEY) : null;
                debugLog('dump: stored raw values', { rawMap, rawFree, rawNext });
            } catch(e){ errorLog('dump: failed reading stored raw values', e); }
            return { map: { ...this.map }, free: [...this.free], next: this.next };
        },
        _resetAll(){
            // Diagnostic only – not used in production flow
            try {
                this.map = {};
                this.free = [];
                this.next = 1;
                this.persist();
                debugLog('_resetAll: state cleared');
            } catch(e){ errorLog('_resetAll: failed', e); }
        }
    };

    global.ProfileIdManager = mgr;
    try {
        if (!global.dumpProfileIdState) global.dumpProfileIdState = () => (global.ProfileIdManager ? global.ProfileIdManager.dump() : null);
        if (!global.resetProfileIdManager) global.resetProfileIdManager = () => (global.ProfileIdManager ? global.ProfileIdManager._resetAll() : null);
        if (!global.migrateLegacyProfile) global.migrateLegacyProfile = (legacyKey, newKey, options) => (global.ProfileIdManager ? global.ProfileIdManager.migrateLegacyProfile(legacyKey, newKey, options) : null);
    } catch(e) { /* ignore */ }
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
