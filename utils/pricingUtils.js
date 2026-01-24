// filepath: utils/pricingUtils.js
// Shared pricing / upgrade estimation utilities.
// Provides logic for computing the estimated Suite upgrade price used by Advanced Search.
// Rules:
//  - Estimated price for the offer's own category = taxes & fees (for two guests)
//  - Estimated price for another category = max(categoryPrice - offerCategoryPrice, 0) + taxes & fees
(function(){
    if (!window.App) window.App = {};
    if (!App.PricingUtils) App.PricingUtils = {};

    const baseCategoryMap = { I:'INTERIOR', IN:'INTERIOR', INT:'INTERIOR', INSIDE:'INTERIOR', INTERIOR:'INTERIOR',
        O:'OUTSIDE', OV:'OUTSIDE', OB:'OUTSIDE', E:'OUTSIDE', OCEAN:'OUTSIDE', OCEANVIEW:'OUTSIDE', OUTSIDE:'OUTSIDE',
        B:'BALCONY', BAL:'BALCONY', BK:'BALCONY', BALCONY:'BALCONY',
        D:'DELUXE', DLX:'DELUXE', DELUXE:'DELUXE', JS:'DELUXE', SU:'DELUXE', SUITE:'DELUXE',
        // Junior Suite synonyms added
        JUNIOR:'DELUXE', 'JR':'DELUXE', 'JR.':'DELUXE', 'JR-SUITE':'DELUXE', 'JR SUITE':'DELUXE', 'JUNIOR SUITE':'DELUXE', 'JRSUITE':'DELUXE', 'JR SUITES':'DELUXE', 'JUNIOR SUITES':'DELUXE'
    };
    const WIDE_CATS = ['INTERIOR','OUTSIDE','BALCONY','DELUXE'];

    function dbg(){
        try { console.debug('[PricingUtils]', ...arguments); } catch(e){ /* ignore */ }
    }

    function resolveCategory(raw){
        try { if (window.RoomCategoryUtils && typeof window.RoomCategoryUtils.resolveCategory === 'function') return window.RoomCategoryUtils.resolveCategory(raw); } catch(e){}
        if (!raw) { dbg('resolveCategory:none', raw); return null; }
        const up = (''+raw).trim().toUpperCase();
        const upCompact = up.replace(/\s+/g, '');
        let resolved = baseCategoryMap[up] || baseCategoryMap[upCompact] || (WIDE_CATS.includes(up) ? up : null);
        if (!resolved) {
            try { if (window.RoomCategoryUtils && typeof window.RoomCategoryUtils.classifyBroad === 'function') resolved = window.RoomCategoryUtils.classifyBroad(up); } catch(e){}
        }
        if (!resolved) {
            const cleaned = up.replace(/\bGTY\b/g, '').replace(/[^A-Z]/g, '');
            if (/SUITE|JRSUITE|JR\s?SUITE|JS|DLX|DELUXE/.test(cleaned)) resolved = 'DELUXE';
            else if (/BALCONY|BALC|BK/.test(cleaned)) resolved = 'BALCONY';
            else if (/OCEANVIEW|OCEANVIEW|OUTSIDE|OV/.test(cleaned)) resolved = 'OUTSIDE';
            else if (/INTERIOR|INSIDE|INT/.test(cleaned)) resolved = 'INTERIOR';
        }
        dbg('resolveCategory', { raw, up, resolved });
        return resolved;
    }

    function getOfferValue(offer, sailing){
        try {
            if (typeof App !== 'undefined' && App && App.Utils && typeof App.Utils.computeOfferValue === 'function') {
                return App.Utils.computeOfferValue(offer, sailing);
            }
        } catch(e) { /* ignore */ }
        try {
            if (typeof Utils !== 'undefined' && Utils && typeof Utils.computeOfferValue === 'function') {
                return Utils.computeOfferValue(offer, sailing);
            }
        } catch(e) { /* ignore */ }
        return null;
    }

    function getGuestMultiplier(){
        try {
            if (typeof App !== 'undefined' && App) {
                if (App.SettingsStore && typeof App.SettingsStore.getSoloBooking === 'function') {
                    return App.SettingsStore.getSoloBooking() ? 1 : 2;
                }
                if (App.Utils && typeof App.Utils.getSoloBookingPreference === 'function') {
                    return App.Utils.getSoloBookingPreference() ? 1 : 2;
                }
            }
        } catch(e){ /* ignore */ }
        return 2;
    }

    function cheapestPriceForCategory(entry, broadCat){
        if (!entry || !entry.stateroomPricing || !broadCat) {
            dbg('cheapestPriceForCategory:insufficient', { hasEntry: !!entry, hasPricing: !!(entry && entry.stateroomPricing), broadCat });
            return null;
        }
        let min = null;
        const pricingKeys = Object.keys(entry.stateroomPricing || {});
        dbg('cheapestPriceForCategory:start', { broadCat, pricingKeysCount: pricingKeys.length });
        // Helper: parse price values that may be strings like "$1,234.56" or numeric strings
        function parsePriceRaw(raw) {
            try {
                if (raw == null) return NaN;
                if (typeof raw === 'number') return Number(raw);
                if (typeof raw === 'string') {
                    const cleaned = raw.replace(/[^0-9.\-]/g, '');
                    if (cleaned === '' || cleaned === '.' || cleaned === '-') return NaN;
                    const n = Number(cleaned);
                    return isFinite(n) ? n : NaN;
                }
                return NaN;
            } catch(e){ return NaN; }
        }
        pricingKeys.forEach(k => {
            try {
                const pr = entry.stateroomPricing[k];
                if (!pr) return;
                const code = pr && (pr.code || k) || '';
                const cat = resolveCategory(code);
                const rawPrice = pr && (pr.price ?? pr.amount ?? pr.priceAmount ?? pr.priceAmt ?? pr.priceamount);
                const parsed = parsePriceRaw(rawPrice);
                // Capture and cap parse failures so we can inspect why prices are missing/invalid
                try {
                    if (!isFinite(parsed)) {
                        App.PricingUtils._parseNaNCount = (App.PricingUtils._parseNaNCount || 0) + 1;
                        if (App.PricingUtils._parseNaNCount <= 50) {
                            try { console.debug('[PricingUtils] parsePriceRaw:NaN sample', { key:k, code, rawPrice, parsed }); } catch(e){}
                        }
                    }
                } catch{}
                if (cat === broadCat && isFinite(parsed)) {
                    const val = Number(parsed) * 2; // always dual occupancy
                    if (min == null || val < min) {
                        dbg('cheapestPriceForCategory:match', { key:k, code, cat, rawPrice, parsed, dualPrice: val, prevMin: min });
                        min = val;
                    }
                }
            } catch(e){ /* ignore per-slot errors */ }
        });
        dbg('cheapestPriceForCategory:end', { broadCat, min });
        return min;
    }

    function computeUpgradePrice(targetBroad, dbgLabel, offer, sailing, options){
        try {
            const suiteDbg = true; // Sampling-only debug logging
            const dbgLog = (tag, payload) => {
                if (!suiteDbg) return;
                try {
                    App.PricingUtils._suiteDbgCount = (App.PricingUtils._suiteDbgCount || 0) + 1;
                    const n = App.PricingUtils._suiteDbgCount;
                    // Log first few, then every 50th to reduce noise
                    if (n > 12 && n % 50 !== 0) return;
                    // Use console.info so it shows even when verbose debug is hidden
                    console.info('[SuiteUpgradeDBG]', tag, payload);
                } catch(e) { /* ignore */ }
            };
            dbgLog(`${dbgLabel}:entry`, { includeTaxes: options && Object.prototype.hasOwnProperty.call(options, 'includeTaxes') ? !!options.includeTaxes : true, shipCode: sailing && sailing.shipCode, sailDate: sailing && sailing.sailDate, offerCategory: offer && offer.category });
            const includeTaxes = options && Object.prototype.hasOwnProperty.call(options, 'includeTaxes') ? !!options.includeTaxes : true;
            const shipCode = (sailing && sailing.shipCode) ? String(sailing.shipCode).trim() : '';
            const sailDate = (sailing && sailing.sailDate) ? String(sailing.sailDate).trim().slice(0,10) : '';
            // Require sailDate and ItineraryCache. Do NOT require shipCode here —
            // we have a fallback that can resolve entries by sailDate + shipName.
            if (!sailDate || typeof ItineraryCache === 'undefined') {
                dbg('computeUpgradePrice:missingPrereqs', { targetBroad, shipCode, sailDate, hasItineraryCache: typeof ItineraryCache !== 'undefined' });
                dbgLog(`${dbgLabel}:missingPrereqs`, { shipCode, sailDate, includeTaxes });
                // Limited logging to help root-cause
                try {
                    App.PricingUtils._nullReportCount = (App.PricingUtils._nullReportCount || 0) + 1;
                    if (App.PricingUtils._nullReportCount <= 20) console.debug('[PricingUtils] missing prereqs for computeUpgradePrice', { targetBroad, shipCode, sailDate, hasItineraryCache: typeof ItineraryCache !== 'undefined', offerCategory: offer?.category, sailingRoomType: sailing?.roomType });
                } catch{}
                return null;
            }

            const key = `SD_${shipCode}_${sailDate}`;
            let entry = (typeof ItineraryCache !== 'undefined' && ItineraryCache && typeof ItineraryCache.get === 'function') ? ItineraryCache.get(key) : (App && App.ItineraryCache && typeof App.ItineraryCache.get === 'function' ? App.ItineraryCache.get(key) : null);

            // Fallback: if no shipCode or entry missing, try to find an entry by sailDate + shipName match
            if ((!entry || !entry.stateroomPricing || !Object.keys(entry.stateroomPricing).length) && (!shipCode || !entry)) {
                try {
                    const ICall = (typeof ItineraryCache !== 'undefined' && ItineraryCache && typeof ItineraryCache.all === 'function') ? ItineraryCache.all() : (App && App.ItineraryCache && typeof App.ItineraryCache.all === 'function' ? App.ItineraryCache.all() : null);
                    const shipName = (sailing && sailing.shipName) ? String(sailing.shipName).trim().toLowerCase() : '';
                    if (ICall && typeof ICall === 'object') {
                        const candidates = Object.keys(ICall).map(k => ICall[k]).filter(e => e && e.sailDate && String(e.sailDate).slice(0,10) === sailDate);
                        if (candidates.length) {
                            // Prefer exact shipName match
                            let found = candidates.find(c => c.shipName && String(c.shipName).trim().toLowerCase() === shipName);
                            if (!found) found = candidates[0];
                            if (found) {
                                entry = found;
                                try { console.debug('[PricingUtils] fallback: resolved itinerary entry by sailDate+shipName', { keyTried: key, resolvedKey: entry && entry.sailDate ? `SD_${entry.shipCode}_${entry.sailDate}` : null, shipName, sailDate, candidateCount: candidates.length }); } catch{}
                            }
                        }
                    }
                } catch(e) { /* ignore fallback errors */ }
            }

            if (!entry || !entry.stateroomPricing || !Object.keys(entry.stateroomPricing).length) {
                dbg('computeUpgradePrice:noPricingEntry', { key, targetBroad, hasEntry: !!entry, pricingKeys: entry && Object.keys(entry.stateroomPricing || {}) });
                try {
                    App.PricingUtils._nullReportCount = (App.PricingUtils._nullReportCount || 0) + 1;
                    if (App.PricingUtils._nullReportCount <= 20) console.debug('[PricingUtils] no pricing entry for key', key, { targetBroad, hasEntry: !!entry, pricingKeys: entry && Object.keys(entry.stateroomPricing || {}) });
                    // Detailed, capped diagnostics to help root-cause: show offer/sailing context and a snapshot of itinerary cache stats
                    App.PricingUtils._detailedNullCount = (App.PricingUtils._detailedNullCount || 0) + 1;
                    if (App.PricingUtils._detailedNullCount <= 50) {
                        try {
                            const sample = {
                                offerCode: offer?.campaignOffer?.offerCode || null,
                                shipCode,
                                shipName: sailing?.shipName || null,
                                sailDate,
                                keyTried: key,
                                hasItineraryCache: typeof ItineraryCache !== 'undefined',
                                itineraryCacheSize: (typeof ItineraryCache !== 'undefined' && ItineraryCache && typeof ItineraryCache.all === 'function') ? Object.keys(ItineraryCache.all() || {}).length : null,
                                entrySnapshotKeys: entry && entry.stateroomPricing ? Object.keys(entry.stateroomPricing).slice(0,10) : []
                            };
                            console.debug('[PricingUtils][DETAILED] noPricingEntry sample', sample);
                            if (entry && entry.stateroomPricing) {
                                const pricingKeys = Object.keys(entry.stateroomPricing || {}).slice(0,10);
                                pricingKeys.forEach(pk => {
                                    try {
                                        const p = entry.stateroomPricing[pk];
                                        console.debug('[PricingUtils][DETAILED] pricing sample', { key: pk, code: p && p.code, price: p && (p.price ?? p.amount ?? p.priceAmount), priceType: typeof (p && (p.price ?? p.amount ?? p.priceAmount)) });
                                    } catch{}
                                });
                            }
                        } catch{}
                    }
                } catch{}
                return null;
            }

            // taxesAndFees in the entry may be a string; parse robustly
            let taxesNumber = 0;
            try {
                const rawTaxes = entry.taxesAndFees;
                const guestMultiplier = getGuestMultiplier();
                if (typeof rawTaxes === 'number') taxesNumber = Number(rawTaxes) * guestMultiplier;
                else if (typeof rawTaxes === 'string') {
                    const tClean = (rawTaxes || '').replace(/[^0-9.\-]/g, '');
                    const tNum = Number(tClean);
                    if (isFinite(tNum)) taxesNumber = tNum * guestMultiplier;
                    else taxesNumber = 0;
                } else taxesNumber = 0;
            } catch(e) { taxesNumber = 0; }

            const offerCategoryRaw = (sailing && sailing.roomType)
                || (offer && offer.category)
                || (offer && offer.campaignOffer && offer.campaignOffer.category)
                || (offer && offer.campaignOffer && offer.campaignOffer.name)
                || '';
            const offerBroad = resolveCategory(offerCategoryRaw) || null;
            const targetPriceNum = cheapestPriceForCategory(entry, targetBroad);

            if (targetPriceNum == null) {
                dbg('computeUpgradePrice:noTargetPricing', { key, targetBroad });
                dbgLog(`${dbgLabel}:noTargetPricing`, { key, shipCode, sailDate, targetBroad, includeTaxes });
                try { App.PricingUtils._nullReportCount = (App.PricingUtils._nullReportCount || 0) + 1; if (App.PricingUtils._nullReportCount <= 20) console.debug('[PricingUtils] no target pricing in entry', key, { targetBroad, pricingKeys: Object.keys(entry.stateroomPricing || {}) }); } catch{}
                return null;
            }

            // Guard against malformed pricing (zero/negative), which likely means sold out or invalid data
            const targetPriceValid = isFinite(targetPriceNum) && Number(targetPriceNum) > 0;
            if (!targetPriceValid) {
                dbgLog(`${dbgLabel}:targetPriceNonPositive`, { key, shipCode, sailDate, targetPriceNum });
                return null;
            }

            // Prefer the shared offer-value pipeline for base pricing to keep consistency with table Value column
            let offerValueNum = getOfferValue(offer, sailing);

            if (offerValueNum != null && isFinite(offerValueNum)) {
                // OfferValue is base price minus taxes; upgrade with taxes = max(taxes, target - offerValue)
                let upgradeWithTaxes = Math.max(Number(taxesNumber), Number(targetPriceNum) - Number(offerValueNum));
                if (!isFinite(upgradeWithTaxes)) upgradeWithTaxes = null;
                if (includeTaxes) {
                    dbg('computeUpgradePrice:usingOfferValue', { offerValueNum, taxesNumber, targetPriceNum, upgradeWithTaxes });
                    dbgLog(`${dbgLabel}:usingOfferValue`, { key, shipCode, sailDate, offerValueNum, taxesNumber, targetPriceNum, includeTaxes, upgrade: upgradeWithTaxes });
                    return Number(upgradeWithTaxes);
                }
                const upgradeNoTaxes = Math.max(0, Number(targetPriceNum) - Number(offerValueNum) - Number(taxesNumber));
                dbg('computeUpgradePrice:usingOfferValueNoTaxes', { offerValueNum, taxesNumber, targetPriceNum, upgradeNoTaxes });
                dbgLog(`${dbgLabel}:usingOfferValueNoTaxes`, { key, shipCode, sailDate, offerValueNum, taxesNumber, targetPriceNum, includeTaxes, upgrade: upgradeNoTaxes });
                return Number(upgradeNoTaxes);
            }

            // If the offer is already the target category the upgrade price is just taxes & fees
            if (offerBroad === targetBroad) {
                dbg('computeUpgradePrice:offerIsTarget', { offerBroad, taxesNumber });
                const baseVal = includeTaxes ? taxesNumber : 0;
                dbgLog(`${dbgLabel}:offerIsTarget`, { key, shipCode, sailDate, taxesNumber, includeTaxes, upgrade: baseVal });
                return Number(baseVal);
            }

            // Determine the price for the offer's category (dual occupancy), falling back to attempt to use the exact offer price if available
            let offerCategoryPrice = null;
            if (offerBroad) {
                offerCategoryPrice = cheapestPriceForCategory(entry, offerBroad);
                dbg('computeUpgradePrice:offerCategoryPriceResolved', { offerBroad, offerCategoryPrice });
            }
            // If still null, attempt a heuristic: choose the cheapest non-suite category price (best-effort)
            if (offerCategoryPrice == null) {
                try {
                    // Do NOT fall back to the target category; that can make the upgrade look like $0 when the base
                    // category is sold out (e.g., Interior sold out but Balcony has pricing).
                    const nonTargetCats = WIDE_CATS.filter(c => c !== 'DELUXE' && c !== targetBroad);
                    let best = null;
                    nonTargetCats.forEach(cat => {
                        try {
                            const p = cheapestPriceForCategory(entry, cat);
                            if (p != null && isFinite(p)) {
                                if (best == null || p < best) best = p;
                            }
                        } catch{}
                    });
                    if (best != null) {
                        offerCategoryPrice = best;
                        dbg('computeUpgradePrice:offerCategoryPriceFallbackToCheapestNonTarget', { offerCategoryPrice });
                        App.PricingUtils._fallbackUsed = (App.PricingUtils._fallbackUsed || 0) + 1;
                    }
                } catch{}
            }
            // If still null, try to parse a price from offer object (many shapes tolerated)
            if (offerCategoryPrice == null) {
                try {
                    const tryVals = [offer && offer.price, offer && offer.priceAmount, offer && offer.amount, offer && offer.cabinPrice, offer && offer.totalPrice];
                    for (let i=0;i<tryVals.length;i++) {
                        const v = tryVals[i];
                        if (v == null) continue;
                        let num = NaN;
                        if (typeof v === 'number') num = Number(v);
                        else if (typeof v === 'string') {
                            const cleaned = v.replace(/[^0-9.\-]/g,'');
                            num = Number(cleaned);
                        }
                        if (isFinite(num)) { offerCategoryPrice = Number(num); break; }
                    }
                    // If parsed found, ensure dual occupancy semantics (the entry-based prices are already dual-occupied)
                    if (offerCategoryPrice != null && isFinite(offerCategoryPrice)) {
                        // Heuristic: if the parsed offer price looks like a per-person amount (small) it's ambiguous — but we can't be sure.
                        // We'll assume the value represents the full price for the cabin and will NOT multiply again.
                        dbg('computeUpgradePrice:offerPriceParsed', { offerCategoryPrice });
                    }
                } catch{} // removed variable in catch to suppress redundant initializer warning
            }

            // At this point, we must have suitePriceNum and ideally offerCategoryPrice.
            // If offerCategoryPrice is null, we can't compute a meaningful difference so return null.
            const offerPriceValid = offerCategoryPrice != null && isFinite(offerCategoryPrice) && Number(offerCategoryPrice) > 0;
            if (!offerPriceValid) {
                dbg('computeUpgradePrice:cannotResolveOfferCategoryPrice', { offerBroad, offerCategoryPrice, targetBroad });
                dbgLog(`${dbgLabel}:cannotResolveOfferCategoryPrice`, { key, shipCode, sailDate, offerBroad, offerCategoryPrice, targetPriceNum, includeTaxes });
                return null;
            }

            // Compute delta: how much more the suite costs vs the offer category (already dual occupancy numbers)
            // GOBO: align with itinerary "You Pay" logic (single-guest award, second guest at 40%)
            if (sailing && sailing.isGOBO) {
                const modifierMap = { INTERIOR:125, OUTSIDE:150, BALCONY:200, DELUXE:300 };
                const mod = modifierMap[offerBroad] ?? 150;
                // Solve for base fare of first guest from awarded category price (dual-style number)
                const baseFareOneGuest = (Number(offerCategoryPrice) + mod - Number(taxesNumber)) / 1.4;
                const singleGuestOfferValue = baseFareOneGuest - mod;
                let upgrade = Math.max(0, Number(targetPriceNum) - Math.max(0, Number(singleGuestOfferValue)));
                if (includeTaxes) {
                    if (upgrade < Number(taxesNumber)) upgrade = Number(taxesNumber);
                } else {
                    upgrade = Math.max(0, upgrade - Number(taxesNumber));
                }
                dbg('computeUpgradePrice:computedGOBO', { targetPriceNum, offerCategoryPrice, singleGuestOfferValue, taxesNumber, upgrade, includeTaxes, isGOBO:true, targetBroad });
                dbgLog(`${dbgLabel}:computedGOBO`, { key, shipCode, sailDate, offerBroad, targetBroad, targetPriceNum, offerCategoryPrice, singleGuestOfferValue, taxesNumber, includeTaxes, upgrade, isGOBO:true });
                return Number(upgrade);
            }

            let delta = Math.max(0, Number(targetPriceNum) - Number(offerCategoryPrice));
            const upgradeEstimate = includeTaxes ? (Number(delta) + Number(taxesNumber)) : Number(delta);
            dbg('computeUpgradePrice:computed', { targetPriceNum, offerCategoryPrice, delta, taxesNumber, upgradeEstimate, includeTaxes, isGOBO: !!(sailing && sailing.isGOBO), targetBroad });
            dbgLog(`${dbgLabel}:computed`, { key, shipCode, sailDate, offerBroad, targetBroad, targetPriceNum, offerCategoryPrice, delta, taxesNumber, includeTaxes, upgradeEstimate, isGOBO: !!(sailing && sailing.isGOBO) });
            return Number(upgradeEstimate);

        } catch(e) {
            try { console.error('[PricingUtils] computeUpgradePrice:unexpected', e); } catch(err){}
            return null;
        }
    }

    // Compute suite (DELUXE) upgrade estimated price for the given sailing/offer pair.
    // Returns number or null if not computable. Supports includeTaxes flag (default true).
    App.PricingUtils.computeSuiteUpgradePrice = function(offer, sailing, options){
        return computeUpgradePrice('DELUXE', 'Suite', offer, sailing, options);
    };

    // Compute balcony (BALCONY) upgrade estimated price for the given sailing/offer pair.
    App.PricingUtils.computeBalconyUpgradePrice = function(offer, sailing, options){
        return computeUpgradePrice('BALCONY', 'Balcony', offer, sailing, options);
    };

})();
