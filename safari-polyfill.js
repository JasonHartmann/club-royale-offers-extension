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

