const Spinner = {
    showSpinner() {
        try {
            console.debug('Loading spinner displaying...');
            const existingSpinner = document.getElementById('gobo-loading-spinner-container');
            if (existingSpinner) existingSpinner.remove();
            const spinnerContainer = document.createElement('div');
            spinnerContainer.id = 'gobo-loading-spinner-container';
            // Use explicit inline styles to avoid Tailwind dependency in Safari/iOS
            try {
                spinnerContainer.style.position = 'fixed';
                spinnerContainer.style.top = '0';
                spinnerContainer.style.left = '0';
                spinnerContainer.style.right = '0';
                spinnerContainer.style.bottom = '0';
                spinnerContainer.style.display = 'flex';
                spinnerContainer.style.alignItems = 'center';
                spinnerContainer.style.justifyContent = 'center';
                spinnerContainer.style.background = 'rgba(0,0,0,0.5)';
                spinnerContainer.style.zIndex = '2147483660';
            } catch(e) { /* ignore css assignment errors */ }
            const spinnerEl = document.createElement('div');
            spinnerEl.id = 'gobo-loading-spinner';
            try {
                spinnerEl.style.width = '48px';
                spinnerEl.style.height = '48px';
                spinnerEl.style.borderRadius = '50%';
                spinnerEl.style.border = '4px solid rgba(255,255,255,0.35)';
                spinnerEl.style.borderTopColor = '#ffffff';
                spinnerEl.style.boxShadow = '0 8px 20px rgba(15,23,42,0.25)';
                spinnerEl.style.animation = 'gobo-spin 0.9s linear infinite';
                spinnerEl.style.willChange = 'transform';
            } catch(e) { /* ignore css assignment errors */ }
            spinnerContainer.appendChild(spinnerEl);
            document.body.appendChild(spinnerContainer);
            console.debug('Loading spinner displayed');
        } catch (error) {
            console.debug('Failed to show loading spinner:', error.message);
        }
    },
    hideSpinner() {
        try {
            const spinnerContainer = document.getElementById('gobo-loading-spinner-container');
            if (spinnerContainer) {
                spinnerContainer.remove();
                console.debug('Loading spinner hidden');
            }
        } catch (error) {
            console.debug('Failed to hide loading spinner:', error.message);
        }
    }
};