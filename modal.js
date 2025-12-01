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
        exportButton.textContent = 'CSV Export';
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

        // Prepare Buy Me a Coffee and Venmo links (they will be moved into the Donate panel)
        const coffeeButton = document.createElement('a');
        coffeeButton.className = 'buy-coffee-link';
        coffeeButton.href = 'https://ko-fi.com/percex';
        coffeeButton.target = '_blank';
        coffeeButton.rel = 'noopener noreferrer';
        coffeeButton.setAttribute('aria-label', 'Buy me a coffee (opens in new tab)');
        coffeeButton.innerHTML = '<span class="coffee-emoji" aria-hidden="true">☕️</span><span class="buy-coffee-text">Buy me a coffee</span>';

        const venmoButton = document.createElement('a');
        venmoButton.className = 'venmo-link';
        venmoButton.href = 'https://venmo.com/percex';
        venmoButton.target = '_blank';
        venmoButton.rel = 'noopener noreferrer';
        venmoButton.setAttribute('aria-label', 'Venmo (opens in new tab)');
        venmoButton.style.cssText = 'display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:50%; overflow:hidden; border:1px solid #ddd; box-sizing:border-box;';
        const venmoImg = document.createElement('img');
        try {
            venmoImg.src = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('images/venmo.png') : 'images/venmo.png';
        } catch(e) {
            venmoImg.src = 'images/venmo.png';
        }
        venmoImg.alt = 'Venmo';
        venmoImg.style.cssText = 'width:100%; height:100%; object-fit:contain; display:block;';
        venmoButton.appendChild(venmoImg);

    // Restructure footer into a single clean row: Donate, What's New, Export, Close
    // Force a single-row layout (no wrap) via inline styles with !important so stylesheet !important rules can't override
        try {
        footerContainer.style.setProperty('display', 'flex', 'important');
        footerContainer.style.setProperty('flex-wrap', 'nowrap', 'important');
        footerContainer.style.setProperty('flex-direction', 'row', 'important');
        footerContainer.style.setProperty('align-items', 'center', 'important');
        // Center the footer buttons horizontally
        footerContainer.style.setProperty('justify-content', 'center', 'important');
        // Slightly tighter gap between buttons
        footerContainer.style.setProperty('gap', '8px', 'important');
        // Full width so centering is predictable
        footerContainer.style.setProperty('width', '100%', 'important');
    } catch (e) {
        footerContainer.style.display = 'flex';
        footerContainer.style.flexWrap = 'nowrap';
        footerContainer.style.flexDirection = 'row';
        footerContainer.style.alignItems = 'center';
        footerContainer.style.justifyContent = 'center';
        footerContainer.style.gap = '8px';
        footerContainer.style.width = '100%';
    }

        // Donate button will toggle a small inline panel containing the coffee + venmo links
        const donateButton = document.createElement('button');
        donateButton.className = 'donate-button';
        donateButton.type = 'button';
        // Default the donate button to collapsed; the panel opens only on user click
        donateButton.setAttribute('aria-expanded', 'false');
        donateButton.textContent = 'Tip';
        donateButton.style.position = 'relative';

        const donatePanel = document.createElement('div');
        donatePanel.className = 'donate-panel';
        // Hidden by default; positioned above the donate button
        // Center the panel horizontally above the Donate button to avoid off-screen placement
        // The stylesheet controls display; keep positioning/visuals here. Use top instead of bottom
        donatePanel.style.cssText = 'position:absolute; left:50%; transform:translateX(-50%); background:#fff; border:1px solid #e5e7eb; padding:8px; border-radius:6px; box-shadow:0 6px 18px rgba(0,0,0,0.12); z-index:2147483650; min-width:180px;';
        // Build fresh panel-specific links (avoid reusing elements that may be styled for footer placement)
        const panelList = document.createElement('div');
        panelList.style.cssText = 'display:flex; flex-direction:column; gap:8px;';
        // Coffee link for panel
        const panelCoffee = document.createElement('a');
        panelCoffee.className = 'buy-coffee-link donate-panel-link';
        panelCoffee.href = coffeeButton.href;
        panelCoffee.target = '_blank';
        panelCoffee.rel = 'noopener noreferrer';
        panelCoffee.setAttribute('aria-label', coffeeButton.getAttribute('aria-label') || 'Buy me a coffee');
        panelCoffee.innerHTML = '<span class="coffee-emoji" aria-hidden="true">☕️</span><span class="buy-coffee-text">Buy me a coffee</span>';
        panelList.appendChild(panelCoffee);
        // small visual separator between links
        const smallSep = document.createElement('div'); smallSep.style.cssText = 'height:1px; background:#f0f0f0; margin:4px 0;';
        panelList.appendChild(smallSep);
        // Venmo link for panel (fresh element)
        const panelVenmo = document.createElement('a');
        panelVenmo.className = 'venmo-link donate-panel-link';
        panelVenmo.href = venmoButton.href;
        panelVenmo.target = '_blank';
        panelVenmo.rel = 'noopener noreferrer';
        panelVenmo.setAttribute('aria-label', venmoButton.getAttribute('aria-label') || 'Venmo');
        // build image
        const panelVenmoImg = document.createElement('img');
        try {
            panelVenmoImg.src = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('images/venmo.png') : 'images/venmo.png';
        } catch(e) { panelVenmoImg.src = 'images/venmo.png'; }
        panelVenmoImg.alt = 'Venmo';
        panelVenmoImg.style.cssText = 'width:24px; height:24px; object-fit:contain; display:block; margin-right:8px;';
        panelVenmo.appendChild(panelVenmoImg);
        const panelVenmoLabel = document.createElement('span'); panelVenmoLabel.className = 'venmo-text'; panelVenmoLabel.textContent = 'Venmo'; panelVenmoLabel.style.cssText = 'font-weight:600; font-size:13px;';
        panelVenmo.appendChild(panelVenmoLabel);
        panelList.appendChild(panelVenmo);
        donatePanel.appendChild(panelList);
        // Append panel to modal container (not inside the footer) so footer-scoped CSS doesn't hide or alter panel children
        container.appendChild(donatePanel);

        // Toggle behavior
        let _donateOutsideClickHandler = null;
        function openDonatePanel() {
            // show the panel then position it centered above the donate button relative to the modal container
            donatePanel.style.display = 'block';
            donateButton.setAttribute('aria-expanded', 'true');
            try {
                const btnRect = donateButton.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                // compute center x relative to container
                const centerX = (btnRect.left + btnRect.right) / 2 - containerRect.left;
                // temporarily ensure panel is visible to measure
                donatePanel.style.left = '0px';
                donatePanel.style.transform = 'translateX(-50%)';
                // measure panel width
                const panelRect = donatePanel.getBoundingClientRect();
                const panelWidth = panelRect.width || donatePanel.offsetWidth || 200;
                // compute left to center the panel at centerX, but keep within container bounds
                let left = centerX - (panelWidth / 2);
                const minLeft = 8;
                const maxLeft = Math.max(8, containerRect.width - panelWidth - 8);
                if (left < minLeft) left = minLeft;
                if (left > maxLeft) left = maxLeft;
                donatePanel.style.left = left + 'px';
                // compute top so the panel sits above the donate button; if not enough space, place below
                const panelHeight = panelRect.height || donatePanel.offsetHeight || 150;
                let top = btnRect.top - containerRect.top - panelHeight - 8; // 8px gap
                const minTop = 8;
                if (top < minTop) {
                    // not enough room above — place below the button instead
                    top = btnRect.bottom - containerRect.top + 8;
                }
                donatePanel.style.top = top + 'px';
                // clear bottom if present
                donatePanel.style.bottom = '';
                donatePanel.style.transform = 'none';
            } catch (e) {
                // fallback: center above donate button using percent transform
                donatePanel.style.left = '50%';
                donatePanel.style.transform = 'translateX(-50%)';
            }
            // close when clicking outside
            _donateOutsideClickHandler = function(ev) {
                if (!donatePanel.contains(ev.target) && !donateButton.contains(ev.target)) {
                    closeDonatePanel();
                }
            };
            setTimeout(() => document.addEventListener('click', _donateOutsideClickHandler));
        }
        function closeDonatePanel() {
            donatePanel.style.display = 'none';
            donateButton.setAttribute('aria-expanded', 'false');
            if (_donateOutsideClickHandler) {
                document.removeEventListener('click', _donateOutsideClickHandler);
                _donateOutsideClickHandler = null;
            }
        }
    donateButton.addEventListener('click', (e) => { e.stopPropagation(); if (donatePanel.style.display === 'block') closeDonatePanel(); else openDonatePanel(); });
    // Do not auto-open the donate panel; it will open on user click via the handler above

        // Append in desired order: Donate, What's New, Export, Close
        footerContainer.innerHTML = '';
        footerContainer.appendChild(donateButton);

        // Ensure a single authoritative What's New button exists and is placed here (modal-driven)
        let wnBtn = document.getElementById('gobo-whatsnew-btn');
        if (!wnBtn) {
            // Create a footer-local What's New button so ordering is guaranteed
                try {
                wnBtn = document.createElement('button');
                wnBtn.id = 'gobo-whatsnew-btn';
                wnBtn.type = 'button';
                wnBtn.textContent = "What's New";
                // Use same visual language as other footer action buttons
                wnBtn.className = 'whatsnew-btn';
                wnBtn.setAttribute('aria-label', "What's New");
                wnBtn.addEventListener('click', () => {
                    try { if (window.WhatsNew) WhatsNew.start(true); } catch (e) {}
                });
            } catch (e) {
                wnBtn = null;
            }
                } else {
            // Normalize an existing button and remove it from any current parent so we can reinsert it here
            try {
                if (wnBtn.parentElement) wnBtn.parentElement.removeChild(wnBtn);
                // Apply consistent footer button sizing/typography
                wnBtn.style.setProperty('display', 'inline-flex', 'important');
                wnBtn.style.setProperty('align-items', 'center', 'important');
                wnBtn.style.setProperty('justify-content', 'center', 'important');
                wnBtn.style.setProperty('margin-left', '8px', 'important');
                wnBtn.style.setProperty('padding', wnBtn.style.padding ? wnBtn.style.padding : '8px 12px', 'important');
                wnBtn.style.setProperty('font-size', '13px', 'important');
                wnBtn.style.setProperty('font-weight', '600', 'important');
                wnBtn.style.setProperty('line-height', '1', 'important');
                wnBtn.style.setProperty('min-height', '36px', 'important');
                wnBtn.style.setProperty('border-radius', wnBtn.style.borderRadius ? wnBtn.style.borderRadius : '6px', 'important');
                if (!wnBtn.getAttribute('aria-label')) wnBtn.setAttribute('aria-label', "What's New");
            } catch(e) {/* ignore */}
        }
        if (wnBtn) footerContainer.appendChild(wnBtn);

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
        // Keep a ref so closeModal can remove donate-panel outside click listener if active
        this._donatePanelCloseHandler = function() {
            try { if (typeof _donateOutsideClickHandler === 'function') { document.removeEventListener('click', _donateOutsideClickHandler); } } catch(e){}
        };
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
        if (this._sessionCheckInterval) {
            clearInterval(this._sessionCheckInterval);
            this._sessionCheckInterval = null;
        }
        // Cleanup donate outside-click handler if still attached
        try {
            if (this._donatePanelCloseHandler) { this._donatePanelCloseHandler(); this._donatePanelCloseHandler = null; }
        } catch(e) {}
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
            // Strip brand prefix (R- or C-) if present in branded keys
            if ((base.startsWith('R-')) || (base.startsWith('C-'))) base = base.slice(2);
            // For emails, cut at first '_' unless '@' appears earlier; for keys, cut at first '_' or '@'
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
            // Only include chain ID when exporting the Favorites tab; otherwise use numeric child-count depth
            const includeChainId = activeKey === 'goob-favorites';
            const b2bDepth = (includeChainId && sailing && sailing.__b2bChainId) ? String(sailing.__b2bChainId) : ((sailing && typeof sailing.__b2bDepth === 'number') ? Math.max(0, Number(sailing.__b2bDepth) - 1) : '');
            return [
                profileLabel,
                b2bDepth,
                offer.campaignOffer?.offerCode || '-',
                offer.campaignOffer?.startDate ? App.Utils.formatDate(offer.campaignOffer.startDate) : '-',
                offer.campaignOffer?.reserveByDate ? App.Utils.formatDate(offer.campaignOffer.reserveByDate) : '-',
                (function(){ const t = offer.campaignOffer?.tradeInValue; if (t === null || t === undefined || t === '') return '-'; if (typeof t === 'number') return Number.isInteger(t) ? `$${t.toLocaleString()}` : `$${t.toFixed(2)}`; const cleaned = String(t).replace(/[^0-9.\-]/g, ''); const parsed = cleaned === '' ? NaN : parseFloat(cleaned); if (!isNaN(parsed)) return Number.isInteger(parsed) ? `$${parsed.toLocaleString()}` : `$${parsed.toFixed(2)}`; return String(t); })(),
                (function(){ try { const raw = (App && App.Utils && App.Utils.computeOfferValue) ? App.Utils.computeOfferValue(offer, sailing) : (Utils.computeOfferValue ? Utils.computeOfferValue(offer, sailing) : null); return (App && App.Utils && App.Utils.formatOfferValue) ? App.Utils.formatOfferValue(raw) : (raw!=null?`$${Number(raw).toFixed(2)}`:'-'); } catch(e){ return '-'; } })(),
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
};