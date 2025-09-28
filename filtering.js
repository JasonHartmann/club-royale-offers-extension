const Filtering = {

    filterOffers(state, offers) {
        let profileKey = (state.selectedProfileKey || (App.CurrentProfile && App.CurrentProfile.key)) || 'default';
        const hiddenGroups = Filtering.loadHiddenGroups(profileKey);
        if (!Array.isArray(hiddenGroups) || hiddenGroups.length === 0) return offers;
        // Map group label to offer property key using headers
        const labelToKey = {};
        if (Array.isArray(state.headers)) {
            state.headers.forEach(h => {
                if (h.label && h.key) labelToKey[h.label.toLowerCase()] = h.key;
            });
        }
        // Helper to get the displayed value for each column, matching table rendering
        function getOfferColumnValue(offer, sailing, key) {
            let qualityText = sailing.isGOBO ? '1 Guest' : '2 Guests';
            if (sailing.isDOLLARSOFF && sailing.DOLLARSOFF_AMT > 0) qualityText += ` + $${sailing.DOLLARSOFF_AMT} off`;
            if (sailing.isFREEPLAY && sailing.FREEPLAY_AMT > 0) qualityText += ` + $${sailing.FREEPLAY_AMT} freeplay`;
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
                case 'quality':
                    return qualityText;
                case 'perks':
                    return perksStr;
                default:
                    return offer[key];
            }
        }
        return offers.filter(({ offer, sailing }) => {
            for (const path of hiddenGroups) {
                const [label, value] = path.split(':').map(s => s.trim());
                if (!label || !value) continue;
                const key = labelToKey[label.toLowerCase()];
                if (!key) continue;
                const offerColumnValue = getOfferColumnValue(offer, sailing, key);
                if (offerColumnValue && offerColumnValue.toString().toUpperCase() === value.toUpperCase()) {
                    return false;
                }
            }
            return true;
        });
    },
    // Load hidden groups for a profile
    loadHiddenGroups(profileKey) {
        try {
            return JSON.parse(localStorage.getItem('goboHiddenGroups-' + profileKey)) || [];
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
                localStorage.setItem('goboHiddenGroups-' + profileKey, JSON.stringify(groups));
            } catch (e) { /* ignore */ }
        }
        this.updateHiddenGroupsDropdown(profileKey, document.getElementById('hidden-groups-display'));
        return groups;
    },
    // Delete a hidden group for a profile
    deleteHiddenGroup(state, group) {
        let profileKey = (state.selectedProfileKey || (App.CurrentProfile && App.CurrentProfile.key)) || 'default';
        let groups = Filtering.loadHiddenGroups(profileKey);
        groups = groups.filter(g => g !== group);
        try {
            localStorage.setItem('goboHiddenGroups-' + profileKey, JSON.stringify(groups));
        } catch (e) { /* ignore */ }
        this.updateHiddenGroupsDropdown(profileKey, document.getElementById('hidden-groups-display'));
        return groups;
    },
    // Update the hidden groups display element for a profile
    updateHiddenGroupsDropdown(profileKey, displayElement) {
        if (!displayElement) {
            console.warn('updateHiddenGroupsDropdown: displayElement is null for profileKey', profileKey);
            return;
        }
        displayElement.innerHTML = '';
        displayElement.style.maxHeight = '180px';
        displayElement.style.overflowY = 'auto';
        const hiddenGroups = Filtering.loadHiddenGroups(profileKey);
        if (Array.isArray(hiddenGroups) && hiddenGroups.length > 0) {
            const ul = document.createElement('ul');
            ul.style.margin = '0';
            ul.style.padding = '0';
            ul.style.listStyle = 'disc inside';
            hiddenGroups.forEach(path => {
                const li = document.createElement('li');
                li.textContent = path;
                ul.appendChild(li);
            });
            displayElement.appendChild(ul);
        } else {
            displayElement.textContent = '(None hidden)';
        }
    },
};