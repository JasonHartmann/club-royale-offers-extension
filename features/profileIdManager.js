var RESTRICTED_PROFILE_KEY_PATTERN = /^gobo-[RC]-/i;

// Manages stable assignment of numeric profile IDs to gobo-* profile keys.
// Once a profile key receives an ID it will never change unless the profile
// is deleted (its storage entry removed). Deleted profile IDs return to a
// free pool and may be reused by future new profiles.
(function(global){
    var STORAGE_KEY = 'goboProfileIdMap_v1';
    var FREE_KEY = 'goboProfileIdFreeIds_v1';
    var NEXT_KEY = 'goboProfileIdNext_v1';
    var DEBUG = true;
    function log(){ if (!DEBUG) return; try { console.debug('[ProfileIdManager]', [].slice.call(arguments)); } catch(e){} }
    function warn(){ try { console.warn('[ProfileIdManager]', [].slice.call(arguments)); } catch(e){} }
    function error(){ try { console.error('[ProfileIdManager]', [].slice.call(arguments)); } catch(e){} }
    function safeGet(k){ try { if (typeof goboStorageGet === 'function') return goboStorageGet(k); if (global.localStorage) return global.localStorage.getItem(k); } catch(e){} return null; }
    function safeSet(k,v){ try { if (typeof goboStorageSet === 'function') goboStorageSet(k,v); else if (global.localStorage) global.localStorage.setItem(k,v); } catch(e){} }

    var mgr = {
        ready: false,
        map: {},
        free: [],
        next: 1,
        _deferredAssign: [],
        _reentrant: false,
        init: function(){
            if (this.ready) return;
            try { console.debug('[ProfileIdManager] init starting'); } catch(e) {}
            this._hydrate();
            this.ready = true;
            try { console.debug('[ProfileIdManager] init completed', { ready: this.ready, next: this.next, mapKeys: Object.keys(this.map || {}) }); } catch(e) {}
            this._applyDeferredAssign();
        },
        // Return true for branded profile keys like `gobo-R-foo`
        _isBrandedKey: function(k){ return typeof k === 'string' && /^gobo-[A-Za-z]-/.test(k); },
        _unbrandedForBranded: function(brandedKey){
            if (!this._isBrandedKey(brandedKey)) return null;
            return brandedKey.replace(/^gobo-[A-Za-z]-/, 'gobo-');
        },
        _hydrate: function(){
            try { var rawMap = safeGet(STORAGE_KEY); this.map = rawMap ? JSON.parse(rawMap) : this.map; } catch(e){ error('map parse', e); }
            try { var rawFree = safeGet(FREE_KEY); this.free = rawFree ? JSON.parse(rawFree) : this.free; } catch(e){ error('free parse', e); }
            try { var rawNext = safeGet(NEXT_KEY); if (rawNext) this.next = JSON.parse(rawNext); else { var maxId = 0; for (var k in this.map) if (this.map.hasOwnProperty(k)) if (this.map[k] > maxId) maxId = this.map[k]; this.next = maxId + 1 || 1; } } catch(e){ var maxId2 = 0; for (var k2 in this.map) if (this.map.hasOwnProperty(k2)) if (this.map[k2] > maxId2) maxId2 = this.map[k2]; this.next = maxId2 + 1 || 1; }
            // Cleanup: if both unbranded `gobo-username` and branded `gobo-X-username` exist,
            // prefer the branded mapping and remove the unbranded one (freeing its ID).
            try {
                var keys = Object.keys(this.map || {});
                if (keys.length) {
                    for (var idx = 0; idx < keys.length; idx++) {
                        var k = keys[idx];
                        // skip already branded keys like `gobo-R-foo`
                        if (/^gobo-[A-Za-z]-/.test(k)) continue;
                        // only consider keys that start with `gobo-`
                        if (!/^gobo-/.test(k)) continue;
                        var suffix = k.replace(/^gobo-/, '');
                        // look for any branded version
                        var brandedFound = false;
                        for (var letter = 0; letter < 26; letter++) {
                            // construct branded pattern `gobo-<Letter>-<suffix>` (case-insensitive)
                            var patternKeyUpper = 'gobo-' + String.fromCharCode(65 + letter) + '-' + suffix;
                            var patternKeyLower = 'gobo-' + String.fromCharCode(97 + letter) + '-' + suffix;
                            if (this.map.hasOwnProperty(patternKeyUpper) || this.map.hasOwnProperty(patternKeyLower)) {
                                brandedFound = true;
                                break;
                            }
                        }
                        if (brandedFound) {
                            try {
                                var legacyId = this.map[k];
                                if (legacyId != null && this.free.indexOf(legacyId) === -1) this.free.push(legacyId);
                                delete this.map[k];
                            } catch (delErr) { /* ignore */ }
                        }
                    }
                }
            } catch (cleanupErr) { /* ignore cleanup errors */ }

            // Deduplicate numeric IDs: if a numeric ID is assigned to multiple keys,
            // keep a single mapping (prefer branded `gobo-<Letter>-...`) and free the rest.
            try {
                var idToKeys = {};
                var allKeys = Object.keys(this.map || {});
                for (var ii = 0; ii < allKeys.length; ii++) {
                    var kk = allKeys[ii];
                    var iid = this.map[kk];
                    if (iid == null) continue;
                    if (!idToKeys[iid]) idToKeys[iid] = [];
                    idToKeys[iid].push(kk);
                }
                for (var iidStr in idToKeys) {
                    var coll = idToKeys[iidStr];
                    if (!coll || coll.length < 2) continue;
                    coll.sort(function(a,b){
                        var aBr = /^gobo-[A-Za-z]-/.test(a) ? 0 : 1;
                        var bBr = /^gobo-[A-Za-z]-/.test(b) ? 0 : 1;
                        if (aBr !== bBr) return aBr - bBr;
                        return a.localeCompare(b);
                    });
                    for (var ci = 1; ci < coll.length; ci++) {
                        var removeKey = coll[ci];
                        try {
                            var freed = this.map[removeKey];
                            if (freed != null && this.free.indexOf(freed) === -1) this.free.push(freed);
                            delete this.map[removeKey];
                        } catch (eDel) { /* ignore */ }
                    }
                }
                // Ensure `free` has unique IDs
                if (this.free && this.free.length) {
                    var seen = {};
                    var uniq = [];
                    for (var fi = 0; fi < this.free.length; fi++) {
                        var v = this.free[fi];
                        if (v == null) continue;
                        if (!seen[v]) { seen[v] = true; uniq.push(v); }
                    }
                    this.free = uniq;
                }
            } catch (dedupeErr) { /* ignore */ }
        },
        _persist: function(force){
            if (!this.ready && !force) return;
            if (this._reentrant && !force) return; // do not persist while inside ensureIds unless forced
            try {
                // Before persisting, ensure there are no duplicate numeric IDs assigned.
                try {
                    var seenId = {};
                    var mapKeys = Object.keys(this.map || {});
                    // prefer branded keys when choosing which mapping to keep
                    mapKeys.sort(function(a,b){
                        var aBr = /^gobo-[A-Za-z]-/.test(a) ? 0 : 1;
                        var bBr = /^gobo-[A-Za-z]-/.test(b) ? 0 : 1;
                        if (aBr !== bBr) return aBr - bBr;
                        return a.localeCompare(b);
                    });
                    for (var mi=0; mi<mapKeys.length; mi++) {
                        var mk = mapKeys[mi];
                        var mv = this.map[mk];
                        if (mv == null) continue;
                        if (!seenId[mv]) {
                            seenId[mv] = mk;
                        } else {
                            // duplicate id: remove this mapping and free the id
                            try {
                                delete this.map[mk];
                                if (this.free.indexOf(mv) === -1) this.free.push(mv);
                            } catch (e) { /* ignore */ }
                        }
                    }
                    // normalize free list to unique values
                    if (this.free && this.free.length) {
                        var fseen = {};
                        var uniq = [];
                        for (var fi=0; fi<this.free.length; fi++) {
                            var fv = this.free[fi];
                            if (fv == null) continue;
                            if (!fseen[fv]) { fseen[fv] = true; uniq.push(fv); }
                        }
                        this.free = uniq;
                    }
                    // ensure next is at least max(map)+1
                    try {
                        var maxId = 0;
                        for (var k2 in this.map) if (this.map.hasOwnProperty(k2)) if (this.map[k2] > maxId) maxId = this.map[k2];
                        this.next = Math.max(this.next || 1, maxId + 1 || 1);
                    } catch (eNext) { /* ignore */ }
                } catch (dedupeErr) { /* ignore dedupe errors */ }

                try { if (typeof window !== 'undefined') window.__profileIdPersistInProgress = true; } catch(ignore) {}
                try {
                    var useGobo = (typeof goboStorageSet === 'function');
                    try { console.debug('[ProfileIdManager] _persist writing via', useGobo ? 'goboStorageSet' : 'localStorage', { mapSize: Object.keys(this.map||{}).length, free: (this.free||[]).slice(), next: this.next }); } catch(e) {}
                } catch(ignoreLog) {}
                // Actual writes
                safeSet(STORAGE_KEY, JSON.stringify(this.map));
                safeSet(FREE_KEY, JSON.stringify(this.free));
                safeSet(NEXT_KEY, JSON.stringify(this.next));
                // Emit storage-updated events so other code (and our tests) can observe the exact keys written
                try {
                    if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
                        try { document.dispatchEvent(new CustomEvent('goboStorageUpdated', { detail: { key: STORAGE_KEY } })); } catch(e) {}
                        try { document.dispatchEvent(new CustomEvent('goboStorageUpdated', { detail: { key: FREE_KEY } })); } catch(e) {}
                        try { document.dispatchEvent(new CustomEvent('goboStorageUpdated', { detail: { key: NEXT_KEY } })); } catch(e) {}
                    }
                } catch(ignoreEvt) {}
                // Also write a visible marker into localStorage and print a page-visible console line
                try {
                    var persistMarker = { ts: Date.now(), mapSize: Object.keys(this.map||{}).length, free: (this.free||[]).slice(), next: this.next };
                    try { if (typeof localStorage !== 'undefined' && localStorage) localStorage.setItem('__goboProfileIdLastPersist_v1', JSON.stringify(persistMarker)); } catch(e) {}
                    try { console.log('[ProfileIdManager][PERSIST]', persistMarker); } catch(e) {}
                } catch(ignoreMarker) {}
                // Clear the in-progress flag on the next tick so other listeners know this was an internal write
                try { if (typeof window !== 'undefined') { setTimeout(function(){ try{ window.__profileIdPersistInProgress = false; } catch(e){} }, 0); } } catch(ignore2) {}
            } catch(e){ error('persist fail', e); }
        },
        ensureIds: function(keys){
            this.init();
            try { console.debug('[ProfileIdManager] ensureIds called', { keys: keys, reentrant: this._reentrant, next: this.next, free: (this.free || []).slice(), mapSnapshot: { ...this.map } }); } catch(e) {}
            if (!Array.isArray(keys) || !keys.length) return this.map;
            var assignable = [];
            for (var i=0;i<keys.length;i++) {
                var k = keys[i];
                // Allow ensureIds to assign to legacy unbranded keys (tests and migrations may seed them)
                if (!/^gobo-/.test(k)) continue;
                if (this.map[k] == null && assignable.indexOf(k) === -1) assignable.push(k);
            }
            try { console.debug('[ProfileIdManager] computed assignable', { assignable: assignable.slice() }); } catch(e) {}
            if (!assignable.length) return this.map;
            if (this._reentrant) {
                try {
                    try { console.debug('[ProfileIdManager] deferring assignable due to reentrant', { assignable: assignable.slice(), deferredBefore: this._deferredAssign.slice() }); } catch(e) {}
                    for (var ai = 0; ai < assignable.length; ai++) {
                        var ak = assignable[ai];
                        if (this._deferredAssign.indexOf(ak) === -1) this._deferredAssign.push(ak);
                    }
                    try { console.debug('[ProfileIdManager] deferredAssign after push', { deferredAssign: this._deferredAssign.slice() }); } catch(e) {}
                } catch (dq) { /* ignore */ }
                return this.map;
            }
            this._reentrant = true;
            try {
                if (this.free.length) this.free.sort(function(a,b){ return a-b; });
                for (var j=0;j<assignable.length;j++) {
                    var key = assignable[j];
                    // If there's an unbranded legacy key with an ID for this suffix, transfer it
                    try {
                        var legacyKey = this._unbrandedForBranded(key);
                        if (legacyKey && this.map.hasOwnProperty(legacyKey) && this.map[legacyKey] != null) {
                            this.transferId(legacyKey, key);
                            continue;
                        }
                    } catch(eLegacy) { /* ignore and proceed to allocate */ }
                    var id;
                    if (this.free.length) { id = this.free.shift(); }
                    else { id = this.next++; }
                    this.map[key] = id;
                }
                try { console.debug('[ProfileIdManager] assigned ids', { assignedKeys: assignable.slice(), mapSnapshot: assignable.reduce(function(acc,kk){ acc[kk]=this.map[kk]; return acc; }.bind(this), {}) }); } catch(e) {}
            } finally { this._reentrant = false; }
            this._persist(true);
            // If other callers queued keys while we were assigning, process them now.
            if (this._deferredAssign && this._deferredAssign.length) {
                try { this._applyDeferredAssign(); } catch(eDeferred) { /* ignore */ }
            }
            return this.map;
        },
        removeKeys: function(keys){
            this.init();
            if (!Array.isArray(keys) || !keys.length) return;
            var changed = false;
            var seen = {};
            for (var i=0;i<keys.length;i++) {
                var key = keys[i];
                if (seen[key]) continue;
                seen[key] = true;
                if (this.map.hasOwnProperty(key)) {
                    var id = this.map[key];
                    if (id != null && this.free.indexOf(id) === -1) this.free.push(id);
                    delete this.map[key];
                    changed = true;
                }
            }
            if (changed) this._persist();
        },
        sanitizeProfileKeys: function(profileKeys){
            this.init();
            var keys = Array.isArray(profileKeys) ? profileKeys.slice() : [];
            var removed = [];
            keys = keys.filter(function(key){
                if (RESTRICTED_PROFILE_KEY_PATTERN.test(key)) {
                    if (removed.indexOf(key) === -1) removed.push(key);
                    return false;
                }
                return true;
            });
            if (removed.length) {
                try {
                    this.removeKeys(removed);
                } catch (e) {
                    warn('Failed to remove restricted profile keys from ID map', e);
                }
                try {
                    cleanupRestrictedProfileArtifacts(removed);
                } catch (cleanupErr) {
                    warn('Failed to cleanup restricted profile artifacts', cleanupErr);
                }
            }
            return {filteredKeys: keys, removedKeys: removed};
        },
        persist: function(){ this._persist(true); },
        // Move an existing ID from oldKey to newKey (used during migration)
        transferId: function(oldKey, newKey){
            this.init();
            try {
                if (!oldKey || !newKey) return null;
                if (!this.map || !this.map.hasOwnProperty(oldKey)) return null;
                var id = this.map[oldKey];
                if (id == null) return null;
                // If newKey already has an ID, do nothing
                if (this.map.hasOwnProperty(newKey) && this.map[newKey] != null) return this.map[newKey];
                // Move id
                this.map[newKey] = id;
                delete this.map[oldKey];
                try { console.log('[ProfileIdManager] transferId moved', { from: oldKey, to: newKey, id: id }); } catch(e) {}
                // Ensure free/next consistency
                if (this.free && this.free.indexOf(id) !== -1) {
                    this.free = this.free.filter(function(v){ return v !== id; });
                }
                // Ensure next is at least max(map)+1
                try {
                    var maxId = 0;
                    for (var k in this.map) if (this.map.hasOwnProperty(k)) if (this.map[k] > maxId) maxId = this.map[k];
                    this.next = Math.max(this.next || 1, maxId + 1 || 1);
                } catch(e){}
                this._persist(true);
                return id;
            } catch(e) { return null; }
        },
        // Synchronously assign numeric IDs for any missing keys (used by UI rendering)
        assignMissingIds: function(keys){
            this.init();
            try { console.debug('[ProfileIdManager] assignMissingIds called', { keys: keys && keys.slice ? keys.slice() : keys }); } catch(e) {}
            if (!Array.isArray(keys) || !keys.length) return this.map;
            // Deduplicate incoming keys and preserve order
            var seenIn = {};
            var processKeys = [];
            for (var pi=0; pi<keys.length; pi++) {
                var pk = keys[pi];
                if (!pk) continue;
                if (seenIn[pk]) continue;
                seenIn[pk] = true;
                processKeys.push(pk);
            }
            var assigned = [];
            try {
                if (!this.free) this.free = [];
                try { console.debug('[ProfileIdManager] assignMissingIds state before', { next: this.next, free: (this.free||[]).slice(), mapKeys: Object.keys(this.map||{}) }); } catch(e) {}
                try { console.debug('[ProfileIdManager] assignMissingIds state before', { next: this.next, free: (this.free||[]).slice(), mapKeys: Object.keys(this.map||{}) }); } catch(e) {}
                for (var i=0;i<processKeys.length;i++){
                    var k = processKeys[i];
                    try { console.debug('[ProfileIdManager] consider key', k, 'existingId:', this.map[k]); } catch(e) {}
                    // Skip non-gobo and legacy unbranded gobo keys — only branded keys should receive IDs here
                    if (!this._isBrandedKey(k)) {
                        try { console.debug('[ProfileIdManager] skipping unbranded/non-gobo key (no ID assigned)', k); } catch(e) {}
                        continue;
                    }
                    if (this.map[k] == null) {
                        // If a legacy unbranded key already has an ID for this suffix, transfer it instead of allocating
                        try {
                            var legacy = this._unbrandedForBranded(k);
                            if (legacy && this.map.hasOwnProperty(legacy) && this.map[legacy] != null) {
                                var moved = this.transferId(legacy, k);
                                if (moved != null) {
                                    assigned.push({key:k,id:moved});
                                    try { console.debug('[ProfileIdManager] transferred id from legacy', { legacy: legacy, key: k, id: moved }); } catch(e) {}
                                    continue;
                                }
                            }
                        } catch(eTrans) { /* ignore and proceed */ }
                        var id;
                        // Ensure free list does not contain IDs that are already used in map
                        try {
                            if (this.free && this.free.length) {
                                var used = {};
                                for (var mk in this.map) if (this.map.hasOwnProperty(mk)) { var mv = this.map[mk]; if (mv != null) used[mv] = true; }
                                // filter free in-place to only IDs not present in used
                                var newFree = [];
                                for (var fi=0; fi<this.free.length; fi++) {
                                    var fv = this.free[fi];
                                    if (fv == null) continue;
                                    if (used[fv]) {
                                        try { console.debug('[ProfileIdManager] skipping free id already in use', fv); } catch(e) {}
                                        continue;
                                    }
                                    newFree.push(fv);
                                }
                                this.free = newFree;
                            }
                        } catch(filterErr) { /* ignore */ }
                        // Ensure `next` is greater than any ID currently used in the map
                        try {
                            var maxUsed = 0;
                            for (var umk in this.map) if (this.map.hasOwnProperty(umk)) { var umv = this.map[umk]; if (umv != null && umv > maxUsed) maxUsed = umv; }
                            if (!this.next || this.next <= maxUsed) {
                                try { console.debug('[ProfileIdManager] bumping next from', this.next, 'to', maxUsed + 1); } catch(e) {}
                                this.next = (maxUsed || 0) + 1;
                            }
                        } catch(bumpErr) { /* ignore */ }
                        if (this.free.length) { this.free.sort(function(a,b){return a-b;}); id = this.free.shift(); }
                        else { id = this.next++; }
                        this.map[k] = id;
                        assigned.push({key:k,id:id});
                        try { console.debug('[ProfileIdManager] assigned', { key: k, id: id }); } catch(e) {}
                    } else {
                        try { console.debug('[ProfileIdManager] already had id for', k, this.map[k]); } catch(e) {}
                    }
                }
                if (assigned.length) this._persist(true);
            } catch(e) { /* ignore */ }
            try { console.debug('[ProfileIdManager] assignMissingIds result', { assigned: assigned.slice(), mapSnapshot: { ...this.map } }); } catch(e) {}
            return assigned;
        },
        getId: function(k){
            this.init();
            if (this.map[k] != null) return this.map[k];
            try {
                // Only assign IDs for branded gobo keys
                if (this._isBrandedKey(k)) {
                    try { this.ensureIds([k]); } catch(e) { /* ignore */ }
                    return this.map[k] != null ? this.map[k] : null;
                }
            } catch(e) { /* ignore */ }
            return null;
        },
        dump: function(){ this.init(); return { ready:this.ready, map:this.map, free:this.free, next:this.next }; },
        _applyDeferredAssign: function(){ if (!this._deferredAssign.length) return; this.ensureIds(this._deferredAssign.slice()); this._deferredAssign = []; }
    };

    global.ProfileIdManager = mgr;
    try { mgr.init(); } catch(e){ }
    if (!global.dumpProfileIdState) global.dumpProfileIdState = function(){ return global.ProfileIdManager ? global.ProfileIdManager.dump() : null; };
})(typeof window !== 'undefined' ? window : globalThis);

