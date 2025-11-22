let _offerValueStats = null;
function _initOfferValueStats() {
    _offerValueStats = {
        totalRows: 0,
        computed: 0,
        missing: 0,
        matchMiss: 0,
        reasons: {
            cacheMiss: 0,
            fallbackByShipName: 0,
            fallbackShipNameFailed: 0,
            noPricingEntry: 0,
            taxesMissing: 0,
            offerBroadNull: 0,
            bucketEmpty: 0,
            offerBasePriceNull: 0,
            computeError: 0
        },
        samples: {
            noPricingEntry: [],
            offerBasePriceNull: [],
            bucketEmpty: [],
            matchMiss: []
        }
    };
}
function _recordReason(reason, offer, sailing) {
    if (!_offerValueStats) return;
    if (_offerValueStats.reasons[reason] === undefined) _offerValueStats.reasons[reason] = 0;
    _offerValueStats.reasons[reason]++;
    const code = (offer?.campaignOffer?.offerCode || '').trim();
    const sailISO = (sailing?.sailDate || '').toString().trim().slice(0,10);
    const shipName = (sailing?.shipName || '').trim();
    if (_offerValueStats.samples[reason] && _offerValueStats.samples[reason].length < 5) {
        _offerValueStats.samples[reason].push({ code, sailISO, shipName });
    }
}
function _logOfferValueSummary(tag='OfferValueSummary') {
    if (!_offerValueStats) return;
    const s = _offerValueStats;
    const missingPct = s.totalRows ? ((s.missing / s.totalRows) * 100).toFixed(1) : '0.0';
    const computedPct = s.totalRows ? ((s.computed / s.totalRows) * 100).toFixed(1) : '0.0';
    const summary = {
        totalRows: s.totalRows,
        computed: `${s.computed} (${computedPct}%)`,
        missing: `${s.missing} (${missingPct}%)`,
        matchMiss: s.matchMiss,
        reasons: s.reasons,
        samples: s.samples
    };
    try {
        console.debug(`[DEBUG][${tag}]`, summary);
    } catch(e){}
}

