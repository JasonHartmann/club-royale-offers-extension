// filepath: utils/utils_filter.js
// Utility definitions for advanced-only filter fields (not shown as table columns)
// Provides metadata for fields available exclusively in Advanced Search.
(function(){
    if (!window.App) window.App = {};
    if (!App.FilterUtils) App.FilterUtils = {};

    // Returns an array of advanced-only field descriptors
    // Each descriptor: { key, label }
    // These fields do NOT correspond to visible table columns but can be used in Advanced Search predicates.
    App.FilterUtils.getAdvancedOnlyFields = function() {
        try {
            return [
                { key: 'departureDayOfWeek', label: 'Departure Day of Week' },
                { key: 'departureMonth', label: 'Departure Month' },
                { key: 'visits', label: 'Visits' },
                { key: 'endDate', label: 'End Date' },
                { key: 'minInteriorPrice', label: 'Interior Price' },
                { key: 'minOutsidePrice', label: 'Outside Price' },
                { key: 'minBalconyPrice', label: 'Balcony Price' },
                { key: 'minSuitePrice', label: 'Suite Price' }
                // Removed retired upgrade-to-suite fields: upgradeInteriorToSuite, upgradeOutsideToSuite, upgradeBalconyToSuite
            ];
        } catch(e) { return []; }
    };

    // Timezone-stable day-of-week computation.
    // Goal: produce a consistent day name regardless of the user's local timezone settings.
    // Strategy:
    // 1. If sailDate is a pure date string (YYYY-MM-DD), parse components manually and use Date.UTC.
    // 2. If it includes time / timezone, let Date parse it; then derive weekday via getUTCDay so the absolute instant => stable weekday.
    // 3. If parsing fails, fallback to attempting local Date; else '-'.
    // NOTE: This chooses a UTC interpretation for date-only strings to avoid environment-dependent behavior.
    const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    App.FilterUtils.computeDepartureDayOfWeek = function(sailDate) {
        try {
            if (!sailDate) return '-';
            if (sailDate instanceof Date && !isNaN(sailDate.getTime())) {
                return DAY_NAMES[sailDate.getUTCDay()] || '-';
            }
            if (typeof sailDate === 'string') {
                const trimmed = sailDate.trim();
                // Pure date pattern (treat as UTC midnight)
                const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(trimmed);
                if (m) {
                    const y = parseInt(m[1],10); const mo = parseInt(m[2],10)-1; const d = parseInt(m[3],10);
                    if (!isNaN(y) && !isNaN(mo) && !isNaN(d)) {
                        const utcMs = Date.UTC(y, mo, d, 0,0,0,0);
                        const day = new Date(utcMs).getUTCDay();
                        return DAY_NAMES[day] || '-';
                    }
                }
                // Includes time/timezone; rely on Date parser
                const parsed = new Date(trimmed);
                if (!isNaN(parsed.getTime())) {
                    return DAY_NAMES[parsed.getUTCDay()] || '-';
                }
            }
            // Fallback attempt
            const fallback = new Date(sailDate);
            if (!isNaN(fallback.getTime())) return DAY_NAMES[fallback.getUTCDay()] || '-';
            return '-';
        } catch(e){ return '-'; }
    };

    // Month computation similar to day-of-week: timezone-stable month name
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    App.FilterUtils.computeDepartureMonth = function(sailDate) {
        try {
            if (!sailDate) return '-';
            if (sailDate instanceof Date && !isNaN(sailDate.getTime())) {
                return MONTH_NAMES[sailDate.getUTCMonth()] || '-';
            }
            if (typeof sailDate === 'string') {
                const trimmed = sailDate.trim();
                // Pure date pattern (treat as UTC midnight)
                const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(trimmed);
                if (m) {
                    const y = parseInt(m[1],10); const mo = parseInt(m[2],10)-1; const d = parseInt(m[3],10);
                    if (!isNaN(y) && !isNaN(mo) && !isNaN(d)) {
                        const utcMs = Date.UTC(y, mo, d, 0,0,0,0);
                        const month = new Date(utcMs).getUTCMonth();
                        return MONTH_NAMES[month] || '-';
                    }
                }
                // Includes time/timezone; rely on Date parser
                const parsed = new Date(trimmed);
                if (!isNaN(parsed.getTime())) {
                    return MONTH_NAMES[parsed.getUTCMonth()] || '-';
                }
            }
            const fallback = new Date(sailDate);
            if (!isNaN(fallback.getTime())) return MONTH_NAMES[fallback.getUTCMonth()] || '-';
            return '-';
        } catch(e){ return '-'; }
    };
})();
