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
        backdrop.className = 'fixed inset-0 bg-black bg-opacity-50 z-[2147483646]';
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

        // Store references for ESC handling & cleanup
        this._container = container;
        this._backdrop = backdrop;
        this._overlappingElements = overlappingElements;
        // Create a bound handler so we can remove it later
        this._escapeHandler = this.handleEscapeKey.bind(this);
        document.addEventListener('keydown', this._escapeHandler);

        table.appendChild(tbody);
        scrollContainer.appendChild(breadcrumbContainer);
        scrollContainer.appendChild(table);
        scrollContainer.appendChild(accordionContainer);

        // Add Buy Me a Coffee button (left-justified)
        const coffeeButton = document.createElement('a');
        coffeeButton.className = 'buy-coffee-link';
        coffeeButton.href = 'https://www.buymeacoffee.com/comproyale';
        coffeeButton.target = '_blank';
        coffeeButton.rel = 'noopener noreferrer';
        coffeeButton.innerHTML = `<img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=☕&slug=comproyale&button_colour=FFDD00&font_colour=000000&font_family=Arial&outline_colour=000000&coffee_colour=ffffff" alt="Buy Me A Coffee" style="height: 32px;">`;
        footerContainer.appendChild(coffeeButton);
        footerContainer.appendChild(exportButton);
        footerContainer.appendChild(closeButton);

        container.appendChild(scrollContainer);
        container.appendChild(footerContainer);

        // Add legend and copyright below the buttons
        const legendCopyrightWrapper = document.createElement('div');
        legendCopyrightWrapper.style.cssText = 'width: 100%; display: flex; justify-content: space-between; align-items: center; margin-top: 2px;';

        // Legend
        const legend = document.createElement('div');
        legend.style.cssText = 'display: flex; align-items: center; gap: 12px; font-size: 10px; margin-left: 8px;';
        // Expiring Soon
        const expiringBox = document.createElement('span');
        expiringBox.style.cssText = 'display: inline-block; width: 14px; height: 14px; background: #FDD; border: 1px solid #ccc; margin-right: 4px; vertical-align: middle;';
        const expiringLabel = document.createElement('span');
        expiringLabel.textContent = 'Expiring Soon';
        legend.appendChild(expiringBox);
        legend.appendChild(expiringLabel);
        // New Offer
        const newBox = document.createElement('span');
        newBox.style.cssText = 'display: inline-block; width: 14px; height: 14px; background: #DFD; border: 1px solid #ccc; margin-right: 4px; vertical-align: middle;';
        const newLabel = document.createElement('span');
        newLabel.style.cssText = 'color: #14532d;';
        newLabel.textContent = 'Newest Offer';
        legend.appendChild(newBox);
        legend.appendChild(newLabel);

        // Copyright
        const copyright = document.createElement('div');
        copyright.style.cssText = 'text-align: right; font-size: 10px; color: #bbb; margin-right: 8px;';
        copyright.textContent = '© 2025 Percex Technologies, LLC';

        legendCopyrightWrapper.appendChild(legend);
        legendCopyrightWrapper.appendChild(copyright);
        container.appendChild(legendCopyrightWrapper);

        document.body.appendChild(backdrop);
        document.body.appendChild(container);
    },
    closeModal(container, backdrop, overlappingElements) {
        // Allow calling with stored references when no args provided
        container = container || this._container;
        backdrop = backdrop || this._backdrop;
        overlappingElements = overlappingElements || this._overlappingElements || [];
        if (!container || !backdrop) return; // Already closed
        container.remove();
        backdrop.remove();
        document.body.style.overflow = '';
        overlappingElements.forEach(el => {
            el.style.display = el.dataset.originalDisplay || '';
            delete el.dataset.originalDisplay;
        });
        if (this._escapeHandler) {
            document.removeEventListener('keydown', this._escapeHandler);
        }
        // Cleanup stored refs
        this._container = null;
        this._backdrop = null;
        this._overlappingElements = null;
        this._escapeHandler = null;
    },
    handleEscapeKey(event) {
        if (event.key === 'Escape') {
            this.closeModal();
        }
    },
    exportToCSV(state) {
        const { headers } = state;
        let rows = [];
        let usedSubset = false; // flag to know if we exported a nested subset

        // Determine if a nested (focused) subset is being viewed: presence of a selected path
        if (state.viewMode === 'accordion' && Array.isArray(state.groupKeysStack) && state.groupKeysStack.length > 0) {
            // Derive subset by drilling down through groupingStack using selected keys
            let subset = state.sortedOffers || [];
            for (let depth = 0; depth < state.groupKeysStack.length && depth < state.groupingStack.length; depth++) {
                const colKey = state.groupingStack[depth];
                const groupVal = state.groupKeysStack[depth];
                const grouped = App.AccordionBuilder.createGroupedData(subset, colKey);
                subset = grouped[groupVal] || [];
                if (!subset.length) break; // abort if path invalid
            }
            if (subset.length) {
                rows = subset; // Only export the focused nested group's flat rows
                usedSubset = true;
            }
        }

        // Fallback: export all currently sorted offers if no focused subset was determined
        if (rows.length === 0) {
            rows = state.sortedOffers || [];
        }

        const csvHeaders = headers.map(h => h.label);
        const csvRows = rows.map(({ offer, sailing }) => {
            const itinerary = sailing.itineraryDescription || sailing.sailingType?.name || '-';
            const parsed = App.Utils.parseItinerary(itinerary);
            const nights = parsed.nights;
            const destination = parsed.destination;
            const perksStr = App.Utils.computePerks(offer, sailing);
            const shipClass = App.Utils.getShipClass(sailing.shipName);
            return [
                offer.campaignOffer?.offerCode || '-',
                offer.campaignOffer?.startDate ? App.Utils.formatDate(offer.campaignOffer.startDate) : '-',
                offer.campaignOffer?.reserveByDate ? App.Utils.formatDate(offer.campaignOffer.reserveByDate) : '-',
                offer.campaignOffer?.name || '-',
                shipClass,
                sailing.shipName || '-',
                sailing.sailDate ? App.Utils.formatDate(sailing.sailDate) : '-',
                sailing.departurePort?.name || '-',
                nights,
                destination,
                (() => { let room = sailing.roomType; if (sailing.isGTY) room = room ? room + ' GTY' : 'GTY'; return room || '-'; })(),
                (() => { let qualityText = sailing.isGOBO ? '1 Guest' : '2 Guests'; if (sailing.isDOLLARSOFF && sailing.DOLLARSOFF_AMT > 0) qualityText += ` + $${sailing.DOLLARSOFF_AMT} off`; if (sailing.isFREEPLAY && sailing.FREEPLAY_AMT > 0) qualityText += ` + $${sailing.FREEPLAY_AMT} freeplay`; return qualityText; })(),
                perksStr
            ];
        });

        let csvContent = [csvHeaders, ...csvRows]
            .map(row => row.map(field => '"' + String(field).replace(/"/g, '""') + '"').join(','))
            .join('\r\n');

        // Append filter breadcrumb line if subset exported
        if (usedSubset) {
            const parts = ['All Offers'];
            for (let i = 0; i < state.groupKeysStack.length && i < state.groupingStack.length; i++) {
                const colKey = state.groupingStack[i];
                const label = (state.headers.find(h => h.key === colKey)?.label) || colKey;
                const val = state.groupKeysStack[i];
                parts.push(label, val);
            }
            const filterLine = 'Filters: ' + parts.join(' -> ');
            csvContent += '\r\n\r\n' + filterLine;
        }

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