const DOMUtils = {
    _observer: null,
    _observerTarget: null,
    _onDomReady() {
        console.debug('DOM is ready');
        App.Styles.injectStylesheet();
        App.ButtonManager.addButton();
        this.observeDomChanges();
        this._scheduleLateInjection();
    },
    waitForDom(maxAttempts = 10, attempt = 1) {
        // At document_start, document.head/body may exist as empty shells while
        // the SPA hasn't rendered a single component. Wait for DOMContentLoaded
        // (full HTML parse) before firing injection, so the banner div has a
        // chance to exist in the initial HTML or the SPA has at least bootstrapped.
        if (document.readyState === 'complete' || (document.readyState === 'interactive' && document.body && document.body.innerHTML.length > 0)) {
            console.debug('DOM ready (complete/interactive with content), injecting immediately');
            this._onDomReady();
        } else if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this._onDomReady(), { once: true });
        } else if (attempt <= maxAttempts) {
            console.debug(`DOM not ready, retrying (${attempt}/${maxAttempts})`);
            setTimeout(() => this.waitForDom(maxAttempts, attempt + 1), 500);
        } else {
            console.debug('Failed to load DOM after max attempts');
            App.ErrorHandler.showError('Failed to initialize extension. Please reload the page.');
        }
    },
    observeDomChanges() {
        if (!document.body) return;
        if (this._observer && this._observerTarget === document.body) return;
        if (this._observer) {
            try { this._observer.disconnect(); } catch (e) { /* ignore */ }
        }
        const observer = new MutationObserver(() => {
            if (!App.ButtonManager.isButtonCorrectlyPlaced()) {
                App.ButtonManager.addButton();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        this._observer = observer;
        this._observerTarget = document.body;
        console.debug('DOM observer started for button re-injection');
    },
    _scheduleLateInjection() {
        const lateAttempt = () => {
            if (!App.ButtonManager.isButtonCorrectlyPlaced()) {
                App.ButtonManager.addButton(30);
            }
            this.observeDomChanges();
        };
        setTimeout(lateAttempt, 1500);
        setTimeout(lateAttempt, 4000);
        if (document.readyState !== 'complete') {
            window.addEventListener('load', lateAttempt, { once: true });
        }
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                lateAttempt();
            }
        });
    }
};