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
        const code = offer.campaignCode || offer.campaignOffer?.offerCode || '';
        const ship = sailing.shipName || '';
        const date = sailing.sailDate || '';
        const isGOBO = String(sailing.isGOBO === true);
        const pid = profileId || '0';
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
        const code = offer.campaignCode || offer.campaignOffer?.offerCode || '';
        return profile.data.offers.findIndex(o => (o.campaignCode || o.campaignOffer?.offerCode || '') === code);
    }

    function isFavorite(offer, sailing, profileId) {
        const profile = loadProfileObject();
        const key = getSailingKey(offer, sailing, profileId);
        const offers = profile.data.offers || [];
        for (const off of offers) {
            const sailings = off.campaignOffer?.sailings || [];
            for (const s of sailings) {
                if (getSailingKey(off, s, s.__profileId || profileId) === key) return true;
            }
        }
        return false;
    }

    function addFavorite(offer, sailing, profileId) {
        const profile = loadProfileObject();
        let idx = findOfferIndex(profile, offer);
        const clonedSailing = JSON.parse(JSON.stringify(sailing));
        clonedSailing.__profileId = profileId || '0';
        if (idx === -1) {
            const newOffer = cloneOfferForFavorite(offer, clonedSailing);
            // Also annotate offer wrapper meta
            newOffer.__favoriteMeta = { profileId: profileId || '0' };
            profile.data.offers.push(newOffer);
        } else {
            const targetOffer = profile.data.offers[idx];
            if (!targetOffer.campaignOffer) targetOffer.campaignOffer = {};
            if (!Array.isArray(targetOffer.campaignOffer.sailings)) targetOffer.campaignOffer.sailings = [];
            const key = getSailingKey(offer, clonedSailing, profileId);
            const exists = targetOffer.campaignOffer.sailings.some(s => getSailingKey(offer, s, s.__profileId || profileId) === key);
            if (!exists) targetOffer.campaignOffer.sailings.push(clonedSailing);
        }
        saveProfileObject(profile);
        refreshIfViewingFavorites(profile);
        try { if (App && App.TableRenderer) App.TableRenderer.updateBreadcrumb(App.TableRenderer.lastState.groupingStack, App.TableRenderer.lastState.groupKeysStack); } catch(e){/* ignore */}
    }

    function removeFavorite(offer, sailing, profileId) {
        const profile = loadProfileObject();
        const key = getSailingKey(offer, sailing, profileId);
        const offers = profile.data.offers || [];
        for (let i = offers.length -1; i >=0; i--) {
            const off = offers[i];
            const sailings = off.campaignOffer?.sailings || [];
            for (let j = sailings.length -1; j >=0; j--) {
                if (getSailingKey(off, sailings[j], sailings[j].__profileId || profileId) === key) {
                    sailings.splice(j,1);
                }
            }
            if (!off.campaignOffer?.sailings || off.campaignOffer.sailings.length === 0) {
                offers.splice(i,1);
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
            try { console.debug('[favorites] Removed favorite', { profileId, code: offer.campaignCode || offer.campaignOffer?.offerCode, sailDate: sailing.sailDate }); } catch(e){}
        } else {
            addFavorite(offer, sailing, profileId);
            try { console.debug('[favorites] Added favorite', { profileId, code: offer.campaignCode || offer.campaignOffer?.offerCode, sailDate: sailing.sailDate }); } catch(e){}
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