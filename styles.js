const Styles = {
    injectStylesheet() {
        try {
            // 1. Ensure Tailwind (optional utility layer) is present once.
            if (!document.querySelector('link[data-ext-tailwind]')) {
                const tailwindLink = document.createElement('link');
                tailwindLink.href = 'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css';
                tailwindLink.rel = 'stylesheet';
                tailwindLink.setAttribute('data-ext-tailwind', 'true');
                document.head.appendChild(tailwindLink);
                console.debug('[OffersExt] Tailwind CSS injected');
            }

            // 2. Detect the extension base stylesheet injected by the manifest (MV3 content_scripts css field).
            const extStylesheet = Array.from(document.styleSheets).find(ss => {
                try { return ss.href && ss.href.endsWith('/styles/styles.css'); } catch(_) { return false; }
            });
            if (extStylesheet) {
                console.debug('[OffersExt] Base stylesheet (styles/styles.css) present');
            } else if (!document.querySelector('link[data-ext-base-css]')) {
                // Fallback only if segmented styles are not yet all injected (avoid double rules if both exist)
                const segmentedNeeded = ['styles/table-base.css', 'styles/table-columns.css','styles/accordion.css','styles/ui.css','styles/tabs-badges.css']
                  .some(p => !document.querySelector(`link[data-ext-seg="${p}"]`));
                if (segmentedNeeded) {
                    const baseLink = document.createElement('link');
                    baseLink.rel = 'stylesheet';
                    const runtime = (typeof chrome !== 'undefined' && chrome.runtime) ? chrome.runtime : (typeof browser !== 'undefined' && browser.runtime ? browser.runtime : null);
                    baseLink.href = runtime ? runtime.getURL('styles/styles.css') : 'styles/styles.css';
                    baseLink.setAttribute('data-ext-base-css', 'true');
                    document.head.appendChild(baseLink);
                    console.debug('[OffersExt] Base stylesheet injected manually as fallback');
                }
            }

            // 3. Inject segmented stylesheet files (new modular split) once each.
            this.injectSegmentedStyles();

            // 4. Inline overrides placeholder (empty for future dynamic rules)
            if (!document.querySelector('style[data-ext-inline-overrides]')) {
                const dynamicStyle = document.createElement('style');
                dynamicStyle.type = 'text/css';
                dynamicStyle.setAttribute('data-ext-inline-overrides', 'true');
                dynamicStyle.textContent = '';
                document.head.appendChild(dynamicStyle);
                console.debug('[OffersExt] Inline overrides style tag ready (currently empty)');
            }
        } catch (error) {
            console.debug('[OffersExt] Failed to ensure styles:', error.message);
            if (window.App && App.ErrorHandler && typeof App.ErrorHandler.showError === 'function') {
                App.ErrorHandler.showError('Failed to load styles. Table may appear unstyled.');
            }
        }
    },
    injectSegmentedStyles() {
        const runtime = (typeof chrome !== 'undefined' && chrome.runtime) ? chrome.runtime : (typeof browser !== 'undefined' && browser.runtime ? browser.runtime : null);
        const files = ['styles/table.css','styles/accordion.css','styles/ui.css','styles/tabs-badges.css'];
        files.forEach(path => {
            if (!document.querySelector(`link[data-ext-seg="${path}"]`)) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = runtime ? runtime.getURL(path) : path; // runtime resolves extension URL; fallback relative
                link.setAttribute('data-ext-seg', path);
                document.head.appendChild(link);
                console.debug(`[OffersExt] Segmented stylesheet injected: ${path}`);
            }
        });
    }
};