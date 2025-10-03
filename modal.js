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
        // Always use the current tab's state for export
        exportButton.addEventListener('click', () => {
            App.Modal.exportToCSV(App.TableRenderer.lastState);
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
        // Also close secondary Back-to-Back modal if it exists
        try { this.closeBackToBackModal(); } catch(e){ /* ignore */ }
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
            let subset = state.sortedOffers || [];
            for (let depth = 0; depth < state.groupKeysStack.length && depth < state.groupingStack.length; depth++) {
                const colKey = state.groupingStack[depth];
                const groupVal = state.groupKeysStack[depth];
                const grouped = App.AccordionBuilder.createGroupedData(subset, colKey);
                subset = grouped[groupVal] || [];
                if (!subset.length) break;
            }
            if (subset.length) {
                rows = subset;
                usedSubset = true;
            }
        }
        if (rows.length === 0) rows = state.sortedOffers || [];

        // Build header labels directly from state.headers (now includes Favorite column at index 0)
        const csvHeaders = headers.map(h => h.label);

        const csvRows = rows.map(({ offer, sailing }) => {
            const itinerary = sailing.itineraryDescription || sailing.sailingType?.name || '-';
            const parsed = App.Utils.parseItinerary(itinerary);
            const nights = parsed.nights;
            const destination = parsed.destination;
            const perksStr = App.Utils.computePerks(offer, sailing);
            const shipClass = App.Utils.getShipClass(sailing.shipName);
            const isFav = (typeof Favorites !== 'undefined' && Favorites && typeof Favorites.isFavorite === 'function') ? Favorites.isFavorite(offer, sailing) : false;
            const favMarker = isFav ? '★' : '';
            return [
                favMarker, // Favorite column
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
                (() => { let guestsText = sailing.isGOBO ? '1 Guest' : '2 Guests'; if (sailing.isDOLLARSOFF && sailing.DOLLARSOFF_AMT > 0) guestsText += ` + $${sailing.DOLLARSOFF_AMT} off`; if (sailing.isFREEPLAY && sailing.FREEPLAY_AMT > 0) guestsText += ` + $${sailing.FREEPLAY_AMT} freeplay`; return guestsText; })(),
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
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
    },
    showBackToBackModal() {
        // Avoid duplicates
        if (document.getElementById('gobo-b2b-modal')) {
            const existing = document.getElementById('gobo-b2b-modal');
            existing.style.display = 'block';
            return;
        }
        const parentModal = document.getElementById('gobo-offers-table');
        if (!parentModal) return; // primary modal must exist
        // Backdrop (local to primary modal)
        const backdrop = document.createElement('div');
        backdrop.id = 'gobo-b2b-backdrop';
        backdrop.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.35); z-index:2147483646;';
        // Container
        const container = document.createElement('div');
        container.id = 'gobo-b2b-modal';
        container.setAttribute('role','dialog');
        container.setAttribute('aria-modal','true');
        container.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:70vw; max-width:1000px; height:70vh; max-height:800px; background:#fff; border-radius:10px; box-shadow:0 10px 25px rgba(0,0,0,0.35); display:flex; flex-direction:column; overflow:hidden; z-index:2147483647;';
        // Header (reuse title format – pull from existing breadcrumb first node text)
        const header = document.createElement('div');
        header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#0d3b66; color:#fff; font-weight:600; font-size:14px;';
        const titleSpan = document.createElement('span');
        // Derive title: use currently active tab label or fallback to 'All Offers'
        let titleText = 'All Offers';
        try {
            const activeTab = document.querySelector('.profile-tab.active .profile-tab-label');
            if (activeTab && activeTab.textContent.trim()) titleText = activeTab.textContent.trim();
        } catch(e) { /* ignore */ }
        titleSpan.textContent = titleText + ' – Back-to-Back Search';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '✖';
        closeBtn.style.cssText = 'background:transparent; border:none; color:#fff; font-size:16px; cursor:pointer; padding:4px; line-height:1;';
        closeBtn.addEventListener('click', () => this.closeBackToBackModal());
        header.appendChild(titleSpan);
        header.appendChild(closeBtn);
        // Content
        const content = document.createElement('div');
        content.style.cssText = 'flex:1; overflow:auto; padding:12px; font-size:12px; display:flex; flex-direction:column; gap:12px;';
        content.innerHTML = `
            <div style="font-size:13px; font-weight:600;">Back-to-Back Search</div>
            <div style="font-size:11px; color:#444;">(Placeholder) Use this space to implement multi-offer or sequential sailing search logic. Close when done.</div>
            <form id="b2b-form" style="display:flex; flex-direction:column; gap:8px; max-width:480px;">
                <label style="display:flex; flex-direction:column; font-size:11px; gap:4px;">
                    Offer Code(s)
                    <input type="text" name="codes" placeholder="e.g. ABC123, DEF456" style="border:1px solid #bbb; padding:4px 6px; border-radius:4px; font-size:12px;" />
                </label>
                <label style="display:flex; flex-direction:column; font-size:11px; gap:4px;">
                    Earliest Sail Date
                    <input type="date" name="start" style="border:1px solid #bbb; padding:4px 6px; border-radius:4px; font-size:12px;" />
                </label>
                <label style="display:flex; flex-direction:column; font-size:11px; gap:4px;">
                    Latest Sail Date
                    <input type="date" name="end" style="border:1px solid #bbb; padding:4px 6px; border-radius:4px; font-size:12px;" />
                </label>
                <div style="display:flex; gap:8px;">
                    <button type="submit" style="background:#0d3b66; color:#fff; border:none; padding:6px 12px; font-size:12px; border-radius:4px; cursor:pointer;">Search</button>
                    <button type="button" id="b2b-cancel" style="background:#aaa; color:#fff; border:none; padding:6px 12px; font-size:12px; border-radius:4px; cursor:pointer;">Cancel</button>
                </div>
            </form>
        `;
        content.querySelector('#b2b-cancel').addEventListener('click', () => this.closeBackToBackModal());
        content.querySelector('#b2b-form').addEventListener('submit', (e) => {
            e.preventDefault();
            // Placeholder: In a future iteration we can implement real search logic.
            try { App.Spinner.showSpinner(); setTimeout(() => App.Spinner.hideSpinner(), 800); } catch(e){/* ignore */}
        });
        // Footer (optional)
        const footer = document.createElement('div');
        footer.style.cssText = 'padding:6px 10px; background:#f5f5f5; border-top:1px solid #ddd; text-align:right; font-size:10px;';
        footer.textContent = 'Back-to-Back Search Utility';
        container.appendChild(header);
        container.appendChild(content);
        container.appendChild(footer);
        // Append backdrop then container (after primary so appears above)
        document.body.appendChild(backdrop);
        document.body.appendChild(container);
        backdrop.addEventListener('click', () => this.closeBackToBackModal());
        // Esc handling for secondary modal only
        this._b2bEscHandler = (evt) => { if (evt.key === 'Escape') this.closeBackToBackModal(); };
        document.addEventListener('keydown', this._b2bEscHandler);
    },
    closeBackToBackModal() {
        const modal = document.getElementById('gobo-b2b-modal');
        const backdrop = document.getElementById('gobo-b2b-backdrop');
        if (modal) modal.remove();
        if (backdrop) backdrop.remove();
        if (this._b2bEscHandler) {
            document.removeEventListener('keydown', this._b2bEscHandler);
            this._b2bEscHandler = null;
        }
    },
};