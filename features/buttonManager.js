const ButtonManager = {
    _TIER_LABELS: ['CURRENT CLUB TIER', 'CURRENT TIER', 'BLUE CHIP CLUB'],
    _followGen: 0,

    _findTierHeading() {
        try {
            for (const label of this._TIER_LABELS) {
                const xpath = `//*[translate(normalize-space(text()), "abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ")="${label}"]`;
                const hit = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                if (hit) return hit;
            }
        } catch (e) { /* ignore */ }
        return null;
    },

    _navBottom() {
        const nav = document.querySelector('#global-head') || document.querySelector('header, [role="banner"], nav');
        if (nav) {
            const r = nav.getBoundingClientRect();
            // ponytail: cap below hero-wrapping headers; RCL chrome is ~96–97px
            if (r.height > 0 && r.height <= 128) return r.bottom;
            if (r.top >= -10 && r.top <= 40) return r.top + 80;
        }
        return 80;
    },

    _placeAboveTier(button, heading) {
        const hr = heading.getBoundingClientRect();
        const navBottom = this._navBottom();
        button.style.position = 'fixed';
        button.style.left = `${hr.left + hr.width / 2}px`;
        button.style.transform = 'translateX(-50%)';
        button.dataset.goboPlaced = 'tier';
        if (navBottom <= 8) {
            button.style.visibility = 'hidden';
            return;
        }
        button.style.top = `${navBottom + 5}px`;
        button.style.visibility = 'visible';
    },

    _reposition() {
        const btn = document.getElementById('gobo-offers-button');
        const heading = this._findTierHeading();
        if (btn && heading) this._placeAboveTier(btn, heading);
    },

    _bindReposition() {
        if (this._repositionBound) return;
        this._repositionBound = true;
        const place = () => this._reposition();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, { passive: true });
        const header = document.querySelector('header');
        if (!header) return;
        header.addEventListener('transitionend', place);
        // ponytail: rAF tracks RCL's 0.4s hide-header transform; drop if they hide without CSS
        new MutationObserver(() => {
            const id = ++this._followGen;
            const end = performance.now() + 450;
            const tick = (now) => {
                if (id !== this._followGen) return;
                place();
                if (now < end) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        }).observe(header, { attributes: true, attributeFilter: ['class'] });
    },

    isButtonCorrectlyPlaced() {
        const btn = document.getElementById('gobo-offers-button');
        if (!btn || !btn.isConnected) return false;
        if (btn.parentElement !== document.body && btn.parentElement !== document.documentElement) return false;
        return btn.dataset.goboPlaced === 'tier' && !!this._findTierHeading();
    },

    addButton() {
        try {
            const path = (location && location.pathname ? location.pathname : '').toLowerCase();
            if (/\/signin[^/]*\/?$/.test(path)) {
                const existingOnSignin = document.getElementById('gobo-offers-button');
                if (existingOnSignin) existingOnSignin.remove();
                const staleOnSignin = document.getElementById('gobo-offers-center-container');
                if (staleOnSignin) staleOnSignin.remove();
                return;
            }

            const staleContainer = document.getElementById('gobo-offers-center-container');
            if (staleContainer) staleContainer.remove();

            if (this.isButtonCorrectlyPlaced()) return;

            let button = document.getElementById('gobo-offers-button');
            if (button && button.parentElement !== document.body && button.parentElement !== document.documentElement) {
                button.remove();
                button = null;
            }
            if (!button) {
                button = document.createElement('button');
                button.id = 'gobo-offers-button';
                button.type = 'button';
                button.textContent = 'Show All Offers';
                button.style.visibility = 'hidden';
                button.addEventListener('click', () => {
                    console.debug('Show All Offers button clicked');
                    App.ApiClient.fetchOffers();
                });
                (document.body || document.documentElement).appendChild(button);
            }

            const heading = this._findTierHeading();
            if (heading) {
                this._placeAboveTier(button, heading);
                this._bindReposition();
            }
            console.debug('Button added to DOM');
        } catch (error) {
            console.debug('Failed to add button:', error.message);
            App.ErrorHandler.showError('Failed to add button. Please reload the page.');
        }
    }
};