const Utils = {
    // Centralized brand detection (R = Royal, C = Celebrity)
    detectBrand() {
        const host = (location && location.hostname) ? location.hostname : '';
        let brand = (host.includes('celebritycruises.com') || host.includes('bluechipcluboffers.com')) ? 'C' : 'R';
        try {
            const override = localStorage.getItem('casinoBrand');
            if (override === 'R' || override === 'C') brand = override;
            if (override === 'X') brand = 'C';
        } catch(e) {}
        return brand;
    },
    isCelebrity() { return this.detectBrand() === 'C'; },
    getRedemptionBase() {
        return this.isCelebrity() ? 'https://www.celebritycruises.com/blue-chip-club/redemptions/' : 'https://www.royalcaribbean.com/club-royale/redemptions/';
    },
    computePerks(offer, sailing) {
        const names = new Set();
        const perkCodes = offer?.campaignOffer?.perkCodes;
        if (Array.isArray(perkCodes)) {
            perkCodes.forEach(p => {
                const name = p?.perkName || p?.perkCode;
                if (name) names.add(name.trim());
            });
        }
        const bonus = sailing?.nextCruiseBonusPerkCode;
        if (bonus) {
            const name = bonus.perkName || bonus.perkCode;
            if (name) names.add(name.trim());
        }
        return names.size ? Array.from(names).join(' | ') : '-';
    },
    // Helper to format date string as MM/DD/YY without timezone shift
    formatDate(dateStr) {
        if (!dateStr) return '-';
        // Handles YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
        const [year, month, day] = dateStr.split('T')[0].split('-');
        return `${month}/${day}/${year.slice(-2)}`;
    },
    // Helper to extract nights and destination from itinerary string
    parseItinerary(itinerary) {
        if (!itinerary) return { nights: '-', destination: '-' };
        // Support N, NIGHT, NIGHTS, NT, NTS (case-insensitive). Allow optional hyphen/space after the night token.
        const match = itinerary.match(/^\s*(\d+)\s*N(?:IGHT|T)?S?\b[\s\-.,]*([\s\S]*)$/i);
        if (match) {
            const nights = match[1];
            const destination = match[2] ? match[2].trim() : '-';
            return { nights, destination: destination || '-' };
        }
        return { nights: '-', destination: itinerary };
    },
    // Helper to convert a string to title case (each word capitalized)
    toTitleCase(str) {
        return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    },
    // Helper to title-case only words longer than two characters
    toPortTitleCase(str) {
        if (!str) return str;
        return str.split(/(\W+)/).map(word => {
            if (/^[A-Za-z]{3,}$/.test(word)) {
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            return word;
        }).join('');
    },
    // Helper to format trade-in values consistently across table, grouping and filtering
    formatTradeValue(rawTrade) {
        if (rawTrade === undefined || rawTrade === null || rawTrade === '') return '-';
        if (typeof rawTrade === 'number') {
            const num = rawTrade;
            return Number.isInteger(num) ? `$${num.toLocaleString()}` : `$${num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
        }
        const cleaned = String(rawTrade).replace(/[^0-9.\-]/g, '');
        const parsed = cleaned === '' ? NaN : parseFloat(cleaned);
        if (!isNaN(parsed)) {
            return Number.isInteger(parsed) ? `$${parsed.toLocaleString()}` : `$${parsed.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
        }
        const s = String(rawTrade).trim();
        return s === '' ? '-' : s;
    },
    // New: compute raw offer value (numeric) based on itinerary pricing + guest occupancy
    computeOfferValue(offer, sailing) {
        try {
            if (!offer || !sailing) return null;
            const isOneGuestOffer = !!sailing.isGOBO;
            const shipCode = (sailing.shipCode || '').toString().trim();
            const sailDate = (sailing.sailDate || '').toString().trim().slice(0,10);
            if (!sailDate) { _recordReason('computeError', offer, sailing); return null; }
            const key = shipCode ? `SD_${shipCode}_${sailDate}` : null;
            let entry = key && typeof ItineraryCache !== 'undefined' && ItineraryCache && typeof ItineraryCache.get === 'function' ? ItineraryCache.get(key) : null;
            if (!entry) _recordReason('cacheMiss', offer, sailing);
            if ((!entry || !entry.stateroomPricing || !Object.keys(entry.stateroomPricing).length)) {
                try {
                    const all = (typeof ItineraryCache !== 'undefined' && ItineraryCache && typeof ItineraryCache.all === 'function') ? ItineraryCache.all() : null;
                    const shipNameLc = (sailing.shipName || '').trim().toLowerCase();
                    if (all && typeof all === 'object') {
                        const candidates = Object.values(all).filter(e => e && e.sailDate && String(e.sailDate).slice(0,10) === sailDate);
                        let found = candidates.find(c => c.shipName && String(c.shipName).trim().toLowerCase() === shipNameLc);
                        if (!found && candidates.length) found = candidates[0];
                        if (found) { entry = found; _recordReason('fallbackByShipName', offer, sailing); }
                        else _recordReason('fallbackShipNameFailed', offer, sailing);
                    }
                } catch(e){ _recordReason('computeError', offer, sailing); }
            }
            let sailingPricingFallback = null;
            try {
                if ((!entry || !entry.stateroomPricing || !Object.keys(entry.stateroomPricing).length) && Array.isArray(sailing.stateroomClassPricing) && sailing.stateroomClassPricing.length) {
                    sailingPricingFallback = sailing.stateroomClassPricing;
                }
            } catch(e){ _recordReason('computeError', offer, sailing); }
            if ((!entry || !entry.stateroomPricing || !Object.keys(entry.stateroomPricing).length) && !sailingPricingFallback) { _recordReason('noPricingEntry', offer, sailing); return null; }
            let taxesNumber = 0;
            try {
                let rawTaxes = entry && entry.taxesAndFees;
                if (rawTaxes == null && sailing.taxesAndFees != null) rawTaxes = sailing.taxesAndFees;
                if (rawTaxes && typeof rawTaxes === 'object' && rawTaxes.value != null) rawTaxes = rawTaxes.value;
                if (typeof rawTaxes === 'number') taxesNumber = Number(rawTaxes) * 2;
                else if (typeof rawTaxes === 'string') { const cleaned = rawTaxes.replace(/[^0-9.\-]/g,''); const num = Number(cleaned); if (isFinite(num)) taxesNumber = num * 2; }
            } catch(e){ taxesNumber = 0; }
            if (!taxesNumber) _recordReason('taxesMissing', offer, sailing);
            let categoriesMap = null;
            try { if (entry && entry.pricingDerived && entry.pricingDerived.categories) categoriesMap = entry.pricingDerived.categories; } catch(e){ }
            // Heuristic classification for stateroom codes (broader mapping than original)
            function classifyBroad(code) {
                try { if (typeof window !== 'undefined' && window.RoomCategoryUtils && typeof window.RoomCategoryUtils.classifyBroad === 'function') return window.RoomCategoryUtils.classifyBroad(code); } catch(e){}
                if (!code) return null;
                const up = String(code).trim().toUpperCase();
                if (/SUITE|JRSUITE|JR\s?SUITE|JS|SU\b|DLX|DELUXE/.test(up)) return 'DELUXE';
                if (/BALC|BALCONY|BK\b|^\d+B$|BALK?/.test(up) || /\bB$/.test(up)) return 'BALCONY';
                if (/OCEAN|OUTSIDE|OV|\bO\b|\bN$/.test(up) || /\d+N$/.test(up) || /\d+O$/.test(up)) return 'OUTSIDE';
                if (/INTERIOR|INSIDE|INT|\bI\b|\d+V$|\d+I$|\bV$/.test(up)) return 'INTERIOR';
                return null;
            }
            const offerCategoryRaw = (sailing.roomType || offer.category || offer.campaignOffer?.category || '').toString().trim();
            let offerBroad = classifyBroad(offerCategoryRaw);
            if (!offerBroad) {
                // Try parsing from offer name fragments
                const nameStr = (offer.campaignOffer?.name || '').toString();
                offerBroad = classifyBroad(nameStr);
            }
            if (!offerBroad) _recordReason('offerBroadNull', offer, sailing);
            let offerBasePriceNum = null;
            if (categoriesMap && offerBroad && categoriesMap[offerBroad] != null) {
                offerBasePriceNum = categoriesMap[offerBroad];
            } else {
                const rawPricingSource = sailingPricingFallback || (entry ? entry.stateroomPricing : {});
                const priceEntries = [];
                if (Array.isArray(rawPricingSource)) {
                    rawPricingSource.forEach(p => {
                        try {
                            const code = (p?.stateroomClass?.content?.code || p?.stateroomClass?.id || '').toString().trim();
                            const priceVal = p?.price?.value ?? p?.priceAmount ?? p?.price ?? null;
                            if (code && priceVal != null && isFinite(priceVal)) priceEntries.push({ code, dual: Number(priceVal) * 2 });
                        } catch(e){}
                    });
                } else {
                    Object.keys(rawPricingSource || {}).forEach(k => {
                        try {
                            const pr = rawPricingSource[k];
                            const code = (pr && (pr.code || k) || '').toString().trim();
                            const rawPrice = pr && (pr.price ?? pr.amount ?? pr.priceAmount ?? pr.priceAmt ?? pr.priceamount);
                            if (code && rawPrice != null) {
                                let dual = null;
                                if (typeof rawPrice === 'number') dual = rawPrice * 2; else if (typeof rawPrice === 'string') { const cleaned = rawPrice.replace(/[^0-9.\-]/g,''); const num = Number(cleaned); if (isFinite(num)) dual = num * 2; }
                                if (dual != null) priceEntries.push({ code, dual });
                            }
                        } catch(e){}
                    });
                }
                if (priceEntries.length) {
                    // Build minima per broad category via heuristic classification
                    const minima = { INTERIOR:null, OUTSIDE:null, BALCONY:null, DELUXE:null };
                    priceEntries.forEach(pe => {
                        const broad = classifyBroad(pe.code);
                        if (broad && (minima[broad] == null || pe.dual < minima[broad])) minima[broad] = pe.dual;
                    });
                    // If offerBroad resolved, use its min directly
                    if (offerBroad && minima[offerBroad] != null) {
                        offerBasePriceNum = minima[offerBroad];
                    } else {
                        // Lower-category fallback logic: attempt nearest lower categories only
                        if (offerBroad) {
                            const order = ['INTERIOR','OUTSIDE','BALCONY','DELUXE'];
                            const idx = order.indexOf(offerBroad);
                            if (idx > 0) {
                                for (let i = idx - 1; i >= 0; i--) {
                                    const cat = order[i];
                                    if (minima[cat] != null) { offerBasePriceNum = minima[cat]; _recordReason('fallbackLowerCategoryUsed_'+cat, offer, sailing); break; }
                                }
                            }
                            if (offerBasePriceNum == null) {
                                // No lower categories available => value zero
                                _recordReason('allLowerSoldOut', offer, sailing);
                                offerBasePriceNum = 0; // sentinel for zero value
                            }
                        } else {
                            // Original generic fallback when classification failed: cheapest overall
                            const order = ['INTERIOR','OUTSIDE','BALCONY','DELUXE'];
                            for (const cat of order) { if (minima[cat] != null) { offerBasePriceNum = minima[cat]; _recordReason('fallbackAny_'+cat, offer, sailing); break; } }
                            if (offerBasePriceNum == null) { _recordReason('minimaAllNull', offer, sailing); offerBasePriceNum = 0; }
                        }
                    }
                } else {
                    _recordReason('bucketEmpty', offer, sailing);
                }
            }
            if (offerBasePriceNum == null || !isFinite(offerBasePriceNum)) { _recordReason('offerBasePriceNull', offer, sailing); return null; }
            // Sentinel zero means no priced awarded or lower category available
            if (offerBasePriceNum === 0) { _recordReason('zeroValue', offer, sailing); return 0; }
            if (isOneGuestOffer) {
                const SINGLE_GUEST_DISCOUNT_ASSUMED = 200;
                const numerator = offerBasePriceNum + SINGLE_GUEST_DISCOUNT_ASSUMED - taxesNumber;
                const val = numerator / 1.4 - SINGLE_GUEST_DISCOUNT_ASSUMED;
                return (isFinite(val) && val>0)?val:0;
            }
            const diff = offerBasePriceNum - taxesNumber;
            return (isFinite(diff) && diff>0)?diff:0;
        } catch(e){ _recordReason('computeError', offer, sailing); return null; }
    },
    refreshOfferValues() {
        try {
            const rows = document.querySelectorAll('table.table-auto tbody tr, .accordion-table tbody tr');
            if (!rows || !rows.length) return;
            if (!_offerValueStats) _initOfferValueStats();
            const state = (window.App && App.TableRenderer && App.TableRenderer.lastState) ? App.TableRenderer.lastState : null;
            // Build quick lookup map by compound key to speed matching fallback (offerCode|sailDateISO|shipName)
            let compoundMap = null;
            if (state && Array.isArray(state.sortedOffers)) {
                compoundMap = new Map();
                state.sortedOffers.forEach(({offer, sailing}, i) => {
                    try {
                        const code = (offer.campaignOffer?.offerCode || '').trim();
                        const sailISO = (sailing.sailDate || '').toString().trim().slice(0,10);
                        const shipName = (sailing.shipName || '').trim();
                        if (code && sailISO && shipName) compoundMap.set(code+'|'+sailISO+'|'+shipName, i);
                    } catch(e){}
                });
            }
            rows.forEach(r => {
                try {
                    const cells = r.querySelectorAll('td');
                    if (cells.length < 7) return;
                    const valCell = cells[6];
                    if (!valCell) return;
                    const code = (r.dataset.offerCode || '').trim();
                    const sailISO = (r.dataset.sailDate || '').trim();
                    const shipName = (r.dataset.shipName || '').trim();
                    if (!_offerValueStats) _initOfferValueStats();
                    _offerValueStats.totalRows++;
                    if (valCell.textContent && valCell.textContent.trim() !== '-') {
                        _offerValueStats.computed++;
                        return;
                    }
                    let matchObj = null;
                    if (state && Array.isArray(state.sortedOffers)) {
                        // Prefer direct index if present
                        if (r.dataset.offerIndex && state.sortedOffers[Number(r.dataset.offerIndex)]) {
                            matchObj = state.sortedOffers[Number(r.dataset.offerIndex)];
                        } else if (compoundMap) {
                            const idx = compoundMap.get(code+'|'+sailISO+'|'+shipName);
                            if (idx != null) matchObj = state.sortedOffers[idx];
                        } else {
                            // Fallback linear search (should rarely occur now)
                            matchObj = state.sortedOffers.find(w => {
                                try {
                                    const mCode = (w.offer.campaignOffer?.offerCode || '').trim();
                                    const mISO = (w.sailing.sailDate || '').toString().trim().slice(0,10);
                                    const mShip = (w.sailing.shipName || '').trim();
                                    return code && sailISO && shipName && code === mCode && sailISO === mISO && shipName === mShip;
                                } catch(e){ return false; }
                            });
                        }
                    }
                    if (!matchObj) {
                        _offerValueStats.matchMiss++;
                        if (_offerValueStats.samples.matchMiss.length < 5) _offerValueStats.samples.matchMiss.push({ code, sailISO, shipName });
                        _offerValueStats.missing++;
                        return;
                    }
                    const rawVal = Utils.computeOfferValue(matchObj.offer, matchObj.sailing);
                    if (rawVal != null && isFinite(rawVal)) {
                        valCell.textContent = App.Utils.formatOfferValue(rawVal);
                        _offerValueStats.computed++;
                    } else {
                        _offerValueStats.missing++;
                    }
                } catch(e){ _offerValueStats.missing++; }
            });
        } catch(e){ /* ignore */ }
    },
    // Normalize fetched offers data: trim and standardize capitalization
    normalizeOffers(data) {
        if (data && Array.isArray(data.offers)) {
            data.offers.forEach((offerObj) => {
                const co = offerObj.campaignOffer;
                if (co) {
                    if (typeof co.offerCode === 'string') co.offerCode = co.offerCode.trim().toUpperCase();
                    if (typeof co.name === 'string') co.name = Utils.toTitleCase(co.name.trim());
                    if (Array.isArray(co.sailings)) {
                        co.sailings.forEach((sailing) => {
                            if (typeof sailing.shipName === 'string') sailing.shipName = Utils.toTitleCase(sailing.shipName.trim());
                            if (sailing.departurePort?.name) sailing.departurePort.name = Utils.toPortTitleCase(sailing.departurePort.name.trim());
                            if (typeof sailing.itineraryDescription === 'string') sailing.itineraryDescription = Utils.toTitleCase(sailing.itineraryDescription.trim());
                            if (sailing.sailingType?.name) sailing.sailingType.name = Utils.toTitleCase(sailing.sailingType.name.trim());
                        });
                    }
                }
            });
            // Build/update shared itinerary cache (keys: SD_<shipCode>_<sailDate>) persisted in extension storage
            try {
                ItineraryCache.buildOrUpdateFromOffers(data);
            } catch(e) { /* ignore cache build errors */ }
        }
        return data;
    },
    // Ship class lookup
    getShipClass(shipName) {
        if (!shipName) return '-';
        const key = shipName.trim().toLowerCase();
        const map = {
            // Royal Caribbean International
            'icon of the seas': 'Icon',
            'star of the seas': 'Icon',
            'legend of the seas': 'Icon',
            'utopia of the seas': 'Oasis',
            'oasis of the seas': 'Oasis',
            'allure of the seas': 'Oasis',
            'harmony of the seas': 'Oasis',
            'symphony of the seas': 'Oasis',
            'wonder of the seas': 'Oasis',
            'freedom of the seas': 'Freedom',
            'liberty of the seas': 'Freedom',
            'independence of the seas': 'Freedom',
            'quantum of the seas': 'Quantum',
            'anthem of the seas': 'Quantum',
            'ovation of the seas': 'Quantum',
            'spectrum of the seas': 'Quantum Ultra',
            'odyssey of the seas': 'Quantum Ultra',
            'voyager of the seas': 'Voyager',
            'navigator of the seas': 'Voyager',
            'mariner of the seas': 'Voyager',
            'adventure of the seas': 'Voyager',
            'explorer of the seas': 'Voyager',
            'radiance of the seas': 'Radiance',
            'brilliance of the seas': 'Radiance',
            'serenade of the seas': 'Radiance',
            'jewel of the seas': 'Radiance',
            'vision of the seas': 'Vision',
            'enchantment of the seas': 'Vision',
            'grandeur of the seas': 'Vision',
            'rhapsody of the seas': 'Vision',
            'majesty of the seas': 'Sovereign',
            'sovereign of the seas': 'Sovereign',
            'empress of the seas': 'Empress',
            // Celebrity Cruises
            'celebrity xcel': 'Edge',
            'celebrity ascent': 'Edge',
            'celebrity beyond': 'Edge',
            'celebrity apex': 'Edge',
            'celebrity edge': 'Edge',
            'celebrity reflection': 'Solstice',
            'celebrity silhouette': 'Solstice',
            'celebrity equinox': 'Solstice',
            'celebrity eclipse': 'Solstice',
            'celebrity solstice': 'Solstice',
            'celebrity constellation': 'Millennium',
            'celebrity summit': 'Millennium',
            'celebrity infinity': 'Millennium',
            'celebrity millennium': 'Millennium',
            'celebrity flora': 'Expedition',
            'xcel': 'Edge',
            'ascent': 'Edge',
            'beyond': 'Edge',
            'apex': 'Edge',
            'edge': 'Edge',
            'reflection': 'Solstice',
            'silhouette': 'Solstice',
            'equinox': 'Solstice',
            'eclipse': 'Solstice',
            'solstice': 'Solstice',
            'constellation': 'Millennium',
            'summit': 'Millennium',
            'infinity': 'Millennium',
            'millennium': 'Millennium',
            'flora': 'Expedition',
        };
        return map[key] || '-';
    }
};

// Expose globally for other scripts that may reference window.Utils
if (typeof window !== 'undefined') {
    try { window.Utils = Utils; } catch(e) { /* ignore in strict environments */ }
    // Attach post-render listeners once
    try {
        if (!window._offerValueListenersAttached) {
            const triggerRefresh = () => {
                _initOfferValueStats();
                try { Utils.refreshOfferValues(); } catch(e){}
                setTimeout(() => { try { Utils.refreshOfferValues(); } catch(e){} }, 500);
                setTimeout(() => { try { Utils.refreshOfferValues(); _logOfferValueSummary(); } catch(e){} }, 1500);
            };
            document.addEventListener('tableRenderComplete', triggerRefresh);
            document.addEventListener('goboItineraryHydrated', triggerRefresh);
            document.addEventListener('goboItineraryPricingComputed', triggerRefresh);
            window._offerValueListenersAttached = true;
        }
    } catch(e){}
}
