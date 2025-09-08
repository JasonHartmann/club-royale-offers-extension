const Spinner = {
    showSpinner() {
        try {
            const existingSpinner = document.getElementById('gobo-loading-spinner-container');
            if (existingSpinner) existingSpinner.remove();
            const spinnerContainer = document.createElement('div');
            spinnerContainer.id = 'gobo-loading-spinner-container';
            spinnerContainer.className = 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-[2147483646]';
            spinnerContainer.innerHTML = `<div id="gobo-loading-spinner"></div>`;
            document.body.appendChild(spinnerContainer);
            console.log('Loading spinner displayed');
        } catch (error) {
            console.log('Failed to show loading spinner:', error.message);
        }
    },
    hideSpinner() {
        try {
            const spinnerContainer = document.getElementById('gobo-loading-spinner-container');
            if (spinnerContainer) {
                spinnerContainer.remove();
                console.log('Loading spinner hidden');
            }
        } catch (error) {
            console.log('Failed to hide loading spinner:', error.message);
        }
    }
};