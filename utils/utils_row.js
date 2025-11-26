(function(){
    // Ensure Utils exists (core should be loaded before this file via manifest order)
    if (typeof Utils === 'undefined') window.Utils = {};

    Utils.createOfferRow = function ({offer, sailing}, isNewest = false, isExpiringSoon = false, idx = null) {
        const row = document.createElement('tr');
        // Attach identifying data attributes for recomputation of offerValue
        try {
            row.dataset.offerCode = (offer.campaignOffer?.offerCode || '').toString().trim();
            row.dataset.sailDate = (sailing.sailDate || '').toString().trim().slice(0,10); // raw ISO slice
            row.dataset.shipName = (sailing.shipName || '').toString().trim();
            row.dataset.shipCode = (sailing.shipCode || '').toString().trim();
            if (idx !== null && idx !== undefined) row.dataset.offerIndex = String(idx);
            // Ensure sailing has a stable __b2bRowId so handlers can attach during incremental render
            try {
                if (sailing && !sailing.__b2bRowId) {
                    const rawParts = [offer && offer.campaignOffer && offer.campaignOffer.offerCode, sailing.shipCode, sailing.shipName, sailing.sailDate];
                    const baseParts = rawParts
                        .filter(p => p !== undefined && p !== null && String(p).trim() !== '')
                        .map(p => String(p).trim().replace(/[^a-zA-Z0-9_-]/g, '_'));
                    if (baseParts.length) {
                        sailing.__b2bRowId = `b2b-${baseParts.join('-')}`;
                    } else {
                        // Fallback: use provided index if available, otherwise a short random id
                        sailing.__b2bRowId = `b2b-${(idx !== null && idx !== undefined) ? idx : Math.random().toString(36).slice(2,9)}`;
                    }
                }
                if (sailing && sailing.__b2bRowId) row.dataset.b2bRowId = sailing.__b2bRowId;
            } catch(e){}
        } catch(e){}
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
        // Build stable itinerary key: ONLY shipCode+sailDate (SD_<shipCode>_<YYYY-MM-DD>)
        let itineraryKey;
        try {
            const sailDate = sailing?.sailDate ? String(sailing.sailDate).trim().slice(0,10) : '';
            const shipCode = sailing?.shipCode ? String(sailing.shipCode).trim() : '';
            itineraryKey = (shipCode && sailDate) ? `SD_${shipCode}_${sailDate}` : (sailDate ? `SD_UNKNOWN_${sailDate}` : 'SD_UNKNOWN');
        } catch(e) { itineraryKey = 'SD_UNKNOWN'; }
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
        // New Value column (Offer Value)
        let valueDisplay = '-';
        try {
            const rawVal = (App && App.Utils && typeof App.Utils.computeOfferValue === 'function') ? App.Utils.computeOfferValue(offer, sailing) : (Utils.computeOfferValue ? Utils.computeOfferValue(offer, sailing) : null);
            valueDisplay = (App && App.Utils && typeof App.Utils.formatOfferValue === 'function') ? App.Utils.formatOfferValue(rawVal) : (Utils.formatOfferValue ? Utils.formatOfferValue(rawVal) : (rawVal!=null?`$${Number(rawVal).toFixed(2)}`:'-'));
        } catch(e){ valueDisplay='-'; }
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
            <td class="border p-2 b2b-depth-cell"></td>
            <td class="border p-2">${codeCell}</td>
            <td class="border p-2">${Utils.formatDate(offer.campaignOffer?.startDate)}</td>
            <td class="border p-2">${Utils.formatDate(offer.campaignOffer?.reserveByDate)}</td>
            <td class="border p-2">${tradeDisplay}</td>
            <td class="border p-2">${valueDisplay}</td>
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
            try {
                // If BackToBackTool has a persisted selection, apply persistent highlight
                // Do NOT apply this highlight when viewing the Favorites pseudo-profile
                // (it produces a persistent highlight that doesn't make sense in that view).
                try {
                    const viewingFavorites = (typeof App !== 'undefined' && App.CurrentProfile && App.CurrentProfile.key === 'goob-favorites');
                    if (!viewingFavorites && window.BackToBackTool && BackToBackTool._selectedRowId && row.dataset && row.dataset.b2bRowId && String(row.dataset.b2bRowId) === String(BackToBackTool._selectedRowId)) {
                        row.classList.add('gobo-b2b-selected');
                    }
                } catch(e) { /* ignore */ }
            const b2bCell = row.querySelector('.b2b-depth-cell');
            if (b2bCell) {
                const rowId = sailing && sailing.__b2bRowId;
                if (rowId) {
                    b2bCell.dataset.b2bRowId = rowId;
                    b2bCell.classList.add('b2b-depth-cell-action');
                    // Expose offerIndex on the cell for easier mapping during incremental updates
                    try { if (row.dataset && row.dataset.offerIndex !== undefined) b2bCell.dataset.offerIndex = row.dataset.offerIndex; } catch(e) {}
                    // If the TableRenderer has already computed depths, render the pill immediately
                    try {
                        if (App && App.TableRenderer && App.TableRenderer.lastState && typeof App.TableRenderer.updateB2BDepthCell === 'function') {
                            let idx = null;
                            try { idx = row.dataset && row.dataset.offerIndex !== undefined ? parseInt(row.dataset.offerIndex, 10) : null; } catch(e) { idx = null; }
                            if ((idx === null || isNaN(idx)) && row.dataset && row.dataset.b2bRowId) {
                                const rid = row.dataset.b2bRowId;
                                const found = (Array.isArray(App.TableRenderer.lastState.sortedOffers) ? App.TableRenderer.lastState.sortedOffers : []).findIndex(p => p && p.sailing && p.sailing.__b2bRowId === rid);
                                if (found >= 0) idx = found;
                            }
                            if (typeof idx === 'number' && idx >= 0 && Array.isArray(App.TableRenderer.lastState.sortedOffers)) {
                                const pair = App.TableRenderer.lastState.sortedOffers[idx];
                                if (pair && pair.sailing) {
                                    const depth = (typeof pair.sailing.__b2bDepth === 'number') ? pair.sailing.__b2bDepth : null;
                                    const chainId = pair.sailing && pair.sailing.__b2bChainId ? pair.sailing.__b2bChainId : null;
                                    if (depth !== null) {
                                        try { App.TableRenderer.updateB2BDepthCell(b2bCell, depth, chainId); } catch(e) {}
                                    }
                                }
                            }
                        }
                    } catch(e) { /* ignore immediate render errors */ }
                    if (!b2bCell.dataset.b2bCellBound) {
                        const handler = (ev) => {
                            try { console.debug('[B2B] cell clicked', { rowId, evType: ev.type }); } catch(e){}
                            if (!window.BackToBackTool) { try { console.debug('[B2B] BackToBackTool missing'); } catch(e){}; return; }
                            if (typeof BackToBackTool.openByRowId !== 'function') { try { console.debug('[B2B] BackToBackTool.openByRowId missing'); } catch(e){}; return; }
                            // If the pill wasn't rendered for this cell (possible during incremental render),
                            // attempt to render it on-demand using the model's computed depth.
                            try {
                                const hasPill = b2bCell.querySelector && b2bCell.querySelector('.b2b-chevrons');
                                if (!hasPill && App && App.TableRenderer && App.TableRenderer.lastState) {
                                    try {
                                        const lastState = App.TableRenderer.lastState;
                                        let idx = null;
                                        if (b2bCell.dataset && b2bCell.dataset.offerIndex) idx = parseInt(b2bCell.dataset.offerIndex, 10);
                                        if ((idx === null || isNaN(idx)) && row.dataset && row.dataset.b2bRowId) {
                                            const rid = row.dataset.b2bRowId;
                                            const found = (Array.isArray(lastState.sortedOffers) ? lastState.sortedOffers : []).findIndex(p => p && p.sailing && p.sailing.__b2bRowId === rid);
                                            if (found >= 0) idx = found;
                                        }
                                        if (typeof idx === 'number' && idx >= 0 && Array.isArray(lastState.sortedOffers)) {
                                            const pair = lastState.sortedOffers[idx];
                                            if (pair && pair.sailing) {
                                                const depth = (typeof pair.sailing.__b2bDepth === 'number') ? pair.sailing.__b2bDepth : null;
                                                const chainId = pair.sailing && pair.sailing.__b2bChainId ? pair.sailing.__b2bChainId : null;
                                                if (depth !== null && typeof App.TableRenderer.updateB2BDepthCell === 'function') {
                                                    try { App.TableRenderer.updateB2BDepthCell(b2bCell, depth, chainId); } catch(e) {}
                                                }
                                            }
                                        }
                                    } catch(e) { /* ignore on-demand render errors */ }
                                }
                            } catch(e) { /* ignore */ }
                            try { ev.preventDefault(); ev.stopPropagation(); } catch(e){}
                            // Perform an on-demand depth computation so the UI updates 'Search' pills
                            try {
                                const state = App.TableRenderer && App.TableRenderer.lastState ? App.TableRenderer.lastState : null;
                                const allowSideBySide = (typeof App.TableRenderer !== 'undefined' && App.TableRenderer && typeof App.TableRenderer.getSideBySidePreference === 'function') ? App.TableRenderer.getSideBySidePreference() : true;
                                const hiddenStore = (typeof Filtering !== 'undefined' && typeof Filtering._getHiddenRowStore === 'function') ? Filtering._getHiddenRowStore(state) : null;
                                const globalHidden = (typeof Filtering !== 'undefined' && Filtering._globalHiddenRowKeys instanceof Set) ? Filtering._globalHiddenRowKeys : null;
                                const filterPredicate = (row) => {
                                    try {
                                        if (!row) return false;
                                        const code = (row.offer && row.offer.campaignOffer && row.offer.campaignOffer.offerCode) ? String(row.offer.campaignOffer.offerCode).trim().toUpperCase() : '';
                                        const ship = (row.sailing && (row.sailing.shipCode || row.sailing.shipName)) ? String(row.sailing.shipCode || row.sailing.shipName).trim().toUpperCase() : '';
                                        const sail = (row.sailing && row.sailing.sailDate) ? String(row.sailing.sailDate).trim().slice(0,10) : '';
                                        const key = (code || '') + '|' + (ship || '') + '|' + (sail || '');
                                        if (hiddenStore && hiddenStore instanceof Set && hiddenStore.has(key)) return false;
                                        if (globalHidden && globalHidden.has(key)) return false;
                                        return true;
                                    } catch (e) { return true; }
                                };
                                // Run compute with force so B2BUtils doesn't early-return
                                const renderedRows = state && Array.isArray(state.sortedOffers) ? state.sortedOffers : [];
                                if (typeof B2BUtils !== 'undefined' && typeof B2BUtils.computeB2BDepth === 'function') {
                                    // Prefer the BackToBackTool context rows (the same dataset used by the builder)
                                    const contextRows = (window.BackToBackTool && BackToBackTool._context && Array.isArray(BackToBackTool._context.rows) && BackToBackTool._context.rows.length)
                                        ? BackToBackTool._context.rows
                                        : renderedRows;
                                    const depthsMap = B2BUtils.computeB2BDepth(contextRows, { allowSideBySide, filterPredicate, force: true });
                                    // Map depths from contextRows back into the renderedRows model by stable rowId
                                    try {
                                        contextRows.forEach((ctxRow, ctxIdx) => {
                                            try {
                                                const d = (depthsMap && typeof depthsMap.get === 'function' && depthsMap.has(ctxIdx)) ? depthsMap.get(ctxIdx) : null;
                                                if (d == null) return;
                                                const rid = ctxRow && ctxRow.sailing && ctxRow.sailing.__b2bRowId ? String(ctxRow.sailing.__b2bRowId) : null;
                                                if (!rid) return;
                                                const found = renderedRows.findIndex(p => p && p.sailing && String(p.sailing.__b2bRowId) === rid);
                                                if (found >= 0) {
                                                    try { if (renderedRows[found] && renderedRows[found].sailing) renderedRows[found].sailing.__b2bDepth = d; } catch(e){}
                                                }
                                            } catch(e) {}
                                        });
                                    } catch(e) {}
                                    // Update depth cells only for rows rendered inside the current tbody
                                    try {
                                        const tbody = (state && state.tbody) ? state.tbody : (document.querySelector('.table-scroll-container') ? document.querySelector('.table-scroll-container').querySelector('tbody') : null);
                                        const allRows = tbody ? Array.from(tbody.querySelectorAll('tr')) : Array.from(document.querySelectorAll('tbody tr'));
                                        // Build map from stable rowId -> DOM tr so we survive sorting/reorder
                                        const domById = new Map();
                                        allRows.forEach(tr => {
                                            try {
                                                const rid = tr.dataset && tr.dataset.b2bRowId ? String(tr.dataset.b2bRowId) : null;
                                                if (rid) domById.set(rid, tr);
                                            } catch(inner) {}
                                        });
                                        renderedRows.forEach((pair, i) => {
                                            try {
                                                if (!pair) return;
                                                const rowId = pair.sailing && pair.sailing.__b2bRowId ? String(pair.sailing.__b2bRowId) : null;
                                                let tr = null;
                                                if (rowId && domById.has(rowId)) tr = domById.get(rowId);
                                                // Fallback: try matching by offerIndex dataset if present on rows
                                                if (!tr) {
                                                    const possible = allRows.find(t => { try { return t.dataset && t.dataset.offerIndex !== undefined && Number(t.dataset.offerIndex) === i; } catch(e){ return false; } });
                                                    if (possible) tr = possible;
                                                }
                                                // Final fallback to positional mapping
                                                if (!tr && allRows[i]) tr = allRows[i];
                                                if (!tr) return;
                                                const cell = tr.querySelector('.b2b-depth-cell');
                                                if (!cell) return;
                                                const depth = (pair.sailing && typeof pair.sailing.__b2bDepth === 'number') ? pair.sailing.__b2bDepth : 1;
                                                const chainId = pair.sailing && pair.sailing.__b2bChainId ? pair.sailing.__b2bChainId : null;
                                                try { App.TableRenderer.updateB2BDepthCell(cell, depth, chainId); } catch(e) { cell.textContent = String(depth); }
                                            } catch(e) { /* ignore per-row errors */ }
                                        });
                                    } catch(e) {}
                                }
                            } catch(e) { /* ignore compute errors */ }
                            try { BackToBackTool.openByRowId(rowId); } catch(openErr) { try { console.debug('[B2B] openByRowId threw', openErr); } catch(e){} }
                        };
                        b2bCell.addEventListener('click', handler, true);
                        b2bCell.addEventListener('pointerdown', handler, true);
                        b2bCell.addEventListener('keydown', (ev) => {
                            if (ev.key === 'Enter' || ev.key === ' ') {
                                handler(ev);
                            }
                        }, true);
                        b2bCell.setAttribute('role', 'button');
                        b2bCell.setAttribute('tabindex', '0');
                        b2bCell.dataset.b2bCellBound = 'true';
                    }
                }
                if (window.BackToBackTool && typeof BackToBackTool.attachToCell === 'function') {
                    BackToBackTool.attachToCell(b2bCell, { offer, sailing });
                }
            }
        } catch(e) { /* ignore B2B attachment errors */ }
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
                // Attach offer category (raw room label) so the itinerary modal can compute estimates
                try { a.dataset.offerCategory = (offer.campaignOffer && offer.campaignOffer.category) ? String(offer.campaignOffer.category) : (sailing.roomType || ''); } catch(e) {}
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
                            // Remove row from DOM immediately for responsiveness
                            row.parentElement && row.parentElement.removeChild(row);
                        } catch(remErr){ /* ignore */ }
                    });
                }
            } catch(e){ /* ignore */ }
        }
        return row;
    };
})();
