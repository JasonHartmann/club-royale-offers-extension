const Modal = {
    createModalContainer() {
        const container = document.createElement('div');
        container.id = 'gobo-offers-table';
        container.className = 'fixed inset-0 m-auto max-w-[90vw] max-h-[90vh] bg-white p-6 rounded-lg shadow-xl overflow-y-auto z-[2147483647]';
        container.style.cssText = 'width: 90vw; overflow-y: auto !important;';
        container.addEventListener('scroll', () => {
            console.log('Table scrolled, scrollTop:', container.scrollTop);
        });
        return container;
    },
    createBackdrop() {
        const backdrop = document.createElement('div');
        backdrop.id = 'gobo-backdrop';
        backdrop.className = 'fixed inset-0 bg-black bg-opacity-70 z-[2147483646]';
        backdrop.style.cssText = 'pointer-events: auto !important;';
        return backdrop;
    },
    setupModal(container, backdrop, table, tbody, accordionContainer, backButton, overlappingElements) {
        const closeButton = document.createElement('button');
        closeButton.className = 'absolute top-2 right-2 bg-red-600 text-white font-semibold py-1 px-2 rounded hover:bg-red-700 z-[2147483647]';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', () => this.closeModal(container, backdrop, overlappingElements));

        backdrop.addEventListener('click', () => this.closeModal(container, backdrop, overlappingElements));

        document.addEventListener('keydown', this.handleEscapeKey);

        table.appendChild(tbody);
        container.appendChild(backButton);
        container.appendChild(table);
        container.appendChild(accordionContainer);
        container.appendChild(closeButton);
        document.body.appendChild(backdrop);
        document.body.appendChild(container);
    },
    closeModal(container, backdrop, overlappingElements) {
        container.remove();
        backdrop.remove();
        document.body.style.overflow = '';
        overlappingElements.forEach(el => {
            el.style.display = el.dataset.originalDisplay || '';
            delete el.dataset.originalDisplay;
        });
        document.removeEventListener('keydown', this.handleEscapeKey);
    },
    handleEscapeKey(event) {
        if (event.key === 'Escape') {
            console.log('Escape key pressed, closing modal');
            const container = document.getElementById('gobo-offers-table');
            const backdrop = document.getElementById('gobo-backdrop');
            if (container && backdrop) {
                container.remove();
                backdrop.remove();
                document.body.style.overflow = '';
                document.querySelectorAll('[data-original-display]').forEach(el => {
                    el.style.display = el.dataset.originalDisplay || '';
                    delete el.dataset.originalDisplay;
                });
                document.removeEventListener('keydown', this.handleEscapeKey);
            }
        }
    }
};