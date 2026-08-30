(function(){
    // B2B (Back-to-back / side-by-side) itinerary chaining utilities
    // Public API: window.B2BUtils.computeB2BDepth
    // - rows: Array<{ offer, sailing }>
    // - options: {
    //      allowSideBySide: boolean,
    //      filterPredicate?: (row) => boolean
    //   }
    // Returns: Map<rowIndex, depthNumber>

    function lookupItineraryRecord(sailing) {
        try {
            if (!sailing) return null;
            const shipCode = (sailing.shipCode || '').toString().trim();
            const sailDate = (sailing.sailDate || '').toString().trim().slice(0, 10);
            if (!shipCode || !sailDate) return null;
            const cache = (typeof App !== 'undefined' && App && App.ItineraryCache) ? App.ItineraryCache : (typeof ItineraryCache !== 'undefined' ? ItineraryCache : null);
            if (cache && typeof cache.getByShipDate === 'function') {
                return cache.getByShipDate(shipCode, sailDate) || null;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    function computeEndDateAndPort(row) {
        try {
            const sailing = row.sailing || {};
            const itineraryRecord = lookupItineraryRecord(sailing);
            const dayPorts = Array.isArray(itineraryRecord && itineraryRecord.days) ? itineraryRecord.days : [];
            const getDayRegion = (idx) => {
                try {
                    const day = dayPorts[idx];
                    const ports = day && Array.isArray(day.ports) ? day.ports : [];
                    const firstPort = ports[0];
                    return (firstPort && firstPort.port && firstPort.port.region) ? String(firstPort.port.region).trim() : '';
                } catch(e) { return ''; }
            };
            const getFirstRegion = () => getDayRegion(0);
            const getLastRegion = () => {
                for (let i = dayPorts.length - 1; i >= 0; i--) {
                    const region = getDayRegion(i);
                    if (region) return region;
                }
                return '';
            };
            const itinerary = sailing.itineraryDescription || (sailing.sailingType && sailing.sailingType.name) || '';
            const rawEnd = sailing.endDate || sailing.disembarkDate || null;
            const rawStart = sailing.sailDate || null;
            const startPort = (sailing.departurePort && sailing.departurePort.name)
                || (itineraryRecord && itineraryRecord.departurePortName)
                || '';
            const startRegion = (sailing.departurePort && sailing.departurePort.region)
                || (itineraryRecord && itineraryRecord.departurePortRegion)
                || getFirstRegion()
                || sailing.region
                || '';
            const endRegionFallback = () => (sailing.arrivalPort && sailing.arrivalPort.region)
                || (sailing.returnPort && sailing.returnPort.region)
                || (itineraryRecord && (itineraryRecord.arrivalPortRegion || itineraryRecord.returnPortRegion))
                || (sailing.departurePort && sailing.departurePort.region)
                || (itineraryRecord && itineraryRecord.departurePortRegion)
                || getLastRegion()
                || sailing.region
                || '';
            const endPortFallback = () => (sailing.arrivalPort && sailing.arrivalPort.name)
                || (sailing.returnPort && sailing.returnPort.name)
                || (itineraryRecord && (itineraryRecord.arrivalPortName || itineraryRecord.returnPortName))
                || (sailing.departurePort && sailing.departurePort.name)
                || (itineraryRecord && itineraryRecord.departurePortName)
                || '';
            // Prefer explicit end date if present
            if (rawEnd) {
                const d = String(rawEnd).trim().slice(0, 10);
                const port = endPortFallback();
                return {
                    endISO: d,
                    endPort: (port || '').trim(),
                    startISO: rawStart ? String(rawStart).trim().slice(0, 10) : null,
                    startPort: (startPort || '').trim(),
                    startRegion: (startRegion || '').trim(),
                    endRegion: (endRegionFallback() || '').trim()
                };
            }
            // Fallback: attempt to parse nights from itinerary
            let nights = null;
            if (typeof App !== 'undefined' && App.Utils && typeof App.Utils.parseItinerary === 'function') {
                try {
                    const parsed = App.Utils.parseItinerary(itinerary || '');
                    if (parsed && parsed.nights && !isNaN(parseInt(parsed.nights, 10))) {
                        nights = parseInt(parsed.nights, 10);
                    }
                } catch(e){}
            } else if (typeof Utils !== 'undefined' && typeof Utils.parseItinerary === 'function') {
                try {
                    const parsed = Utils.parseItinerary(itinerary || '');
                    if (parsed && parsed.nights && !isNaN(parseInt(parsed.nights, 10))) {
                        nights = parseInt(parsed.nights, 10);
                    }
                } catch(e){}
            }
            if (nights == null && typeof itinerary === 'string') {
                const nightsMatch = itinerary.match(/(\d+)\s+Night/i);
                if (nightsMatch && nightsMatch[1]) {
                    nights = parseInt(nightsMatch[1], 10);
                }
            }
            if (rawStart && nights != null) {
                const startISO = String(rawStart).trim().slice(0, 10);
                // Use UTC date arithmetic to avoid timezone shifts
                const d = new Date(startISO + 'T00:00:00Z');
                if (!isNaN(d.getTime())) {
                    d.setUTCDate(d.getUTCDate() + nights);
                    const endISO = d.toISOString().slice(0, 10);
                    const port = endPortFallback();
                    return {
                        endISO,
                        endPort: (port || '').trim(),
                        startISO,
                        startPort: (startPort || '').trim(),
                        startRegion: (startRegion || '').trim(),
                        endRegion: (endRegionFallback() || '').trim()
                    };
                }
            }
            // Fallback: treat end as same day as start
            if (rawStart) {
                const startISO = String(rawStart).trim().slice(0, 10);
                const port = endPortFallback();
                return {
                    endISO: startISO,
                    endPort: (port || '').trim(),
                    startISO,
                    startPort: (startPort || '').trim(),
                    startRegion: (startRegion || '').trim(),
                    endRegion: (endRegionFallback() || '').trim()
                };
            }
        } catch(e){}
        return { endISO: null, endPort: null, startISO: null, startPort: null, startRegion: null, endRegion: null };
    }

    // playerOfferId on an offer: top-level, then nested campaignOffer. Blank/whitespace ids are absent.
    function getPlayerOfferId(offer) {
        if (!offer || typeof offer !== 'object') return '';
        const top = offer.playerOfferId != null ? String(offer.playerOfferId).trim() : '';
        if (top) return top;
        const nested = offer.campaignOffer && offer.campaignOffer.playerOfferId != null
            ? String(offer.campaignOffer.playerOfferId).trim() : '';
        return nested;
    }

    // Identity key for offer-level dedup: playerOfferId (top-level, then nested), else offerCode.
    // Takes a { offer, sailing } row. Blank/whitespace ids are absent.
    function getOfferKey(row) {
        if (!row || typeof row !== 'object') return '';
        const offer = row.offer || {};
        const pid = getPlayerOfferId(offer);
        if (pid) return pid;
        return offer.campaignOffer && offer.campaignOffer.offerCode != null
            ? String(offer.campaignOffer.offerCode).trim() : '';
    }

    // Stable row id for B2B handler attachment. Normalizes parts to [a-zA-Z0-9_-]; falls back to idx.
    function buildB2BRowId(offer, sailing, idx) {
        let sail = (sailing && sailing.sailDate != null) ? String(sailing.sailDate).trim() : '';
        if (sail) {
            if (/^\d{4}-\d{2}-\d{2}/.test(sail)) sail = sail.slice(0, 10);
            else { const d = new Date(sail); sail = isNaN(d) ? '' : d.toISOString().slice(0, 10); }
        }
        const rawParts = [
            offer && offer.playerOfferId,
            offer && offer.campaignOffer && offer.campaignOffer.offerCode,
            sailing && sailing.shipCode,
            sailing && sailing.shipName,
            sail
        ];
        const baseParts = rawParts
            .filter(p => p !== undefined && p !== null && String(p).trim() !== '')
            .map(p => String(p).trim().replace(/[^a-zA-Z0-9_-]/g, '_'));
        if (baseParts.length) return `b2b-${baseParts.join('-')}`;
        return `b2b-${(idx !== null && idx !== undefined) ? idx : Math.random().toString(36).slice(2, 9)}`;
    }

    function computeB2BDepth(rows, options) {
        options = options || {};
        const allowSideBySide = !!options.allowSideBySide;
        let drivingRangeHours = (options.drivingRangeHours !== undefined) ? parseInt(options.drivingRangeHours, 10) || 0 : null;
        try {
            if (drivingRangeHours == null && typeof App !== 'undefined' && App && App.SettingsStore && typeof App.SettingsStore.getB2BDrivingRangeHours === 'function') {
                drivingRangeHours = App.SettingsStore.getB2BDrivingRangeHours();
            }
        } catch (e) { /* ignore */ }
        if (drivingRangeHours == null) drivingRangeHours = 0;
        drivingRangeHours = Math.max(0, Math.min(5, parseInt(drivingRangeHours, 10) || 0));
        let lagDays = (options.lagDays !== undefined) ? parseInt(options.lagDays, 10) || 0 : null;
        try {
            if (lagDays == null && typeof App !== 'undefined' && App && App.SettingsStore && typeof App.SettingsStore.getB2BLagDays === 'function') {
                lagDays = App.SettingsStore.getB2BLagDays();
            }
        } catch (e) { /* ignore */ }
        if (lagDays == null) lagDays = 0;
        lagDays = Math.max(0, Math.min(7, parseInt(lagDays, 10) || 0));
        const filterPredicate = typeof options.filterPredicate === 'function' ? options.filterPredicate : null;
        const initialUsedOfferCodes = Array.isArray(options.initialUsedOfferCodes) ? options.initialUsedOfferCodes.map(c => (c || '').toString().trim()) : [];
        if (!Array.isArray(rows) || !rows.length) return new Map();

        let autoRunB2B = true;
        try {
            if (typeof App !== 'undefined' && App && App.SettingsStore && typeof App.SettingsStore.getAutoRunB2B === 'function') {
                autoRunB2B = !!App.SettingsStore.getAutoRunB2B();
            }
        } catch (e) { /* ignore and keep default true */ }
        if (!autoRunB2B && !options.force) return new Map();

        function dayNum(iso) {
            if (!iso) return null;
            const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
            return isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 86400000);
        }

        const matchCache = new Map();
        const getMatchKeys = (port) => {
            if (!port) return [];
            const hit = matchCache.get(port);
            if (hit) return hit;
            let keys = null;
            if (drivingRangeHours === 0) {
                try {
                    if (typeof PortsTravelTimes !== 'undefined' && PortsTravelTimes && typeof PortsTravelTimes.normalizePort === 'function') {
                        keys = [PortsTravelTimes.normalizePort(port).toLowerCase()];
                    }
                } catch (e) { /* ignore */ }
                if (!keys) keys = [String(port).toLowerCase()];
            } else {
                try {
                    if (typeof PortsTravelTimes !== 'undefined' && PortsTravelTimes && typeof PortsTravelTimes.getNearbyPorts === 'function') {
                        keys = PortsTravelTimes.getNearbyPorts(port, drivingRangeHours * 60).map(p => p.toLowerCase());
                    }
                } catch (e) { /* ignore */ }
                if (!keys) {
                    try {
                        if (typeof PortsTravelTimes !== 'undefined' && PortsTravelTimes && typeof PortsTravelTimes.normalizePort === 'function') {
                            keys = [PortsTravelTimes.normalizePort(port).toLowerCase()];
                        }
                    } catch (e) { /* ignore */ }
                }
                if (!keys) keys = [String(port).toLowerCase()];
            }
            matchCache.set(port, keys);
            return keys;
        };

        const n = rows.length;
        const meta = new Array(n);
        const pidIndex = new Map();
        let kCount = 0;
        for (let i = 0; i < n; i++) {
            const row = rows[i];
            const { endISO, endPort, startISO, startPort } = computeEndDateAndPort(row);
            const sailing = row.sailing || {};
            const shipKey = ((sailing.shipCode || sailing.shipName || '') + '').trim().toLowerCase();
            const offerKey = getOfferKey(row);
            let allow = !filterPredicate || filterPredicate(row);
            if (!filterPredicate && typeof Filtering !== 'undefined') {
                try {
                    const lastState = (typeof App !== 'undefined' && App && App.TableRenderer && App.TableRenderer.lastState) ? App.TableRenderer.lastState : null;
                    const globalHidden = Filtering._globalHiddenRowKeys instanceof Set ? Filtering._globalHiddenRowKeys : null;
                    const stateHidden = lastState && lastState._hiddenGroupRowKeys instanceof Set ? lastState._hiddenGroupRowKeys : null;
                    const key = Filtering.rowKey(row);
                    if (key && ((globalHidden && globalHidden.has(key)) || (stateHidden && stateHidden.has(key)))) allow = false;
                } catch (e) { /* ignore */ }
            }
            let bit = 0;
            if (allow) {
                let ki = pidIndex.get(offerKey);
                if (ki === undefined) {
                    ki = kCount++;
                    pidIndex.set(offerKey, ki);
                }
                if (ki < 31) bit = 1 << ki;
            }
            meta[i] = {
                sn: dayNum(startISO),
                en: dayNum(endISO),
                startPort,
                endPort,
                shipKey,
                offerKey,
                allow,
                bit
            };
        }

        const bucket = new Map();
        const push = (key, idx) => {
            let a = bucket.get(key);
            if (!a) { a = []; bucket.set(key, a); }
            a.push(idx);
        };
        for (let i = 0; i < n; i++) {
            const m = meta[i];
            if (!m.allow || m.sn == null || !m.startPort || !m.shipKey) continue;
            const mks = getMatchKeys(m.startPort);
            if (!mks.length) continue;
            for (let ld = 0; ld <= lagDays; ld++) {
                const indexDay = m.sn - ld;
                for (let p = 0; p < mks.length; p++) {
                    const pk = mks[p];
                    push(indexDay + '|' + pk + '|' + m.shipKey, i);
                    if (allowSideBySide) push(indexDay + '|' + pk + '|*', i);
                }
            }
        }

        const adj = new Array(n);
        for (let i = 0; i < n; i++) {
            const m = meta[i];
            const list = [];
            if (m.allow && m.en != null && m.endPort && m.shipKey) {
                const mks = getMatchKeys(m.endPort);
                const seen = new Set();
                for (let p = 0; p < mks.length; p++) {
                    const pk = mks[p];
                    const k1 = m.en + '|' + pk + '|' + m.shipKey;
                    const k2 = allowSideBySide ? m.en + '|' + pk + '|*' : null;
                    const buckets = k2 ? [bucket.get(k1), bucket.get(k2)] : [bucket.get(k1)];
                    for (let b = 0; b < buckets.length; b++) {
                        const arr = buckets[b];
                        if (!arr) continue;
                        for (let t = 0; t < arr.length; t++) {
                            const j = arr[t];
                            if (j === i || seen.has(j)) continue;
                            seen.add(j);
                            const gap = meta[j].sn - m.en;
                            if (gap >= 0 && gap <= lagDays) list.push(j);
                        }
                    }
                }
            }
            adj[i] = list;
        }

        const depthMap = new Map();
        const K = kCount;
        // ponytail: 30-bit mask covers typical 15-20 offer codes; Set memo if more
        if (K <= 30) {
            const MOD = K === 0 ? 1 : (1 << K);
            const fullMask = K === 0 ? 0 : (MOD - 1);
            let seedMask = 0;
            for (let s = 0; s < initialUsedOfferCodes.length; s++) {
                const c = initialUsedOfferCodes[s];
                if (!c) continue;
                const ki = pidIndex.get(c);
                if (ki !== undefined && ki < 31) seedMask |= (1 << ki);
            }
            const memo = new Map();
            const dfs = (i, avail) => {
                const key = i * MOD + avail;
                const hit = memo.get(key);
                if (hit !== undefined) return hit;
                let best = 0;
                const list = adj[i];
                for (let a = 0; a < list.length; a++) {
                    const j = list[a];
                    const bj = meta[j].bit;
                    if (bj && !(avail & bj)) continue;
                    const d = dfs(j, avail & ~bj);
                    if (d > best) best = d;
                }
                const val = 1 + best;
                memo.set(key, val);
                return val;
            };
            for (let i = 0; i < n; i++) {
                if (!meta[i].allow) continue;
                depthMap.set(i, dfs(i, fullMask & ~(seedMask | meta[i].bit)));
            }
        } else {
            const seedSet = new Set(initialUsedOfferCodes.filter(Boolean));
            const memo = new Map();
            const dfs = (i, used) => {
                const key = i + '|' + Array.from(used).sort().join(',');
                if (memo.has(key)) return memo.get(key);
                const usedHere = new Set(used);
                usedHere.add(meta[i].offerKey);
                let best = 1;
                const list = adj[i];
                for (let a = 0; a < list.length; a++) {
                    const j = list[a];
                    if (usedHere.has(meta[j].offerKey)) continue;
                    const d = 1 + dfs(j, usedHere);
                    if (d > best) best = d;
                }
                memo.set(key, best);
                return best;
            };
            for (let i = 0; i < n; i++) {
                if (!meta[i].allow) continue;
                depthMap.set(i, dfs(i, seedSet));
            }
        }
        return depthMap;
    }

    // Compute the longest B2B chain path (array of offer codes) for diagnostics or UI.
    function computeLongestB2BPath(rows, options) {
        options = options || {};
        try {
            if (!computeLongestB2BPath._dbg) computeLongestB2BPath._dbg = { count:0, last:0 };
            const now = Date.now();
            computeLongestB2BPath._dbg.count += 1;
            if (now - computeLongestB2BPath._dbg.last < 200) computeLongestB2BPath._dbg.rapid = (computeLongestB2BPath._dbg.rapid || 0) + 1; else computeLongestB2BPath._dbg.rapid = 0;
            computeLongestB2BPath._dbg.last = now;
            // If invoked excessively in a short window, avoid expensive recursion/diagnostics
            if (computeLongestB2BPath._dbg.rapid > 8) {
                try { console.debug('[B2BUtils] computeLongestB2BPath throttled due to rapid calls', computeLongestB2BPath._dbg); } catch(e){}
                return [];
            }
            try { console.debug('[B2BUtils] computeLongestB2BPath ENTRY', { dbg: computeLongestB2BPath._dbg }); console.debug(new Error('Breadcrumb: computeLongestB2BPath').stack.split('\n').slice(0,6).join('\n')); } catch(e){}
        } catch(e) {}
        const allowSideBySide = !!options.allowSideBySide;
        const filterPredicate = typeof options.filterPredicate === 'function' ? options.filterPredicate : null;
        if (!Array.isArray(rows) || !rows.length) return [];

        // Reuse computeEndDateAndPort and similar meta construction as in computeB2BDepth
        const meta = rows.map((row, idx) => {
            const { endISO, endPort, startISO, startPort } = computeEndDateAndPort(row);
            const sailing = row.sailing || {};
            const shipKey = (sailing.shipCode || sailing.shipName || '').toString().trim().toLowerCase();
            const offerCode = (row.offer && row.offer.campaignOffer && row.offer.campaignOffer.offerCode ? String(row.offer.campaignOffer.offerCode) : '').trim();
            const offerKey = getOfferKey(row);
            let allow = !filterPredicate || filterPredicate(row);
            // Use hidden-row Sets directly to avoid re-entrancy into Filtering helpers
            if (!filterPredicate && typeof Filtering !== 'undefined') {
                try {
                    const lastState = (typeof App !== 'undefined' && App && App.TableRenderer && App.TableRenderer.lastState) ? App.TableRenderer.lastState : null;
                    const globalHidden = Filtering._globalHiddenRowKeys instanceof Set ? Filtering._globalHiddenRowKeys : null;
                    const stateHidden = lastState && lastState._hiddenGroupRowKeys instanceof Set ? lastState._hiddenGroupRowKeys : null;
                    try {
                        const key = Filtering.rowKey(row);
                        if (key && ((globalHidden && globalHidden.has(key)) || (stateHidden && stateHidden.has(key)))) {
                            allow = false;
                        }
                    } catch(e) { /* ignore per-row key build errors */ }
                } catch(e) { /* ignore */ }
            }
            return { idx, endISO, endPort, startISO, startPort, shipKey, offerCode, offerKey, allow };
        });

        let lagDays2 = 0;
        try {
            if (typeof App !== 'undefined' && App && App.SettingsStore && typeof App.SettingsStore.getB2BLagDays === 'function') {
                lagDays2 = App.SettingsStore.getB2BLagDays();
            }
        } catch (e) { /* ignore */ }
        lagDays2 = Math.max(0, Math.min(7, parseInt(lagDays2, 10) || 0));

        function addDaysLocal(iso, delta) {
            try {
                const d = new Date(String(iso).slice(0,10) + 'T00:00:00Z');
                if (isNaN(d.getTime())) return iso;
                d.setUTCDate(d.getUTCDate() + delta);
                return d.toISOString().slice(0, 10);
            } catch (e) { return iso; }
        }
        function diffDaysLocal(nextISO, prevISO) {
            try {
                const a = new Date(String(nextISO).slice(0,10) + 'T00:00:00Z');
                const b = new Date(String(prevISO).slice(0,10) + 'T00:00:00Z');
                if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
                return Math.round((a.getTime() - b.getTime()) / 86400000);
            } catch(e) { return null; }
        }

        const startIndex = new Map();
        meta.forEach(info => {
            if (!info.startISO || !info.startPort || !info.allow) return;
            const day = info.startISO;
            const portKey = info.startPort.toLowerCase();
            const daysToIndex = [day];
            for (let ld = 1; ld <= lagDays2; ld++) {
                const offsetDay = addDaysLocal(day, -ld);
                if (offsetDay && offsetDay !== day) daysToIndex.push(offsetDay);
            }
            daysToIndex.forEach((indexDay) => {
                const key = indexDay + '|' + portKey + '|' + (info.shipKey || '');
                if (!startIndex.has(key)) startIndex.set(key, []);
                startIndex.get(key).push(info.idx);
                if (allowSideBySide) {
                    const sideKey = indexDay + '|' + portKey + '|*';
                    if (!startIndex.has(sideKey)) startIndex.set(sideKey, []);
                    startIndex.get(sideKey).push(info.idx);
                }
            });
        });

        let bestPath = [];

        function dfsPath(rootIdx, usedSet, path) {
            const rootInfo = meta[rootIdx];
            if (!rootInfo) return;
            const curPath = path.concat(rootInfo.offerCode || '');
            if (curPath.length > bestPath.length) bestPath = curPath.slice();
            if (!rootInfo.endISO || !rootInfo.endPort) return;
            const day = rootInfo.endISO;
            const portKey = rootInfo.endPort.toLowerCase();
            const shipKey = rootInfo.shipKey || '';
            if (!portKey || !shipKey) return;
            const keysToCheck = [];
            if (day) {
                keysToCheck.push(day + '|' + portKey + '|' + shipKey);
                if (allowSideBySide) keysToCheck.push(day + '|' + portKey + '|*');
            }
            const usedHere = new Set(usedSet);
            usedHere.add(rootInfo.offerKey);
            for (let k = 0; k < keysToCheck.length; k++) {
                const bucket = startIndex.get(keysToCheck[k]);
                if (!bucket || !bucket.length) continue;
                for (let i = 0; i < bucket.length; i++) {
                    const nextIdx = bucket[i];
                    if (nextIdx === rootIdx) continue;
                    const nextInfo = meta[nextIdx];
                    if (!nextInfo || !nextInfo.allow) continue;
                    if (!nextInfo.startISO) continue;
                    const gap = diffDaysLocal(nextInfo.startISO, day);
                    if (gap == null || gap < 0 || gap > lagDays2) continue;
                    if (usedHere.has(nextInfo.offerKey)) continue;
                    dfsPath(nextIdx, usedHere, curPath);
                }
            }
        }

        for (let i = 0; i < meta.length; i++) {
            if (!meta[i].allow) continue;
            dfsPath(i, new Set(), []);
        }

        return bestPath.filter(Boolean);
    }

    const B2BUtils = {
        getOfferKey,
        getPlayerOfferId,
        buildB2BRowId,
        computeB2BDepth,
        computeLongestB2BPath,
        // Compute the longest chain (detailed nodes) starting from a specific index
        computeLongestChainFromIndex: function(rows, options, startIdx) {
            options = options || {};
            const allowSideBySide = !!options.allowSideBySide;
            const filterPredicate = typeof options.filterPredicate === 'function' ? options.filterPredicate : null;
            if (!Array.isArray(rows) || !rows.length) return [];

            // Build meta similarly to computeB2BDepth
            const meta = rows.map((row, idx) => {
                const { endISO, endPort, startISO, startPort } = computeEndDateAndPort(row);
                const sailing = row.sailing || {};
                const shipName = (sailing.shipName || sailing.shipCode || '').toString().trim();
                const offerCode = (row.offer && row.offer.campaignOffer && row.offer.campaignOffer.offerCode ? String(row.offer.campaignOffer.offerCode) : '').trim();
                const offerKey = getOfferKey(row);
                let allow = !filterPredicate || filterPredicate(row);
                if (!filterPredicate && typeof Filtering !== 'undefined') {
                    try {
                        if (typeof Filtering.wasRowHidden === 'function') allow = allow && !Filtering.wasRowHidden(row, (typeof App !== 'undefined' && App && App.TableRenderer && App.TableRenderer.lastState) ? App.TableRenderer.lastState : null);
                        else if (typeof Filtering.isRowHidden === 'function') allow = allow && !Filtering.isRowHidden(row, (typeof App !== 'undefined' && App && App.TableRenderer && App.TableRenderer.lastState) ? App.TableRenderer.lastState : null);
                    } catch(e) { /* ignore */ }
                }
                return { idx, endISO, endPort, startISO, startPort, shipName, offerCode, offerKey, allow };
            });

            if (!meta[startIdx] || !meta[startIdx].allow) return [];

            let lagDays3 = 0;
            try {
                if (typeof App !== 'undefined' && App && App.SettingsStore && typeof App.SettingsStore.getB2BLagDays === 'function') {
                    lagDays3 = App.SettingsStore.getB2BLagDays();
                }
            } catch (e) { /* ignore */ }
            lagDays3 = Math.max(0, Math.min(7, parseInt(lagDays3, 10) || 0));

            function addDaysL(iso, delta) {
                try {
                    const d = new Date(String(iso).slice(0,10) + 'T00:00:00Z');
                    if (isNaN(d.getTime())) return iso;
                    d.setUTCDate(d.getUTCDate() + delta);
                    return d.toISOString().slice(0, 10);
                } catch(e) { return iso; }
            }
            function diffDaysL(nextISO, prevISO) {
                try {
                    const a = new Date(String(nextISO).slice(0,10) + 'T00:00:00Z');
                    const b = new Date(String(prevISO).slice(0,10) + 'T00:00:00Z');
                    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
                    return Math.round((a.getTime() - b.getTime()) / 86400000);
                } catch(e) { return null; }
            }

            // Build startIndex map
            const startIndex = new Map();
            meta.forEach(info => {
                if (!info.startISO || !info.startPort || !info.allow) return;
                const day = info.startISO;
                const portKey = info.startPort.toLowerCase();
                const shipKey = (info.shipName || '').toLowerCase();
                if (!portKey || !shipKey) return;
                const daysToIndex = [day];
                for (let ld = 1; ld <= lagDays3; ld++) {
                    const offsetDay = addDaysL(day, -ld);
                    if (offsetDay && offsetDay !== day) daysToIndex.push(offsetDay);
                }
                daysToIndex.forEach((indexDay) => {
                    const key = indexDay + '|' + portKey + '|' + shipKey;
                    if (!startIndex.has(key)) startIndex.set(key, []);
                    startIndex.get(key).push(info.idx);
                    if (allowSideBySide) {
                        const sideKey = indexDay + '|' + portKey + '|*';
                        if (!startIndex.has(sideKey)) startIndex.set(sideKey, []);
                        startIndex.get(sideKey).push(info.idx);
                    }
                });
            });

            // sort buckets by startISO desc
            startIndex.forEach(arr => {
                arr.sort((aIdx, bIdx) => {
                    const aISO = meta[aIdx].startISO || '';
                    const bISO = meta[bIdx].startISO || '';
                    if (aISO < bISO) return 1;
                    if (aISO > bISO) return -1;
                    return 0;
                });
            });

            let best = [];
            function dfsLocal(rootIdx, usedSet, path) {
                const rootInfo = meta[rootIdx];
                if (!rootInfo) return;
                const node = {
                    offerCode: rootInfo.offerCode || '',
                    shipName: rootInfo.shipName || '',
                    startISO: rootInfo.startISO || null,
                    endISO: rootInfo.endISO || null
                };
                const curPath = path.concat(node);
                if (curPath.length > best.length) best = curPath.slice();
                if (!rootInfo.endISO || !rootInfo.endPort) return;
                const day = rootInfo.endISO;
                const portKey = rootInfo.endPort.toLowerCase();
                const shipKey = (rootInfo.shipName || '').toLowerCase();
                if (!portKey || !shipKey) return;
                const keysToCheck = [];
                if (day) {
                    keysToCheck.push(day + '|' + portKey + '|' + shipKey);
                    if (allowSideBySide) keysToCheck.push(day + '|' + portKey + '|*');
                }
                const usedHere = new Set(usedSet);
                usedHere.add(rootInfo.offerKey);
                for (let k = 0; k < keysToCheck.length; k++) {
                    const bucket = startIndex.get(keysToCheck[k]);
                    if (!bucket || !bucket.length) continue;
                    for (let i = 0; i < bucket.length; i++) {
                        const nextIdx = bucket[i];
                        if (nextIdx === rootIdx) continue;
                        const nextInfo = meta[nextIdx];
                        if (!nextInfo || !nextInfo.allow) continue;
                        if (!nextInfo.startISO) continue;
                        const gap = diffDaysL(nextInfo.startISO, day);
                        if (gap == null || gap < 0 || gap > lagDays3) continue;
                        if (usedHere.has(nextInfo.offerKey)) continue;
                        dfsLocal(nextIdx, usedHere, curPath);
                    }
                }
            }

            dfsLocal(startIdx, new Set(), []);
            return best.filter(Boolean);
        }
    };

    // Dev helper: compute the longest chain for a given index or offer on a provided rows array
    // Usage: B2BUtils.debugChainFor({ rows: rowsArray, idx: 123 })
    //        B2BUtils.debugChainFor({ rows: rowsArray, offer: '25BFM105' })
    B2BUtils.debugChainFor = function(opts) {
        try {
            if (!opts || !Array.isArray(opts.rows)) return null;
            const rows = opts.rows;
            let idx = (typeof opts.idx === 'number' && opts.idx >= 0) ? opts.idx : null;
            const offer = opts.offer ? String(opts.offer).trim().toUpperCase() : null;
            if (offer && idx == null) {
                for (let i = 0; i < rows.length; i++) {
                    try {
                        const code = rows[i] && rows[i].offer && rows[i].offer.campaignOffer && rows[i].offer.campaignOffer.offerCode ? String(rows[i].offer.campaignOffer.offerCode).trim().toUpperCase() : '';
                        if (code === offer) { idx = i; break; }
                    } catch(e) { /* ignore */ }
                }
            }
            if (idx == null || idx < 0 || idx >= rows.length) return null;
            const chain = B2BUtils.computeLongestChainFromIndex(rows, opts || {}, idx) || [];
            const summary = Array.isArray(chain) ? chain.map(n => (n.offerCode || '') + '(@' + (n.shipName || '') + ':' + (n.startISO || '') + ')').join(' -> ') : String(chain || '');
            return { idx, chainLength: (chain && chain.length) || 0, chain, summary };
        } catch (e) { return null; }
    };

    if (typeof window !== 'undefined') window.B2BUtils = B2BUtils;
    if (typeof globalThis !== 'undefined') globalThis.B2BUtils = B2BUtils;
    if (typeof module !== 'undefined' && module.exports) module.exports = B2BUtils;
})();
