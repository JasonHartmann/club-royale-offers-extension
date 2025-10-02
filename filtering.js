const Filtering = {

    filterOffers(state, offers) {
        console.time('Filtering.filterOffers');
        let profileKey = (state.selectedProfileKey || (App.CurrentProfile && App.CurrentProfile.key)) || 'default';
        const hiddenGroups = Filtering.loadHiddenGroups(profileKey);
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
        const rawCode = offer.campaignOffer?.offerCode || '-';
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
    // Load hidden groups for a profile
    loadHiddenGroups(profileKey) {
        try {
            const key = 'goboHiddenGroups-' + profileKey;
            const raw = (typeof goboStorageGet === 'function' ? goboStorageGet(key) : localStorage.getItem(key));
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    },
    // Add a hidden group for a profile
    addHiddenGroup(state, group) {
        let profileKey = (state.selectedProfileKey || (App.CurrentProfile && App.CurrentProfile.key)) || 'default';
        const groups = Filtering.loadHiddenGroups(profileKey);
        if (!groups.includes(group)) {
            groups.push(group);
            try {
                const key = 'goboHiddenGroups-' + profileKey;
                if (typeof goboStorageSet === 'function') goboStorageSet(key, JSON.stringify(groups)); else localStorage.setItem(key, JSON.stringify(groups));
            } catch (e) { /* ignore */ }
        }
        this.updateHiddenGroupsList(profileKey, document.getElementById('hidden-groups-display'), state);
        return groups;
    },
    // Delete a hidden group for a profile
    deleteHiddenGroup(state, group) {
        let profileKey = (state.selectedProfileKey || (App.CurrentProfile && App.CurrentProfile.key)) || 'default';
        let groups = Filtering.loadHiddenGroups(profileKey);
        groups = groups.filter(g => g !== group);
        try {
            const key = 'goboHiddenGroups-' + profileKey;
            if (typeof goboStorageSet === 'function') goboStorageSet(key, JSON.stringify(groups)); else localStorage.setItem(key, JSON.stringify(groups));
        } catch (e) { /* ignore */ }
        this.updateHiddenGroupsList(profileKey, document.getElementById('hidden-groups-display'), state);
        setTimeout(() => { Spinner.hideSpinner(); }, 3000);
        return groups;
    },
    // Update the hidden groups display element for a profile
    updateHiddenGroupsList(profileKey, displayElement, state) {
        console.debug('[Filtering] updateHiddenGroupsList ENTRY', { profileKey, displayElement, state });
        if (!displayElement) {
            console.warn('updateHiddenGroupsList: displayElement is null for profileKey', profileKey);
            return;
        }
        displayElement.innerHTML = '';
        displayElement.className = 'hidden-groups-display';
        const hiddenGroups = Filtering.loadHiddenGroups(profileKey);
        console.debug('[Filtering] updateHiddenGroupsList loaded hiddenGroups:', hiddenGroups);
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
                    console.debug('[Filtering] Hidden Group removeBtn clicked', { profileKey, path });
                    Spinner.showSpinner();
                    let groups = Filtering.loadHiddenGroups(profileKey);
                    groups = groups.filter(g => g !== path);
                    try {
                        const key = 'goboHiddenGroups-' + profileKey;
                        if (typeof goboStorageSet === 'function') goboStorageSet(key, JSON.stringify(groups)); else localStorage.setItem(key, JSON.stringify(groups));
                        console.debug('[Filtering] Hidden Group removed from storage', { profileKey, path, groups });
                    } catch (e) {
                        console.warn('[Filtering] Error removing Hidden Group from storage', e);
                    }
                    Filtering.updateHiddenGroupsList(profileKey, document.getElementById('hidden-groups-display'), state);
                    console.debug('[Filtering] updateHiddenGroupsList called after removal', { profileKey, groups });
                    if (typeof App !== 'undefined' && App.TableRenderer && typeof App.TableRenderer.updateView === 'function') {
                        console.debug('[Filtering] Calling App.TableRenderer.updateView after hidden group removal');
                        App.TableRenderer.updateView(state);
                    }
                    setTimeout(() => {
                        Spinner.hideSpinner();
                        console.debug('[Filtering] Spinner hidden after Hidden Group removal');
                        setTimeout(() => {
                            console.debug('[Filtering] Post-spinner: 500ms after spinner hidden');
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
                });

                row.appendChild(label);
                row.appendChild(removeBtn);
                container.appendChild(row);
            });
            displayElement.appendChild(container);
            console.debug('[Filtering] updateHiddenGroupsList DOM updated with hidden groups');
        } else {
            console.debug('[Filtering] updateHiddenGroupsList: No hidden groups to display');
        }
        console.debug('[Filtering] updateHiddenGroupsList EXIT');
    },
};