// Stable Profile ID initialization: mirror ProfileIdManager map if available
try {
    if (typeof ProfileIdManager !== 'undefined' && ProfileIdManager) {
        ProfileIdManager.init();
        var root = typeof window !== 'undefined' ? window : globalThis;
        if (!root.App) root.App = {};
        if (!root.App.ProfileIdMap) root.App.ProfileIdMap = { ...ProfileIdManager.map };
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
            // if (offerNameA.includes('two room offer') || offerNameB.includes('two room offer')) return false;
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
            // Merge perk codes from both offers and include sailing-level bonus perks
            try {
                const aPerks = Array.isArray(offerA.campaignOffer?.perkCodes) ? offerA.campaignOffer.perkCodes.slice() : [];
                const bPerks = Array.isArray(matchObj.offerB?.campaignOffer?.perkCodes) ? matchObj.offerB.campaignOffer.perkCodes.slice() : [];
                const seen = new Set();
                const combined = [];
                const pushPerk = (p) => {
                    if (!p) return;
                    const name = (p && (p.perkName || p.perkCode)) ? (p.perkName || p.perkCode) : String(p);
                    const key = String(name).trim();
                    if (!key) return;
                    if (seen.has(key)) return;
                    seen.add(key);
                    if (typeof p === 'string') combined.push({ perkCode: p }); else combined.push(p);
                };
                aPerks.forEach(pushPerk);
                bPerks.forEach(pushPerk);
                // include sailing-level bonus from matched B sailing if present
                try {
                    const bonusB = matchObj.sailingB && matchObj.sailingB.nextCruiseBonusPerkCode ? matchObj.sailingB.nextCruiseBonusPerkCode : null;
                    if (bonusB) {
                        const bonusName = (bonusB.perkName || bonusB.perkCode) ? (bonusB.perkName || bonusB.perkCode) : String(bonusB);
                        if (bonusName && !seen.has(String(bonusName).trim())) {
                            seen.add(String(bonusName).trim());
                            if (typeof bonusB === 'string') combined.push({ perkCode: bonusB }); else combined.push(bonusB);
                        }
                    }
                } catch (bonusErr) { /* ignore */ }
                if (combined.length) {
                    // Ensure campaignOffer exists
                    if (!offerA.campaignOffer) offerA.campaignOffer = {};
                    offerA.campaignOffer.perkCodes = combined;
                }
            } catch (perkMergeErr) { /* ignore */ }
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
        const arr = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(arr) || !arr.length) return arr || [];
        let changed = false;
        const normalized = arr.map((acc) => {
            try {
                if (!acc || !acc.key || typeof acc.key !== 'string') return acc;
                const k = acc.key;
                // If already branded, leave as-is
                if (/^gobo-[A-Za-z]-/.test(k) || k === 'goob-combined' || k === 'goob-combined-linked' || k === 'goob-favorites') return acc;
                // Legacy unbranded key: try to prefer/migrate to branded key
                if (/^gobo-/.test(k)) {
                    const username = k.replace(/^gobo-/, '');
                    // Try to read existing payload to preserve brand if present
                    let rawPayload = null;
                    try { rawPayload = (typeof goboStorageGet === 'function') ? goboStorageGet(k) : localStorage.getItem(k); } catch(e) { rawPayload = null; }
                    let payload = null;
                    try { payload = rawPayload ? JSON.parse(rawPayload) : null; } catch(e) { payload = null; }
                    let detectedBrand = payload && payload.brand ? payload.brand : null;
                    try { if (!detectedBrand && typeof App !== 'undefined' && App.Utils && typeof App.Utils.detectBrand === 'function') detectedBrand = App.Utils.detectBrand(); } catch(e) {}
                    if (!detectedBrand) detectedBrand = 'R';
                    const brandedKey = `gobo-${detectedBrand}-${username}`;
                    try {
                        const brandedExists = (typeof goboStorageGet === 'function') ? goboStorageGet(brandedKey) : localStorage.getItem(brandedKey);
                        // If branded exists, prefer it
                        if (brandedExists) {
                            changed = true;
                            return { ...acc, key: brandedKey };
                        }
                        // If payload present, migrate payload into branded key
                        if (payload) {
                            try { if (typeof goboStorageSet === 'function') goboStorageSet(brandedKey, JSON.stringify(payload)); else localStorage.setItem(brandedKey, JSON.stringify(payload)); } catch(e) {}
                            try { if (typeof goboStorageRemove === 'function') goboStorageRemove(k); else localStorage.removeItem(k); } catch(e) {}
                            // Preserve ProfileIdManager mapping if present
                                    try {
                                        if (typeof ProfileIdManager !== 'undefined' && ProfileIdManager) {
                                            var legacyId = ProfileIdManager.getId(k);
                                            if (legacyId != null) {
                                                try { ProfileIdManager.transferId(k, brandedKey); } catch(eTrans) { /* ignore */ }
                                                try { App.ProfileIdMap = { ...ProfileIdManager.map }; } catch(eMap) { /* ignore */ }
                                            }
                                        }
                                    } catch(e) { /* ignore */ }
                            changed = true;
                            return { ...acc, key: brandedKey };
                        }
                    } catch(e) { /* ignore migration errors */ }
                }
            } catch(e) { /* ignore single-account errors */ }
            return acc;
        });
        if (changed) {
            try { setLinkedAccounts(normalized); } catch(e) { /* ignore */ }
        }
        return normalized;
    } catch (e) {
        return [];
    }
}

