// Ensures advanced-only predicates stay active even if App.FilterUtils is unavailable (e.g., tests)
const ADVANCED_ONLY_FALLBACK_KEYS = [
    'departureDayOfWeek',
    'departureMonth',
    'visits',
    'endDate',
    'minInteriorPrice',
    'minOutsidePrice',
    'minBalconyPrice',
    'minSuitePrice'
];

const ADV_PRICE_KEY_TO_CATEGORY = {
    minInteriorPrice: 'INTERIOR',
    minOutsidePrice: 'OUTSIDE',
    minBalconyPrice: 'BALCONY',
    minSuitePrice: 'DELUXE'
};

const STATEROOM_CATEGORY_MAP = {
    I: 'INTERIOR', IN: 'INTERIOR', INT: 'INTERIOR', INSIDE: 'INTERIOR', INTERIOR: 'INTERIOR',
    O: 'OUTSIDE', OV: 'OUTSIDE', OB: 'OUTSIDE', E: 'OUTSIDE', OCEAN: 'OUTSIDE', OCEANVIEW: 'OUTSIDE', OUTSIDE: 'OUTSIDE',
    B: 'BALCONY', BAL: 'BALCONY', BK: 'BALCONY', BALCONY: 'BALCONY',
    D: 'DELUXE', DLX: 'DELUXE', DELUXE: 'DELUXE', JS: 'DELUXE', SU: 'DELUXE', SUITE: 'DELUXE', JUNIOR: 'DELUXE',
    JR: 'DELUXE', 'JR.': 'DELUXE', 'JR-SUITE': 'DELUXE', 'JR SUITE': 'DELUXE', 'JUNIOR SUITE': 'DELUXE',
    JRSUITE: 'DELUXE', 'JR SUITES': 'DELUXE', 'JUNIOR SUITES': 'DELUXE'
};

const STATEROOM_DISPLAY_MAP = {
    I: 'Interior', IN: 'Interior', INT: 'Interior', INSIDE: 'Interior', INTERIOR: 'Interior',
    O: 'Ocean View', OV: 'Ocean View', OB: 'Ocean View', E: 'Ocean View', OCEAN: 'Ocean View', OCEANVIEW: 'Ocean View', OUTSIDE: 'Ocean View',
    B: 'Balcony', BAL: 'Balcony', BK: 'Balcony', BALCONY: 'Balcony',
    D: 'Suite', DLX: 'Suite', DELUXE: 'Suite', JS: 'Suite', SU: 'Suite', SUITE: 'Suite', JUNIOR: 'Suite',
    JR: 'Suite', 'JR.': 'Suite', 'JR-SUITE': 'Suite', 'JR SUITE': 'Suite', 'JUNIOR SUITE': 'Suite',
    JRSUITE: 'Suite', 'JR SUITES': 'Suite', 'JUNIOR SUITES': 'Suite'
};

const MS_PER_DAY = 86400000;

