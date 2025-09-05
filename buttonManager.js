const ButtonManager = {
    addButton(maxAttempts = 10, attempt = 1) {
        try {
            const existingButton = document.getElementById('gobo-offers-button');
            if (existingButton) existingButton.remove();
            const button = document.createElement('button');
            button.id = 'gobo-offers-button';
            button.className = 'bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-700 ml-2';
            button.textContent = 'Show Casino Offers';
            button.addEventListener('click', () => {
                console.log('Show Casino Offers button clicked');
                App.ApiClient.fetchOffers();
            });

            const banner = document.querySelector('div[class*="flex"][class*="items-center"][class*="justify-between"]');
            if (!banner && attempt <= maxAttempts) {
                console.log(`Banner div not found, retrying (${attempt}/${maxAttempts})`);
                setTimeout(() => this.addButton(maxAttempts, attempt + 1), 500);
                return;
            }
            if (!banner) {
                console.error('Banner div not found after max attempts, falling back to fixed position');
                button.className = 'fixed top-4 right-4 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-lg hover:bg-blue-700 z-[2147483647]';
                document.body.appendChild(button);
            } else {
                console.log('Banner div found, adding button');
                const signOutButton = Array.from(banner.querySelectorAll('button, a')).find(child =>
                    child.textContent.toLowerCase().includes('sign out') ||
                    child.getAttribute('aria-label')?.toLowerCase().includes('sign out')
                );
                if (signOutButton) {
                    signOutButton.insertAdjacentElement('afterend', button);
                    console.log('Button added after Sign Out button');
                } else {
                    banner.appendChild(button);
                    console.log('Button added to banner div');
                }
            }
            console.log('Button added to DOM');
        } catch (error) {
            console.error('Failed to add button:', error.message);
            App.ErrorHandler.showError('Failed to add button. Please reload the page.');
        }
    }
};