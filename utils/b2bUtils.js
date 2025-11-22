(function(){
    // B2B (Back-to-back / side-by-side) itinerary chaining utilities
    // Public API: window.B2BUtils.computeB2BDepth
    // - rows: Array<{ offer, sailing }>
    // - options: {
    //      allowSideBySide: boolean,
    //      filterPredicate?: (row) => boolean
    //   }
    // Returns: Map<rowIndex, depthNumber>

    function computeEndDateAndPort(row) {
        try {
            const sailing = row.sailing || {};
            const itinerary = sailing.itineraryDescription || (sailing.sailingType && sailing.sailingType.name) || '';
            const rawEnd = sailing.endDate || sailing.disembarkDate || null;
            const rawStart = sailing.sailDate || null;
            const startPort = (sailing.departurePort && sailing.departurePort.name) || '';
            // Prefer explicit end date if present
            if (rawEnd) {
                const d = String(rawEnd).trim().slice(0, 10);
                const port = (sailing.arrivalPort && sailing.arrivalPort.name) || (sailing.departurePort && sailing.departurePort.name) || '';
                return { endISO: d, endPort: (port || '').trim(), startISO: rawStart ? String(rawStart).trim().slice(0, 10) : null, startPort: (startPort || '').trim() };
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
                const d = new Date(startISO);
                if (!isNaN(d.getTime())) {
                    d.setDate(d.getDate() + nights);
                    const endISO = d.toISOString().slice(0, 10);
                    const port = (sailing.arrivalPort && sailing.arrivalPort.name) || (sailing.departurePort && sailing.departurePort.name) || '';
                    return { endISO, endPort: (port || '').trim(), startISO, startPort: (startPort || '').trim() };
                }
            }
            // Fallback: treat end as same day as start
            if (rawStart) {
                const startISO = String(rawStart).trim().slice(0, 10);
                const port = (sailing.arrivalPort && sailing.arrivalPort.name) || (sailing.departurePort && sailing.departurePort.name) || '';
                return { endISO: startISO, endPort: (port || '').trim(), startISO, startPort: (startPort || '').trim() };
            }
        } catch(e){}
        return { endISO: null, endPort: null, startISO: null, startPort: null };
    }

    function computeB2BDepth(rows, options) {
        options = options || {};
        const allowSideBySide = !!options.allowSideBySide;
        const filterPredicate = typeof options.filterPredicate === 'function' ? options.filterPredicate : null;
        const initialUsedOfferCodes = Array.isArray(options.initialUsedOfferCodes) ? options.initialUsedOfferCodes.map(c => (c || '').toString().trim()) : [];
        if (!Array.isArray(rows) || !rows.length) return new Map();

        // Normalize and precompute end/start keys
        const meta = rows.map((row, idx) => {
            const { endISO, endPort, startISO, startPort } = computeEndDateAndPort(row);
            const sailing = row.sailing || {};
            const shipCode = (sailing.shipCode || '').toString().trim();
            const shipName = (sailing.shipName || '').toString().trim();
            const offerCode = (row.offer && row.offer.campaignOffer && row.offer.campaignOffer.offerCode ? String(row.offer.campaignOffer.offerCode) : '').trim();
            let allow = !filterPredicate || filterPredicate(row);
            // Fallback: if caller didn't provide a filterPredicate, consult Filtering stores
            if (!filterPredicate && typeof Filtering !== 'undefined') {
                try {
                    if (typeof Filtering.wasRowHidden === 'function') {
                        allow = allow && !Filtering.wasRowHidden(row, (typeof App !== 'undefined' && App && App.TableRenderer && App.TableRenderer.lastState) ? App.TableRenderer.lastState : null);
                    } else if (typeof Filtering.isRowHidden === 'function') {
                        allow = allow && !Filtering.isRowHidden(row, (typeof App !== 'undefined' && App && App.TableRenderer && App.TableRenderer.lastState) ? App.TableRenderer.lastState : null);
                    }
                } catch(e) { /* ignore filtering fallback errors */ }
            }
            return {
                idx,
                endISO,
                endPort,
                startISO,
                startPort,
                shipCode,
                shipName,
                offerCode,
                allow
            };
        });

        try {
            if (typeof window !== 'undefined' && window.GOBO_DEBUG_ENABLED) {
                const allowedCount = meta.filter(m=>m.allow).length;
                const sampleAllowed = meta.filter(m=>m.allow).slice(0,6).map(m=>({idx:m.idx, offerCode:m.offerCode, startISO:m.startISO, endISO:m.endISO}));
                console.debug('[B2BUtils] meta built', { total: meta.length, allowedCount, sampleAllowed });
                try {
                    if (typeof filterPredicate === 'function') {
                        const excluded = meta.filter(m=>!m.allow).slice(0,8).map(m=>({idx:m.idx, offerCode:m.offerCode, startISO:m.startISO, endISO:m.endISO}));
                        console.debug('[B2BUtils] filterPredicate present - excluded sample', { excludedCount: meta.filter(m=>!m.allow).length, excluded });
                    }
                } catch(e) { console.debug('[B2BUtils] debug predicate snapshot failed', e); }
                try {
                    // Detect rows that appear in hidden-row stores but are still marked allow===true
                    const hiddenByKey = (key) => {
                        try {
                            if (!key) return false;
                            if (Filtering && Filtering._globalHiddenRowKeys instanceof Set && Filtering._globalHiddenRowKeys.has(key)) return true;
                            const lastState = (typeof App !== 'undefined' && App && App.TableRenderer && App.TableRenderer.lastState) ? App.TableRenderer.lastState : null;
                            if (lastState && lastState._hiddenGroupRowKeys instanceof Set && lastState._hiddenGroupRowKeys.has(key)) return true;
                        } catch(e){}
                        return false;
                    };
                    const problemRows = [];
                    meta.forEach(m => {
                        if (!m.allow) return;
                        try {
                            const code = (m.offerCode || '').toString().trim().toUpperCase();
                            const ship = (m.shipCode || m.shipName || '').toString().trim().toUpperCase();
                            const sail = (m.startISO || '').toString().trim().slice(0,10);
                            const key = (code || '') + '|' + (ship || '') + '|' + (sail || '');
                            if (hiddenByKey(key)) {
                                problemRows.push({ idx: m.idx, offerCode: m.offerCode, startISO: m.startISO, key });
                            }
                        } catch(e){}
                    });
                    if (problemRows.length) console.debug('[B2BUtils] Hidden rows included in allowed set (possible missing filterPredicate)', { count: problemRows.length, sample: problemRows.slice(0,8) });
                } catch(e) { console.debug('[B2BUtils] hidden-row diagnostic failed', e); }
            }
        } catch(e){ /* ignore */ }

        // Build index: key = `${endISO}|${port}|${shipKey}` -> array of indices sorted by start date desc
        const startIndex = new Map();
        meta.forEach(info => {
            // index by the sailing's start day and startPort so adjacency matches where next sailings embark
            if (!info.startISO || !info.startPort || !info.allow) return;
            const day = info.startISO;
            const portKey = info.startPort.toLowerCase();
            const shipKey = (info.shipCode || info.shipName || '').toLowerCase();
            if (!portKey || !shipKey) return;
            const key = day + '|' + portKey + '|' + shipKey;
            if (!startIndex.has(key)) startIndex.set(key, []);
            startIndex.get(key).push(info.idx);
            if (allowSideBySide) {
                const sideKey = day + '|' + portKey + '|*';
                if (!startIndex.has(sideKey)) startIndex.set(sideKey, []);
                startIndex.get(sideKey).push(info.idx);
            }
        });

        // Sort each adjacency bucket in descending sail date (for deterministic behavior)
        startIndex.forEach((arrKey) => {
            arrKey.sort((aIdx, bIdx) => {
                const aISO = meta[aIdx].startISO || '';
                const bISO = meta[bIdx].startISO || '';
                if (aISO < bISO) return 1;
                if (aISO > bISO) return -1;
                return 0;
            });
        });

        const depthMap = new Map();
        const memo = new Map();

        function getMemoKey(rootIdx, usedSet) {
            if (!usedSet || !usedSet.size) return rootIdx + '|0';
            try {
                return rootIdx + '|' + Array.from(usedSet).sort().join(',');
            } catch(e) {
                return rootIdx + '|0';
            }
        }

        function addDays(iso, delta) {
            try {
                const d = new Date(iso);
                if (isNaN(d.getTime())) return iso;
                d.setDate(d.getDate() + delta);
                return d.toISOString().slice(0, 10);
            } catch(e){ return iso; }
        }

        function dfs(rootIdx, usedGlobal) {
            const memoKey = getMemoKey(rootIdx, usedGlobal);
            if (memo.has(memoKey)) return memo.get(memoKey);
            const rootInfo = meta[rootIdx];
            if (!rootInfo || !rootInfo.endISO || !rootInfo.endPort) {
                memo.set(memoKey, 1);
                return 1;
            }
            let maxDepth = 1;
            const day = rootInfo.endISO;
            const nextDay = day ? addDays(day, 1) : null;
            const portKey = rootInfo.endPort.toLowerCase();
            const shipKey = (rootInfo.shipCode || rootInfo.shipName || '').toLowerCase();
            if (!portKey || !shipKey) {
                memo.set(memoKey, 1);
                return 1;
            }
            const keysToCheck = [];
            if (day) {
                keysToCheck.push(day + '|' + portKey + '|' + shipKey);
                if (allowSideBySide) keysToCheck.push(day + '|' + portKey + '|*');
            }
            if (nextDay) {
                keysToCheck.push(nextDay + '|' + portKey + '|' + shipKey);
                if (allowSideBySide) keysToCheck.push(nextDay + '|' + portKey + '|*');
            }
            const offerUsedHere = usedGlobal.has(rootInfo.offerCode) ? usedGlobal : new Set(usedGlobal);
            offerUsedHere.add(rootInfo.offerCode);

            for (let keyIdx = 0; keyIdx < keysToCheck.length; keyIdx++) {
                const key = keysToCheck[keyIdx];
                const bucket = startIndex.get(key);
                if (!bucket || !bucket.length) continue;
                for (let i = 0; i < bucket.length; i++) {
                    const nextIdx = bucket[i];
                    if (nextIdx === rootIdx) continue;
                    const nextInfo = meta[nextIdx];
                    if (!nextInfo.allow) continue;
                    if (!nextInfo.startISO || (nextInfo.startISO !== day && nextInfo.startISO !== nextDay)) continue;
                    if (offerUsedHere.has(nextInfo.offerCode)) continue;
                    const newUsed = offerUsedHere;
                    const branchDepth = 1 + dfs(nextIdx, newUsed);
                    if (branchDepth > maxDepth) maxDepth = branchDepth;
                }
            }
            memo.set(memoKey, maxDepth);
            return maxDepth;
        }

        // Compute depth for each row independently, seeding the used-offer set with any initial used codes
        for (let i = 0; i < meta.length; i++) {
            const info = meta[i];
            if (!info.allow) continue;
            const seedSet = new Set(initialUsedOfferCodes.filter(Boolean));
            const depth = dfs(i, seedSet);
            depthMap.set(i, depth);
        }
        return depthMap;
    }

    // Compute the longest B2B chain path (array of offer codes) for diagnostics or UI.
    function computeLongestB2BPath(rows, options) {
        options = options || {};
        const allowSideBySide = !!options.allowSideBySide;
        const filterPredicate = typeof options.filterPredicate === 'function' ? options.filterPredicate : null;
        if (!Array.isArray(rows) || !rows.length) return [];

        // Reuse computeEndDateAndPort and similar meta construction as in computeB2BDepth
        const meta = rows.map((row, idx) => {
            const { endISO, endPort, startISO, startPort } = computeEndDateAndPort(row);
            const sailing = row.sailing || {};
            const shipKey = (sailing.shipCode || sailing.shipName || '').toString().trim().toLowerCase();
            const offerCode = (row.offer && row.offer.campaignOffer && row.offer.campaignOffer.offerCode ? String(row.offer.campaignOffer.offerCode) : '').trim();
            let allow = !filterPredicate || filterPredicate(row);
            if (!filterPredicate && typeof Filtering !== 'undefined') {
                try {
                    if (typeof Filtering.wasRowHidden === 'function') allow = allow && !Filtering.wasRowHidden(row, (typeof App !== 'undefined' && App && App.TableRenderer && App.TableRenderer.lastState) ? App.TableRenderer.lastState : null);
                    else if (typeof Filtering.isRowHidden === 'function') allow = allow && !Filtering.isRowHidden(row, (typeof App !== 'undefined' && App && App.TableRenderer && App.TableRenderer.lastState) ? App.TableRenderer.lastState : null);
                } catch (e) { /* ignore */ }
            }
            return { idx, endISO, endPort, startISO, startPort, shipKey, offerCode, allow };
        });

        const startIndex = new Map();
        meta.forEach(info => {
            if (!info.startISO || !info.startPort || !info.allow) return;
            const day = info.startISO;
            const portKey = info.startPort.toLowerCase();
            const key = day + '|' + portKey + '|' + (info.shipKey || '');
            if (!startIndex.has(key)) startIndex.set(key, []);
            startIndex.get(key).push(info.idx);
            if (allowSideBySide) {
                const sideKey = day + '|' + portKey + '|*';
                if (!startIndex.has(sideKey)) startIndex.set(sideKey, []);
                startIndex.get(sideKey).push(info.idx);
            }
        });

        function addDays(iso, delta) {
            try {
                const d = new Date(iso);
                if (isNaN(d.getTime())) return iso;
                d.setDate(d.getDate() + delta);
                return d.toISOString().slice(0, 10);
            } catch (e) { return iso; }
        }

        let bestPath = [];

        function dfsPath(rootIdx, usedSet, path) {
            const rootInfo = meta[rootIdx];
            if (!rootInfo) return;
            const curPath = path.concat(rootInfo.offerCode || '');
            if (curPath.length > bestPath.length) bestPath = curPath.slice();
            if (!rootInfo.endISO || !rootInfo.endPort) return;
            const day = rootInfo.endISO;
            const nextDay = day ? addDays(day, 1) : null;
            const portKey = rootInfo.endPort.toLowerCase();
            const shipKey = rootInfo.shipKey || '';
            if (!portKey || !shipKey) return;
            const keysToCheck = [];
            if (day) {
                keysToCheck.push(day + '|' + portKey + '|' + shipKey);
                if (allowSideBySide) keysToCheck.push(day + '|' + portKey + '|*');
            }
            if (nextDay) {
                keysToCheck.push(nextDay + '|' + portKey + '|' + shipKey);
                if (allowSideBySide) keysToCheck.push(nextDay + '|' + portKey + '|*');
            }
            const usedHere = new Set(usedSet);
            usedHere.add(rootInfo.offerCode);
            for (let k = 0; k < keysToCheck.length; k++) {
                const bucket = startIndex.get(keysToCheck[k]);
                if (!bucket || !bucket.length) continue;
                for (let i = 0; i < bucket.length; i++) {
                    const nextIdx = bucket[i];
                    if (nextIdx === rootIdx) continue;
                    const nextInfo = meta[nextIdx];
                    if (!nextInfo || !nextInfo.allow) continue;
                    if (!nextInfo.startISO || (nextInfo.startISO !== day && nextInfo.startISO !== nextDay)) continue;
                    if (usedHere.has(nextInfo.offerCode)) continue;
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
        computeB2BDepth,
        computeLongestB2BPath
    };

    if (typeof window !== 'undefined') window.B2BUtils = B2BUtils;
    if (typeof globalThis !== 'undefined') globalThis.B2BUtils = B2BUtils;
    if (typeof module !== 'undefined' && module.exports) module.exports = B2BUtils;
})();