function normalizeIsoDateString(raw) {
    if (!raw) return null;
    if (raw instanceof Date && !isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
    const str = String(raw).trim();
    if (!str) return null;
    const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(str);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    const parsed = new Date(str);
    if (isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
}

function coerceNightCount(raw) {
    if (raw == null || raw === '') return null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
}

function getItineraryParser() {
    try {
        if (typeof App !== 'undefined' && App && App.Utils && typeof App.Utils.parseItinerary === 'function') {
            return App.Utils.parseItinerary.bind(App.Utils);
        }
    } catch (e) { /* ignore */ }
    try {
        if (typeof Utils !== 'undefined' && typeof Utils.parseItinerary === 'function') {
            return Utils.parseItinerary.bind(Utils);
        }
    } catch (e) { /* ignore */ }
    return null;
}

function resolveItineraryMeta(sailing) {
    if (!sailing) return { nightsText: '-', destination: '-', nightsCount: null };
    if (sailing.__itineraryMeta && typeof sailing.__itineraryMeta === 'object') return sailing.__itineraryMeta;
    const meta = { nightsText: '-', destination: '-', nightsCount: null };
    const parser = getItineraryParser();
    const itinerary = sailing.itineraryDescription || sailing.sailingType?.name || '';
    if (parser) {
        try {
            const parsed = parser(itinerary || '');
            if (parsed && typeof parsed === 'object') {
                if (parsed.nights != null && parsed.nights !== '') {
                    meta.nightsText = parsed.nights;
                    meta.nightsCount = coerceNightCount(parsed.nights);
                }
                if (parsed.destination) meta.destination = parsed.destination;
            }
        } catch (e) { /* ignore */ }
    }
    if (meta.nightsCount == null) {
        const fallback = coerceNightCount(sailing.nights ?? sailing.numberOfNights ?? sailing.totalNights ?? (sailing.itinerary && sailing.itinerary.nights));
        if (fallback != null) {
            meta.nightsCount = fallback;
            meta.nightsText = `${fallback}`;
        }
    }
    if (!meta.destination || meta.destination === '-') {
        meta.destination = sailing.destination || sailing.region || '-';
    }
    sailing.__itineraryMeta = meta;
    return meta;
}

function deriveEndDateIso(sailing) {
    if (!sailing) return null;
    if (typeof sailing.__computedEndDateIso === 'string' && sailing.__computedEndDateIso) return sailing.__computedEndDateIso;
    const direct = normalizeIsoDateString(sailing.endDate || sailing.disembarkDate || sailing.arrivalDate);
    if (direct) {
        sailing.__computedEndDateIso = direct;
        return direct;
    }
    const sailIso = normalizeIsoDateString(sailing.sailDate || sailing.startDate);
    if (!sailIso) return null;
    const meta = resolveItineraryMeta(sailing);
    const nights = meta.nightsCount;
    if (nights == null || !isFinite(nights)) return null;
    const parts = sailIso.split('-');
    if (parts.length !== 3) return null;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if ([year, month, day].some(v => Number.isNaN(v))) return null;
    const endMs = Date.UTC(year, month, day) + nights * MS_PER_DAY;
    const iso = new Date(endMs).toISOString().slice(0, 10);
    sailing.__computedEndDateIso = iso;
    return iso;
}

function coercePrice(raw) {
    if (raw == null) return null;
    if (typeof raw === 'number') return isFinite(raw) ? Number(raw) : null;
    if (typeof raw === 'string') {
        const cleaned = raw.replace(/[^0-9.\-]/g, '');
        if (!cleaned) return null;
        const num = Number(cleaned);
        return isFinite(num) ? num : null;
    }
    return null;
}

function resolveBroadCategory(raw) {
    if (!raw) return null;
    const up = String(raw).trim().toUpperCase();
    if (STATEROOM_CATEGORY_MAP[up]) return STATEROOM_CATEGORY_MAP[up];
    if (['INTERIOR', 'OUTSIDE', 'BALCONY', 'DELUXE'].includes(up)) return up;
    return null;
}

function resolveDisplayLabel(raw) {
    if (!raw) return '';
    const up = String(raw).trim().toUpperCase();
    return STATEROOM_DISPLAY_MAP[up] || String(raw).trim();
}

function buildPriceEntries(entry, sailing) {
    const entries = [];
    const pushEntry = (code, basePrice, currency) => {
        if (!code) return;
        const coerced = coercePrice(basePrice);
        if (coerced == null) return;
        entries.push({
            code: code.toString().trim(),
            priceDual: Number(coerced) * 2,
            currency: currency || ''
        });
    };

    const rawPricing = (entry && entry.stateroomPricing) || {};
    Object.keys(rawPricing).forEach(key => {
        try {
            const pr = rawPricing[key] || {};
            const code = (pr.code || key || '').toString().trim();
            const base = pr.price ?? pr.amount ?? pr.priceAmount ?? pr.priceAmt ?? pr.priceamount ?? pr.fare ?? null;
            const currency = pr.currency || pr.currencyCode || '';
            pushEntry(code, base, currency);
        } catch (e) { /* ignore */ }
    });

    if (!entries.length && Array.isArray(sailing?.stateroomClassPricing)) {
        sailing.stateroomClassPricing.forEach(pr => {
            try {
                const code = (pr?.stateroomClass?.content?.code || pr?.stateroomClass?.id || '').toString().trim();
                const base = pr?.price?.value ?? pr?.priceAmount ?? pr?.price ?? pr?.fare ?? null;
                const currency = pr?.price?.currency ?? pr?.currency ?? '';
                pushEntry(code, base, currency);
            } catch (e) { /* ignore */ }
        });
    }
    return entries;
}

function deriveCategoryMinimums(priceEntries) {
    const mins = { INTERIOR: null, OUTSIDE: null, BALCONY: null, DELUXE: null };
    priceEntries.forEach(pe => {
        const broad = resolveBroadCategory(pe.code);
        if (!broad || pe.priceDual == null) return;
        if (mins[broad] == null || pe.priceDual < mins[broad]) mins[broad] = pe.priceDual;
    });
    return mins;
}

function findOfferPriceEntry(priceEntries, rawCategory) {
    if (!rawCategory) return null;
    const target = rawCategory.toString().trim().toUpperCase();
    if (!target) return null;
    let match = priceEntries.find(pe => pe.code.toUpperCase() === target);
    if (match) return match;
    match = priceEntries.find(pe => resolveDisplayLabel(pe.code).toUpperCase() === target);
    if (match) return match;
    const bucket = resolveBroadCategory(rawCategory);
    if (!bucket) return null;
    const bucketEntries = priceEntries
        .filter(pe => resolveBroadCategory(pe.code) === bucket && pe.priceDual != null)
        .sort((a, b) => a.priceDual - b.priceDual);
    return bucketEntries.length ? bucketEntries[0] : null;
}

function computeDualTaxes(entry, sailing, derived) {
    if (derived && typeof derived.taxesAndFeesDual === 'number' && isFinite(derived.taxesAndFeesDual)) {
        return Number(derived.taxesAndFeesDual);
    }
    let rawTaxes = entry && entry.taxesAndFees != null ? entry.taxesAndFees : sailing?.taxesAndFees;
    if (rawTaxes && typeof rawTaxes === 'object' && rawTaxes.value != null) rawTaxes = rawTaxes.value;
    const coerced = coercePrice(rawTaxes);
    return coerced != null ? Number(coerced) * 2 : 0;
}

function detectSingleGuestScenario(offer, sailing) {
    const isTruthyFlag = (val) => {
        if (val === true) return true;
        if (typeof val === 'number') return Number(val) === 1;
        if (typeof val === 'string') {
            const trimmed = val.trim().toLowerCase();
            if (!trimmed) return false;
            if (trimmed === 'true' || trimmed === '1' || trimmed === 'yes') return true;
        }
        return false;
    };
    const labelIndicatesSingle = (val) => {
        if (typeof val !== 'string') return false;
        return /^\s*1\s*guest/i.test(val.trim());
    };
    try {
        if (isTruthyFlag(sailing?.isGOBO)) return true;
        const occupancyHints = [
            sailing?.guestOccupancy,
            sailing?.guestCount,
            sailing?.guestCapacity,
            offer?.guestOccupancy,
            offer?.guestCount,
            offer?.campaignOffer?.guestOccupancy,
            offer?.campaignOffer?.guestCount
        ];
        if (occupancyHints.some(isTruthyFlag)) return true;
        const guestLabels = [
            sailing?.guests,
            offer?.guests,
            offer?.campaignOffer?.guests,
            offer?.campaignOffer?.guestLabel
        ];
        if (guestLabels.some(labelIndicatesSingle)) return true;
        const state = (typeof App !== 'undefined' && App && App.TableRenderer && App.TableRenderer.lastState) ? App.TableRenderer.lastState : null;
        if (state && Array.isArray(state.sortedOffers)) {
            const offerCode = (offer?.campaignOffer?.offerCode || '').trim().toUpperCase();
            const sailDate = (sailing?.sailDate || '').toString().trim().slice(0, 10);
            const ship = (sailing?.shipCode || sailing?.shipName || '').toString().trim().toUpperCase();
            if (offerCode && sailDate && ship) {
                const match = state.sortedOffers.find(({ offer: o, sailing: s }) => {
                    if (!o || !s) return false;
                    const oCode = (o?.campaignOffer?.offerCode || '').trim().toUpperCase();
                    if (oCode !== offerCode) return false;
                    const sDate = (s?.sailDate || '').toString().trim().slice(0, 10);
                    if (sDate !== sailDate) return false;
                    const sShip = (s?.shipCode || s?.shipName || '').toString().trim().toUpperCase();
                    return sShip === ship;
                });
                if (match) {
                    if (isTruthyFlag(match.sailing?.isGOBO)) return true;
                    if (labelIndicatesSingle(match.sailing?.guests)) return true;
                }
            }
        }
    } catch (e) { /* ignore detection errors */ }
    return false;
}

function computeAdvancedMinPrice(offer, sailing, key, includeTaxes) {
    try {
        const broadKey = ADV_PRICE_KEY_TO_CATEGORY[key];
        if (!broadKey) return '-';
        if (!sailing) return '-';
        const shipCode = (sailing.shipCode || '').toString().trim();
        const sailDate = (sailing.sailDate || '').toString().trim().slice(0, 10);
        if (!sailDate) return '-';
        const cacheKey = shipCode ? `SD_${shipCode}_${sailDate}` : null;
        let entry = cacheKey && typeof ItineraryCache !== 'undefined' && ItineraryCache.get ? ItineraryCache.get(cacheKey) : null;
        if (!entry && shipCode && typeof ItineraryCache !== 'undefined' && ItineraryCache.getByShipDate) {
            try { entry = ItineraryCache.getByShipDate(shipCode, sailDate); } catch (e) { entry = null; }
        }
        if (!entry || !entry.pricingDerived) return '-';
        const derived = entry.pricingDerived;
        const priceEntries = buildPriceEntries(entry, sailing);
        const categoryMins = deriveCategoryMinimums(priceEntries);
        const getCategoryMin = (broad) => {
            if (!broad) return null;
            if (derived.categories && derived.categories[broad] != null) return derived.categories[broad];
            if (categoryMins[broad] != null) return categoryMins[broad];
            return null;
        };
        const taxesDual = computeDualTaxes(entry, sailing, derived);
        const offerCategoryRaw = (sailing.roomType || offer?.category || offer?.campaignOffer?.category || offer?.campaignOffer?.name || '').toString().trim();
        let offerBroad = resolveBroadCategory(offerCategoryRaw);
        if (!offerBroad && offer?.campaignOffer?.name) offerBroad = resolveBroadCategory(offer.campaignOffer.name);
        const offerPriceEntry = findOfferPriceEntry(priceEntries, offerCategoryRaw)
            || (offer?.campaignOffer?.category ? findOfferPriceEntry(priceEntries, offer.campaignOffer.category) : null)
            || (offer?.campaignOffer?.name ? findOfferPriceEntry(priceEntries, offer.campaignOffer.name) : null);
        let offerBaseDual = offerPriceEntry && typeof offerPriceEntry.priceDual === 'number' ? offerPriceEntry.priceDual : null;
        // Prefer an explicit price entry for the offer's category
        if (offerBaseDual == null && offerBroad) {
            const sameCatFallback = getCategoryMin(offerBroad);
            if (sameCatFallback != null) offerBaseDual = sameCatFallback;
        }
        // Do NOT fall back to prices from other categories. If the offer's
        // category prices are unavailable (sold out or missing), we must not
        // assume another category's price (e.g., balcony or suite) as the
        // offer base — return unknown so numeric predicates don't match.

        let computedOfferValue = null;
        try {
            if (App && App.Utils && typeof App.Utils.computeOfferValue === 'function') {
                const rawVal = App.Utils.computeOfferValue(offer, sailing);
                if (rawVal != null && isFinite(rawVal) && rawVal > 0) computedOfferValue = Number(rawVal);
            } else if (typeof Utils !== 'undefined' && Utils && typeof Utils.computeOfferValue === 'function') {
                const rawVal = Utils.computeOfferValue(offer, sailing);
                if (rawVal != null && isFinite(rawVal) && rawVal > 0) computedOfferValue = Number(rawVal);
            }
        } catch (e) { computedOfferValue = null; }

        const isOneGuestOffer = detectSingleGuestScenario(offer, sailing);

        let singleGuestOfferValue = null;
        if (isOneGuestOffer) {
            if (computedOfferValue != null && isFinite(computedOfferValue)) {
                singleGuestOfferValue = Number(computedOfferValue);
            } else if (offerBaseDual != null && isFinite(offerBaseDual)) {
                const SINGLE_GUEST_DISCOUNT_ASSUMED = 200;
                const numerator = offerBaseDual + SINGLE_GUEST_DISCOUNT_ASSUMED - taxesDual;
                const calc = numerator / 1.4 - SINGLE_GUEST_DISCOUNT_ASSUMED;
                if (isFinite(calc) && calc > 0) singleGuestOfferValue = calc;
            }
        }

        const categoryMinDual = getCategoryMin(broadKey);
        if (categoryMinDual == null) return '-';

        if (isOneGuestOffer && singleGuestOfferValue != null) {
            let estimated = categoryMinDual - singleGuestOfferValue;
            if (!isFinite(estimated) || estimated < taxesDual) estimated = taxesDual;
            const value = includeTaxes ? estimated : Math.max(0, estimated - taxesDual);
            return Number(value.toFixed(2));
        }

        if (offerBaseDual == null || !isFinite(offerBaseDual)) return '-';
        if (offerBroad && offerBroad === broadKey) {
            const value = includeTaxes ? taxesDual : 0;
            return Number(value.toFixed(2));
        }

        let diff = categoryMinDual - offerBaseDual;
        if (!isFinite(diff) || diff <= 0) {
            const value = includeTaxes ? taxesDual : 0;
            return Number(value.toFixed(2));
        }

        const finalValue = includeTaxes ? diff + taxesDual : diff;
        return Number(finalValue.toFixed(2));
    } catch (e) {
        return '-';
    }
}


const Filtering = {
    // Debug flag (toggle below to enable/disable debug logging by editing this file)
    DEBUG: false,
    _dbg(){ if (Filtering.DEBUG) { try { console.debug('[Filtering]', ...arguments); } catch(e){} } },
    _globalHiddenRowKeys: new Set(),
    _resetHiddenRowStore(state) {
        if (state) {
            state._hiddenGroupRowKeys = new Set();
            return state._hiddenGroupRowKeys;
        }
        Filtering._globalHiddenRowKeys = new Set();
        return Filtering._globalHiddenRowKeys;
    },
    _getHiddenRowStore(state) {
        if (state) {
            if (!(state._hiddenGroupRowKeys instanceof Set)) state._hiddenGroupRowKeys = new Set();
            return state._hiddenGroupRowKeys;
        }
        if (!(Filtering._globalHiddenRowKeys instanceof Set)) Filtering._globalHiddenRowKeys = new Set();
        return Filtering._globalHiddenRowKeys;
    },
    _rowKey(wrapper) {
        try {
            const code = (wrapper?.offer?.campaignOffer?.offerCode || '').toString().trim().toUpperCase();
            const ship = (wrapper?.sailing?.shipCode || wrapper?.sailing?.shipName || '').toString().trim().toUpperCase();
            const sail = (wrapper?.sailing?.sailDate || '').toString().trim().slice(0, 10);
            if (!code && !ship && !sail) return null;
            return `${code}|${ship}|${sail}`;
        } catch (e) {
            return null;
        }
    },
    _rememberHiddenRow(wrapper, store) {
        if (!store) return;
        const key = Filtering._rowKey(wrapper);
        if (key) store.add(key);
    },
    wasRowHidden(wrapper, state) {
        if (!wrapper) return false;
        const key = Filtering._rowKey(wrapper);
        // no-op debug removed
        if (key) {
            if (state && state._hiddenGroupRowKeys instanceof Set && state._hiddenGroupRowKeys.has(key)) return true;
            if (Filtering._globalHiddenRowKeys instanceof Set && Filtering._globalHiddenRowKeys.has(key)) return true;
        }
        return Filtering.isRowHidden(wrapper, state);
    },
    _parseHiddenGroupPath(path) {
        if (typeof path !== 'string') return null;
        const idx = path.indexOf(':');
        if (idx === -1) return null;
        const label = path.slice(0, idx).trim();
        const value = path.slice(idx + 1).trim();
        if (!label || !value) return null;
        return { label, value, labelLower: label.toLowerCase() };
    },
    _resolveHiddenGroupKey(label, headers, labelMap) {
        if (!label) return null;
        const normalized = label.toLowerCase();
        if (labelMap && labelMap[normalized]) return labelMap[normalized];
        const list = Array.isArray(headers) ? headers : [];
        if (list.length) {
            for (const h of list) {
                if (!h) continue;
                if (h.key && String(h.key).toLowerCase() === normalized) return h.key;
                if (h.label && String(h.label).toLowerCase() === normalized) return h.key;
            }
            for (const h of list) {
                if (!h || !h.label) continue;
                const labelLc = String(h.label).toLowerCase();
                if (labelLc.includes(normalized)) return h.key;
            }
        }
        const common = {
            'name': 'offerName',
            'offername': 'offerName',
            'offercode': 'offerCode',
            'code': 'offerCode',
            'b2b': 'b2bDepth',
            'perks': 'perks'
        };
        const compact = normalized.replace(/\s+/g, '');
        return common[compact] || null;
    },
    _buildHiddenGroupDescriptors(hiddenGroups, headers, labelMap) {
        if (!Array.isArray(hiddenGroups) || !hiddenGroups.length) return [];
        const descriptors = [];
        hiddenGroups.forEach(path => {
            const parsed = Filtering._parseHiddenGroupPath(path);
            if (!parsed) return;
            const key = Filtering._resolveHiddenGroupKey(parsed.label, headers, labelMap);
            if (!key) return;
            descriptors.push({ key, value: parsed.value, label: parsed.label });
        });
        // debug: descriptors built (silent by default)
        return descriptors;
    },
    _matchesHiddenDescriptor(wrapper, descriptor) {
        if (!descriptor || !descriptor.key) return false;
        try {
            const val = Filtering.getOfferColumnValue(wrapper?.offer, wrapper?.sailing, descriptor.key);
            const matched = Filtering._matchesHiddenValue(val, descriptor.value);
            return matched;
        } catch (e) {
            return false;
        }
    },
    _matchesHiddenValue(offerColumnValue, targetValue) {
        if (offerColumnValue == null || targetValue == null) return false;
        try {
            const left = String(offerColumnValue).trim().toUpperCase();
            const right = String(targetValue).trim().toUpperCase();
            if (!left || !right) return false;
            if (left === right) return true;
            // If the left contains multiple codes separated by common delimiters, check tokens
            const tokens = left.split(/[\/,:;|]+/).map(s => s.trim()).filter(Boolean);
            if (tokens.length && tokens.some(t => t === right)) return true;
            // Word-boundary match (e.g. " 25TIER3 " in " 25TIER3/OTHER")
            if ((' ' + left + ' ').indexOf(' ' + right + ' ') !== -1) return true;
            // Fallback: substring match
            if (left.indexOf(right) !== -1) return true;
        } catch (e) { /* ignore matching errors */ }
        return false;
    },
    filterOffers(state, offers) {
        try { console.time('Filtering.filterOffers'); } catch(e){}
        console.debug('[Filtering] filterOffers ENTRY', { offersLen: Array.isArray(offers) ? offers.length : 0, advancedEnabled: !!(state && state.advancedSearch && state.advancedSearch.enabled) });
        // Reset per-run stats for numeric predicates
        Filtering._lessThanStats = { total:0, incomplete:0, invalidTarget:0, missingActual:0, passed:0, failed:0, samples:[] };
        // Hidden groups (GLOBAL)
        const hiddenGroups = Filtering.loadHiddenGroups();
        const hiddenKeyStore = Filtering._resetHiddenRowStore(state);
        Filtering._globalHiddenRowKeys = new Set();
        let working = offers;
        if (Array.isArray(hiddenGroups) && hiddenGroups.length > 0) {
            const headers = Array.isArray(state?.headers) ? state.headers : [];
            const labelToKey = {};
            headers.forEach(h => { if (h && h.label && h.key) labelToKey[h.label.toLowerCase()] = h.key; });
            const descriptors = Filtering._buildHiddenGroupDescriptors(hiddenGroups, headers, labelToKey);
            if (descriptors.length) {
                working = working.filter((wrapper) => {
                    for (const desc of descriptors) {
                        if (Filtering._matchesHiddenDescriptor(wrapper, desc)) {
                            Filtering._rememberHiddenRow(wrapper, hiddenKeyStore);
                            return false;
                        }
                    }
                    return true;
                });
            }
        }
        // Advanced Search layer
        try {
            if (state && state.advancedSearch && state.advancedSearch.enabled) {
                // Removed suiteUpgradePrice hydration logic (field deprecated)
                working = Filtering.applyAdvancedSearch(working, state);
            }
        } catch(e) { console.warn('[Filtering][AdvancedSearch] applyAdvancedSearch failed', e); }
        try { console.timeEnd('Filtering.filterOffers'); } catch(e){}
        if (Filtering.DEBUG && Filtering._lessThanStats && Filtering._lessThanStats.total && window.GOBO_DEBUG_ENABLED) {
            try {
                const s = Filtering._lessThanStats;
                Filtering._dbg('lessThan:summary', {
                    total:s.total,
                    incomplete:s.incomplete,
                    invalidTarget:s.invalidTarget,
                    missingActual:s.missingActual,
                    passed:s.passed,
                    failed:s.failed,
                    sampleCount:s.samples.length,
                    samples:s.samples
                });
            } catch(e){ /* ignore */ }
        }
        return working;
    },

    excludeHidden(offers, state) {
        if (!Array.isArray(offers) || offers.length === 0) return [];
        return offers.filter(w => !Filtering.wasRowHidden(w, state));
    },
    applyAdvancedSearch(offers, state) {
        if (!state || !state.advancedSearch || !state.advancedSearch.enabled) return offers;
        const basePreds = Array.isArray(state.advancedSearch.predicates) ? state.advancedSearch.predicates : [];
        // Filter to committed predicates only
        let committed = basePreds.filter(p => p && p.complete && p.fieldKey && p.operator && Array.isArray(p.values) && p.values.length);
        // Remove any predicates whose fieldKey is no longer present (upgrade* keys fully removed)
        try {
            const headerKeys = new Set((state.headers||[]).map(h=>h && h.key).filter(Boolean));
            let advOnly = [];
            try { advOnly = (App.FilterUtils && typeof App.FilterUtils.getAdvancedOnlyFields === 'function') ? App.FilterUtils.getAdvancedOnlyFields() : []; } catch(e){ advOnly = []; }
            const advKeys = new Set(ADVANCED_ONLY_FALLBACK_KEYS);
            advOnly.forEach(f => {
                try {
                    const key = f && f.key;
                    if (key) advKeys.add(key);
                } catch(fieldErr){ /* ignore bad entries */ }
            });
            committed = committed.filter(p => headerKeys.has(p.fieldKey) || advKeys.has(p.fieldKey));
        } catch(e){ /* ignore field presence check errors */ }
        if (!committed.length) return offers;
        const labelToKey = {};
        try { (state.headers||[]).forEach(h=>{ if (h && h.label && h.key) labelToKey[h.label.toLowerCase()] = h.key; }); } catch(e){}
        return offers.filter(wrapper => Filtering.matchesAdvancedPredicates(wrapper, committed, labelToKey, state));
    },
    matchesAdvancedPredicates(wrapper, predicates, labelToKey, state) {
        try {
            return predicates.every(pred => {
                try {
                    const key = pred.fieldKey || labelToKey[pred.fieldKey?.toLowerCase()] || pred.fieldKey;
                    // Use adjusted pricing variant when taxes/fees excluded
                    let rawVal;
                    if (Filtering.getOfferColumnValueForFiltering) {
                        rawVal = Filtering.getOfferColumnValueForFiltering(wrapper.offer, wrapper.sailing, key, state);
                    } else {
                        rawVal = Filtering.getOfferColumnValue(wrapper.offer, wrapper.sailing, key);
                    }
                    return Filtering.evaluatePredicate(pred, rawVal, wrapper.offer, wrapper.sailing);
                } catch(e){ return false; }
            });
        } catch(e) { return true; }
    },
    evaluatePredicate(predicate, fieldValue, offer, sailing) {
        try {
            let op = (predicate.operator||'').toLowerCase();
            if (op === 'starts with') op = 'contains';
            if (op === 'less than') {
                // Initialize stats object if not present
                if (!Filtering._lessThanStats) Filtering._lessThanStats = { total:0, incomplete:0, invalidTarget:0, missingActual:0, passed:0, failed:0, samples:[] };
                const stats = Filtering._lessThanStats;
                stats.total++;
                const targetRaw = Array.isArray(predicate.values) && predicate.values.length ? predicate.values[0] : null;
                if (targetRaw == null || targetRaw === '') {
                    stats.incomplete++;
                    if (stats.samples.length < 15) stats.samples.push({reason:'incomplete', fieldValue});
                    return true;
                }
                const targetNum = Number(targetRaw);
                if (!isFinite(targetNum)) {
                    stats.invalidTarget++;
                    if (stats.samples.length < 15) stats.samples.push({reason:'invalidTarget', targetRaw, fieldValue});
                    return true;
                }
                const actualNum = Number(fieldValue);
                if (!isFinite(actualNum)) {
                    stats.missingActual++;
                    if (stats.samples.length < 15) stats.samples.push({reason:'missingActual', targetNum, rawFieldValue: fieldValue});
                    Filtering._missingActualLogCounter = (Filtering._missingActualLogCounter || 0) + 1;
                    if (Filtering._missingActualLogCounter <= 5 || Filtering._missingActualLogCounter % 250 === 0) {
                        Filtering._dbg('lessThan:missingActual sample', { predicateId: predicate.id, fieldKey: predicate.fieldKey, rawFieldValue: fieldValue, targetNum, occurrence: Filtering._missingActualLogCounter });
                    }
                    return false;
                }
                const result = actualNum < targetNum;
                if (result) stats.passed++; else stats.failed++;
                if (stats.samples.length < 15) stats.samples.push({reason:'evaluated', actualNum, targetNum, passed:result});
                return result;
            }
            if (op === 'greater than') {
                if (!Filtering._greaterThanStats) Filtering._greaterThanStats = { total:0, incomplete:0, invalidTarget:0, missingActual:0, passed:0, failed:0, samples:[] };
                const stats = Filtering._greaterThanStats;
                stats.total++;
                const targetRaw = Array.isArray(predicate.values) && predicate.values.length ? predicate.values[0] : null;
                if (targetRaw == null || targetRaw === '') {
                    stats.incomplete++;
                    if (stats.samples.length < 15) stats.samples.push({reason:'incomplete', fieldValue});
                    return true;
                }
                const targetNum = Number(targetRaw);
                if (!isFinite(targetNum)) {
                    stats.invalidTarget++;
                    if (stats.samples.length < 15) stats.samples.push({reason:'invalidTarget', targetRaw, fieldValue});
                    return true;
                }
                const actualNum = Number(fieldValue);
                if (!isFinite(actualNum)) {
                    stats.missingActual++;
                    if (stats.samples.length < 15) stats.samples.push({reason:'missingActual', targetNum, rawFieldValue: fieldValue});
                    Filtering._missingActualLogCounterGT = (Filtering._missingActualLogCounterGT || 0) + 1;
                    if (Filtering._missingActualLogCounterGT <= 5 || Filtering._missingActualLogCounterGT % 250 === 0) {
                        Filtering._dbg && Filtering._dbg('greaterThan:missingActual sample', { predicateId: predicate.id, fieldKey: predicate.fieldKey, rawFieldValue: fieldValue, targetNum, occurrence: Filtering._missingActualLogCounterGT });
                    }
                    return false;
                }
                const result = actualNum > targetNum;
                if (result) stats.passed++; else stats.failed++;
                if (stats.samples.length < 15) stats.samples.push({reason:'evaluated', actualNum, targetNum, passed:result});
                return result;
            }
            // Visits field requires set membership evaluation against individual ports
            if (predicate.fieldKey === 'visits') {
                const selected = Array.isArray(predicate.values) ? predicate.values.map(v=>Filtering.normalizePredicateValue(v, 'visits')) : [];
                if (!op || !selected.length) return true; // incomplete passes
                let ports = [];
                try {
                    if (typeof AdvancedItinerarySearch !== 'undefined' && AdvancedItinerarySearch && typeof AdvancedItinerarySearch.getPortsForSailing === 'function') {
                        ports = AdvancedItinerarySearch.getPortsForSailing(sailing);
                    }
                } catch(e){ ports = []; }
                // Augment with region names directly from sailing days if available
                try {
                    const days = sailing && Array.isArray(sailing.days) ? sailing.days : [];
                    days.forEach(d => {
                        try {
                            const pArr = Array.isArray(d.ports) ? d.ports : [];
                            pArr.forEach(pObj => {
                                const reg = pObj?.port?.region; const name = pObj?.port?.name;
                                if (reg) {
                                    const regNorm = Filtering.normalizePredicateValue(reg,'visits');
                                    const nameNorm = name ? Filtering.normalizePredicateValue(name,'visits') : null;
                                    if (regNorm && !ports.some(x => Filtering.normalizePredicateValue(x,'visits') === regNorm)) ports.push(reg.trim());
                                }
                            });
                        } catch(innerDay){ /* ignore */ }
                    });
                } catch(eAug){ /* ignore aug */ }
                const normPorts = ports.map(p=>Filtering.normalizePredicateValue(p,'visits'));
                const portSet = new Set(normPorts);
                if (op === 'in') return selected.some(v => portSet.has(v)); // any selected port OR region present
                if (op === 'not in') return selected.every(v => !portSet.has(v)); // none of selected present
                const joined = normPorts.join('|');
                if (op === 'contains') return selected.some(v => joined.includes(v));
                if (op === 'not contains') return selected.every(v => !joined.includes(v));
                return true;
            }
            if (op === 'date range') {
                // Expect predicate.values = [startISO, endISO] inclusive; ISO = YYYY-MM-DD
                if (!Array.isArray(predicate.values) || predicate.values.length !== 2) return true; // incomplete treated as pass
                const [startIso, endIso] = predicate.values;
                if (!startIso || !endIso) return true;
                const toEpoch = (iso) => {
                    if (!iso) return NaN; // iso expected yyyy-mm-dd
                    const parts = iso.split('-');
                    if (parts.length !== 3) return NaN;
                    const y = parseInt(parts[0],10), m=parseInt(parts[1],10)-1, d=parseInt(parts[2],10);
                    return Date.UTC(y,m,d);
                };
                const startEp = toEpoch(startIso), endEp = toEpoch(endIso);
                if (isNaN(startEp) || isNaN(endEp)) return true;
                // Determine actual field raw ISO date from offer/sailing when possible
                let rawIso = null;
                try {
                    switch (predicate.fieldKey) {
                        case 'offerDate': rawIso = offer?.campaignOffer?.startDate || null; break;
                        case 'expiration': rawIso = offer?.campaignOffer?.reserveByDate || null; break;
                        case 'sailDate': rawIso = sailing?.sailDate || null; break;
                        case 'endDate': rawIso = deriveEndDateIso(sailing); break;
                        default: rawIso = null; break;
                    }
                } catch(e) { rawIso = null; }
                if (!rawIso) {
                    // Fallback: attempt parse of formatted MM/DD/YY string (fieldValue)
                    try {
                        const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(fieldValue || '');
                        if (m) {
                            const mm = parseInt(m[1],10), dd=parseInt(m[2],10), yy=parseInt(m[3],10);
                            const fullYear = 2000 + yy; // assume 20xx
                            rawIso = `${fullYear.toString().padStart(4,'0')}-${mm.toString().padStart(2,'0')}-${dd.toString().padStart(2,'0')}`;
                        }
                    } catch(e){ /* ignore */ }
                }
                if (!rawIso) {
                    // Handle already-ISO-formatted strings (YYYY-MM-DD) produced by computed fields
                    try {
                        const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec((fieldValue || '').trim());
                        if (isoMatch) rawIso = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
                    } catch(eIso){ /* ignore */ }
                }
                if (!rawIso) return true; // treat unknown as pass
                // Normalize rawIso to first 10 chars (YYYY-MM-DD)
                rawIso = rawIso.split('T')[0];
                const valEp = toEpoch(rawIso);
                const inRange = !isNaN(valEp) && valEp >= startEp && valEp <= endEp;
                // Debug logging (only when AdvancedSearch debug or advdbg query param active)
                try {
                    const dbg = (typeof AdvancedSearch !== 'undefined' && AdvancedSearch._debug) || (typeof window !== 'undefined' && window.location && /[?&]advdbg=1/.test(window.location.search));
                    if (dbg) {
                        console.debug('[Filtering][DateRangeEval]', {
                            fieldKey: predicate.fieldKey,
                            startIso, endIso,
                            rawIso,
                            fieldValue,
                            startEp, endEp, valEp,
                            inRange
                        });
                    }
                } catch(logErr){ /* ignore logging errors */ }
                return inRange;
            }
            const values = Array.isArray(predicate.values) ? predicate.values.map(v=>Filtering.normalizePredicateValue(v, predicate.fieldKey)) : [];
            const fv = Filtering.normalizePredicateValue(fieldValue == null ? '' : (''+fieldValue), predicate.fieldKey);
            if (!op || !values.length) return true;
            if (op === 'in') return values.includes(fv);
            if (op === 'not in') return !values.includes(fv);
            if (op === 'contains') return values.some(v => fv.includes(v));
            if (op === 'not contains') return values.every(v => !fv.includes(v));
            return true;
        } catch(e) { return true; }
    },
    normalizePredicateValue(raw, fieldKey) {
        try { return (''+raw).trim().toUpperCase(); } catch(e){ return ''; }
    },
    getOfferColumnValue(offer, sailing, key) {
        let guestsText = sailing.isGOBO ? '1 Guest' : '2 Guests';
        if (sailing.isDOLLARSOFF && sailing.DOLLARSOFF_AMT > 0) guestsText += ` + $${sailing.DOLLARSOFF_AMT} off`;
        if (sailing.isFREEPLAY && sailing.FREEPLAY_AMT > 0) guestsText += ` + $${sailing.FREEPLAY_AMT} freeplay`;
        let room = sailing.roomType;
        if (sailing.isGTY) room = room ? room + ' GTY' : 'GTY';
        const itineraryMeta = resolveItineraryMeta(sailing);
        const nights = itineraryMeta.nightsText;
        const destination = itineraryMeta.destination;
        const computedEndIso = deriveEndDateIso(sailing);
        let perksStr = '-';
        try {
            if (typeof Utils !== 'undefined' && Utils && typeof Utils.computePerks === 'function') {
                perksStr = Utils.computePerks(offer, sailing);
            } else if (typeof App !== 'undefined' && App && App.Utils && typeof App.Utils.computePerks === 'function') {
                perksStr = App.Utils.computePerks(offer, sailing);
            }
        } catch (perksErr) { perksStr = '-'; }
        switch (key) {
            case 'offerCode':
                return offer.campaignOffer?.offerCode;
            case 'offerDate':
                return App.Utils.formatDate(offer.campaignOffer?.startDate);
            case 'expiration':
                return App.Utils.formatDate(offer.campaignOffer?.reserveByDate);
            case 'offerName':
                return offer.campaignOffer?.name || '-';
            case 'shipClass':
                return Utils.getShipClass(sailing.shipName);
            case 'ship':
                return sailing?.shipName || '-';
            case 'sailDate':
                return App.Utils.formatDate(sailing.sailDate);
            case 'endDate':
                if (!computedEndIso) return '-';
                try {
                    if (typeof App !== 'undefined' && App && App.Utils && typeof App.Utils.formatDate === 'function') {
                        return App.Utils.formatDate(computedEndIso);
                    }
                } catch (formatErr) { /* ignore */ }
                return computedEndIso;
            case 'departurePort':
                return sailing.departurePort?.name || '-';
            case 'nights':
                return nights;
            case 'destination':
                return destination;
            case 'category':
                return room || '-';
            case 'guests':
                return guestsText;
            case 'perks':
                return perksStr;
            case 'tradeInValue':
                return App.Utils.formatTradeValue(offer.campaignOffer?.tradeInValue);
            case 'b2bDepth': {
                const depthVal = (sailing && typeof sailing.__b2bDepth === 'number') ? sailing.__b2bDepth : null;
                if (depthVal != null) return depthVal;
                try {
                    if (!(typeof window !== 'undefined' && window.App && App.TableRenderer && typeof App.TableRenderer._ensureRowsHaveB2BDepth === 'function')) {
                        return (sailing && typeof sailing.__b2bDepth === 'number') ? sailing.__b2bDepth : 1;
                    }

                    const state = App.TableRenderer.lastState;
                    if (!state || !Array.isArray(state.sortedOffers) || !state.sortedOffers.length) {
                        return (sailing && typeof sailing.__b2bDepth === 'number') ? sailing.__b2bDepth : 1;
                    }

                    const allowSideBySide = (typeof App.TableRenderer.getSideBySidePreference === 'function')
                        ? App.TableRenderer.getSideBySidePreference()
                        : true;

                    const hiddenStore = Filtering._getHiddenRowStore(state);
                    const globalHidden = Filtering._globalHiddenRowKeys instanceof Set ? Filtering._globalHiddenRowKeys : null;

                    const filterPredicate = (row) => {
                        try {
                            if (!row) return false;
                            const code = (row.offer && row.offer.campaignOffer && row.offer.campaignOffer.offerCode) ? String(row.offer.campaignOffer.offerCode).trim().toUpperCase() : '';
                            const ship = (row.sailing && (row.sailing.shipCode || row.sailing.shipName)) ? String(row.sailing.shipCode || row.sailing.shipName).trim().toUpperCase() : '';
                            const sail = (row.sailing && row.sailing.sailDate) ? String(row.sailing.sailDate).trim().slice(0,10) : '';
                            const key = (code || '') + '|' + (ship || '') + '|' + (sail || '');
                            if (hiddenStore && hiddenStore instanceof Set && hiddenStore.has(key)) return false;
                            if (globalHidden && globalHidden.has(key)) return false;
                            return true;
                        } catch (e) { return true; }
                    };

                    // If AdvancedSearch is building its static index, prime depths without diagnostics
                    if (typeof window !== 'undefined' && window.__ADV_INDEX_BUILDING) {
                        try { App.TableRenderer._ensureRowsHaveB2BDepth(state.sortedOffers, { allowSideBySide, filterPredicate }); } catch (ignore) {}
                        return (sailing && typeof sailing.__b2bDepth === 'number') ? sailing.__b2bDepth : 1;
                    }

                    const depthsMap = App.TableRenderer._ensureRowsHaveB2BDepth(state.sortedOffers, { allowSideBySide, filterPredicate });

                    // Compute longest path for diagnostics (best-effort, swallow errors)
                    try {
                        let longestPath = [];
                        try {
                            if (typeof B2BUtils !== 'undefined' && typeof B2BUtils.computeLongestB2BPath === 'function') {
                                longestPath = B2BUtils.computeLongestB2BPath(state.sortedOffers, { allowSideBySide, filterPredicate });
                            } else if (typeof window !== 'undefined' && window.B2BUtils && typeof window.B2BUtils.computeLongestB2BPath === 'function') {
                                longestPath = window.B2BUtils.computeLongestB2BPath(state.sortedOffers, { allowSideBySide, filterPredicate });
                            }
                        } catch (ignore) { longestPath = []; }

                        let maxDepth = 1;
                        if (depthsMap instanceof Map) {
                            for (const v of depthsMap.values()) if (typeof v === 'number' && v > maxDepth) maxDepth = v;
                        } else if (Array.isArray(state.sortedOffers)) {
                            for (const r of state.sortedOffers) {
                                const d = r && r.sailing && typeof r.sailing.__b2bDepth === 'number' ? r.sailing.__b2bDepth : 1;
                                if (d > maxDepth) maxDepth = d;
                            }
                        }

                        // Throttled diagnostic logging
                        try {
                            if (!Filtering._longestPathDbg) Filtering._longestPathDbg = { count:0, last:0 };
                            const tNow = Date.now();
                            Filtering._longestPathDbg.count += 1;
                            if (tNow - Filtering._longestPathDbg.last < 200) Filtering._longestPathDbg.rapid = (Filtering._longestPathDbg.rapid || 0) + 1; else Filtering._longestPathDbg.rapid = 0;
                            Filtering._longestPathDbg.last = tNow;
                            if (typeof console !== 'undefined' && console.info) {
                                console.info('[Filtering] Longest B2B chain path', { path: longestPath, pathLength: longestPath.length, maxDepthFound: maxDepth, expectedPathLen: Math.max(0, maxDepth - 1), dbg: Filtering._longestPathDbg });
                                try { console.debug(new Error('Breadcrumb: LongestB2BPath called').stack.split('\n').slice(0,6).join('\n')); } catch(e){}
                            }
                        } catch (ignore) {}
                    } catch (ignore) {}
                } catch (ignore) {}

                return (sailing && typeof sailing.__b2bDepth === 'number') ? sailing.__b2bDepth : 1;
            }
            case 'offerValue': {
                try {
                    const raw = (App && App.Utils && App.Utils.computeOfferValue) ? App.Utils.computeOfferValue(offer, sailing) : (Utils.computeOfferValue ? Utils.computeOfferValue(offer, sailing) : null);
                    return raw != null && isFinite(raw) ? Number(raw.toFixed(2)) : '-';
                } catch(e){ return '-'; }
            }
            // Advanced-only virtual fields (not in table headers)
            case 'departureDayOfWeek': {
                try {
                    if (App && App.FilterUtils && typeof App.FilterUtils.computeDepartureDayOfWeek === 'function') {
                        return App.FilterUtils.computeDepartureDayOfWeek(sailing.sailDate);
                    }
                    // Fallback (should rarely be hit if utils_filter.js loaded)
                    const d = new Date(sailing.sailDate);
                    if (!sailing.sailDate || isNaN(d.getTime())) return '-';
                    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                    return days[d.getUTCDay()] || '-';
                } catch(e){ return '-'; }
            }
            case 'departureMonth': {
                try {
                    if (App && App.FilterUtils && typeof App.FilterUtils.computeDepartureMonth === 'function') {
                        return App.FilterUtils.computeDepartureMonth(sailing.sailDate);
                    }
                    const d = new Date(sailing.sailDate);
                    if (!sailing.sailDate || isNaN(d.getTime())) return '-';
                    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                    return months[d.getUTCMonth()] || '-';
                } catch(e){ return '-'; }
            }
            case 'visits': {
                try {
                    const ports = AdvancedItinerarySearch.getPortsForSailing(sailing);
                    return ports && ports.length ? ports.join(', ') : '-';
                } catch(e){ return '-'; }
            }
            // Removed suiteUpgradePrice handler (deprecated)
            case 'minInteriorPrice':
            case 'minOutsidePrice':
            case 'minBalconyPrice':
            case 'minSuitePrice': {
                const computed = computeAdvancedMinPrice(offer, sailing, key, true);
                return computed === '-' ? '-' : computed;
            }
            default:
                return offer[key];
        }
    },
    // New variant used by AdvancedSearch suggestion + predicate evaluation when tax flag toggled
    getOfferColumnValueForFiltering(offer, sailing, key, state) {
        try {
            const includeTF = state && state.advancedSearch && (state.advancedSearch.includeTaxesAndFeesInPriceFilters !== false);
            const pricingKeys = new Set(['minInteriorPrice','minOutsidePrice','minBalconyPrice','minSuitePrice']);
            if (includeTF || !pricingKeys.has(key)) return Filtering.getOfferColumnValue(offer, sailing, key);
            const computed = computeAdvancedMinPrice(offer, sailing, key, false);
            return computed === '-' ? '-' : computed;
        } catch(e){ return Filtering.getOfferColumnValue(offer, sailing, key); }
    },

    // Check whether a single wrapper row matches any hidden-group rule
    isRowHidden(wrapper, state) {
        try {
            if (!wrapper) return false;
            const hiddenGroups = Filtering.loadHiddenGroups();
            if (!Array.isArray(hiddenGroups) || hiddenGroups.length === 0) return false;
            const headers = Array.isArray(state?.headers) ? state.headers : [];
            const labelToKey = {};
            headers.forEach(h => { if (h && h.label && h.key) labelToKey[h.label.toLowerCase()] = h.key; });
            const descriptors = Filtering._buildHiddenGroupDescriptors(hiddenGroups, headers, labelToKey);
            if (!descriptors.length) return false;
            for (const desc of descriptors) {
                if (!Filtering._matchesHiddenDescriptor(wrapper, desc)) continue;
                if (window && window.GOBO_DEBUG_ENABLED) {
                    try {
                        const code = (wrapper.offer && wrapper.offer.campaignOffer && wrapper.offer.campaignOffer.offerCode) ? String(wrapper.offer.campaignOffer.offerCode).trim() : '';
                        const name = (wrapper.offer && wrapper.offer.campaignOffer && wrapper.offer.campaignOffer.name) ? String(wrapper.offer.campaignOffer.name).trim() : '';
                        console.debug('[Filtering] isRowHidden MATCH', { label: desc.label, value: desc.value, key: desc.key, code, name });
                    } catch(e) { /* ignore */ }
                }
                Filtering._rememberHiddenRow(wrapper, Filtering._getHiddenRowStore(state));
                return true;
            }
            return false;
        } catch(e) { return false; }
    },
    // Load hidden groups (GLOBAL now). Performs one-time migration from per-profile keys.
    loadHiddenGroups() {
        const GLOBAL_KEY = 'goboHiddenGroups-global';
        try {
            const existing = (typeof goboStorageGet === 'function' ? goboStorageGet(GLOBAL_KEY) : localStorage.getItem(GLOBAL_KEY));
            if (existing) {
                try { return JSON.parse(existing) || []; } catch(e){ return []; }
            }
            const aggregated = new Set();
            const collectFromValue = (raw) => {
                if (!raw) return;
                try {
                    const arr = JSON.parse(raw);
                    if (Array.isArray(arr)) arr.forEach(v => aggregated.add(v));
                } catch(e) { /* ignore */ }
            };
            // Enumerate legacy keys from GoboStore if available
            if (typeof GoboStore !== 'undefined' && GoboStore && typeof GoboStore.listKeys === 'function') {
                try {
                    GoboStore.listKeys('goboHiddenGroups-').forEach(k => {
                        if (k !== GLOBAL_KEY) collectFromValue(goboStorageGet(k));
                    });
                } catch(e) { /* ignore */ }
            }
            // Also enumerate window.localStorage for any leftovers
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('goboHiddenGroups-') && k !== GLOBAL_KEY) {
                    collectFromValue(localStorage.getItem(k));
                }
            }
            const merged = Array.from(aggregated);
            try {
                if (typeof goboStorageSet === 'function') goboStorageSet(GLOBAL_KEY, JSON.stringify(merged)); else localStorage.setItem(GLOBAL_KEY, JSON.stringify(merged));
            } catch(e) { /* ignore */ }
            return merged;
        } catch (e) {
            return [];
        }
    },
    // Add a hidden group (GLOBAL)
    addHiddenGroup(state, group) {
        const GLOBAL_KEY = 'goboHiddenGroups-global';
        const groups = Filtering.loadHiddenGroups();
        if (!groups.includes(group)) {
            groups.push(group);
            try {
                if (typeof goboStorageSet === 'function') goboStorageSet(GLOBAL_KEY, JSON.stringify(groups)); else localStorage.setItem(GLOBAL_KEY, JSON.stringify(groups));
            } catch (e) { /* ignore */ }
        }
        this.updateHiddenGroupsList(null, document.getElementById('hidden-groups-display'), state);
        return groups;
    },
    // Delete a hidden group (GLOBAL)
    deleteHiddenGroup(state, group) {
        const GLOBAL_KEY = 'goboHiddenGroups-global';
        let groups = Filtering.loadHiddenGroups();
        groups = groups.filter(g => g !== group);
        try {
            if (typeof goboStorageSet === 'function') goboStorageSet(GLOBAL_KEY, JSON.stringify(groups)); else localStorage.setItem(GLOBAL_KEY, JSON.stringify(groups));
        } catch (e) { /* ignore */ }
        this.updateHiddenGroupsList(null, document.getElementById('hidden-groups-display'), state);
        setTimeout(() => { Spinner.hideSpinner(); }, 3000);
        return groups;
    },
    // Update the hidden groups display element (GLOBAL)
    updateHiddenGroupsList(_ignoredProfileKey, displayElement, state) {
        try {
            if (Filtering._updateHiddenGroupsListActive) {
                console.debug('[Filtering] updateHiddenGroupsList re-entrant call ignored');
                return;
            }
            Filtering._updateHiddenGroupsListActive = true;
            if (!Filtering._updateHiddenGroupsListCalls) Filtering._updateHiddenGroupsListCalls = { count:0, last:0 };
            const now = Date.now();
            Filtering._updateHiddenGroupsListCalls.count += 1;
            if (now - Filtering._updateHiddenGroupsListCalls.last < 200) {
                Filtering._updateHiddenGroupsListCalls.rapid = (Filtering._updateHiddenGroupsListCalls.rapid || 0) + 1;
            } else {
                Filtering._updateHiddenGroupsListCalls.rapid = 0;
            }
            Filtering._updateHiddenGroupsListCalls.last = now;
            console.debug('[Filtering] updateHiddenGroupsList ENTRY (GLOBAL)', { displayElement, state, callCount: Filtering._updateHiddenGroupsListCalls.count, rapid: Filtering._updateHiddenGroupsListCalls.rapid });
        } catch(e) { console.debug('[Filtering] updateHiddenGroupsList ENTRY (GLOBAL)'); }
        if (!displayElement) {
            console.warn('updateHiddenGroupsList: displayElement is null (GLOBAL)');
            return;
        }
        displayElement.innerHTML = '';
        displayElement.className = 'hidden-groups-display';
        const hiddenGroups = Filtering.loadHiddenGroups();
        console.debug('[Filtering] updateHiddenGroupsList loaded hiddenGroups (GLOBAL):', hiddenGroups);
        if (Array.isArray(hiddenGroups) && hiddenGroups.length > 0) {
            // Sort hidden groups alphabetically, case-insensitive
            const sortedGroups = hiddenGroups.slice().sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
            const container = document.createElement('div');
            container.className = 'hidden-groups-display';
            sortedGroups.forEach(path => {
                const row = document.createElement('div');
                row.className = 'hidden-group-row';

                const label = document.createElement('span');
                label.className = 'hidden-group-label';
                label.textContent = path;

                const removeBtn = document.createElement('span');
                removeBtn.className = 'hidden-group-remove';
                removeBtn.textContent = '✖';
                removeBtn.title = 'Remove hidden group';
                removeBtn.style.cursor = 'pointer';
                removeBtn.addEventListener('click', () => {
                    console.debug('[Filtering] Hidden Group removeBtn clicked (GLOBAL)', { path });
                    // Ensure spinner is shown immediately so the user sees feedback.
                    // Previously we only queued Spinner.showSpinner() which could be starved
                    // by subsequent synchronous work; show it synchronously and defer
                    // the heavier work to the next tick so the browser has a chance to paint.
                    try { Spinner.showSpinner(); } catch(e) { try { Spinner.showSpinner(); } catch(_){} }

                    // Defer the actual removal/storage/update work so spinner can render first.
                        setTimeout(() => {
                        let groups = Filtering.loadHiddenGroups();
                        groups = groups.filter(g => g !== path);
                        try {
                            const GLOBAL_KEY = 'goboHiddenGroups-global';
                            if (typeof goboStorageSet === 'function') goboStorageSet(GLOBAL_KEY, JSON.stringify(groups)); else localStorage.setItem(GLOBAL_KEY, JSON.stringify(groups));
                            console.debug('[Filtering] Hidden Group removed from storage (GLOBAL)', { path, groups });
                        } catch (e) {
                            console.warn('[Filtering] Error removing Hidden Group from storage (GLOBAL)', e);
                        }

                        // If a table update is in progress, defer the DOM update to avoid re-entrancy.
                        try {
                            if (typeof App !== 'undefined' && App && App.TableRenderer && App.TableRenderer._inUpdateView) {
                                // schedule for next tick after renderer finishes
                                setTimeout(() => Filtering.updateHiddenGroupsList(null, document.getElementById('hidden-groups-display'), state), 50);
                            } else {
                                Filtering.updateHiddenGroupsList(null, document.getElementById('hidden-groups-display'), state);
                            }
                        } catch(e) { Filtering.updateHiddenGroupsList(null, document.getElementById('hidden-groups-display'), state); }
                        console.debug('[Filtering] updateHiddenGroupsList called after removal (GLOBAL)', { groups });
                        if (typeof App !== 'undefined' && App.TableRenderer && typeof App.TableRenderer.updateView === 'function') {
                            console.debug('[Filtering] Calling App.TableRenderer.updateView after hidden group removal (GLOBAL)');
                            try {
                                if (App.TableRenderer._inUpdateView) {
                                    console.debug('[Filtering] TableRenderer.updateView busy, deferring update');
                                    setTimeout(() => { try { App.TableRenderer.updateView(state); } catch(e){} }, 60);
                                } else {
                                    App.TableRenderer.updateView(state);
                                }
                            } catch(e) { try { App.TableRenderer.updateView(state); } catch(_){} }
                        }

                        setTimeout(() => {
                            Spinner.hideSpinner();
                            console.debug('[Filtering] Spinner hidden after Hidden Group removal (GLOBAL)');
                            setTimeout(() => {
                                console.debug('[Filtering] Post-spinner (GLOBAL): 500ms after spinner hidden');
                                const table = document.querySelector('table');
                                const rowCount = table ? table.rows.length : 0;
                                const visibleElements = Array.from(document.body.querySelectorAll('*')).filter(el => el.offsetParent !== null).length;
                                console.debug('[Filtering] Post-spinner: Table row count:', rowCount);
                                console.debug('[Filtering] Post-spinner: Visible DOM elements:', visibleElements);
                                if (window.performance && window.performance.memory) {
                                    console.debug('[Filtering] Post-spinner: JS Heap Size:', window.performance.memory.usedJSHeapSize, '/', window.performance.memory.totalJSHeapSize);
                                }
                                if (typeof App !== 'undefined' && App.TableRenderer && App.TableRenderer.lastState) {
                                    console.debug('[Filtering] Post-spinner: TableRenderer.lastState:', App.TableRenderer.lastState);
                                }
                            }, 500);
                        }, 3000);
                    }, 0);
                });

                row.appendChild(label);
                row.appendChild(removeBtn);
                container.appendChild(row);
            });
            displayElement.appendChild(container);
            console.debug('[Filtering] updateHiddenGroupsList DOM updated with hidden groups (GLOBAL)');
        } else {
            console.debug('[Filtering] updateHiddenGroupsList: No hidden groups to display (GLOBAL)');
        }
        console.debug('[Filtering] updateHiddenGroupsList EXIT (GLOBAL)');
        try { Filtering._updateHiddenGroupsListActive = false; } catch(e) {}
    },
    // Debug helper: prints first `limit` offers (or uses state.originalOffers) with pricing diagnostics
    printSuitePricingDiagnostics(state, offers, limit = 40) {
        try {
            const source = Array.isArray(offers) ? offers : (state && (state.originalOffers || state.fullOriginalOffers || state.sortedOffers) ? (state.originalOffers || state.fullOriginalOffers || state.sortedOffers) : []);
            const list = (source || []).slice(0, limit).map((w, idx) => {
                try {
                    const offer = w && w.offer;
                    const sailing = w && w.sailing;
                    const shipCode = sailing && sailing.shipCode ? (''+sailing.shipCode).trim() : '';
                    const sailDate = sailing && sailing.sailDate ? (''+sailing.sailDate).slice(0,10) : '';
                    const key = `SD_${shipCode}_${sailDate}`;
                    const entry = (typeof ItineraryCache !== 'undefined' && ItineraryCache && typeof ItineraryCache.get === 'function') ? ItineraryCache.get(key) : null;
                    const entryExists = !!entry && entry.stateroomPricing && Object.keys(entry.stateroomPricing || {}).length > 0;
                    let computed = null;
                    try { computed = App && App.PricingUtils ? App.PricingUtils.computeSuiteUpgradePrice(offer, sailing) : null; } catch(e) { computed = `ERR:${e && e.message}`; }
                    return {
                        idx, offerCode: offer?.campaignOffer?.offerCode || null,
                        shipCode, shipName: sailing?.shipName || null, sailDate,
                        itineraryKey: key, itineraryPresent: entryExists,
                        computedSuiteUpgrade: computed
                    };
                } catch(e){ return { idx, err:true, e }; }
            });
            try { console.table(list); } catch(e){ console.debug('[Filtering.printSuitePricingDiagnostics] table', list); }
            return list;
        } catch(e) { console.warn('[Filtering.printSuitePricingDiagnostics] failed', e); return null; }
    },
};

try { if (typeof module !== 'undefined' && module.exports) module.exports = Filtering; } catch(e) {}
try { if (typeof globalThis !== 'undefined') globalThis.Filtering = Filtering; } catch(e) {}
