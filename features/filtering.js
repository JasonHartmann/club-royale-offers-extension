const Filtering = {

    filterOffers(state, offers) {
        console.time('Filtering.filterOffers');
        // Hidden groups are now GLOBAL (shared across all accounts)
        const hiddenGroups = Filtering.loadHiddenGroups();
        if (!Array.isArray(hiddenGroups) || hiddenGroups.length === 0) {
            console.timeEnd('Filtering.filterOffers');
            return offers;
        }
        // Map group label to offer property key using headers
        const labelToKey = {};
        if (Array.isArray(state.headers)) {
            state.headers.forEach(h => {
                if (h.label && h.key) labelToKey[h.label.toLowerCase()] = h.key;
            });
        }
        // Helper to get the displayed value for each column, matching table rendering
        const result = offers.filter(({ offer, sailing }) => {
            for (const path of hiddenGroups) {
                const [label, value] = path.split(':').map(s => s.trim());
                if (!label || !value) continue;
                const key = labelToKey[label.toLowerCase()];
                if (!key) continue;
                const offerColumnValue = this.getOfferColumnValue(offer, sailing, key);
                if (offerColumnValue && offerColumnValue.toString().toUpperCase() === value.toUpperCase()) {
                    return false;
                }
            }
            return true;
        });
        console.timeEnd('Filtering.filterOffers');
        return result;
    },
    getOfferColumnValue(offer, sailing, key) {
        let guestsText = sailing.isGOBO ? '1 Guest' : '2 Guests';
        if (sailing.isDOLLARSOFF && sailing.DOLLARSOFF_AMT > 0) guestsText += ` + $${sailing.DOLLARSOFF_AMT} off`;
        if (sailing.isFREEPLAY && sailing.FREEPLAY_AMT > 0) guestsText += ` + $${sailing.FREEPLAY_AMT} freeplay`;
        let room = sailing.roomType;
        if (sailing.isGTY) room = room ? room + ' GTY' : 'GTY';
        const itinerary = sailing.itineraryDescription || sailing.sailingType?.name || '-';
        const {nights, destination} = App.Utils.parseItinerary(itinerary);
        const perksStr = Utils.computePerks(offer, sailing);
        switch (key) {
            case 'offerCode':
                return offer.campaignOffer?.offerCode;
            case 'offerDate':
                return App.Utils.formatDate(offer.campaignOffer?.startDate);
            case 'expiration':
                return App.Utils.formatDate(offer.campaignOffer?.reserveByDate);
            case 'offerName':
                return offer.campaignOffer?.name || '-';
            case 'shipClass':
                return Utils.getShipClass(sailing.shipName);
            case 'ship':
                return sailing?.shipName || '-';
            case 'sailDate':
                return App.Utils.formatDate(sailing.sailDate);
            case 'departurePort':
                return sailing.departurePort?.name || '-';
            case 'nights':
                return nights;
            case 'destination':
                return destination;
            case 'category':
                return room || '-';
            case 'guests':
                return guestsText;
            case 'perks':
                return perksStr;
            default:
                return offer[key];
        }
    },
    // Load hidden groups (GLOBAL now). Performs one-time migration from per-profile keys.
    loadHiddenGroups() {
        const GLOBAL_KEY = 'goboHiddenGroups-global';
        try {
            const existing = (typeof goboStorageGet === 'function' ? goboStorageGet(GLOBAL_KEY) : localStorage.getItem(GLOBAL_KEY));
            if (existing) {
                try { return JSON.parse(existing) || []; } catch(e){ return []; }
            }
            const aggregated = new Set();
            const collectFromValue = (raw) => {
                if (!raw) return;
                try {
                    const arr = JSON.parse(raw);
                    if (Array.isArray(arr)) arr.forEach(v => aggregated.add(v));
                } catch(e) { /* ignore */ }
            };
            // Enumerate legacy keys from GoboStore if available
            if (typeof GoboStore !== 'undefined' && GoboStore && typeof GoboStore.listKeys === 'function') {
                try {
                    GoboStore.listKeys('goboHiddenGroups-').forEach(k => {
                        if (k !== GLOBAL_KEY) collectFromValue(goboStorageGet(k));
                    });
                } catch(e) { /* ignore */ }
            }
            // Also enumerate window.localStorage for any leftovers
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('goboHiddenGroups-') && k !== GLOBAL_KEY) {
                    collectFromValue(localStorage.getItem(k));
                }
            }
            const merged = Array.from(aggregated);
            try {
                if (typeof goboStorageSet === 'function') goboStorageSet(GLOBAL_KEY, JSON.stringify(merged)); else localStorage.setItem(GLOBAL_KEY, JSON.stringify(merged));
            } catch(e) { /* ignore */ }
            return merged;
        } catch (e) {
            return [];
        }
    },
    // Add a hidden group (GLOBAL)
    addHiddenGroup(state, group) {
        const GLOBAL_KEY = 'goboHiddenGroups-global';
        const groups = Filtering.loadHiddenGroups();
        if (!groups.includes(group)) {
            groups.push(group);
            try {
                if (typeof goboStorageSet === 'function') goboStorageSet(GLOBAL_KEY, JSON.stringify(groups)); else localStorage.setItem(GLOBAL_KEY, JSON.stringify(groups));
            } catch (e) { /* ignore */ }
        }
        this.updateHiddenGroupsList(null, document.getElementById('hidden-groups-display'), state);
        return groups;
    },
    // Delete a hidden group (GLOBAL)
    deleteHiddenGroup(state, group) {
        const GLOBAL_KEY = 'goboHiddenGroups-global';
        let groups = Filtering.loadHiddenGroups();
        groups = groups.filter(g => g !== group);
        try {
            if (typeof goboStorageSet === 'function') goboStorageSet(GLOBAL_KEY, JSON.stringify(groups)); else localStorage.setItem(GLOBAL_KEY, JSON.stringify(groups));
        } catch (e) { /* ignore */ }
        this.updateHiddenGroupsList(null, document.getElementById('hidden-groups-display'), state);
        setTimeout(() => { Spinner.hideSpinner(); }, 3000);
        return groups;
    },
    // Update the hidden groups display element (GLOBAL)
    updateHiddenGroupsList(_ignoredProfileKey, displayElement, state) {
        console.debug('[Filtering] updateHiddenGroupsList ENTRY (GLOBAL)', { displayElement, state });
        if (!displayElement) {
            console.warn('updateHiddenGroupsList: displayElement is null (GLOBAL)');
            return;
        }
        displayElement.innerHTML = '';
        displayElement.className = 'hidden-groups-display';
        const hiddenGroups = Filtering.loadHiddenGroups();
        console.debug('[Filtering] updateHiddenGroupsList loaded hiddenGroups (GLOBAL):', hiddenGroups);
        if (Array.isArray(hiddenGroups) && hiddenGroups.length > 0) {
            // Sort hidden groups alphabetically, case-insensitive
            const sortedGroups = hiddenGroups.slice().sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
            const container = document.createElement('div');
            container.className = 'hidden-groups-display';
            sortedGroups.forEach(path => {
                const row = document.createElement('div');
                row.className = 'hidden-group-row';

                const label = document.createElement('span');
                label.className = 'hidden-group-label';
                label.textContent = path;

                const removeBtn = document.createElement('span');
                removeBtn.className = 'hidden-group-remove';
                removeBtn.textContent = '✖';
                removeBtn.title = 'Remove hidden group';
                removeBtn.style.cursor = 'pointer';
                removeBtn.addEventListener('click', () => {
                    console.debug('[Filtering] Hidden Group removeBtn clicked (GLOBAL)', { path });
                    // Ensure spinner is shown immediately so the user sees feedback.
                    // Previously we only queued Spinner.showSpinner() which could be starved
                    // by subsequent synchronous work; show it synchronously and defer
                    // the heavier work to the next tick so the browser has a chance to paint.
                    try { Spinner.showSpinner(); } catch(e) { try { Spinner.showSpinner(); } catch(_){} }

                    // Defer the actual removal/storage/update work so spinner can render first.
                    setTimeout(() => {
                        let groups = Filtering.loadHiddenGroups();
                        groups = groups.filter(g => g !== path);
                        try {
                            const GLOBAL_KEY = 'goboHiddenGroups-global';
                            if (typeof goboStorageSet === 'function') goboStorageSet(GLOBAL_KEY, JSON.stringify(groups)); else localStorage.setItem(GLOBAL_KEY, JSON.stringify(groups));
                            console.debug('[Filtering] Hidden Group removed from storage (GLOBAL)', { path, groups });
                        } catch (e) {
                            console.warn('[Filtering] Error removing Hidden Group from storage (GLOBAL)', e);
                        }

                        Filtering.updateHiddenGroupsList(null, document.getElementById('hidden-groups-display'), state);
                        console.debug('[Filtering] updateHiddenGroupsList called after removal (GLOBAL)', { groups });
                        if (typeof App !== 'undefined' && App.TableRenderer && typeof App.TableRenderer.updateView === 'function') {
                            console.debug('[Filtering] Calling App.TableRenderer.updateView after hidden group removal (GLOBAL)');
                            App.TableRenderer.updateView(state);
                        }

                        setTimeout(() => {
                            Spinner.hideSpinner();
                            console.debug('[Filtering] Spinner hidden after Hidden Group removal (GLOBAL)');
                            setTimeout(() => {
                                console.debug('[Filtering] Post-spinner (GLOBAL): 500ms after spinner hidden');
                                const table = document.querySelector('table');
                                const rowCount = table ? table.rows.length : 0;
                                const visibleElements = Array.from(document.body.querySelectorAll('*')).filter(el => el.offsetParent !== null).length;
                                console.debug('[Filtering] Post-spinner: Table row count:', rowCount);
                                console.debug('[Filtering] Post-spinner: Visible DOM elements:', visibleElements);
                                if (window.performance && window.performance.memory) {
                                    console.debug('[Filtering] Post-spinner: JS Heap Size:', window.performance.memory.usedJSHeapSize, '/', window.performance.memory.totalJSHeapSize);
                                }
                                if (typeof App !== 'undefined' && App.TableRenderer && App.TableRenderer.lastState) {
                                    console.debug('[Filtering] Post-spinner: TableRenderer.lastState:', App.TableRenderer.lastState);
                                }
                            }, 500);
                        }, 3000);
                    }, 0);
                });

                row.appendChild(label);
                row.appendChild(removeBtn);
                container.appendChild(row);
            });
            displayElement.appendChild(container);
            console.debug('[Filtering] updateHiddenGroupsList DOM updated with hidden groups (GLOBAL)');
        } else {
            console.debug('[Filtering] updateHiddenGroupsList: No hidden groups to display (GLOBAL)');
        }
        console.debug('[Filtering] updateHiddenGroupsList EXIT (GLOBAL)');
    },
};