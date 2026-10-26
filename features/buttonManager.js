const ButtonManager = {
    _TIER_LABELS: ['CURRENT CLUB TIER', 'CURRENT TIER', 'BLUE CHIP CLUB'],

    _findTierHeading() {
        const cached = this._tierHeading;
        if (cached && cached.isConnected) return cached;
        this._tierHeading = null;
        try {
            for (const label of this._TIER_LABELS) {
                const xpath = `//*[translate(normalize-space(text()), "abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ")="${label}"]`;
                const hit = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                if (hit) {
                    this._tierHeading = hit;
                    return hit;
                }
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

    _setStyle(button, prop, value) {
        if (button.style[prop] !== value) button.style[prop] = value;
    },

    _placeAboveTier(button, heading) {
        const hr = heading.getBoundingClientRect();
        const navBottom = this._navBottom();
        const left = `${hr.left + hr.width / 2}px`;
        this._setStyle(button, 'position', 'fixed');
        this._setStyle(button, 'left', left);
        this._setStyle(button, 'transform', 'translateX(-50%)');
        if (button.dataset.goboPlaced !== 'tier') button.dataset.goboPlaced = 'tier';
        if (navBottom <= 8) {
            this._setStyle(button, 'visibility', 'hidden');
            return;
        }
        this._setStyle(button, 'top', `${navBottom + 5}px`);
        this._setStyle(button, 'visibility', 'visible');
    },

    _reposition() {
        const btn = document.getElementById('gobo-offers-button');
        const heading = this._findTierHeading();
        if (btn && heading) this._placeAboveTier(btn, heading);
    },

    _scheduleReposition() {
        if (this._repositionQueued) return;
        this._repositionQueued = true;
        requestAnimationFrame(() => {
            this._repositionQueued = false;
            this._reposition();
        });
    },

    _bindReposition() {
        if (this._repositionBound) return;
        this._repositionBound = true;
        const place = () => this._reposition();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', () => this._scheduleReposition(), { passive: true });
        const header = document.querySelector('header');
        if (!header) return;
        header.addEventListener('transitionend', place);
        // One follow loop per hide-header animation. A new class change extends
        // the deadline instead of starting another 450ms of layout reads.
        new MutationObserver(() => {
            const end = performance.now() + 450;
            if (this._followRunning) {
                if (end > this._followUntil) this._followUntil = end;
                return;
            }
            this._followUntil = end;
            this._followRunning = true;
            const tick = (now) => {
                if (!this._followRunning) return;
                place();
                if (now < this._followUntil) requestAnimationFrame(tick);
                else this._followRunning = false;
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
