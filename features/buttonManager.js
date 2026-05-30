const ButtonManager = {
    _placementObserver: null,
    addButton(maxAttempts = 10, attempt = 1) {
        try {
            const path = (location && location.pathname ? location.pathname : '').toLowerCase();
            const onSignIn = /\/signin[^/]*\/?$/.test(path); // matches /signin, /signin-something, optional trailing slash
            if (onSignIn) {
                const existingOnSignin = document.getElementById('gobo-offers-button');
                if (existingOnSignin) existingOnSignin.remove();
                return;
            }

            const existingButton = document.getElementById('gobo-offers-button');
            if (existingButton) {
                // Button already in DOM – verify it's still connected (not orphaned by SPA re-render)
                if (existingButton.isConnected) return;
                existingButton.remove();
            }
            const button = document.createElement('button');
            button.id = 'gobo-offers-button';
            button.className = 'bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-700 ml-2';
            button.textContent = 'Show All Offers';
            button.addEventListener('click', () => {
                console.debug('Show All Offers button clicked');
                App.ApiClient.fetchOffers();
            });

            const banner = document.querySelector('div[class*="flex"][class*="items-center"][class*="justify-between"]');
            if (!banner && attempt <= maxAttempts) {
                setTimeout(() => this.addButton(maxAttempts, attempt + 1), 100);
                return;
            }
            const narrowViewport = window.matchMedia && window.matchMedia('(max-width: 520px)').matches;
            if (!banner) {
                console.debug('Banner div not found after max attempts, using centered fixed position');
                button.className = 'fixed top-4 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-lg hover:bg-blue-700 z-[2147483647]';
                // Center horizontally
                button.style.left = '50%';
                button.style.transform = 'translateX(-50%)';
                if (narrowViewport) {
                    button.style.top = '72px';
                }
                document.body.appendChild(button);
            } else if (narrowViewport) {
                console.debug('Banner div found (narrow), inserting button inside banner');
                // On narrow viewports, insert the button directly into the banner's flex flow
                // so it stays in the top bar and remains clickable above page content.
                button.style.position = 'absolute';
                button.style.top = '50%';
                button.style.left = '40px';
                button.style.transform = 'translateY(-50%)';
                button.style.flexShrink = '0';
                button.style.fontSize = '12px';
                button.style.padding = '4px 10px';
                button.style.zIndex = '2147483647';
                // Remove any stale absolute container from a previous wide→narrow transition
                const staleContainer = document.getElementById('gobo-offers-center-container');
                if (staleContainer) staleContainer.remove();
                banner.style.position = 'relative';
                banner.appendChild(button);
                console.debug('Button inserted into banner (narrow)');
            } else {
                console.debug('Banner div found, adding button');
                // Create a container for centering
                let centerContainer = document.getElementById('gobo-offers-center-container');
                if (!centerContainer) {
                    centerContainer = document.createElement('div');
                    centerContainer.id = 'gobo-offers-center-container';
                    // Position container at center top of banner and center content via flex
                    centerContainer.style.position = 'absolute';
                    centerContainer.style.top = '0';
                    centerContainer.style.left = '50%';
                    centerContainer.style.transform = 'translateX(-50%)';
                    centerContainer.style.height = '100%';
                    centerContainer.style.zIndex = 'auto';
                    centerContainer.style.display = 'flex';
                    centerContainer.style.justifyContent = 'center';
                    centerContainer.style.alignItems = 'center';
                    centerContainer.style.pointerEvents = 'none';
                    banner.style.position = 'relative'; // ensure banner is positioned
                    banner.appendChild(centerContainer);
                }
                button.style.pointerEvents = 'auto'; // allow button to be clickable
                centerContainer.innerHTML = '';
                centerContainer.appendChild(button);
                button.style.margin = '0 auto';
                button.style.position = 'relative';
                button.style.zIndex = '2147483647';
                // No automatic scrolling: leave layout and viewport unchanged.
                console.debug('Button centered in banner div');
            }
            // Value column (offerValue) added – no button adjustments required.
            console.debug('Button added to DOM');
            // Watch for SPA frameworks removing the button (race condition) and re-place it
            this._watchButtonRemoval();
        } catch (error) {
            console.debug('Failed to add button:', error.message);
            App.ErrorHandler.showError('Failed to add button. Please reload the page.');
        }
    },
    _watchButtonRemoval() {
        try {
            // Disconnect any previous observer to avoid duplicates
            if (this._placementObserver) { this._placementObserver.disconnect(); this._placementObserver = null; }
            const observer = new MutationObserver(() => {
                try {
                    const btn = document.getElementById('gobo-offers-button');
                    if (!btn || !btn.isConnected) {
                        console.debug('[ButtonManager] Button removed from DOM, re-placing');
                        observer.disconnect();
                        this._placementObserver = null;
                        // Small delay to let the SPA finish its DOM update
                        setTimeout(() => this.addButton(), 200);
                    }
                } catch(e) { /* ignore */ }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            this._placementObserver = observer;
        } catch(e) { /* ignore in environments without MutationObserver */ }
    }
};