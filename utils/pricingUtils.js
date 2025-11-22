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
        const resolved = baseCategoryMap[up] || (WIDE_CATS.includes(up) ? up : null);
        dbg('resolveCategory', { raw, up, resolved });
        return resolved;
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

    // Compute suite (DELUXE) upgrade estimated price for the given sailing/offer pair.
    // Returns number or null if not computable.
    App.PricingUtils.computeSuiteUpgradePrice = function(offer, sailing){
        try {
            const shipCode = (sailing && sailing.shipCode) ? String(sailing.shipCode).trim() : '';
            const sailDate = (sailing && sailing.sailDate) ? String(sailing.sailDate).trim().slice(0,10) : '';
            // Require sailDate and ItineraryCache. Do NOT require shipCode here —
            // we have a fallback that can resolve entries by sailDate + shipName.
            if (!sailDate || typeof ItineraryCache === 'undefined') {
                dbg('computeSuiteUpgradePrice:missingPrereqs', { shipCode, sailDate, hasItineraryCache: typeof ItineraryCache !== 'undefined' });
                // Limited logging to help root-cause
                try {
                    App.PricingUtils._nullReportCount = (App.PricingUtils._nullReportCount || 0) + 1;
                    if (App.PricingUtils._nullReportCount <= 20) console.debug('[PricingUtils] missing prereqs for computeSuiteUpgradePrice', { shipCode, sailDate, hasItineraryCache: typeof ItineraryCache !== 'undefined', offerCategory: offer?.category, sailingRoomType: sailing?.roomType });
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
                dbg('computeSuiteUpgradePrice:noPricingEntry', { key, hasEntry: !!entry, pricingKeys: entry && Object.keys(entry.stateroomPricing || {}) });
                try {
                    App.PricingUtils._nullReportCount = (App.PricingUtils._nullReportCount || 0) + 1;
                    if (App.PricingUtils._nullReportCount <= 20) console.debug('[PricingUtils] no pricing entry for key', key, { hasEntry: !!entry, pricingKeys: entry && Object.keys(entry.stateroomPricing || {}) });
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
                if (typeof rawTaxes === 'number') taxesNumber = Number(rawTaxes) * 2;
                else if (typeof rawTaxes === 'string') {
                    const tClean = (rawTaxes || '').replace(/[^0-9.\-]/g, '');
                    const tNum = Number(tClean);
                    if (isFinite(tNum)) taxesNumber = tNum * 2;
                    else taxesNumber = 0;
                } else taxesNumber = 0;
            } catch(e) { taxesNumber = 0; }

            const offerCategoryRaw = (sailing && sailing.roomType) || (offer && offer.category) || '';
            const offerBroad = resolveCategory(offerCategoryRaw) || null;
            const suiteBroad = 'DELUXE';
            const suitePriceNum = cheapestPriceForCategory(entry, suiteBroad);

            if (suitePriceNum == null) {
                dbg('computeSuiteUpgradePrice:noSuitePricing', { key, suiteBroad });
                try { App.PricingUtils._nullReportCount = (App.PricingUtils._nullReportCount || 0) + 1; if (App.PricingUtils._nullReportCount <= 20) console.debug('[PricingUtils] no suite pricing in entry', key, { suiteBroad, pricingKeys: Object.keys(entry.stateroomPricing || {}) }); } catch{}
                return null;
            }

            // If the offer is already a DELUXE (suite) the upgrade price is just taxes & fees
            if (offerBroad === suiteBroad) {
                dbg('computeSuiteUpgradePrice:offerIsSuite', { offerBroad, taxesNumber });
                return Number(taxesNumber);
            }

            // Determine the price for the offer's category (dual occupancy), falling back to attempt to use the exact offer price if available
            let offerCategoryPrice = null;
            if (offerBroad) {
                offerCategoryPrice = cheapestPriceForCategory(entry, offerBroad);
                dbg('computeSuiteUpgradePrice:offerCategoryPriceResolved', { offerBroad, offerCategoryPrice });
            }
            // If still null, attempt a heuristic: choose the cheapest non-suite category price (best-effort)
            if (offerCategoryPrice == null) {
                try {
                    const nonSuiteCats = WIDE_CATS.filter(c => c !== 'DELUXE');
                    let best = null;
                    nonSuiteCats.forEach(cat => {
                        try {
                            const p = cheapestPriceForCategory(entry, cat);
                            if (p != null && isFinite(p)) {
                                if (best == null || p < best) best = p;
                            }
                        } catch{}
                    });
                    if (best != null) {
                        offerCategoryPrice = best;
                        dbg('computeSuiteUpgradePrice:offerCategoryPriceFallbackToCheapestNonSuite', { offerCategoryPrice });
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
                        dbg('computeSuiteUpgradePrice:offerPriceParsed', { offerCategoryPrice });
                    }
                } catch{} // removed variable in catch to suppress redundant initializer warning
            }

            // At this point, we must have suitePriceNum and ideally offerCategoryPrice.
            // If offerCategoryPrice is null, we can't compute a meaningful difference so return null.
            if (offerCategoryPrice == null || !isFinite(offerCategoryPrice)) {
                dbg('computeSuiteUpgradePrice:cannotResolveOfferCategoryPrice', { offerBroad, offerCategoryPrice });
                return null;
            }

            // Compute delta: how much more the suite costs vs the offer category (already dual occupancy numbers)
            const delta = Math.max(0, Number(suitePriceNum) - Number(offerCategoryPrice));
            const upgradeEstimate = Number(delta) + Number(taxesNumber);
            dbg('computeSuiteUpgradePrice:computed', { suitePriceNum, offerCategoryPrice, delta, taxesNumber, upgradeEstimate });
            return Number(upgradeEstimate);

        } catch(e) {
            try { console.error('[PricingUtils] computeSuiteUpgradePrice:unexpected', e); } catch(err){}
            return null;
        }
    };

})();
