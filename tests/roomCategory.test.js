const { classifyBroad, resolveCategory } = (function(){
    if (typeof window !== 'undefined' && window.RoomCategoryUtils) return window.RoomCategoryUtils;
    // Fallback: require the util from file path in node test environment
    const rc = require('../utils/roomCategory.js');
    return rc || {};
})();

test('classifyBroad recognizes DELUXE tokens', () => {
    expect(classifyBroad('Suite')).toBe('DELUXE');
    expect(classifyBroad('Jr Suite')).toBe('DELUXE');
});

test('resolveCategory maps tokens', () => {
    expect(resolveCategory('I')).toBe('INTERIOR');
    expect(resolveCategory('BAL')).toBe('BALCONY');
});
