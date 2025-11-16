// filepath: features/advancedItinerarySearch.js
// Module supplying itinerary-derived port visit data for Advanced Search.
// Provides helpers to enumerate all unique port names from cached itinerary data
// and extract the list of ports for a specific sailing.
(function(){
    if (!window.AdvancedItinerarySearch) window.AdvancedItinerarySearch = {};

    const AIS = window.AdvancedItinerarySearch;

    // Internal cache of aggregated port names so we don't rebuild repeatedly in a session
    AIS._allPortsCacheKey = null;
    AIS._allPorts = [];

    // Normalize a raw port name for comparisons (trim + uppercase)
    function _norm(raw){
        try { return (''+raw).trim().toUpperCase(); } catch(e){ return ''; }
    }

    // Extract port names from a hydrated itinerary cache entry (entry.days[].ports[].port.name)
    function _portsFromEntry(entry){
        const out = [];
        if (!entry) return out;
        try {
            const days = Array.isArray(entry.days) ? entry.days : [];
            if (days.length) {
                days.forEach(d => {
                    try {
                        const ports = Array.isArray(d.ports) ? d.ports : [];
                        ports.forEach(p => {
                            try {
                                const name = p?.port?.name || '';
                                const region = p?.port?.region || '';
                                if (name && !_norm(name)) return; // skip all-whitespace name
                                if (name) out.push(name.trim());
                                if (region) {
                                    const rNorm = _norm(region);
                                    const nNorm = _norm(name);
                                    if (rNorm && rNorm !== nNorm) out.push(region.trim());
                                }
                            } catch(innerPort) { /* ignore individual port errors */ }
                        });
                    } catch(innerDay) { /* ignore */ }
                });
            }
            // Fallback: parse portSequence string if no day/port detail yet
            if (!out.length && entry.portSequence) {
                try {
                    const seq = String(entry.portSequence).trim();
                    // Attempt splitting on common delimiters
                    const rawTokens = seq.split(/\s*[|,;>→\-]+\s*/).filter(Boolean);
                    rawTokens.forEach(tok => {
                        const cleaned = tok.replace(/\b(DAY\s*\d+)\b/i,'').trim();
                        if (!cleaned) return;
                        const n = _norm(cleaned);
                        if (!n) return;
                        out.push(cleaned);
                    });
                } catch(seqErr){ /* ignore */ }
            }
        } catch(e){ /* ignore */ }
        return out;
    }

    // Public: return an array of unique port names for a given sailing object
    AIS.getPortsForSailing = function(sailing){
        try {
            if (!sailing || typeof sailing !== 'object') return [];
            const shipCode = (sailing.shipCode || sailing.ship?.code || '').toString().trim();
            const sailDate = (sailing.sailDate || '').toString().trim().slice(0,10);
            let ports = [];
            if (shipCode && sailDate && typeof ItineraryCache !== 'undefined' && ItineraryCache && typeof ItineraryCache.getByShipDate === 'function') {
                const entry = ItineraryCache.getByShipDate(shipCode, sailDate);
                if (entry) ports = _portsFromEntry(entry);
            }
            // If still empty, attempt quick parse of sailing.itineraryDescription as very rough fallback
            if ((!ports || !ports.length) && sailing.itineraryDescription) {
                try {
                    const desc = String(sailing.itineraryDescription);
                    const tokens = desc.split(/\b(?:\d+\s*N(?:IGHT|T)?S?)\b/i).pop().split(/\s*[|,;>→\-]+\s*/).filter(Boolean);
                    tokens.forEach(t => { const n=_norm(t); if(n && !ports.some(p=>_norm(p)===n)) ports.push(t.trim()); });
                } catch(descErr){ /* ignore */ }
            }
            const dedup = [];
            const seen = new Set();
            ports.forEach(p => { const n = _norm(p); if (!n || seen.has(n)) return; seen.add(n); dedup.push(p); });
            dedup.sort((a,b) => a.toLowerCase().localeCompare(b.toLowerCase()));
            return dedup;
        } catch(e){ return []; }
    };

    // Public: enumerate all unique ports present in itinerary cache (enriched entries only preferred)
    AIS.listAllPorts = function(state){
        try {
            const cacheSigParts = [];
            try {
                // Include number of cache keys with offers + number of enriched-with-days keys (with offers) in signature
                if (typeof ItineraryCache !== 'undefined' && ItineraryCache && ItineraryCache._cache) {
                    const keysAll = Object.keys(ItineraryCache._cache).filter(k => k.startsWith('SD_'));
                    const keysWithOffers = keysAll.filter(k => {
                        const e = ItineraryCache._cache[k];
                        return e && Array.isArray(e.offerCodes) && e.offerCodes.length > 0;
                    });
                    const enrichedCount = keysWithOffers.filter(k => ItineraryCache._cache[k] && ItineraryCache._cache[k].days).length;
                    cacheSigParts.push(keysWithOffers.length, enrichedCount);
                }
            } catch(sigErr) { /* ignore */ }
            // Include count of offers (so new offers trigger refresh)
            try { const arr = state?.fullOriginalOffers || state?.originalOffers || []; cacheSigParts.push(arr.length); } catch(e){ /* ignore */ }
            const sig = cacheSigParts.join('|');
            if (AIS._allPortsCacheKey === sig && Array.isArray(AIS._allPorts) && AIS._allPorts.length) return AIS._allPorts.slice();
            const accumSet = new Map();
            if (typeof ItineraryCache !== 'undefined' && ItineraryCache && ItineraryCache._cache) {
                Object.keys(ItineraryCache._cache).forEach(k => {
                    const entry = ItineraryCache._cache[k];
                    if (!entry) return;
                    // Skip entries that have no offers associated (pruned entries should be gone, but guard anyway)
                    if (!Array.isArray(entry.offerCodes) || entry.offerCodes.length === 0) return;
                    let ports = _portsFromEntry(entry);
                    if ((!ports || !ports.length) && entry.itineraryDescription) {
                        try {
                            const desc = String(entry.itineraryDescription);
                            const tokens = desc.split(/\b(?:\d+\s*N(?:IGHT|T)?S?)\b/i).pop().split(/\s*[|,;>→\-]+\s*/).filter(Boolean);
                            tokens.forEach(t => { const n=_norm(t); if(n && !ports.some(p=>_norm(p)===n)) ports.push(t.trim()); });
                        } catch(fallbackDescErr){ /* ignore */ }
                    }
                    ports.forEach(p => { const n=_norm(p); if(!n) return; if(!accumSet.has(n)) accumSet.set(n,p.trim()); });
                });
            }
            if (accumSet.size === 0) {
                try {
                    const offers = state?.fullOriginalOffers || state?.originalOffers || [];
                    offers.forEach(o => {
                        const co = o?.campaignOffer;
                        if (!co || !Array.isArray(co.sailings)) return;
                        co.sailings.forEach(s => {
                            AIS.getPortsForSailing(s).forEach(p => { const n=_norm(p); if(n && !accumSet.has(n)) accumSet.set(n,p); });
                        });
                    });
                } catch(fallbackErr){ /* ignore */ }
            }
            const all = Array.from(accumSet.values()).sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));
            AIS._allPorts = all; AIS._allPortsCacheKey = sig; return all.slice();
        } catch(e){ return []; }
    };

    // Invalidate cached port list when itinerary hydration or prune events fire
    try {
        document.addEventListener('goboItineraryHydrated', () => {
            AIS._allPortsCacheKey = null; // force rebuild next call
        });
        document.addEventListener('goboItineraryPruned', () => {
            AIS._allPortsCacheKey = null; // force rebuild next call
        });
    } catch(e){ /* ignore */ }
})();
