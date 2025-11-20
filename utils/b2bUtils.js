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
            // Prefer explicit end date if present
            if (rawEnd) {
                const d = String(rawEnd).trim().slice(0, 10);
                const port = (sailing.arrivalPort && sailing.arrivalPort.name) || (sailing.departurePort && sailing.departurePort.name) || '';
                return { endISO: d, endPort: (port || '').trim(), startISO: rawStart ? String(rawStart).trim().slice(0, 10) : null };
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
            if (rawStart && nights != null) {
                const startISO = String(rawStart).trim().slice(0, 10);
                const d = new Date(startISO);
                if (!isNaN(d.getTime())) {
                    d.setDate(d.getDate() + nights);
                    const endISO = d.toISOString().slice(0, 10);
                    const port = (sailing.arrivalPort && sailing.arrivalPort.name) || (sailing.departurePort && sailing.departurePort.name) || '';
                    return { endISO, endPort: (port || '').trim(), startISO };
                }
            }
            // Fallback: treat end as same day as start
            if (rawStart) {
                const startISO = String(rawStart).trim().slice(0, 10);
                const port = (sailing.arrivalPort && sailing.arrivalPort.name) || (sailing.departurePort && sailing.departurePort.name) || '';
                return { endISO: startISO, endPort: (port || '').trim(), startISO };
            }
        } catch(e){}
        return { endISO: null, endPort: null, startISO: null };
    }

    function computeB2BDepth(rows, options) {
        options = options || {};
        const allowSideBySide = !!options.allowSideBySide;
        const filterPredicate = typeof options.filterPredicate === 'function' ? options.filterPredicate : null;
        if (!Array.isArray(rows) || !rows.length) return new Map();

        // Normalize and precompute end/start keys
        const meta = rows.map((row, idx) => {
            const { endISO, endPort, startISO } = computeEndDateAndPort(row);
            const sailing = row.sailing || {};
            const shipCode = (sailing.shipCode || '').toString().trim();
            const shipName = (sailing.shipName || '').toString().trim();
            const offerCode = (row.offer && row.offer.campaignOffer && row.offer.campaignOffer.offerCode ? String(row.offer.campaignOffer.offerCode) : '').trim();
            const allow = !filterPredicate || filterPredicate(row);
            return {
                idx,
                endISO,
                endPort,
                startISO,
                shipCode,
                shipName,
                offerCode,
                allow
            };
        });

        // Build index: key = `${endISO}|${port}|${shipKey}` -> array of indices sorted by start date desc
        const startIndex = new Map();
        meta.forEach(info => {
            if (!info.startISO || !info.endPort || !info.allow) return;
            const day = info.startISO;
            const portKey = info.endPort.toLowerCase();
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

        function addDays(iso, delta) {
            try {
                const d = new Date(iso);
                if (isNaN(d.getTime())) return iso;
                d.setDate(d.getDate() + delta);
                return d.toISOString().slice(0, 10);
            } catch(e){ return iso; }
        }

        function dfs(rootIdx, usedGlobal) {
            if (memo.has(rootIdx)) return memo.get(rootIdx);
            const rootInfo = meta[rootIdx];
            if (!rootInfo || !rootInfo.endISO || !rootInfo.endPort) {
                memo.set(rootIdx, 1);
                return 1;
            }
            let maxDepth = 1;
            const day = rootInfo.endISO;
            const nextDay = day ? addDays(day, 1) : null;
            const portKey = rootInfo.endPort.toLowerCase();
            const shipKey = (rootInfo.shipCode || rootInfo.shipName || '').toLowerCase();
            if (!portKey || !shipKey) {
                memo.set(rootIdx, 1);
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
            memo.set(rootIdx, maxDepth);
            return maxDepth;
        }

        // Compute depth for each row independently
        for (let i = 0; i < meta.length; i++) {
            const info = meta[i];
            if (!info.allow) continue;
            const depth = dfs(i, new Set());
            depthMap.set(i, depth);
        }
        return depthMap;
    }

    window.B2BUtils = {
        computeB2BDepth
    };
})();
