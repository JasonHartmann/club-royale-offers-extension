// favorites.js
// Manages user-favorited sailings persisted as a pseudo profile in storage key 'goob-favorites'.
// The stored object mirrors other profile objects: { data: { offers: [...] }, savedAt: <ts> }
// Each favorited sailing keeps its original offer wrapper but only the selected sailing inside campaignOffer.sailings[]
(function(){
    const STORAGE_KEY = 'goob-favorites';

    function getRawStorage() {
        try { return (typeof goboStorageGet === 'function' ? goboStorageGet(STORAGE_KEY) : localStorage.getItem(STORAGE_KEY)); } catch(e){ return null; }
    }
    function setRawStorage(obj) {
        try { const raw = JSON.stringify(obj); if (typeof goboStorageSet === 'function') goboStorageSet(STORAGE_KEY, raw); else localStorage.setItem(STORAGE_KEY, raw); } catch(e){ /* ignore */ }
    }

    function cloneOfferForFavorite(offer, sailing) {
        const cloned = JSON.parse(JSON.stringify(offer));
        if (cloned.campaignOffer && Array.isArray(cloned.campaignOffer.sailings)) {
            // Keep only this sailing
            cloned.campaignOffer.sailings = [ JSON.parse(JSON.stringify(sailing)) ];
        }
        return cloned;
    }

    function getSailingKey(offer, sailing, profileId) {
        const code = offer.campaignOffer?.offerCode || '';
        const ship = sailing.shipName || '';
        const date = sailing.sailDate || '';
        const isGOBO = String(sailing.isGOBO === true);
        const pid = profileId || 'C';
        return `${pid}|${code}|${ship}|${date}|${isGOBO}`;
    }

    function loadProfileObject() {
        const raw = getRawStorage();
        if (!raw) return { data: { offers: [] }, savedAt: Date.now() };
        try { return JSON.parse(raw); } catch(e){ return { data: { offers: [] }, savedAt: Date.now() }; }
    }

    function saveProfileObject(profile) {
        profile.savedAt = Date.now();
        setRawStorage(profile);
        // Invalidate any cached DOM/profile in App.ProfileCache
        try { if (App && App.ProfileCache && App.ProfileCache['goob-favorites']) delete App.ProfileCache['goob-favorites']; } catch(e){ /* ignore */ }
    }

    function findOfferIndex(profile, offer) {
        if (!profile || !profile.data || !Array.isArray(profile.data.offers)) return -1;
        const code = offer.campaignOffer?.offerCode || '';
        return profile.data.offers.findIndex(o => (o.campaignCode || o.campaignOffer?.offerCode || '') === code);
    }

    function isFavorite(offer, sailing, profileId) {
        const profile = loadProfileObject();
        const offers = profile.data.offers || [];
        const requestedPid = profileId; // may be undefined/null
        let isCombinedContext = (typeof requestedPid === 'string' && requestedPid.includes('-'));
        try { if (!isCombinedContext && App && App.CurrentProfile && App.CurrentProfile.key === 'goob-combined-linked') isCombinedContext = true; } catch(e){}
        // Pre-compute comparable core fields (excluding profileId)
        const coreCode = offer.campaignOffer?.offerCode || '';
        const coreShip = sailing.shipName || '';
        const coreDate = sailing.sailDate || '';
        const coreIsGOBO = String(sailing.isGOBO === true);
        // Exact key (when we have a requestedPid) for fast path
        const exactKey = requestedPid ? getSailingKey(offer, sailing, requestedPid) : null;
        for (const off of offers) {
            const sailings = off.campaignOffer?.sailings || [];
            for (const s of sailings) {
                const storedPid = s.__profileId || requestedPid || 'C';
                // First try exact key match (only if we have requestedPid)
                if (exactKey && getSailingKey(off, s, storedPid) === exactKey) return true;
                // If in combined context, allow core-field match ignoring pid differences
                if (isCombinedContext) {
                    const sCode = off.campaignOffer?.offerCode || '';
                    const sShip = s.shipName || '';
                    const sDate = s.sailDate || '';
                    const sIsGOBO = String(s.isGOBO === true);
                    if (coreCode === sCode && coreShip === sShip && coreDate === sDate && coreIsGOBO === sIsGOBO) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function addFavorite(offer, sailing, profileId) {
        const profile = loadProfileObject();
        // Determine effective profile id: 'C' when on combined offers tab, else provided or '0'
        let effectivePid = profileId;
        try {
            if (App && App.CurrentProfile && App.CurrentProfile.key === 'goob-combined-linked') {
                // For combined tab, use concatenated numeric profile IDs of linked accounts
                let linkedAccounts = [];
                try { if (typeof getLinkedAccounts === 'function') linkedAccounts = getLinkedAccounts(); } catch(e){}
                const linkedIds = linkedAccounts.map(acc => {
                    try { return (App.ProfileIdMap && acc.key in App.ProfileIdMap) ? App.ProfileIdMap[acc.key] : acc.key; } catch(e){ return acc.key; }
                });
                if (linkedIds.length >= 2) {
                    effectivePid = linkedIds.join('-');
                } else {
                    effectivePid = 'C';
                }
            }
        } catch(e){}
        if (!effectivePid) effectivePid = '0';
        let idx = findOfferIndex(profile, offer);
        const clonedSailing = JSON.parse(JSON.stringify(sailing));
        clonedSailing.__profileId = effectivePid;
        if (idx === -1) {
            const newOffer = cloneOfferForFavorite(offer, clonedSailing);
            newOffer.__favoriteMeta = { profileId: effectivePid };
            profile.data.offers.push(newOffer);
        } else {
            const targetOffer = profile.data.offers[idx];
            if (!targetOffer.campaignOffer) targetOffer.campaignOffer = {};
            if (!Array.isArray(targetOffer.campaignOffer.sailings)) targetOffer.campaignOffer.sailings = [];
            const key = getSailingKey(offer, clonedSailing, effectivePid);
            const exists = targetOffer.campaignOffer.sailings.some(s => getSailingKey(offer, s, s.__profileId || effectivePid) === key);
            if (!exists) targetOffer.campaignOffer.sailings.push(clonedSailing);
        }
        saveProfileObject(profile);
        refreshIfViewingFavorites(profile);
        try { if (App && App.TableRenderer) App.TableRenderer.updateBreadcrumb(App.TableRenderer.lastState.groupingStack, App.TableRenderer.lastState.groupKeysStack); } catch(e){/* ignore */}
    }

    function removeFavorite(offer, sailing, profileId) {
        const profile = loadProfileObject();
        const offers = profile.data.offers || [];
        // Determine if we're in a combined context (so we should match by core fields, not PID)
        const requestedPid = profileId; // may be undefined/null
        let isCombinedContext = (typeof requestedPid === 'string' && requestedPid.includes('-'));
        try { if (!isCombinedContext && App && App.CurrentProfile && App.CurrentProfile.key === 'goob-combined-linked') isCombinedContext = true; } catch(e){}
        // Core fields for comparison
        const coreCode = offer.campaignOffer?.offerCode || '';
        const coreShip = sailing.shipName || '';
        const coreDate = sailing.sailDate || '';
        const coreIsGOBO = String(sailing.isGOBO === true);

        if (!requestedPid && isCombinedContext) {
            // Remove by matching core fields (ignore stored __profileId differences)
            for (let i = offers.length -1; i >= 0; i--) {
                const off = offers[i];
                const sailings = off.campaignOffer?.sailings || [];
                for (let j = sailings.length -1; j >= 0; j--) {
                    const s = sailings[j];
                    const sCode = off.campaignOffer?.offerCode || '';
                    const sShip = s.shipName || '';
                    const sDate = s.sailDate || '';
                    const sIsGOBO = String(s.isGOBO === true);
                    if (coreCode === sCode && coreShip === sShip && coreDate === sDate && coreIsGOBO === sIsGOBO) {
                        sailings.splice(j, 1);
                    }
                }
                if (!off.campaignOffer?.sailings || off.campaignOffer.sailings.length === 0) {
                    offers.splice(i, 1);
                }
            }
        } else {
            // Precise removal using PID-based key (default behavior)
            const key = getSailingKey(offer, sailing, profileId);
            for (let i = offers.length -1; i >= 0; i--) {
                const off = offers[i];
                const sailings = off.campaignOffer?.sailings || [];
                for (let j = sailings.length -1; j >= 0; j--) {
                    if (getSailingKey(off, sailings[j], sailings[j].__profileId || profileId) === key) {
                        sailings.splice(j, 1);
                    }
                }
                if (!off.campaignOffer?.sailings || off.campaignOffer.sailings.length === 0) {
                    offers.splice(i, 1);
                }
            }
        }
        saveProfileObject(profile);
        refreshIfViewingFavorites(profile);
        try { if (App && App.TableRenderer) App.TableRenderer.updateBreadcrumb(App.TableRenderer.lastState.groupingStack, App.TableRenderer.lastState.groupKeysStack); } catch(e){/* ignore */}
    }

    function toggleFavorite(offer, sailing, profileId) {
        try { ensureProfileExists(); } catch(e){ /* ignore */ }
        const before = isFavorite(offer, sailing, profileId);
        if (before) {
            removeFavorite(offer, sailing, profileId);
            try { console.debug('[favorites] Removed favorite', { profileId, code: offer.campaignOffer?.offerCode, sailDate: sailing.sailDate }); } catch(e){}
        } else {
            addFavorite(offer, sailing, profileId);
            try { console.debug('[favorites] Added favorite', { profileId, code: offer.campaignOffer?.offerCode, sailDate: sailing.sailDate }); } catch(e){}
        }
    }

    function ensureProfileExists() {
        const raw = getRawStorage();
        if (!raw) saveProfileObject({ data: { offers: [] }, savedAt: Date.now() });
    }

    function refreshIfViewingFavorites(profile) {
        try {
            if (App && App.CurrentProfile && App.CurrentProfile.key === 'goob-favorites') {
                // Re-load favorites profile into current view
                if (App && App.TableRenderer && typeof App.TableRenderer.loadProfile === 'function') {
                    App.TableRenderer.loadProfile('goob-favorites', profile);
                }
            }
        } catch(e){ /* ignore */ }
    }

    window.Favorites = {
        toggleFavorite,
        isFavorite,
        getSailingKey,
        ensureProfileExists,
        loadProfileObject,
        addFavorite, // newly exported
        removeFavorite // newly exported
    };
})();