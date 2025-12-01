// Lightweight polyfill to smooth Safari Web Extension compatibility.
// Injects a minimal chrome namespace in Safari (which provides browser.*),
// and a minimal browser namespace in Chromium-based browsers if needed.
(function () {
    try {
        // Provide chrome -> browser bridge for Safari (Safari exposes browser.* APIs)
        if (typeof chrome === 'undefined' && typeof browser !== 'undefined') {
            // Only map what we actually use in the extension to keep it simple.
            const c = {};
            if (browser.runtime) c.runtime = browser.runtime;
            if (browser.storage) c.storage = browser.storage;
            // Assign without overwriting if another script already defined chrome.
            if (typeof window !== 'undefined' && !window.chrome) window.chrome = c;
        }
        // Provide browser -> chrome bridge for Chromium (optional; we mainly check chrome first).
        if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
            const b = {};
            if (chrome.runtime) b.runtime = chrome.runtime;
            if (chrome.storage) b.storage = chrome.storage;
            if (typeof window !== 'undefined') window.browser = b;
        }
    } catch (e) {
        // Fail silently; extension will still attempt direct paths.
        console.warn('[safari-polyfill] initialization error', e);
    }
})();

// Global debug logging toggle (immutable). Set to true to enable verbose debug output.
// To enable debug logging for development, change the value below to true and reload the extension.
(function(){
    try {
        if (typeof window !== 'undefined' && !('GOBO_DEBUG_ENABLED' in window)) {
            Object.defineProperty(window, 'GOBO_DEBUG_ENABLED', { value: false, writable: false, configurable: false });
        }
        // Monkey patch debug-level logging so existing calls don't need modification.
        const noop = function(){};
        const origDebug = (typeof console !== 'undefined' && console.debug) ? console.debug.bind(console) : noop;
        const origLog = (typeof console !== 'undefined' && console.log) ? console.log.bind(console) : noop;
        const origInfo = (typeof console !== 'undefined' && console.info) ? console.info.bind(console) : noop;
        // Replace console.debug entirely when disabled.
        if (typeof console !== 'undefined') {
            // Suppress known noisy debug patterns even when debug is enabled
            const DEBUG_SUPPRESS_PATTERNS = [
                /^\[Filtering\] wasRowHidden check/i
            ];
            console.debug = function(...args){
                try {
                    if (!window.GOBO_DEBUG_ENABLED) return;
                    if (args && args.length && typeof args[0] === 'string') {
                        for (let i = 0; i < DEBUG_SUPPRESS_PATTERNS.length; i++) {
                            try { if (DEBUG_SUPPRESS_PATTERNS[i].test(args[0])) return; } catch(e){}
                        }
                    }
                } catch(e) {}
                origDebug(...args);
            };
            // Filter only explicit [DEBUG] tagged log lines for console.log; leave other logs intact.
            console.log = function(...args){ if (!window.GOBO_DEBUG_ENABLED && typeof args[0] === 'string' && /^\[DEBUG]/.test(args[0])) return; origLog(...args); };
            // Treat console.info as debug-level only if prefixed with [DEBUG] to avoid hiding informational user-facing messages.
            console.info = function(...args){ if (!window.GOBO_DEBUG_ENABLED && typeof args[0] === 'string' && /^\[DEBUG]/.test(args[0])) return; origInfo(...args); };
        }
        // Convenience helper for new debug messages (preferred): window.dlog('message', data)
        if (typeof window !== 'undefined' && !window.dlog) {
            window.dlog = function(...args){ if (!window.GOBO_DEBUG_ENABLED) return; try { origDebug(...args); } catch(e){} };
        }
    } catch(patchErr){ /* ignore patch errors */ }
})();
