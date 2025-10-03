const Utils = {
    // Centralized brand detection (R = Royal, C = Celebrity)
    detectBrand() {
        const host = (location && location.hostname) ? location.hostname : '';
        let brand = (host.includes('celebritycruises.com') || host.includes('bluechipcluboffers.com')) ? 'C' : 'R';
        try {
            const override = localStorage.getItem('casinoBrand');
            if (override === 'R' || override === 'C') brand = override;
            if (override === 'X') brand = 'C';
        } catch(e) {}
        return brand;
    },
    isCelebrity() { return this.detectBrand() === 'C'; },
    getRedemptionBase() {
        return this.isCelebrity() ? 'https://www.celebritycruises.com/blue-chip-club/redemptions/' : 'https://www.royalcaribbean.com/club-royale/redemptions/';
    },
    computePerks(offer, sailing) {
        const names = new Set();
        const perkCodes = offer?.campaignOffer?.perkCodes;
        if (Array.isArray(perkCodes)) {
            perkCodes.forEach(p => {
                const name = p?.perkName || p?.perkCode;
                if (name) names.add(name.trim());
            });
        }
        const bonus = sailing?.nextCruiseBonusPerkCode;
        if (bonus) {
            const name = bonus.perkName || bonus.perkCode;
            if (name) names.add(name.trim());
        }
        return names.size ? Array.from(names).join(' | ') : '-';
    },
    createOfferRow: function ({offer, sailing}, isNewest = false, isExpiringSoon = false, idx = null) {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        if (isNewest) row.classList.add('newest-offer-row');
        if (isExpiringSoon) row.classList.add('expiring-soon-row');
        let guestsText = sailing.isGOBO ? '1 Guest' : '2 Guests';
        if (sailing.isDOLLARSOFF && sailing.DOLLARSOFF_AMT > 0) guestsText += ` + $${sailing.DOLLARSOFF_AMT} off`;
        if (sailing.isFREEPLAY && sailing.FREEPLAY_AMT > 0) guestsText += ` + $${sailing.FREEPLAY_AMT} freeplay`;
        let room = sailing.roomType;
        if (sailing.isGTY) room = room ? room + ' GTY' : 'GTY';
        const itinerary = sailing.itineraryDescription || sailing.sailingType?.name || '-';
        const {nights, destination} = App.Utils.parseItinerary(itinerary);
        const perksStr = Utils.computePerks(offer, sailing);
        const rawCode = offer.campaignOffer?.offerCode || '-';
        // Generate separate links/buttons for each code if rawCode contains '/'
        let codeCell = '-';
        if (rawCode !== '-') {
            let split = String(rawCode).split('/');
            const codes = split.map(c => c.trim()).filter(Boolean);
            const links = codes.map(code => `
                <a href="#" class="offer-code-link text-blue-600 underline" data-offer-code="${code}" title="Lookup ${code}">${code}</a>
            `).join(' / ');
            codeCell = `${links}`; // Redeem button currently disabled
        }
        const shipClass = App.Utils.getShipClass(sailing.shipName);
        // Favorite / ID column setup
        const isFavoritesView = (App && App.CurrentProfile && App.CurrentProfile.key === 'goob-favorites');
        let favCellHtml = '';
        if (isFavoritesView && idx !== null) {
            // Show saved profileId as ID icon, with Trash Icon below
            let savedProfileId = (sailing && sailing.__profileId !== undefined && sailing.__profileId !== null)
                ? sailing.__profileId
                : (offer && offer.__favoriteMeta && offer.__favoriteMeta.profileId !== undefined && offer.__favoriteMeta.profileId !== null)
                    ? offer.__favoriteMeta.profileId
                    : '-';
            // Use combined badge logic based on savedProfileId parts (fixed at save time)
            let badgeText, badgeClass;
            const parts = typeof savedProfileId === 'string'
                ? savedProfileId.split('-').map(id => parseInt(id, 10)).filter(n => !isNaN(n))
                : [];
            if (savedProfileId === 'C' || parts.length >= 2) {
                if (parts.length >= 2) {
                    badgeText = `${parts[0]}+${parts[1]}`;
                    const sum = parts[0] + parts[1];
                    badgeClass = `profile-id-badge-combined profile-id-badge-combined-${sum}`;
                } else {
                    badgeText = 'C';
                    badgeClass = 'profile-id-badge-combined';
                }
            } else {
                badgeText = String(savedProfileId);
                badgeClass = `profile-id-badge profile-id-badge-${savedProfileId}`;
            }
            favCellHtml = `<td class="border p-1 text-center">
                <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                    <span class="${badgeClass}" title="Profile ID #${savedProfileId}">${badgeText}</span>
                    <span class="trash-favorite" title="Remove from Favorites" style="cursor:pointer;">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M6 2V1.5C6 1.22 6.22 1 6.5 1H9.5C9.78 1 10 1.22 10 1.5V2M2 4H14M12.5 4V13.5C12.5 13.78 12.28 14 12 14H4C3.72 14 3.5 13.78 3.5 13.5V4M5.5 7V11M8 7V11M10.5 7V11" stroke="#888" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </span>
                </div>
            </td>`;
        } else {
            let profileId = null;
            try {
                if (App && App.CurrentProfile && App.CurrentProfile.state && App.CurrentProfile.state.profileId !== undefined && App.CurrentProfile.state.profileId !== null) {
                    profileId = App.CurrentProfile.state.profileId; // allow 0
                }
            } catch(e){}
            let isFav = false;
            try { if (window.Favorites && Favorites.isFavorite) isFav = Favorites.isFavorite(offer, sailing, profileId); } catch(e){ /* ignore */ }
            favCellHtml = `<td class="border p-1 text-center" style="width:32px;">
                <button type="button" class="favorite-toggle" aria-label="${isFav ? 'Unfavorite' : 'Favorite'} sailing" title="${isFav ? 'Remove from Favorites' : 'Add to Favorites'}" style="cursor:pointer; background:none; border:none; font-size:14px; line-height:1; color:${isFav ? '#f5c518' : '#bbb'};">${isFav ? '\u2605' : '\u2606'}</button>
            </td>`;
        }
        row.innerHTML = `
            ${favCellHtml}
            <td class="border p-2">${codeCell}</td>
            <td class="border p-2">${App.Utils.formatDate(offer.campaignOffer?.startDate)}</td>
            <td class="border p-2">${App.Utils.formatDate(offer.campaignOffer?.reserveByDate)}</td>
            <td class="border p-2">${offer.campaignOffer.name || '-'}</td>
            <td class="border p-2">${shipClass}</td>
            <td class="border p-2">${sailing.shipName || '-'}</td>
            <td class="border p-2">${App.Utils.formatDate(sailing.sailDate)}</td>
            <td class="border p-2">${sailing.departurePort?.name || '-'}</td>
            <td class="border p-2">${nights}</td>
            <td class="border p-2">${destination}</td>
            <td class="border p-2">${room || '-'}</td>
            <td class="border p-2">${guestsText}</td>
            <td class="border p-2">${perksStr}</td>
        `;
        // Attach favorite toggle handler only when not in favorites overview
        if (!isFavoritesView) {
            try {
                const btn = row.querySelector('.favorite-toggle');
                if (btn && window.Favorites) {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        let profileId = null;
                        try { if (App && App.CurrentProfile && App.CurrentProfile.state) profileId = App.CurrentProfile.state.profileId; } catch(err){}
                        try { if (Favorites.ensureProfileExists) Favorites.ensureProfileExists(); } catch(err){}
                        try { Favorites.toggleFavorite(offer, sailing, profileId); } catch(err){ console.debug('[favorite-toggle] toggle error', err); }
                        // Re-evaluate favorite state
                        let nowFav = false;
                        try { nowFav = Favorites.isFavorite(offer, sailing, profileId); } catch(e2){ /* ignore */ }
                        btn.textContent = nowFav ? '\u2605' : '\u2606';
                        btn.style.color = nowFav ? '#f5c518' : '#bbb';
                        btn.setAttribute('aria-label', nowFav ? 'Unfavorite sailing' : 'Favorite sailing');
                        btn.title = nowFav ? 'Remove from Favorites' : 'Add to Favorites';
                    });
                }
            } catch(e){ /* ignore */ }
        } else {
            // Attach trash icon handler in favorites view
            try {
                const trashBtn = row.querySelector('.trash-favorite');
                if (trashBtn && window.Favorites) {
                    trashBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Determine stored profileId (embedded in sailing)
                        let embeddedPid = sailing && (sailing.__profileId !== undefined ? sailing.__profileId : (offer.__favoriteMeta && offer.__favoriteMeta.profileId));
                        try { Favorites.removeFavorite(offer, sailing, embeddedPid); } catch(err){ console.debug('[trash-favorite] remove error', err); }
                        try {
                            // Fully refresh favorites view so numbering re-computes
                            if (App && App.TableRenderer && typeof Favorites.loadProfileObject === 'function') {
                                const refreshed = Favorites.loadProfileObject();
                                App.TableRenderer.loadProfile('goob-favorites', refreshed);
                            } else {
                                // Fallback: remove row only
                                row.remove();
                            }
                        } catch(err) { row.remove(); }
                    });
                }
            } catch(e) { /* ignore */ }
        }
        return row;
    },
    // Helper to format date string as MM/DD/YY without timezone shift
    formatDate(dateStr) {
        if (!dateStr) return '-';
        // Handles YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
        const [year, month, day] = dateStr.split('T')[0].split('-');
        return `${month}/${day}/${year.slice(-2)}`;
    },
    // Helper to extract nights and destination from itinerary string
    parseItinerary(itinerary) {
        if (!itinerary) return { nights: '-', destination: '-' };
        // Support N, NIGHT, NIGHTS, NT, NTS (case-insensitive). Allow optional hyphen/space after the night token.
        const match = itinerary.match(/^\s*(\d+)\s*(?:N(?:IGHT|T)?S?)\b[\s\-.,]*([\s\S]*)$/i);
        if (match) {
            const nights = match[1];
            const destination = match[2] ? match[2].trim() : '-';
            return { nights, destination: destination || '-' };
        }
        return { nights: '-', destination: itinerary };
    },
    // Helper to convert a string to title case (each word capitalized)
    toTitleCase(str) {
        return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    },
    // Helper to title-case only words longer than two characters
    toPortTitleCase(str) {
        if (!str) return str;
        return str.split(/(\W+)/).map(word => {
            if (/^[A-Za-z]{3,}$/.test(word)) {
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            return word;
        }).join('');
    },
    // Normalize fetched offers data: trim and standardize capitalization
    normalizeOffers(data) {
        if (data && Array.isArray(data.offers)) {
            data.offers.forEach((offerObj) => {
                const co = offerObj.campaignOffer;
                if (co) {
                    if (typeof co.offerCode === 'string') co.offerCode = co.offerCode.trim().toUpperCase();
                    if (typeof co.name === 'string') co.name = Utils.toTitleCase(co.name.trim());
                    if (Array.isArray(co.sailings)) {
                        co.sailings.forEach((sailing) => {
                            if (typeof sailing.shipName === 'string') sailing.shipName = Utils.toTitleCase(sailing.shipName.trim());
                            if (sailing.departurePort?.name) sailing.departurePort.name = Utils.toPortTitleCase(sailing.departurePort.name.trim());
                            if (typeof sailing.itineraryDescription === 'string') sailing.itineraryDescription = Utils.toTitleCase(sailing.itineraryDescription.trim());
                            if (sailing.sailingType?.name) sailing.sailingType.name = Utils.toTitleCase(sailing.sailingType.name.trim());
                        });
                    }
                }
            });
        }
        return data;
    },
    // Ship class lookup
    getShipClass(shipName) {
        if (!shipName) return '-';
        const key = shipName.trim().toLowerCase();
        const map = {
            // Royal Caribbean International
            'icon of the seas': 'Icon',
            'star of the seas': 'Icon',
            'utopia of the seas': 'Oasis',
            'oasis of the seas': 'Oasis',
            'allure of the seas': 'Oasis',
            'harmony of the seas': 'Oasis',
            'symphony of the seas': 'Oasis',
            'wonder of the seas': 'Oasis',
            'freedom of the seas': 'Freedom',
            'liberty of the seas': 'Freedom',
            'independence of the seas': 'Freedom',
            'quantum of the seas': 'Quantum',
            'anthem of the seas': 'Quantum',
            'ovation of the seas': 'Quantum',
            'spectrum of the seas': 'Quantum Ultra',
            'odyssey of the seas': 'Quantum Ultra',
            'voyager of the seas': 'Voyager',
            'navigator of the seas': 'Voyager',
            'mariner of the seas': 'Voyager',
            'adventure of the seas': 'Voyager',
            'explorer of the seas': 'Voyager',
            'radiance of the seas': 'Radiance',
            'brilliance of the seas': 'Radiance',
            'serenade of the seas': 'Radiance',
            'jewel of the seas': 'Radiance',
            'vision of the seas': 'Vision',
            'enchantment of the seas': 'Vision',
            'grandeur of the seas': 'Vision',
            'rhapsody of the seas': 'Vision',
            'majesty of the seas': 'Sovereign',
            'sovereign of the seas': 'Sovereign',
            'empress of the seas': 'Empress',
            // Celebrity Cruises
            'celebrity xcel': 'Edge',
            'celebrity ascent': 'Edge',
            'celebrity beyond': 'Edge',
            'celebrity apex': 'Edge',
            'celebrity edge': 'Edge',
            'celebrity reflection': 'Solstice',
            'celebrity silhouette': 'Solstice',
            'celebrity equinox': 'Solstice',
            'celebrity eclipse': 'Solstice',
            'celebrity solstice': 'Solstice',
            'celebrity constellation': 'Millennium',
            'celebrity summit': 'Millennium',
            'celebrity infinity': 'Millennium',
            'celebrity millennium': 'Millennium',
            'celebrity flora': 'Expedition',
            'xcel': 'Edge',
            'ascent': 'Edge',
            'beyond': 'Edge',
            'apex': 'Edge',
            'edge': 'Edge',
            'reflection': 'Solstice',
            'silhouette': 'Solstice',
            'equinox': 'Solstice',
            'eclipse': 'Solstice',
            'solstice': 'Solstice',
            'constellation': 'Millennium',
            'summit': 'Millennium',
            'infinity': 'Millennium',
            'millennium': 'Millennium',
            'flora': 'Expedition',
        };
        return map[key] || '-';
    }
};