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
        // Point to Ko-fi as requested
        coffeeButton.href = 'https://ko-fi.com/percex';
        coffeeButton.target = '_blank';
        coffeeButton.rel = 'noopener noreferrer';
        // Use an emoji + text rather than an external image; sizing and layout handled via CSS
        coffeeButton.setAttribute('aria-label', 'Buy me a coffee (opens in new tab)');
        coffeeButton.innerHTML = '<span class="coffee-emoji" aria-hidden="true">☕️</span><span class="buy-coffee-text">Buy me a coffee</span>';

        // Create Venmo circular button placed between coffee and what's new
        const venmoButton = document.createElement('a');
        venmoButton.className = 'venmo-link';
        venmoButton.href = 'https://venmo.com/percex';
        venmoButton.target = '_blank';
        venmoButton.rel = 'noopener noreferrer';
        venmoButton.setAttribute('aria-label', 'Venmo (opens in new tab)');
        // Inline styles adjusted: 24px circle, no padding so image can fill it
        venmoButton.style.cssText = 'display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:50%; overflow:hidden; border:1px solid #ddd; box-sizing:border-box;';
        const venmoImg = document.createElement('img');
        // Prefer extension-safe URL if available, fallback to relative path
        try {
            venmoImg.src = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('images/venmo.png') : 'images/venmo.png';
        } catch(e) {
            venmoImg.src = 'images/venmo.png';
        }
        venmoImg.alt = 'Venmo';
        // Make the image fill the circular container
        venmoImg.style.cssText = 'width:100%; height:100%; object-fit:cover; display:block;';
        venmoButton.appendChild(venmoImg);

        // Restructure footer into three groups: left (coffee + whats new), center (export), right (close)
        footerContainer.style.display = 'grid';
        footerContainer.style.gridTemplateColumns = '1fr auto 1fr';
        footerContainer.style.alignItems = 'center';
        footerContainer.style.columnGap = '12px';
        const footerLeft = document.createElement('div'); footerLeft.id = 'gobo-footer-left'; footerLeft.style.cssText = 'display:flex; align-items:center; gap:8px; justify-self:start;';
        const footerCenter = document.createElement('div'); footerCenter.id = 'gobo-footer-center'; footerCenter.style.cssText = 'display:flex; justify-content:center; align-items:center;';
        const footerRight = document.createElement('div'); footerRight.id = 'gobo-footer-right'; footerRight.style.cssText = 'display:flex; justify-content:flex-end; align-items:center; justify-self:end;';
        const separator = document.createElement('span');
        separator.className = 'footer-separator';
        separator.textContent = '|';
        separator.setAttribute('aria-hidden', 'true');
        separator.style.cssText = 'color:#888; margin:0 2px; font-size:24px; align-self:center;';

        footerLeft.appendChild(coffeeButton);
        footerLeft.appendChild(separator);
        footerLeft.appendChild(venmoButton);
        footerCenter.appendChild(exportButton);
        footerRight.appendChild(closeButton);
        // Append groups in order
        footerContainer.innerHTML = '';
        footerContainer.appendChild(footerLeft);
        footerContainer.appendChild(footerCenter);
        footerContainer.appendChild(footerRight);
        // Fallback: if What's New button already exists (in breadcrumb), relocate it now
        try {
            const existingWn = document.getElementById('gobo-whatsnew-btn');
            if (existingWn) footerLeft.appendChild(existingWn);
        } catch(e) { /* ignore */ }

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
        copyright.style.cssText = 'text-align: right; font-size: 10px; color: #bbb; margin-right: 0;';
        copyright.textContent = '\u00a9 2025 Percex Technologies, LLC';

        // Support link (Facebook)
        const supportLink = document.createElement('a');
        supportLink.className = 'support-link';
        supportLink.href = 'https://www.facebook.com/people/Percex-Technologies/61573755056279/';
        supportLink.target = '_blank';
        supportLink.rel = 'noopener noreferrer';
        supportLink.setAttribute('aria-label','Get support on Facebook (opens in new tab)');
        // Prefer web accessible resource URL
        let fbIconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('images/facebook.png') : 'images/facebook.png';
        supportLink.innerHTML = '<img src="'+fbIconUrl+'" alt="Facebook" class="support-link-icon" /> <span>Get Support</span>';

        // Wrap copyright + support into right meta container
        const rightMeta = document.createElement('div');
        rightMeta.style.cssText = 'display:flex; align-items:center; gap:10px;';
        rightMeta.appendChild(copyright);
        rightMeta.appendChild(supportLink);

        legendCopyrightWrapper.appendChild(legend);
        legendCopyrightWrapper.appendChild(rightMeta);
        container.appendChild(legendCopyrightWrapper);

        document.body.appendChild(backdrop);
        document.body.appendChild(container);

        // --- Session disappearance watcher ---
        // Poll every 2 seconds for session presence
        const sessionCheckInterval = setInterval(() => {
            try {
                // If session is missing or empty, close the modal
                const sessionRaw = localStorage.getItem('persist:session');
                if (!sessionRaw) {
                    this.closeModal(container, backdrop, overlappingElements);
                    clearInterval(sessionCheckInterval);
                }
            } catch (e) {
                // On error, also close modal for safety
                this.closeModal(container, backdrop, overlappingElements);
                clearInterval(sessionCheckInterval);
            }
        }, 2000);
        // Store interval id for cleanup
        this._sessionCheckInterval = sessionCheckInterval;
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
        if (this._sessionCheckInterval) {
            clearInterval(this._sessionCheckInterval);
            this._sessionCheckInterval = null;
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
        let usedSubset = false;
        const activeKey = state.selectedProfileKey;

        // Helper: shorten profile key or email to base name
        function shorten(value) {
            if (!value) return '';
            let base = value;
            if (base.startsWith('gobo-')) base = base.slice(5);
            let cut = base.indexOf('_');
            const at = base.indexOf('@');
            if (cut === -1 || (at !== -1 && at < cut)) cut = at;
            if (cut > -1) base = base.slice(0, cut);
            return base;
        }
        // Helper: build combined names label
        function combinedLabel() {
            try {
                const raw = (typeof goboStorageGet === 'function' ? goboStorageGet('goboLinkedAccounts') : localStorage.getItem('goboLinkedAccounts'));
                if (!raw) return 'Combined';
                const linked = JSON.parse(raw) || [];
                const names = linked.slice(0,2).map(acc => shorten(acc.key) || shorten(acc.email)).filter(Boolean);
                if (names.length === 2) return `${names[0]} + ${names[1]}`;
                if (names.length === 1) return names[0];
                return 'Combined';
            } catch(e){ return 'Combined'; }
        }
        // Reverse map profileId -> key for favorites mapping
        const reverseProfileMap = {}; try { if (App && App.ProfileIdMap) { Object.entries(App.ProfileIdMap).forEach(([k,v]) => reverseProfileMap[v] = k); } } catch(e){}

        // Subset if accordion path active
        if (state.viewMode === 'accordion' && Array.isArray(state.groupKeysStack) && state.groupKeysStack.length > 0) {
            let subset = state.sortedOffers || [];
            for (let depth = 0; depth < state.groupKeysStack.length && depth < state.groupingStack.length; depth++) {
                const colKey = state.groupingStack[depth];
                const groupVal = state.groupKeysStack[depth];
                const grouped = App.AccordionBuilder.createGroupedData(subset, colKey);
                subset = grouped[groupVal] || [];
                if (!subset.length) break;
            }
            if (subset.length) { rows = subset; usedSubset = true; }
        }
        if (rows.length === 0) rows = state.sortedOffers || [];

        // Prepare headers (override first to 'Profile')
        const csvHeaders = headers.map(h => h.label);
        if (csvHeaders.length) csvHeaders[0] = 'Profile';

        // Pre-calculate static label for non-favorites non-combined tabs
        const staticProfileLabel = (activeKey && /^gobo-/.test(activeKey)) ? shorten(activeKey) : (activeKey === 'goob-combined-linked' ? combinedLabel() : null);
        const combinedStatic = activeKey === 'goob-combined-linked' ? staticProfileLabel : null;

        function labelForFavoriteRow(offer, sailing) {
            let pid = (sailing && sailing.__profileId != null) ? sailing.__profileId : (offer && offer.__favoriteMeta && offer.__favoriteMeta.profileId != null ? offer.__favoriteMeta.profileId : null);
            // Handle legacy 'C' marker and joined numeric profile IDs like '3-4'
            if (pid === 'C') return combinedLabel();
            if (typeof pid === 'string' && pid.indexOf('-') !== -1) {
                // Combined favorites were stored with joined profile IDs (e.g. '3-4'); treat as combined
                return combinedLabel();
            }
            if (pid == null) return '';
            // Map numeric/string pid to key
            let key = reverseProfileMap[pid];
            if (!key) {
                try {
                    const n = parseInt(String(pid),10);
                    if (!isNaN(n)) key = reverseProfileMap[n];
                } catch(e){}
            }
            if (!key) return String(pid);
            return shorten(key);
        }

        const csvRows = rows.map(({ offer, sailing }) => {
            // Determine profile label per row
            let profileLabel;
            if (activeKey === 'goob-favorites') {
                profileLabel = labelForFavoriteRow(offer, sailing) || 'Favorites';
            } else if (activeKey === 'goob-combined-linked') {
                profileLabel = combinedStatic;
            } else if (staticProfileLabel) {
                profileLabel = staticProfileLabel;
            } else {
                profileLabel = 'Profile';
            }
            const itinerary = sailing.itineraryDescription || sailing.sailingType?.name || '-';
            const parsed = App.Utils.parseItinerary(itinerary);
            const nights = parsed.nights;
            const destination = parsed.destination;
            const perksStr = App.Utils.computePerks(offer, sailing);
            const shipClass = App.Utils.getShipClass(sailing.shipName);
            return [
                profileLabel,
                offer.campaignOffer?.offerCode || '-',
                offer.campaignOffer?.startDate ? App.Utils.formatDate(offer.campaignOffer.startDate) : '-',
                offer.campaignOffer?.reserveByDate ? App.Utils.formatDate(offer.campaignOffer.reserveByDate) : '-',
                (function(){ const t = offer.campaignOffer?.tradeInValue; if (t === null || t === undefined || t === '') return '-'; if (typeof t === 'number') return Number.isInteger(t) ? `$${t.toLocaleString()}` : `$${t.toFixed(2)}`; const cleaned = String(t).replace(/[^0-9.\-]/g, ''); const parsed = cleaned === '' ? NaN : parseFloat(cleaned); if (!isNaN(parsed)) return Number.isInteger(parsed) ? `$${parsed.toLocaleString()}` : `$${parsed.toFixed(2)}`; return String(t); })(),
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

        if (usedSubset) {
            const parts = ['All Offers'];
            for (let i = 0; i < state.groupKeysStack.length && i < state.groupingStack.length; i++) {
                const colKey = state.groupingStack[i];
                const label = (state.headers.find(h => h.key === colKey)?.label) || colKey;
                const val = state.groupKeysStack[i];
                parts.push(label, val);
            }
            csvContent += '\r\n\r\n' + 'Filters: ' + parts.join(' -> ');
        }

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'offers.csv';
        document.body.appendChild(a); a.click();
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
            <div style="font-size:24px; color:#444;">(Placeholder) COMING SOON for multi-offer or sequential sailing search logic. Check back soon!</div>
            <form id="b2b-form" style="display:flex; flex-direction:column; gap:8px; max-width:480px;">
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