function setLinkedAccounts(arr) {
    try {
        // Persist normalized linked accounts array
        const payload = Array.isArray(arr) ? arr : [];
        if (typeof goboStorageSet === 'function') goboStorageSet('goboLinkedAccounts', JSON.stringify(payload)); else localStorage.setItem('goboLinkedAccounts', JSON.stringify(payload));
    } catch (e) {
    }
}

function cleanupRestrictedProfileArtifacts(removedKeys) {
    if (!Array.isArray(removedKeys) || !removedKeys.length) return;
    removedKeys.forEach(function(badKey) {
        try {
            if (typeof goboStorageRemove === 'function') goboStorageRemove(badKey); else if (typeof localStorage !== 'undefined' && localStorage) localStorage.removeItem(badKey);
        } catch (ignoreRemoval) { /* ignore */ }
        try {
            if (typeof App !== 'undefined' && App && App.ProfileCache && App.ProfileCache[badKey]) delete App.ProfileCache[badKey];
        } catch (ignoreCache) { /* ignore */ }
    });
    try {
        const linked = getLinkedAccounts();
        const filteredLinked = linked.filter(acc => acc && removedKeys.indexOf(acc.key) === -1);
        if (filteredLinked.length !== linked.length) {
            setLinkedAccounts(filteredLinked);
            if (filteredLinked.length < 2) {
                if (typeof goboStorageRemove === 'function') goboStorageRemove('goob-combined'); else if (typeof localStorage !== 'undefined' && localStorage) localStorage.removeItem('goob-combined');
                if (typeof App !== 'undefined' && App && App.ProfileCache && App.ProfileCache['goob-combined-linked']) delete App.ProfileCache['goob-combined-linked'];
            }
        }
    } catch (ignoreLinked) { /* ignore */ }
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = globalThis.ProfileIdManager;
}

// Keep ProfileIdManager in sync with the storage shim when it becomes ready
try {
    if (typeof document !== 'undefined') {
        document.addEventListener('goboStorageReady', function() {
            try {
                if (typeof ProfileIdManager !== 'undefined' && ProfileIdManager) {
                    ProfileIdManager._hydrate();
                    if (typeof App !== 'undefined' && App) App.ProfileIdMap = { ...ProfileIdManager.map };
                }
            } catch(e) { /* ignore */ }
        });
        document.addEventListener('goboStorageUpdated', function(ev) {
            try {
                var key = ev && ev.detail && ev.detail.key ? ev.detail.key : null;
                if (!key) return;
                if (/^goboProfileId(Map|FreeIds|Next)_v1$/.test(key)) {
                    if (typeof ProfileIdManager !== 'undefined' && ProfileIdManager) {
                        ProfileIdManager._hydrate();
                        if (typeof App !== 'undefined' && App) App.ProfileIdMap = { ...ProfileIdManager.map };
                    }
                }
            } catch(e) { /* ignore */ }
        });
    }
} catch(e) { /* ignore */ }
