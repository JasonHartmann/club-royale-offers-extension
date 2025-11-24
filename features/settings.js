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
            // Create backdrop/container using Modal utilities where available
            const container = Modal.createModalContainer();
            container.id = 'gobo-settings-modal';
            const backdrop = Modal.createBackdrop();
            // Build content
            const content = document.createElement('div');
            content.className = 'gobo-settings-content';
            content.style.cssText = 'background:#fff; max-width:600px; margin:40px auto; padding:16px; border-radius:8px; box-shadow:0 6px 24px rgba(0,0,0,0.3);';

            const title = document.createElement('h2'); title.textContent = 'Settings'; title.style.marginTop = '0';
            content.appendChild(title);

            // Include Side-by-Sides setting
            const sbsArea = document.createElement('div');
            sbsArea.className = 'gobo-setting-area';
            sbsArea.style.cssText = 'margin-bottom:12px;';
            const sbsLabel = document.createElement('label'); sbsLabel.style.cssText = 'display:flex; align-items:center; gap:8px;';
            const sbsCb = document.createElement('input'); sbsCb.type = 'checkbox'; sbsCb.id = 'gobo-setting-sbs';
            try { sbsCb.checked = (App && App.TableRenderer && typeof App.TableRenderer.getSideBySidePreference === 'function') ? App.TableRenderer.getSideBySidePreference() : true; } catch(e){ sbsCb.checked = true; }
            sbsCb.addEventListener('change', () => {
                try { if (App && App.TableRenderer && typeof App.TableRenderer.setSideBySidePreference === 'function') App.TableRenderer.setSideBySidePreference(!!sbsCb.checked); } catch(e){}
            });
            const sbsTitle = document.createElement('strong'); sbsTitle.textContent = 'Include Side-by-Sides';
            sbsLabel.appendChild(sbsCb); sbsLabel.appendChild(sbsTitle);
            const sbsDesc = document.createElement('div'); sbsDesc.style.cssText = 'font-size:12px; color:#444; margin-left:28px;';
            sbsDesc.textContent = 'When enabled, side-by-side offers (combined or comparison rows) are included in the table. Disable to hide those rows from view.';
            sbsArea.appendChild(sbsLabel); sbsArea.appendChild(sbsDesc);
            content.appendChild(sbsArea);

            // Include Taxes & Fees in Price Filters setting
            const tAndFArea = document.createElement('div');
            tAndFArea.className = 'gobo-setting-area';
            tAndFArea.style.cssText = 'margin-bottom:12px;';
            const tAndFLabel = document.createElement('label'); tAndFLabel.style.cssText = 'display:flex; align-items:center; gap:8px;';
            const tAndFCb = document.createElement('input'); tAndFCb.type = 'checkbox'; tAndFCb.id = 'gobo-setting-tandf';
            try { tAndFCb.checked = (App && App.AdvancedSearch && App.AdvancedSearch.ensureState) ? (App.AdvancedSearch.ensureState(App.AdvancedSearch._lastState) && App.AdvancedSearch._lastState && App.AdvancedSearch._lastState.advancedSearch && App.AdvancedSearch._lastState.advancedSearch.includeTaxesAndFeesInPriceFilters !== false) : true; } catch(e){ tAndFCb.checked = true; }
            tAndFCb.addEventListener('change', () => {
                try {
                    // Update the live state if available
                    const state = App && App.AdvancedSearch && App.AdvancedSearch._lastState ? App.AdvancedSearch._lastState : null;
                    if (state && state.advancedSearch) {
                        state.advancedSearch.includeTaxesAndFeesInPriceFilters = !!tAndFCb.checked;
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
            content.appendChild(tAndFArea);

            // Close button
            const closeBtn = document.createElement('button'); closeBtn.type = 'button'; closeBtn.className = 'gobo-settings-close'; closeBtn.textContent = 'Close';
            closeBtn.style.cssText = 'margin-top:8px; padding:8px 12px;';
            closeBtn.addEventListener('click', () => Modal.closeModal(container, backdrop, []));
            content.appendChild(closeBtn);

            container.appendChild(content);
            document.body.appendChild(backdrop);
            document.body.appendChild(container);
            // allow ESC to close using Modal handlers
            Modal._container = container; Modal._backdrop = backdrop; Modal._escapeHandler = Modal.handleEscapeKey.bind(Modal);
            document.addEventListener('keydown', Modal._escapeHandler);
        } catch (e) { console.warn('openSettingsModal error', e); }
    }
};

try { module.exports = Settings; } catch(e) {}
