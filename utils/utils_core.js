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
            // Build/update shared itinerary cache (keys: <itineraryCode>_<sailDate>) persisted in extension storage
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
}
