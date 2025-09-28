const Filtering = {

    filterTierOffers(state, offers) {
        return state.hideTierSailings ? offers.filter(({ offer }) => !((offer.campaignOffer?.offerCode || '').toUpperCase().includes('TIER'))) : offers;
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