(function(){
    // Ensure Utils exists (core should be loaded before this file via manifest order)
    if (typeof Utils === 'undefined') window.Utils = {};

    Utils.createOfferRow = function ({offer, sailing}, isNewest = false, isExpiringSoon = false, idx = null) {
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
        const {nights, destination} = Utils.parseItinerary(itinerary);
        const itineraryClass = sailing.itineraryCode + "_" + sailing.sailDate;
        // Primary itinerary key should match ItineraryCache key (prefer sailing.id when present)
        const itineraryKey = (sailing && sailing.id && String(sailing.id).trim()) || itineraryClass;
        const perksStr = Utils.computePerks(offer, sailing);
        const rawCode = offer.campaignOffer?.offerCode || '-';
        // Generate separate links/buttons for each code if rawCode contains '/'
        let codeCell = '-';
        if (rawCode !== '-') {
            let split = String(rawCode).split('/');
            const codes = split.map(c => c.trim()).filter(Boolean);
            const links = codes.map(code => `
                <a href="javascript:void(0)" class="offer-code-link text-blue-600 underline" data-offer-code="${code}" title="Lookup ${code}">${code}</a>
            `).join(' / ');
            codeCell = `${links}`; // Redeem button currently disabled
        }
        const shipClass = Utils.getShipClass(sailing.shipName);
        // Trade-in value extraction & formatting (inserted between Expiration and Name columns)
        const rawTrade = offer.campaignOffer?.tradeInValue;
        const tradeDisplay = (typeof App !== 'undefined' && App.Utils && App.Utils.formatTradeValue) ? App.Utils.formatTradeValue(rawTrade) : (function(rt){ if (rt===undefined||rt===null||rt==='') return '-'; const cleaned=String(rt).replace(/[^0-9.\-]/g,''); const parsed = cleaned===''?NaN:parseFloat(cleaned); if(!isNaN(parsed)) return Number.isInteger(parsed)?`$${parsed.toLocaleString()}`:`$${parsed.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,",")}`; return String(rt); })(rawTrade);
        // Favorite / ID column setup
        const isFavoritesView = (App && App.CurrentProfile && App.CurrentProfile.key === 'goob-favorites');
        let favCellHtml;
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
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
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
            <td class="border p-2">${Utils.formatDate(offer.campaignOffer?.startDate)}</td>
            <td class="border p-2">${Utils.formatDate(offer.campaignOffer?.reserveByDate)}</td>
            <td class="border p-2">${tradeDisplay}</td>
            <td class="border p-2">${offer.campaignOffer.name || '-'}</td>
            <td class="border p-2">${shipClass}</td>
            <td class="border p-2">${sailing.shipName || '-'}</td>
            <td class="border p-2">${Utils.formatDate(sailing.sailDate)}</td>
            <td class="border p-2">${sailing.departurePort?.name || '-'}</td>
            <td class="border p-2">${nights}</td>
            <td class="border p-2 itinerary" id="${itineraryKey}">${destination}</td>
            <td class="border p-2">${room || '-'}</td>
            <td class="border p-2">${guestsText}</td>
            <td class="border p-2">${perksStr}</td>
        `;
        // Wrap itinerary cell text in link immediately (so accordion rows also get links) if destination not placeholder
        try {
            const itinCell = row.querySelector('.itinerary');
            if (itinCell && !itinCell.querySelector('a.gobo-itinerary-link')) {
                const text = (itinCell.textContent || '').trim();
                itinCell.textContent = '';
                const a = document.createElement('a');
                a.href = '#';
                a.className = 'gobo-itinerary-link';
                a.dataset.itineraryKey = itineraryKey;
                a.textContent = text || destination || itineraryKey;
                a.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    try { if (ItineraryCache && typeof ItineraryCache.showModal === 'function') ItineraryCache.showModal(itineraryKey, a); } catch(e){ /* ignore */ }
                });
                itinCell.appendChild(a);
            }
        } catch(e){ /* ignore itinerary link wrapping errors */ }
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
    };

})();
