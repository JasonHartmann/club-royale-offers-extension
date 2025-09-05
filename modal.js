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
    setupModal(state, overlappingElements) {
        const { container, backdrop, table, tbody, accordionContainer, backButton } = state;
        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'table-scroll-container';
        const footerContainer = document.createElement('div');
        footerContainer.className = 'table-footer-container';

        const closeButton = document.createElement('button');
        closeButton.className = 'close-button';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', () => this.closeModal(container, backdrop, overlappingElements));

        const exportButton = document.createElement('button');
        exportButton.className = 'export-csv-button';
        exportButton.textContent = 'Export to CSV';
        exportButton.addEventListener('click', () => {
            App.Modal.exportToCSV(state);
        });

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
        footerContainer.appendChild(exportButton);
        footerContainer.appendChild(closeButton);
        container.appendChild(scrollContainer);
        container.appendChild(footerContainer);
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
    },
    exportToCSV(state) {
        const { headers, sortedOffers, viewMode, currentGroupColumn, groupSortStates, openGroups } = state;
        let rows = [];
        if (viewMode === 'accordion' && currentGroupColumn) {
            // Flatten grouped data for export
            const groupedData = App.AccordionBuilder.createGroupedData(sortedOffers, currentGroupColumn);
            Object.keys(groupedData).forEach(groupKey => {
                groupedData[groupKey].forEach(({ offer, sailing }) => {
                    rows.push({ offer, sailing });
                });
            });
        } else {
            rows = sortedOffers;
        }
        const csvHeaders = headers.map(h => h.label);
        const csvRows = rows.map(({ offer, sailing }) => [
            offer.campaignOffer?.offerCode || '-',
            new Date(offer.campaignOffer?.startDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) || '-',
            new Date(offer.campaignOffer?.reserveByDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) || '-',
            offer.campaignOffer?.name || '-',
            sailing.shipName || '-',
            new Date(sailing.sailDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) || '-',
            sailing.departurePort?.name || '-',
            sailing.itineraryDescription || sailing.sailingType?.name || '-',
            (() => {
                let room = sailing.roomType;
                if (sailing.isGTY) room = room ? room + ' GTY' : 'GTY';
                return room || '-';
            })(),
            (() => {
                let qualityText = sailing.isGOBO ? '1 Guest' : '2 Guests';
                if (sailing.isDOLLARSOFF && sailing.DOLLARSOFF_AMT > 0) qualityText += ` + $${sailing.DOLLARSOFF_AMT} off`;
                if (sailing.isFREEPLAY && sailing.FREEPLAY_AMT > 0) qualityText += ` + $${sailing.FREEPLAY_AMT} freeplay`;
                return qualityText;
            })()
        ]);
        const csvContent = [csvHeaders, ...csvRows]
            .map(row => row.map(field => '"' + String(field).replace(/"/g, '""') + '"').join(','))
            .join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'offers.csv';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);
    },
};