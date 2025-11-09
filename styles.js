const Styles = {
    injectStylesheet() {
        try {
            this.ensureLocalTailwind();
            this.injectSegmentedStyles();
            this.ensureInlineOverridesTag();
        } catch (error) {
            console.debug('[OffersExt] Failed to ensure styles:', error.message);
            if (window.App && App.ErrorHandler && typeof App.ErrorHandler.showError === 'function') {
                App.ErrorHandler.showError('Failed to load styles. Table may appear unstyled.');
            }
        }
    },
    injectSegmentedStyles() {
        const runtime = (typeof chrome !== 'undefined' && chrome.runtime)
            ? chrome.runtime
            : (typeof browser !== 'undefined' && browser.runtime ? browser.runtime : null);
        const requiredFiles = [
            'styles/table-base.css',
            'styles/table-columns.css',
            'styles/accordion.css',
            'styles/ui.css',
            'styles/tabs-badges.css',
            'styles/itinerary.css',
            'styles/advanced-search.css'
        ];
        requiredFiles.forEach(path => {
            const selector = `link[rel="stylesheet"][href*="${path}"]`;
            if (document.querySelector(selector)) {
                return;
            }
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = runtime ? runtime.getURL(path) : path;
            link.setAttribute('data-ext-style', path);
            (document.head || document.documentElement).appendChild(link);
            console.debug(`[OffersExt] Stylesheet injected: ${path}`);
        });
    },
    ensureLocalTailwind() {
        if (document.querySelector('link[data-ext-tailwind]')) {
            return;
        }
        const runtime = (typeof chrome !== 'undefined' && chrome.runtime)
            ? chrome.runtime
            : (typeof browser !== 'undefined' && browser.runtime ? browser.runtime : null);
        const tailwindLink = document.createElement('link');
        tailwindLink.rel = 'stylesheet';
        tailwindLink.href = runtime ? runtime.getURL('styles/tailwind.min.css') : 'styles/tailwind.min.css';
        tailwindLink.setAttribute('data-ext-tailwind', 'true');
        (document.head || document.documentElement).appendChild(tailwindLink);
        console.debug('[OffersExt] Tailwind CSS (local) injected');
    },
    ensureInlineOverridesTag() {
        if (document.querySelector('style[data-ext-inline-overrides]')) {
            return;
        }
        const dynamicStyle = document.createElement('style');
        dynamicStyle.type = 'text/css';
        dynamicStyle.setAttribute('data-ext-inline-overrides', 'true');
        dynamicStyle.textContent = '';
        (document.head || document.documentElement).appendChild(dynamicStyle);
        console.debug('[OffersExt] Inline overrides style tag ready (currently empty)');
    }
};