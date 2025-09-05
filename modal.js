const Modal = {
    createModalContainer() {
        const container = document.createElement('div');
        container.id = 'gobo-offers-table';
        container.className = 'fixed inset-0 m-auto z-[2147483647]';
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
        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'table-scroll-container';
        const footerContainer = document.createElement('div');
        footerContainer.className = 'table-footer-container';

        const closeButton = document.createElement('button');
        closeButton.className = 'close-button';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', () => this.closeModal(container, backdrop, overlappingElements));

        const breadcrumbContainer = document.createElement('div');
        breadcrumbContainer.className = 'breadcrumb-container';
        const allOffersLink = document.createElement('span');
        allOffersLink.className = 'breadcrumb-link';
        allOffersLink.textContent = 'All Offers';
        allOffersLink.addEventListener('click', backButton.onclick);
        const arrow = document.createElement('span');
        arrow.className = 'breadcrumb-arrow';
        const groupTitle = document.createElement('span');
        groupTitle.id = 'group-title';
        groupTitle.className = 'group-title';
        breadcrumbContainer.appendChild(allOffersLink);
        breadcrumbContainer.appendChild(arrow);
        breadcrumbContainer.appendChild(groupTitle);

        backdrop.addEventListener('click', () => this.closeModal(container, backdrop, overlappingElements));

        document.addEventListener('keydown', this.handleEscapeKey);

        table.appendChild(tbody);
        scrollContainer.appendChild(breadcrumbContainer);
        scrollContainer.appendChild(table);
        scrollContainer.appendChild(accordionContainer);
        footerContainer.appendChild(closeButton);
        container.appendChild(scrollContainer);
        container.appendChild(footerContainer);
        document.body.appendChild(backdrop);
        document.body.appendChild(container);

        scrollContainer.addEventListener('scroll', () => {
            console.log('Table scrolled, scrollTop:', scrollContainer.scrollTop);
        });
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