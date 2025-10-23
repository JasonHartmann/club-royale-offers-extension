const ButtonManager = {
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
            if (existingButton) existingButton.remove();
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
                setTimeout(() => this.addButton(maxAttempts, attempt + 1), 500);
                return;
            }
            if (!banner) {
                console.debug('Banner div not found after max attempts, using centered fixed position');
                button.className = 'fixed top-4 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-lg hover:bg-blue-700 z-[2147483647]';
                // Center horizontally
                button.style.left = '50%';
                button.style.transform = 'translateX(-50%)';
                document.body.appendChild(button);
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
                button.style.zIndex = '10';
                console.debug('Button centered in banner div');
            }
            console.debug('Button added to DOM');
        } catch (error) {
            console.debug('Failed to add button:', error.message);
            App.ErrorHandler.showError('Failed to add button. Please reload the page.');
        }
    }
};