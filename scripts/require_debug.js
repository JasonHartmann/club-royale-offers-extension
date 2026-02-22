try {
    const mod = require('../features/filtering.js');
    console.log('typeof mod:', typeof mod);
    try { console.log('Object.keys(mod):', Object.keys(mod)); } catch(e) { console.log('Object.keys err', e && e.message); }
    try { console.log('Own props:', Object.getOwnPropertyNames(mod)); } catch(e) { console.log('getOwnPropertyNames err', e && e.message); }
    try { console.log('mod.applyAdvancedSearch type:', typeof mod.applyAdvancedSearch); } catch(e) { console.log('inspect err', e && e.message); }
} catch (e) {
    console.error('Require error:', e && e.stack);
}
