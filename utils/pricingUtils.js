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
        D:'DELUXE', DLX:'DELUXE', DELUXE:'DELUXE', JS:'DELUXE', SU:'DELUXE', SUITE:'DELUXE'
    };
    const WIDE_CATS = ['INTERIOR','OUTSIDE','BALCONY','DELUXE'];

    function dbg(){
        try { console.debug('[PricingUtils]', ...arguments); } catch(e){ /* ignore */ }
    }

    function resolveCategory(raw){
        if (!raw) { dbg('resolveCategory:none', raw); return null; }
        raw = (''+raw).trim();
        const up = raw.toUpperCase();
        let resolved = null;
        if (baseCategoryMap[up]) resolved = baseCategoryMap[up];
        else if (WIDE_CATS.includes(up)) resolved = up;
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
                    return Number(cleaned);
                }
                return NaN;
            } catch(e){ return NaN; }
        }
        pricingKeys.forEach(k => {
            try {
                const pr = entry.stateroomPricing[k];
                const code = pr && (pr.code || k) || '';
                const cat = resolveCategory(code);
                const rawPrice = pr && (pr.price ?? pr.amount ?? pr.priceAmount);
                const parsed = parsePriceRaw(rawPrice);
                if (cat === broadCat && isFinite(parsed)) {
                    const val = Number(parsed) * 2; // always dual occupancy
                    if (min == null || val < min) {
                        dbg('cheapestPriceForCategory:match', { key:k, code, cat, rawPrice, parsed, dualPrice: val, prevMin: min });
                        min = val;
                    }
                }
            } catch(e){ /* ignore */ }
        });
        dbg('cheapestPriceForCategory:end', { broadCat, min });
        return min;
    }

    // Compute suite (DELUXE) upgrade estimated price for the given sailing/offer pair.
    // Returns number or null if not computable.
    App.PricingUtils.computeSuiteUpgradePrice = function(offer, sailing){
        try {
            const shipCode = (sailing.shipCode || '').trim();
            const sailDate = (sailing.sailDate || '').trim().slice(0,10);
            // Require sailDate and ItineraryCache. Do NOT require shipCode here —
            // we have a fallback that can resolve entries by sailDate + shipName.
            if (!sailDate || typeof ItineraryCache === 'undefined') {
                dbg('computeSuiteUpgradePrice:missingPrereqs', { shipCode, sailDate, hasItineraryCache: typeof ItineraryCache !== 'undefined' });
                // Unconditional, limited logging to help root-cause
                try {
                    App.PricingUtils._nullReportCount = (App.PricingUtils._nullReportCount || 0) + 1;
                    if (App.PricingUtils._nullReportCount <= 20) console.debug('[PricingUtils] missing prereqs for computeSuiteUpgradePrice', { shipCode, sailDate, hasItineraryCache: typeof ItineraryCache !== 'undefined', offerCategory: offer?.category, sailingRoomType: sailing?.roomType });
                } catch(e){}
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
                                try { console.debug('[PricingUtils] fallback: resolved itinerary entry by sailDate+shipName', { keyTried: key, resolvedKey: entry && entry.sailDate ? `SD_${entry.shipCode}_${entry.sailDate}` : null, shipName, sailDate, candidateCount: candidates.length }); } catch(e){}
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
                                        console.debug('[PricingUtils][DETAILED] pricing sample', { key: pk, code: p && p.code, price: p && p.price, priceType: typeof (p && p.price) });
                                    } catch(e){}
                                });
                            }
                        } catch(e){}
                    }
                } catch(e){}
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
            const offerCategoryRaw = sailing.roomType || offer?.category || '';
            const offerBroad = resolveCategory(offerCategoryRaw) || null;
            const suiteBroad = 'DELUXE';
            const suitePriceNum = cheapestPriceForCategory(entry, suiteBroad);
            if (suitePriceNum == null) {
                dbg('computeSuiteUpgradePrice:noSuitePricing', { key, suiteBroad });
                try { App.PricingUtils._nullReportCount = (App.PricingUtils._nullReportCount || 0) + 1; if (App.PricingUtils._nullReportCount <= 20) console.debug('[PricingUtils] no suite pricing in entry', key, { suiteBroad, pricingKeys: Object.keys(entry.stateroomPricing || {}) }); } catch(e){}
                // Additional hint: maybe prices are strings; dump a limited sample of pricing entries to inspect shape
                try {
                    App.PricingUtils._noSuiteLogCount = (App.PricingUtils._noSuiteLogCount || 0) + 1;
                    if (App.PricingUtils._noSuiteLogCount <= 50) {
                        const keys = Object.keys(entry.stateroomPricing || {}).slice(0,20);
                        const sample = keys.map(k => {
                            try {
                                const p = entry.stateroomPricing[k] || {};
                                return { k, code: p.code, rawPrice: p.price, priceType: typeof p.price };

