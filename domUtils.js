const DOMUtils = {
    waitForDom(maxAttempts = 10, attempt = 1) {
        if (document.head && document.body) {
            console.log('DOM is ready');
            App.Styles.injectStylesheet();
            App.ButtonManager.addButton();
            if (App.OfferCodeLookup && typeof App.OfferCodeLookup.init === 'function') App.OfferCodeLookup.init();
            this.observeDomChanges();
        } else if (attempt <= maxAttempts) {
            console.log(`DOM not ready, retrying (${attempt}/${maxAttempts})`);
            setTimeout(() => this.waitForDom(maxAttempts, attempt + 1), 500);
        } else {
            console.log('Failed to load DOM after max attempts');
            App.ErrorHandler.showError('Failed to initialize extension. Please reload the page.');
        }
    },
    observeDomChanges() {
        const observer = new MutationObserver(() => {
            if (!document.getElementById('gobo-offers-button')) {
                console.log('Button missing, re-adding button');
                App.ButtonManager.addButton();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        console.log('DOM observer started for button re-injection');
    }
};