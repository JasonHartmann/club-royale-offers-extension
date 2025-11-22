// Shared mapping and classification helpers for stateroom codes/categories
(function(){
    const baseCategoryMap = { I:'INTERIOR', IN:'INTERIOR', INT:'INTERIOR', INSIDE:'INTERIOR', INTERIOR:'INTERIOR',
        O:'OUTSIDE', OV:'OUTSIDE', OB:'OUTSIDE', E:'OUTSIDE', OCEAN:'OUTSIDE', OCEANVIEW:'OUTSIDE', OUTSIDE:'OUTSIDE',
        B:'BALCONY', BAL:'BALCONY', BK:'BALCONY', BALCONY:'BALCONY',
        D:'DELUXE', DLX:'DELUXE', DELUXE:'DELUXE', JS:'DELUXE', SU:'DELUXE', SUITE:'DELUXE',
        JUNIOR:'DELUXE', 'JR':'DELUXE', 'JR.':'DELUXE', 'JR-SUITE':'DELUXE', 'JR SUITE':'DELUXE', 'JUNIOR SUITE':'DELUXE', 'JRSUITE':'DELUXE', 'JR SUITES':'DELUXE', 'JUNIOR SUITES':'DELUXE'
    };
    const WIDE_CATS = ['INTERIOR','OUTSIDE','BALCONY','DELUXE'];

    function resolveCategory(raw){
        if (!raw) return null;
        raw = (''+raw).trim();
        const up = raw.toUpperCase();
        if (baseCategoryMap[up]) return baseCategoryMap[up];
        if (WIDE_CATS.includes(up)) return up;
        return null;
    }

    function classifyBroad(code){
        if (!code) return null;
        const up = String(code).trim().toUpperCase();
        if (/SUITE|JRSUITE|JR\s?SUITE|JS|SU\b|DLX|DELUXE/.test(up)) return 'DELUXE';
        if (/BALC|BALCONY|BK\b|^\d+B$|BALK?/.test(up) || /\bB$/.test(up)) return 'BALCONY';
        if (/OCEAN|OUTSIDE|OV|\bO\b|\bN$/.test(up) || /\d+N$/.test(up) || /\d+O$/.test(up)) return 'OUTSIDE';
        if (/INTERIOR|INSIDE|INT|\bI\b|\d+V$|\d+I$|\bV$/.test(up)) return 'INTERIOR';
        return null;
    }

    try { if (typeof window !== 'undefined') window.RoomCategoryUtils = { resolveCategory, classifyBroad }; } catch(e){}
    try { if (typeof module !== 'undefined' && module.exports) module.exports = { resolveCategory, classifyBroad }; } catch(e){}
})();
