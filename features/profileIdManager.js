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
            this._hydrate();
            this.ready = true;
            this._applyDeferredAssign();
        },
        _hydrate: function(){
            try { var rawMap = safeGet(STORAGE_KEY); this.map = rawMap ? JSON.parse(rawMap) : this.map; } catch(e){ error('map parse', e); }
            try { var rawFree = safeGet(FREE_KEY); this.free = rawFree ? JSON.parse(rawFree) : this.free; } catch(e){ error('free parse', e); }
            try { var rawNext = safeGet(NEXT_KEY); if (rawNext) this.next = JSON.parse(rawNext); else { var maxId = 0; for (var k in this.map) if (this.map.hasOwnProperty(k)) if (this.map[k] > maxId) maxId = this.map[k]; this.next = maxId + 1 || 1; } } catch(e){ var maxId2 = 0; for (var k2 in this.map) if (this.map.hasOwnProperty(k2)) if (this.map[k2] > maxId2) maxId2 = this.map[k2]; this.next = maxId2 + 1 || 1; }
        },
        _persist: function(force){
            if (!this.ready && !force) return;
            if (this._reentrant) return; // do not persist while inside ensureIds
            try {
                safeSet(STORAGE_KEY, JSON.stringify(this.map));
                safeSet(FREE_KEY, JSON.stringify(this.free));
                safeSet(NEXT_KEY, JSON.stringify(this.next));
            } catch(e){ error('persist fail', e); }
        },
        ensureIds: function(keys){
            this.init();
            if (!Array.isArray(keys) || !keys.length) return this.map;
            var assignable = [];
            for (var i=0;i<keys.length;i++) {
                var k = keys[i];
                if (!/^gobo-/.test(k)) continue;
                if (this.map[k] == null && assignable.indexOf(k) === -1) assignable.push(k);
            }
            if (!assignable.length) return this.map;
            if (this._reentrant) return this.map;
            this._reentrant = true;
            try {
                if (this.free.length) this.free.sort(function(a,b){ return a-b; });
                for (var j=0;j<assignable.length;j++) {
                    var key = assignable[j];
                    var id;
                    if (this.free.length) { id = this.free.shift(); }
                    else { id = this.next++; }
                    this.map[key] = id;
                }
                this._persist();
            } finally { this._reentrant = false; }
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
        getId: function(k){ this.init(); return this.map[k] != null ? this.map[k] : null; },
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
