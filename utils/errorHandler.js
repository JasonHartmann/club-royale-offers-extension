const ErrorHandler = {
    showError(message) {
        try {
            const existingError = document.getElementById('gobo-error');
            if (existingError) existingError.remove();
            const errorDiv = document.createElement('div');
            errorDiv.id = 'gobo-error';
            errorDiv.className = 'fixed top-16 right-4 bg-red-600 text-white font-semibold py-2 px-4 rounded-lg shadow-lg z-[2147483647]';
            errorDiv.textContent = message;
            document.body.appendChild(errorDiv);
            setTimeout(() => errorDiv.remove(), 10000);
        } catch (error) {
            console.debug('Failed to show error:', error.message);
        }
    },
    showWarning(message) {
        try {
            const existingWarn = document.getElementById('gobo-warning');
            if (existingWarn) existingWarn.remove();
            const warnDiv = document.createElement('div');
            warnDiv.id = 'gobo-warning';
            warnDiv.className = 'fixed top-16 right-4 text-white font-semibold py-2 px-4 rounded-lg shadow-lg z-[2147483647]';
            // Ensure background color is explicitly set inline to avoid cases where global CSS
            // or missing utility classes render the element transparent.
            try { warnDiv.style.backgroundColor = '#f97316'; /* Tailwind orange-500 */ } catch(e){}
            try { warnDiv.style.color = '#ffffff'; } catch(e){}
            warnDiv.textContent = message;
            document.body.appendChild(warnDiv);
            setTimeout(() => warnDiv.remove(), 10000);
        } catch (error) {
            console.debug('Failed to show warning:', error.message);
        }
    },
    closeModalIfOpen() {
        const container = document.getElementById('gobo-offers-table');
        const backdrop = document.getElementById('gobo-backdrop');
        if (container && backdrop) {
            console.debug('Closing open modal due to error');
            container.remove();
            backdrop.remove();
            document.body.style.overflow = '';
            document.removeEventListener('keydown', App.TableRenderer.handleEscapeKey);
        }
    }
};