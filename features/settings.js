const Settings = {
    ensureState(state) {
        if (!state.settings) state.settings = {};
        return state;
    },
    buildGearButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'gobo-settings-gear';
        btn.title = 'Settings';
        btn.className = 'gobo-settings-gear';
        btn.textContent = '⚙️';
        btn.style.cssText = 'font-size:16px; padding:6px 8px; margin-left:8px; border-radius:6px;';
        btn.addEventListener('click', (e) => {
            try {
                Settings.openSettingsModal();
            } catch (err) { console.warn('Settings open failed', err); }
        });
        return btn;
    },
    openSettingsModal() {
        try {
            // Create overlay/backdrop using B2B overlay pattern so modal centers
            const overlay = document.createElement('div');
            overlay.className = 'b2b-visualizer-overlay';
            overlay.id = 'gobo-settings-modal';
            const backdrop = Modal.createBackdrop();
            // Build modal using the B2B modal classes so the header spans full width
            const modal = document.createElement('div');
            modal.className = 'b2b-visualizer-modal';

            // Header: match the Back-to-Back Builder title bar styling for consistency
            const header = document.createElement('div');
            header.className = 'b2b-visualizer-header';
            const headText = document.createElement('div');
            const title = document.createElement('h2');
            title.className = 'b2b-visualizer-title';
            title.textContent = 'Settings';
            const subtitle = document.createElement('p');
            subtitle.className = 'b2b-visualizer-subtitle';
            subtitle.textContent = 'Configure display and filter behavior for the offers table.';
            headText.appendChild(title);
            headText.appendChild(subtitle);
            const closeBtnHeader = document.createElement('button');
            closeBtnHeader.className = 'b2b-visualizer-close';
            closeBtnHeader.setAttribute('aria-label', 'Close Settings');
            closeBtnHeader.innerHTML = '&times;';
            closeBtnHeader.addEventListener('click', () => Modal.closeModal(overlay, backdrop, []));
            header.appendChild(headText);
            header.appendChild(closeBtnHeader);
            modal.appendChild(header);

            // Body: single-column variant of the B2B body so content lays out nicely
            const body = document.createElement('div');
            body.className = 'b2b-visualizer-body gobo-settings-body';
            body.style.gridTemplateColumns = '1fr';
            body.style.padding = '20px 28px';
            body.style.maxHeight = '70vh';
            body.style.overflow = 'auto';

            // Include 
            // `Side-by-Sides setting
            // --- Auto-run Back-to-Back Calculations setting ---
            let settingsStore = {};
            try { settingsStore = (window.App && App.SettingsStore) ? App.SettingsStore.getSettings() : {}; } catch(e) { settingsStore = {}; }
            const autoRunDefault = (window.App && App.SettingsStore) ? App.SettingsStore.getAutoRunB2B() : (settingsStore.autoRunB2B !== undefined ? !!settingsStore.autoRunB2B : true);
            const autoArea = document.createElement('div');
            autoArea.className = 'gobo-setting-area';
            autoArea.style.cssText = 'margin-bottom:12px;';
            const autoLabel = document.createElement('label'); autoLabel.style.cssText = 'display:flex; align-items:center; gap:8px;';
            const autoCb = document.createElement('input'); autoCb.type = 'checkbox'; autoCb.id = 'gobo-setting-b2b-auto'; autoCb.checked = autoRunDefault;
            autoCb.addEventListener('change', () => {
                try {
                    const val = !!autoCb.checked;
                    try { if (window.App && App.SettingsStore && typeof App.SettingsStore.setAutoRunB2B === 'function') App.SettingsStore.setAutoRunB2B(val); else {
                        settingsStore.autoRunB2B = val;
                        if (typeof goboStorageSet === 'function') goboStorageSet('goboSettings', JSON.stringify(settingsStore)); else localStorage.setItem('goboSettings', JSON.stringify(settingsStore));
                        if (window.App) App.BackToBackAutoRun = val;
                    } } catch(e){}
                } catch(e){}
            });
            const autoTitle = document.createElement('strong'); autoTitle.textContent = 'Auto-run Back-to-Back Builder Calculations';
            autoLabel.appendChild(autoCb); autoLabel.appendChild(autoTitle);
            const autoDesc = document.createElement('div'); autoDesc.className = 'gobo-setting-desc'; autoDesc.style.cssText = 'font-size:12px; margin-left:28px;';
            autoDesc.textContent = 'When enabled, the extension will automatically compute back-to-back sailing chains for the Back-to-Back Builder. Disable this to avoid expensive calculations on large datasets.';
            autoArea.appendChild(autoLabel); autoArea.appendChild(autoDesc);
            body.appendChild(autoArea);
            const sbsArea = document.createElement('div');
            sbsArea.className = 'gobo-setting-area';
            sbsArea.style.cssText = 'margin-bottom:12px;';
            const sbsLabel = document.createElement('label'); sbsLabel.style.cssText = 'display:flex; align-items:center; gap:8px;';
            const sbsCb = document.createElement('input'); sbsCb.type = 'checkbox'; sbsCb.id = 'gobo-setting-sbs';
            try { sbsCb.checked = (App && App.SettingsStore && typeof App.SettingsStore.getIncludeSideBySide === 'function') ? App.SettingsStore.getIncludeSideBySide() : ((App && App.TableRenderer && typeof App.TableRenderer.getSideBySidePreference === 'function') ? App.TableRenderer.getSideBySidePreference() : true); } catch(e){ sbsCb.checked = true; }
            sbsCb.addEventListener('change', () => {
                try {
                    const v = !!sbsCb.checked;
                    if (App && App.SettingsStore && typeof App.SettingsStore.setIncludeSideBySide === 'function') App.SettingsStore.setIncludeSideBySide(v);
                    else if (App && App.TableRenderer && typeof App.TableRenderer.setSideBySidePreference === 'function') App.TableRenderer.setSideBySidePreference(v);
                } catch(e){}
            });
            const sbsTitle = document.createElement('strong'); sbsTitle.textContent = 'Include Side-by-Sides';
            sbsLabel.appendChild(sbsCb); sbsLabel.appendChild(sbsTitle);
            const sbsDesc = document.createElement('div'); sbsDesc.className = 'gobo-setting-desc'; sbsDesc.style.cssText = 'font-size:12px; margin-left:28px;';
            sbsDesc.textContent = 'When enabled, side-by-side offers (combined or comparison rows) are included in Back-to-Back Builder calculations. Disable to hide those rows from view.';
            sbsArea.appendChild(sbsLabel); sbsArea.appendChild(sbsDesc);
            body.appendChild(sbsArea);

            // Include Taxes & Fees in Price Filters setting
            const tAndFArea = document.createElement('div');
            tAndFArea.className = 'gobo-setting-area';
            tAndFArea.style.cssText = 'margin-bottom:12px;';
            const tAndFLabel = document.createElement('label'); tAndFLabel.style.cssText = 'display:flex; align-items:center; gap:8px;';
            const tAndFCb = document.createElement('input'); tAndFCb.type = 'checkbox'; tAndFCb.id = 'gobo-setting-tandf';
            try { tAndFCb.checked = (App && App.SettingsStore && typeof App.SettingsStore.getIncludeTaxesAndFeesInPriceFilters === 'function') ? App.SettingsStore.getIncludeTaxesAndFeesInPriceFilters() : ((App && App.AdvancedSearch && App.AdvancedSearch.ensureState) ? (App.AdvancedSearch.ensureState(App.AdvancedSearch._lastState) && App.AdvancedSearch._lastState && App.AdvancedSearch._lastState.advancedSearch && App.AdvancedSearch._lastState.advancedSearch.includeTaxesAndFeesInPriceFilters !== false) : true); } catch(e){ tAndFCb.checked = true; }
            tAndFCb.addEventListener('change', () => {
                try {
                    const v = !!tAndFCb.checked;
                    if (App && App.SettingsStore && typeof App.SettingsStore.setIncludeTaxesAndFeesInPriceFilters === 'function') {
                        App.SettingsStore.setIncludeTaxesAndFeesInPriceFilters(v);
                    }
                    // Update the live AdvancedSearch state if available
                    const state = App && App.AdvancedSearch && App.AdvancedSearch._lastState ? App.AdvancedSearch._lastState : null;
                    if (state && state.advancedSearch) {
                        state.advancedSearch.includeTaxesAndFeesInPriceFilters = v;
                        try { App.AdvancedSearch.debouncedPersist(state); } catch(e){}
                        try { App.AdvancedSearch.lightRefresh(state, { showSpinner: true }); } catch(e){}
                    }
                } catch(e){}
            });
            const tAndFTitle = document.createElement('strong'); tAndFTitle.textContent = 'Include Taxes & Fees in Price Filters';
            tAndFLabel.appendChild(tAndFCb); tAndFLabel.appendChild(tAndFTitle);
            const tAndFDesc = document.createElement('div'); tAndFDesc.className = 'gobo-setting-desc'; tAndFDesc.style.cssText = 'font-size:12px; margin-left:28px;';
            tAndFDesc.textContent = 'If enabled, price-based filters will include Taxes & Fees when calculating matches and suggestions. Disable to use base prices only.';
            tAndFArea.appendChild(tAndFLabel); tAndFArea.appendChild(tAndFDesc);
            body.appendChild(tAndFArea);

            // Solo Booking setting
            const soloArea = document.createElement('div');
            soloArea.className = 'gobo-setting-area';
            soloArea.style.cssText = 'margin-bottom:12px;';
            const soloLabel = document.createElement('label'); soloLabel.style.cssText = 'display:flex; align-items:center; gap:8px;';
            const soloCb = document.createElement('input'); soloCb.type = 'checkbox'; soloCb.id = 'gobo-setting-solo';
            try { soloCb.checked = (App && App.SettingsStore && typeof App.SettingsStore.getSoloBooking === 'function') ? App.SettingsStore.getSoloBooking() : ((settingsStore.soloBooking !== undefined) ? !!settingsStore.soloBooking : false); } catch(e){ soloCb.checked = false; }
            soloCb.addEventListener('change', () => {
                try {
                    const v = !!soloCb.checked;
                    if (App && App.SettingsStore && typeof App.SettingsStore.setSoloBooking === 'function') {
                        App.SettingsStore.setSoloBooking(v);
                    } else {
                        settingsStore.soloBooking = v;
                        if (typeof goboStorageSet === 'function') goboStorageSet('goboSettings', JSON.stringify(settingsStore)); else localStorage.setItem('goboSettings', JSON.stringify(settingsStore));
                    }
                    try { if (typeof ItineraryCache !== 'undefined' && ItineraryCache && typeof ItineraryCache.computeAllDerivedPricing === 'function') ItineraryCache.computeAllDerivedPricing(); } catch(e) {}
                    try { if (App && App.TableRenderer && typeof App.TableRenderer.refreshAllItineraries === 'function') App.TableRenderer.refreshAllItineraries(); } catch(e) {}
                    try { if (App && App.TableRenderer && App.TableRenderer.lastState && typeof App.TableRenderer.updateView === 'function') App.TableRenderer.updateView(App.TableRenderer.lastState); } catch(e) {}
                    try { if (App && App.Utils && typeof App.Utils.refreshOfferValues === 'function') App.Utils.refreshOfferValues(); } catch(e) {}
                } catch(e){}
            });
            const soloTitle = document.createElement('strong'); soloTitle.textContent = 'Solo Booking';
            soloLabel.appendChild(soloCb); soloLabel.appendChild(soloTitle);
            const soloDesc = document.createElement('div'); soloDesc.className = 'gobo-setting-desc'; soloDesc.style.cssText = 'font-size:12px; margin-left:28px;';
            soloDesc.textContent = 'When enabled, price calculations use single-guest Taxes & Fees (instead of double occupancy).';
            soloArea.appendChild(soloLabel); soloArea.appendChild(soloDesc);
            body.appendChild(soloArea);

            // Dark Mode setting
            const darkArea = document.createElement('div');
            darkArea.className = 'gobo-setting-area';
            darkArea.style.cssText = 'margin-bottom:12px;';
            const darkLabel = document.createElement('label'); darkLabel.style.cssText = 'display:flex; align-items:center; gap:8px;';
            const darkCb = document.createElement('input'); darkCb.type = 'checkbox'; darkCb.id = 'gobo-setting-dark';
            try { darkCb.checked = (App && App.SettingsStore && typeof App.SettingsStore.getDarkMode === 'function') ? App.SettingsStore.getDarkMode() : ((settingsStore.darkMode !== undefined) ? !!settingsStore.darkMode : false); } catch(e){ darkCb.checked = false; }
            darkCb.addEventListener('change', () => {
                try {
                    const v = !!darkCb.checked;
                    if (App && App.SettingsStore && typeof App.SettingsStore.setDarkMode === 'function') {
                        App.SettingsStore.setDarkMode(v);
                    } else {
                        settingsStore.darkMode = v;
                        if (typeof goboStorageSet === 'function') goboStorageSet('goboSettings', JSON.stringify(settingsStore)); else localStorage.setItem('goboSettings', JSON.stringify(settingsStore));
                    }
                    try { if (App && typeof App.applyTheme === 'function') App.applyTheme(); } catch(e) {}
                } catch(e){}
            });
            const darkTitle = document.createElement('strong'); darkTitle.textContent = 'Dark Mode';
            darkLabel.appendChild(darkCb); darkLabel.appendChild(darkTitle);
            const darkDesc = document.createElement('div'); darkDesc.className = 'gobo-setting-desc'; darkDesc.style.cssText = 'font-size:12px; margin-left:28px;';
            darkDesc.textContent = 'Apply a darker theme to the offers table, modals, and panels.';
            darkArea.appendChild(darkLabel); darkArea.appendChild(darkDesc);
            body.appendChild(darkArea);

            // Column visibility settings
            const columnArea = document.createElement('div');
            columnArea.className = 'gobo-setting-area';
            columnArea.style.cssText = 'margin-bottom:12px; width:100%;';
            const columnTitle = document.createElement('strong');
            columnTitle.textContent = 'Visible Columns';
            const columnDesc = document.createElement('div');
            columnDesc.className = 'gobo-setting-desc';
            columnDesc.style.cssText = 'font-size:12px; margin:6px 0 8px 0;';
            columnDesc.textContent = 'Hide or show columns in the offers table. CSV export always includes all columns.';
            const columnsGrid = document.createElement('div');
            columnsGrid.className = 'gobo-columns-grid';
            columnsGrid.style.cssText = 'display:flex; flex-wrap:wrap; width:100%; gap:8px 12px; align-items:flex-start;';

            const defaultHeaders = [
                { key: 'favorite', label: 'Favorite' },
                { key: 'b2bDepth', label: 'B2B' },
                { key: 'offerCode', label: 'Code' },
                { key: 'offerDate', label: 'Rcvd' },
                { key: 'expiration', label: 'Expires' },
                { key: 'tradeInValue', label: 'Trade' },
                { key: 'offerValue', label: 'Value' },
                { key: 'oceanViewUpgrade', label: 'OV' },
                { key: 'balconyUpgrade', label: 'Balcony' },
                { key: 'suiteUpgrade', label: 'Suite' },
                { key: 'offerName', label: 'Name' },
                { key: 'shipClass', label: 'Class' },
                { key: 'ship', label: 'Ship' },
                { key: 'sailDate', label: 'Sail Date' },
                { key: 'departurePort', label: 'Departs' },
                { key: 'nights', label: 'Nights' },
                { key: 'destination', label: 'Destination' },
                { key: 'category', label: 'Category' },
                { key: 'guests', label: 'Guests' },
                { key: 'perks', label: 'Perks' }
            ];

            const headers = (App && App.TableRenderer && App.TableRenderer.lastState && Array.isArray(App.TableRenderer.lastState.headers))
                ? App.TableRenderer.lastState.headers
                : defaultHeaders;
            const hiddenColumns = (App && App.SettingsStore && typeof App.SettingsStore.getHiddenColumns === 'function')
                ? App.SettingsStore.getHiddenColumns()
                : [];
            const hiddenSet = new Set(hiddenColumns);
            const checkboxByKey = {};

            const applyHiddenColumns = () => {
                const newHidden = headers
                    .map(h => h.key)
                    .filter(k => checkboxByKey[k] && checkboxByKey[k].checked === false);
                try {
                    if (App && App.SettingsStore && typeof App.SettingsStore.setHiddenColumns === 'function') {
                        App.SettingsStore.setHiddenColumns(newHidden);
                    }
                } catch(e) { /* ignore */ }
                try {
                    if (App && App.TableRenderer && App.TableRenderer.lastState) {
                        App.TableRenderer.lastState.hiddenColumns = newHidden;
                        if (typeof App.TableRenderer.applyColumnVisibility === 'function') {
                            App.TableRenderer.applyColumnVisibility(App.TableRenderer.lastState);
                        }
                    }
                } catch(e) { /* ignore */ }
            };

            headers.forEach(h => {
                const wrap = document.createElement('label');
                wrap.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:13px;';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = !hiddenSet.has(h.key);
                cb.addEventListener('change', applyHiddenColumns);
                checkboxByKey[h.key] = cb;
                const text = document.createElement('span');
                text.textContent = h.label || h.key;
                wrap.appendChild(cb);
                wrap.appendChild(text);
                columnsGrid.appendChild(wrap);
            });

            columnArea.appendChild(columnTitle);
            columnArea.appendChild(columnDesc);
            columnArea.appendChild(columnsGrid);
            body.appendChild(columnArea);

            // Footer-style close is not needed; header close button is used above

            // Finish building modal and append to overlay/backdrop so it's centered
            modal.appendChild(body);
            overlay.appendChild(modal);
            // Hide overlay until content is rendered to avoid flash
            overlay.style.visibility = 'hidden';
            document.body.appendChild(backdrop);
            document.body.appendChild(overlay);
            // allow ESC to close using Modal handlers
            Modal._container = overlay; Modal._backdrop = backdrop; Modal._escapeHandler = Modal.handleEscapeKey.bind(Modal);
            // Reveal overlay after a tick so layout can settle (mirrors B2B behavior)
            setTimeout(() => { try { overlay.style.visibility = ''; } catch(e){} }, 0);
            document.addEventListener('keydown', Modal._escapeHandler);
        } catch (e) { console.warn('openSettingsModal error', e); }
    }
};

try { module.exports = Settings; } catch(e) {}
