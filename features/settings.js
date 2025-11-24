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
            body.className = 'b2b-visualizer-body';
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
            const autoDesc = document.createElement('div'); autoDesc.style.cssText = 'font-size:12px; color:#444; margin-left:28px;';
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
            const sbsDesc = document.createElement('div'); sbsDesc.style.cssText = 'font-size:12px; color:#444; margin-left:28px;';
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
            const tAndFDesc = document.createElement('div'); tAndFDesc.style.cssText = 'font-size:12px; color:#444; margin-left:28px;';
            tAndFDesc.textContent = 'If enabled, price-based filters will include Taxes & Fees when calculating matches and suggestions. Disable to use base prices only.';
            tAndFArea.appendChild(tAndFLabel); tAndFArea.appendChild(tAndFDesc);
            body.appendChild(tAndFArea);

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
