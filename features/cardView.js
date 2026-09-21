(function() {
    'use strict';

    const CardView = {
        VIRTUAL_SCROLL_THRESHOLD: 100,
        BUFFER_ROWS: 8,
        CARD_HEIGHT_ESTIMATE: 168,

        _resizeObserver: null,
        _vs: null,

        render(container, state, globalMaxOfferDate = null) {
            const parked = document.getElementById('advanced-search-panel');
            if (parked && container.contains(parked)) {
                (document.getElementById('gobo-offers-table') || document.body).appendChild(parked);
            }
            this._cleanup();
            container.innerHTML = '';
            container.classList.add('gobo-card-view');

            const total = (state.sortedOffers || []).length;

            const chrome = document.createElement('div');
            chrome.className = 'gobo-card-chrome';
            chrome.appendChild(this._buildToolbar(state));
            container.appendChild(chrome);

            const grid = document.createElement('div');
            grid.className = 'gobo-card-grid';
            container.appendChild(grid);

            if (total === 0) {
                const empty = document.createElement('div');
                empty.className = 'gobo-card-empty';
                empty.textContent = 'No offers available';
                grid.appendChild(empty);
                this._dispatchComplete(state, 0);
                return;
            }

            const soonestExpDate = this._computeSoonestExpDate(state.sortedOffers);
            const columns = Math.max(1, Math.min(this._columnsFor(container.clientWidth), total));
            container._goboCardCols = columns;
            container.style.setProperty('--gobo-card-cols', String(columns));

            if (total > this.VIRTUAL_SCROLL_THRESHOLD) {
                this._attachVirtualScroll(grid, state, globalMaxOfferDate, soonestExpDate, columns);
            } else {
                const frag = document.createDocumentFragment();
                for (let idx = 0; idx < total; idx++) {
                    const card = this._createCard(state, idx, globalMaxOfferDate, soonestExpDate);
                    if (card) frag.appendChild(card);
                }
                grid.appendChild(frag);
                this._dispatchComplete(state, total);
            }

            this._attachResizeObserver(container, state, globalMaxOfferDate);
        },

        _cleanup() {
            if (this._resizeObserver) { try { this._resizeObserver.disconnect(); } catch(e) {} this._resizeObserver = null; }
            if (this._vs && this._vs.cleanup) { try { this._vs.cleanup(); } catch(e) {} }
            this._vs = null;
        },

        _columnsFor(width) {
            if (width < 640) return 1;
            if (width < 980) return 2;
            if (width < 1600) return 3;
            if (width < 2100) return 4;
            return 5;
        },

        _computeSoonestExpDate(sortedOffers) {
            let soonestExpDate = null;
            const now = Date.now();
            const twoDays = 2 * 24 * 60 * 60 * 1000;
            for (let i = 0; i < sortedOffers.length; i++) {
                const expStr = sortedOffers[i].offer.campaignOffer?.reserveByDate;
                if (!expStr) continue;
                const expDate = new Date(expStr).getTime();
                if (expDate >= now && expDate - now <= twoDays) {
                    if (!soonestExpDate || expDate < soonestExpDate) soonestExpDate = expDate;
                }
            }
            return soonestExpDate;
        },

        _hiddenColumnsSet(state) {
            try {
                if (App.TableRenderer && typeof App.TableRenderer.getHiddenColumnsSet === 'function') {
                    return App.TableRenderer.getHiddenColumnsSet(state);
                }
            } catch(e) {}
            return null;
        },

        _buildToolbar(state) {
            const toolbar = document.createElement('div');
            toolbar.className = 'gobo-card-toolbar';

            const count = document.createElement('span');
            count.className = 'gobo-card-count';
            const n = (state.sortedOffers || []).length;
            count.textContent = `${n} sailing${n === 1 ? '' : 's'}`;
            toolbar.appendChild(count);


            const wrap = document.createElement('div');
            wrap.className = 'gobo-card-sort-wrap';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'gobo-card-sort';
            btn.setAttribute('aria-label', 'Sort by');
            btn.setAttribute('aria-haspopup', 'listbox');
            btn.setAttribute('aria-expanded', 'false');
            const hiddenSet = this._hiddenColumnsSet(state);
            const items = [];
            state.headers.forEach(header => {
                if (header.key === 'favorite') return;
                if (hiddenSet && hiddenSet.has(header.key)) return;
                items.push(header);
            });
            const current = items.find(h => h.key === state.currentSortColumn) || items[0];
            btn.textContent = current ? current.label : 'Sort';
            const menu = document.createElement('div');
            menu.className = 'gobo-card-sort-menu';
            menu.setAttribute('role', 'listbox');
            menu.hidden = true;
            items.forEach(header => {
                const opt = document.createElement('button');
                opt.type = 'button';
                opt.className = 'gobo-card-sort-option';
                opt.setAttribute('role', 'option');
                opt.textContent = header.label;
                if (current && header.key === current.key) opt.setAttribute('aria-selected', 'true');
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    menu.hidden = true;
                    btn.setAttribute('aria-expanded', 'false');
                    this._applySort(state, header.key, 'asc');
                });
                menu.appendChild(opt);
            });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const willOpen = menu.hidden;
                if (willOpen) {
                    menu.hidden = false;
                    btn.setAttribute('aria-expanded', 'true');
                    const close = (ev) => {
                        if (wrap.contains(ev.target)) return;
                        menu.hidden = true;
                        btn.setAttribute('aria-expanded', 'false');
                        document.removeEventListener('click', close);
                    };
                    setTimeout(() => document.addEventListener('click', close), 0);
                } else {
                    menu.hidden = true;
                    btn.setAttribute('aria-expanded', 'false');
                }
            });
            wrap.appendChild(btn);
            wrap.appendChild(menu);
            toolbar.appendChild(wrap);

            const dirBtn = document.createElement('button');
            dirBtn.type = 'button';
            dirBtn.className = 'gobo-card-sort-dir';
            this._updateDirButton(dirBtn, state);
            dirBtn.addEventListener('click', () => {
                const key = state.currentSortColumn || (current && current.key);
                let newOrder = 'asc';
                if (state.currentSortColumn === key) {
                    newOrder = state.currentSortOrder === 'asc' ? 'desc' : (state.currentSortOrder === 'desc' ? 'original' : 'asc');
                }
                this._applySort(state, key, newOrder);
                this._updateDirButton(dirBtn, state);
            });
            toolbar.appendChild(dirBtn);

            return toolbar;
        },

        _updateDirButton(dirBtn, state) {
            const order = state.currentSortOrder;
            if (order === 'asc') { dirBtn.textContent = '\u2191'; dirBtn.setAttribute('aria-label', 'Ascending'); }
            else if (order === 'desc') { dirBtn.textContent = '\u2193'; dirBtn.setAttribute('aria-label', 'Descending'); }
            else { dirBtn.textContent = '\u21ba'; dirBtn.setAttribute('aria-label', 'Original order'); }
        },

        _applySort(state, key, order) {
            const isB2BColumn = key === 'b2bDepth';
            let spinner = null;
            try {
                if (typeof Spinner !== 'undefined' && typeof Spinner.showSpinner === 'function' && typeof Spinner.hideSpinner === 'function') {
                    Spinner.showSpinner();
                    spinner = Spinner;
                }
            } catch(e) {}

            const doWork = () => {
                state.currentSortColumn = key;
                state.currentSortOrder = order;
                if (!state.groupingStack || state.groupingStack.length === 0) {
                    state.baseSortColumn = key;
                    state.baseSortOrder = order;
                }
                state.viewMode = 'table';
                state.currentGroupColumn = null;
                state.groupingStack = [];
                state.groupKeysStack = [];
                try { if (App && App.TableRenderer) state._switchToken = App.TableRenderer.currentSwitchToken; } catch(e) {}
                try { App.TableRenderer.updateView(state); } finally {
                    if (spinner && typeof spinner.hideSpinner === 'function') {
                        try { spinner.hideSpinner(); } catch(e) {}
                    }
                }
            };

            if (isB2BColumn && App && App.TableRenderer) {
                const pending = (typeof App.TableRenderer.isB2BDepthPending === 'function') ? App.TableRenderer.isB2BDepthPending() : false;
                const missingDepths = (typeof App.TableRenderer.hasComputedB2BDepths === 'function')
                    ? !App.TableRenderer.hasComputedB2BDepths(state)
                    : (Array.isArray(state.sortedOffers) && state.sortedOffers.some(row => row && row.sailing && typeof row.sailing.__b2bDepth !== 'number'));
                if (pending || missingDepths) {
                    const waitAndDo = async () => {
                        try { if (typeof App.TableRenderer.waitForB2BDepths === 'function') await App.TableRenderer.waitForB2BDepths(); } catch(e) {}
                        requestAnimationFrame(() => setTimeout(doWork, 0));
                    };
                    requestAnimationFrame(() => setTimeout(waitAndDo, 0));
                    return;
                }
            }

            try { if (spinner) { const el = document.getElementById('gobo-loading-spinner-container'); if (el) el.offsetHeight; } } catch(e) {}
            requestAnimationFrame(() => setTimeout(doWork, 0));
        },

        _createCard(state, idx, globalMaxOfferDate, soonestExpDate) {
            const pair = state.sortedOffers[idx];
            if (!pair) return null;
            const { offer, sailing } = pair;
            const hiddenSet = this._hiddenColumnsSet(state);
            const isHiddenCol = (key) => !!(hiddenSet && hiddenSet.has(key));

            const article = document.createElement('article');
            article.className = 'gobo-sailing-card';
            article.dataset.vsIdx = String(idx);
            article.dataset.offerCode = (offer.campaignOffer?.offerCode || '').toString().trim();
            try {
                if (sailing && !sailing.__b2bRowId) sailing.__b2bRowId = B2BUtils.buildB2BRowId(offer, sailing, idx);
                if (sailing && sailing.__b2bRowId) article.dataset.b2bRowId = sailing.__b2bRowId;
            } catch(e) {}

            const offerDate = offer.campaignOffer?.startDate;
            const isNewest = globalMaxOfferDate && offerDate && new Date(offerDate).getTime() === globalMaxOfferDate;
            const expDate = offer.campaignOffer?.reserveByDate;
            const isExpiringSoon = expDate && new Date(expDate).getTime() === soonestExpDate;
            if (isNewest) article.classList.add('newest-offer-row');
            if (isExpiringSoon) article.classList.add('expiring-soon-row');

            try {
                const viewingFavorites = App.CurrentProfile && App.CurrentProfile.key === 'goob-favorites';
                if (!viewingFavorites && window.BackToBackTool && BackToBackTool._selectedRowId && article.dataset.b2bRowId && String(article.dataset.b2bRowId) === String(BackToBackTool._selectedRowId)) {
                    article.classList.add('gobo-b2b-selected');
                }
            } catch(e) {}

            let isFavoritesView = false;
            try { isFavoritesView = App.CurrentProfile && App.CurrentProfile.key === 'goob-favorites'; } catch(e) {}

            let room = sailing.roomType;
            if (sailing.isGTY) room = room ? room + ' GTY' : 'GTY';
            const itinerary = sailing.itineraryDescription || sailing.sailingType?.name || '-';
            const {nights, destination} = Utils.parseItinerary(itinerary);
            let itineraryKey;
            try {
                const sailDate = sailing?.sailDate ? String(sailing.sailDate).trim().slice(0,10) : '';
                const shipCode = sailing?.shipCode ? String(sailing.shipCode).trim() : '';
                itineraryKey = (shipCode && sailDate) ? `SD_${shipCode}_${sailDate}` : (sailDate ? `SD_UNKNOWN_${sailDate}` : 'SD_UNKNOWN');
            } catch(e) { itineraryKey = 'SD_UNKNOWN'; }
            const perksStr = Utils.computePerks(offer, sailing);
            const codeCell = offer.campaignOffer?.offerCode || '-';
            let includeTaxesAndFees = true;
            try { includeTaxesAndFees = App.Utils.getIncludeTaxesAndFeesPreference(App.TableRenderer.lastState); } catch(e){}
            const upgradeOptions = { includeTaxes: includeTaxesAndFees, state: App.TableRenderer ? App.TableRenderer.lastState : null };
            let interiorDisplay;
            let oceanViewUpgradeDisplay;
            let balconyUpgradeDisplay;
            let suiteUpgradeDisplay;
            try {
                const interiorRaw = App.Utils.computeInteriorYouPayPrice(offer, sailing, upgradeOptions);
                interiorDisplay = App.Utils.formatOfferValue(interiorRaw);
            } catch(e){ interiorDisplay = undefined; }
            try {
                oceanViewUpgradeDisplay = App.Utils.formatUpgradePriceForColumn('oceanViewUpgrade', offer, sailing, upgradeOptions);
                balconyUpgradeDisplay = App.Utils.formatUpgradePriceForColumn('balconyUpgrade', offer, sailing, upgradeOptions);
                suiteUpgradeDisplay = App.Utils.formatUpgradePriceForColumn('suiteUpgrade', offer, sailing, upgradeOptions);
            } catch(e){ oceanViewUpgradeDisplay='-'; balconyUpgradeDisplay='-'; suiteUpgradeDisplay='-'; interiorDisplay=interiorDisplay||'-'; }
            let guestsText = sailing.isGOBO ? '1 Guest' : '2 Guests';
            if (sailing.isDOLLARSOFF && sailing.DOLLARSOFF_AMT > 0) guestsText += ` + $${sailing.DOLLARSOFF_AMT} off`;
            if (sailing.isFREEPLAY && sailing.FREEPLAY_AMT > 0) guestsText += ` + $${sailing.FREEPLAY_AMT} freeplay`;

            // ===== HERO IMAGE (full-width, the cruise itself) =====
            const heroUrl = OfferPdf.heroFileUrl(offer);
            const hero = document.createElement('div');
            hero.className = 'gobo-card-hero';
            if (heroUrl) {
                const img = document.createElement('img');
                img.className = 'gobo-card-hero-img';
                img.alt = sailing.shipName || '';
                img.loading = 'lazy';
                img.addEventListener('error', () => { hero.classList.add('gobo-card-hero-fallback'); img.remove(); });
                OfferPdf.heroSrc(heroUrl).then(src => { if (src) img.src = src; }).catch(() => {});
                hero.appendChild(img);
            } else {
                hero.classList.add('gobo-card-hero-fallback');
            }
            article.appendChild(hero);

            // ===== MAIN CONTENT =====
            const main = document.createElement('div');
            main.className = 'gobo-card-main';

            // Ship name — the hero text
            const ship = document.createElement('h2');
            ship.className = 'gobo-card-ship';
            ship.textContent = sailing.shipName || '-';
            main.appendChild(ship);

            // Route: destination (itinerary link) · nights
            const route = document.createElement('div');
            route.className = 'gobo-card-route';
            const destLink = document.createElement('a');
            destLink.href = '#';
            destLink.className = 'gobo-card-dest gobo-itinerary-link';
            destLink.dataset.itineraryKey = itineraryKey;
            try { destLink.dataset.offerCategory = (offer.campaignOffer && offer.campaignOffer.category) ? String(offer.campaignOffer.category) : (sailing.roomType || ''); } catch(e) {}
            destLink.textContent = destination || itineraryKey;
            destLink.addEventListener('click', (ev) => {
                ev.preventDefault();
                try { if (ItineraryCache && typeof ItineraryCache.showModal === 'function') ItineraryCache.showModal(itineraryKey, destLink); } catch(e){}
            });
            route.appendChild(destLink);
            if (!isHiddenCol('nights')) {
                const nightsSpan = document.createElement('span');
                nightsSpan.className = 'gobo-card-route-nights';
                nightsSpan.textContent = ' \u00b7 ' + nights + ' nights';
                route.appendChild(nightsSpan);
            }
            main.appendChild(route);

            // Date · port
            const dateParts = [];
            if (!isHiddenCol('sailDate')) dateParts.push(Utils.formatDate(sailing.sailDate));
            if (!isHiddenCol('departurePort')) dateParts.push(sailing.departurePort?.name || '-');
            if (!isHiddenCol('guests')) dateParts.push(guestsText);
            if (!isHiddenCol('category') && room) dateParts.push(room);
            if (dateParts.length) {
                const dateLine = document.createElement('div');
                dateLine.className = 'gobo-card-date';
                dateLine.textContent = dateParts.join(' \u00b7 ');
                main.appendChild(dateLine);
            }
            if (!isHiddenCol('perks') && perksStr) {
                const perks = document.createElement('div');
                perks.className = 'gobo-card-date';
                perks.textContent = perksStr;
                main.appendChild(perks);
            }

            // Prices — the value prop (clean columns)
            const priceItems = [];
            if (!isHiddenCol('interior') && interiorDisplay !== undefined) priceItems.push(['Interior', interiorDisplay]);
            if (!isHiddenCol('oceanViewUpgrade') && oceanViewUpgradeDisplay !== undefined) priceItems.push(['Ocean View', oceanViewUpgradeDisplay]);
            if (!isHiddenCol('balconyUpgrade') && balconyUpgradeDisplay !== undefined) priceItems.push(['Balcony', balconyUpgradeDisplay]);
            if (!isHiddenCol('suiteUpgrade') && suiteUpgradeDisplay !== undefined) priceItems.push(['Suite', suiteUpgradeDisplay]);
            if (priceItems.length) {
                const prices = document.createElement('div');
                prices.className = 'gobo-card-prices';
                priceItems.forEach(([label, val]) => {
                    const col = document.createElement('div');
                    col.className = 'gobo-card-price';
                    const l = document.createElement('span');
                    l.className = 'gobo-card-price-label';
                    l.textContent = label;
                    const v = document.createElement('span');
                    v.className = 'gobo-card-price-val';
                    v.textContent = val;
                    col.appendChild(l);
                    col.appendChild(v);
                    prices.appendChild(col);
                });
                main.appendChild(prices);
            }

            // Sub line: offer code (flyer link) · expires
            const sub = document.createElement('div');
            sub.className = 'gobo-card-sub';
            if (!isHiddenCol('offerCode')) {
                const codeBtn = document.createElement('button');
                codeBtn.type = 'button';
                codeBtn.className = 'gobo-card-code';
                codeBtn.textContent = codeCell;
                codeBtn.setAttribute('aria-label', `Open flyer for offer ${codeCell}`);
                codeBtn.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    try { OfferPdf.open(codeCell, state); } catch(e) {}
                });
                sub.appendChild(codeBtn);
            }
            if (!isHiddenCol('expiration')) {
                const exp = document.createElement('span');
                exp.className = 'gobo-card-expires';
                exp.textContent = ' \u00b7 Expires ' + Utils.formatDate(offer.campaignOffer?.reserveByDate);
                sub.appendChild(exp);
            }
            if (sub.children.length) main.appendChild(sub);

            // Actions: B2B pill + favorite
            const actions = document.createElement('div');
            actions.className = 'gobo-card-actions';
            if (!isHiddenCol('b2bDepth')) {
                const b2b = document.createElement('div');
                b2b.className = 'b2b-depth-cell b2b-depth-cell-action';
                const rowId = sailing && sailing.__b2bRowId;
                if (rowId) {
                    b2b.dataset.b2bRowId = rowId;
                    try {
                        const depth = (typeof sailing.__b2bDepth === 'number') ? sailing.__b2bDepth : null;
                        const chainId = sailing && sailing.__b2bChainId ? sailing.__b2bChainId : null;
                        if (depth !== null && App.TableRenderer && typeof App.TableRenderer.updateB2BDepthCell === 'function') {
                            App.TableRenderer.updateB2BDepthCell(b2b, depth, chainId);
                        }
                    } catch(e) {}
                    if (!b2b.dataset.b2bCellBound) {
                        const handler = (ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            if (!window.BackToBackTool || typeof BackToBackTool.openByRowId !== 'function') return;
                            try { BackToBackTool.openByRowId(rowId); } catch(e){}
                        };
                        b2b.addEventListener('click', handler, true);
                        b2b.addEventListener('keydown', (ev) => {
                            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); handler(ev); }
                        }, true);
                        b2b.setAttribute('role', 'button');
                        b2b.setAttribute('tabindex', '0');
                        b2b.dataset.b2bCellBound = 'true';
                    }
                }
                try { if (window.BackToBackTool && typeof BackToBackTool.attachToCell === 'function') BackToBackTool.attachToCell(b2b, { offer, sailing }); } catch(e) {}
                actions.appendChild(b2b);
            }
            actions.appendChild(this._buildFavoriteControl(offer, sailing, idx, isFavoritesView));
            main.appendChild(actions);


            article.appendChild(main);
            return article;
        },

        _buildFavoriteControl(offer, sailing, idx, isFavoritesView) {
            const wrap = document.createElement('div');
            wrap.className = 'gobo-card-fav';
            if (isFavoritesView && idx !== null) {
                let savedProfileId = (sailing && sailing.__profileId !== undefined && sailing.__profileId !== null)
                    ? sailing.__profileId
                    : (offer && offer.__favoriteMeta && offer.__favoriteMeta.profileId !== undefined && offer.__favoriteMeta.profileId !== null)
                        ? offer.__favoriteMeta.profileId
                        : '-';
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
                const badge = document.createElement('span');
                badge.className = badgeClass;
                badge.title = `Profile ID #${savedProfileId}`;
                badge.textContent = badgeText;
                wrap.appendChild(badge);
                const trash = document.createElement('span');
                trash.className = 'trash-favorite';
                trash.title = 'Remove from Favorites';
                trash.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 2V1.5C6 1.22 6.22 1 6.5 1H9.5C9.78 1 10 1.22 10 1.5V2M2 4H14M12.5 4V13.5C12.5 13.78 12.28 14 12 14H4C3.72 14 3.5 13.78 3.5 13.5V4M5.5 7V11M8 7V11M10.5 7V11" stroke="#888" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                trash.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    let embeddedPid = sailing && (sailing.__profileId !== undefined ? sailing.__profileId : (offer.__favoriteMeta && offer.__favoriteMeta.profileId));
                    try { Favorites.removeFavorite(offer, sailing, embeddedPid); } catch(err){}
                    try { const card = wrap.closest('.gobo-sailing-card'); if (card) card.remove(); } catch(err){}
                });
                wrap.appendChild(trash);
            } else {
                let profileId = null;
                try { if (App.CurrentProfile && App.CurrentProfile.state && App.CurrentProfile.state.profileId != null) profileId = App.CurrentProfile.state.profileId; } catch(e){}
                let isFav = false;
                try { if (window.Favorites && Favorites.isFavorite) isFav = Favorites.isFavorite(offer, sailing, profileId); } catch(e){}
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'favorite-toggle';
                btn.setAttribute('aria-label', `${isFav ? 'Unfavorite' : 'Favorite'} sailing`);
                btn.title = isFav ? 'Remove from Favorites' : 'Add to Favorites';
                btn.textContent = isFav ? '\u2605' : '\u2606';
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    let pid = null;
                    try { if (App.CurrentProfile && App.CurrentProfile.state) pid = App.CurrentProfile.state.profileId; } catch(err){}
                    try { if (Favorites.ensureProfileExists) Favorites.ensureProfileExists(); } catch(err){}
                    try { Favorites.toggleFavorite(offer, sailing, pid); } catch(err){}
                    let nowFav = false;
                    try { nowFav = Favorites.isFavorite(offer, sailing, pid); } catch(e2){}
                    btn.textContent = nowFav ? '\u2605' : '\u2606';
                    btn.style.color = nowFav ? '#f5c518' : '#bbb';
                    btn.setAttribute('aria-label', nowFav ? 'Unfavorite sailing' : 'Favorite sailing');
                    btn.title = nowFav ? 'Remove from Favorites' : 'Add to Favorites';
                });
                wrap.appendChild(btn);
            }
            return wrap;
        },

        _attachVirtualScroll(grid, state, globalMaxOfferDate, soonestExpDate, columns) {
            const self = this;
            const total = state.sortedOffers.length;
            const rowCount = Math.ceil(total / columns);

            const topSpacer = document.createElement('div');
            topSpacer.className = 'gobo-card-spacer-top';
            topSpacer.style.gridColumn = '1 / -1';
            const bottomSpacer = document.createElement('div');
            bottomSpacer.className = 'gobo-card-spacer-bottom';
            bottomSpacer.style.gridColumn = '1 / -1';

            grid.innerHTML = '';
            grid.appendChild(topSpacer);
            grid.appendChild(bottomSpacer);

            let rowHeight = this.CARD_HEIGHT_ESTIMATE;
            try {
                const probe = this._createCard(state, 0, globalMaxOfferDate, soonestExpDate);
                if (probe) {
                    grid.appendChild(probe);
                    const h = probe.offsetHeight;
                    if (h > 0) rowHeight = h;
                    grid.removeChild(probe);
                }
            } catch(e) {}

            const vs = {
                topSpacer,
                bottomSpacer,
                rowHeight,
                columns,
                rowCount,
                total,
                renderedStartRow: 0,
                renderedEndRow: 0,
                cleanup: null
            };
            this._vs = vs;

            let scrollEl = null;
            const findScrollContainer = () => {
                try {
                    const sc = grid.closest('.table-scroll-container');
                    if (sc) return sc;
                } catch(e) {}
                return null;
            };
            scrollEl = findScrollContainer();

            const renderVisible = () => {
                if (!scrollEl) scrollEl = findScrollContainer();
                const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
                const viewportHeight = scrollEl ? scrollEl.clientHeight : 600;
                const buffer = self.BUFFER_ROWS;

                const firstRow = Math.floor(scrollTop / rowHeight);
                let startRow = Math.max(0, firstRow - buffer);
                let endRow = Math.ceil((scrollTop + viewportHeight) / rowHeight);
                endRow = Math.min(rowCount, endRow + buffer);

                if (startRow === vs.renderedStartRow && endRow === vs.renderedEndRow) return;

                const startIdx = startRow * columns;
                const endIdx = Math.min(total, endRow * columns);

                const frag = document.createDocumentFragment();
                for (let i = startIdx; i < endIdx; i++) {
                    const card = self._createCard(state, i, globalMaxOfferDate, soonestExpDate);
                    if (card) {
                        card.dataset.vsIdx = String(i);
                        frag.appendChild(card);
                    }
                }

                while (topSpacer.nextSibling && topSpacer.nextSibling !== bottomSpacer) {
                    grid.removeChild(topSpacer.nextSibling);
                }
                grid.insertBefore(frag, bottomSpacer);

                topSpacer.style.height = (startRow * rowHeight) + 'px';
                bottomSpacer.style.height = ((rowCount - endRow) * rowHeight) + 'px';

                vs.renderedStartRow = startRow;
                vs.renderedEndRow = endRow;

                try {
                    const evt = new CustomEvent('tableChunkRendered', { detail: { token: state._rowRenderToken, rendered: endIdx, virtualStart: startIdx, virtualEnd: endIdx } });
                    document.dispatchEvent(evt);
                } catch(e) {}
            };

            let rafId = null;
            const onScroll = () => {
                if (rafId) return;
                rafId = requestAnimationFrame(() => {
                    rafId = null;
                    try { renderVisible(); } catch(e) { console.debug('[cardView] virtual scroll error', e); }
                });
            };

            renderVisible();

            const attachListener = () => {
                const el = scrollEl || findScrollContainer();
                if (el) {
                    if (state._vsCleanup) { try { state._vsCleanup(); } catch(e) {} }
                    el.addEventListener('scroll', onScroll, { passive: true });
                    const cleanup = () => {
                        el.removeEventListener('scroll', onScroll);
                        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
                    };
                    state._vsCleanup = cleanup;
                    vs.cleanup = cleanup;
                } else {
                    requestAnimationFrame(() => {
                        const e = findScrollContainer();
                        if (e) {
                            scrollEl = e;
                            if (state._vsCleanup) { try { state._vsCleanup(); } catch(err) {} }
                            e.addEventListener('scroll', onScroll, { passive: true });
                            const cleanup = () => {
                                e.removeEventListener('scroll', onScroll);
                                if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
                            };
                            state._vsCleanup = cleanup;
                            vs.cleanup = cleanup;
                        }
                    });
                }
            };
            attachListener();

            try {
                setTimeout(() => {
                    try {
                        const evt = new CustomEvent('tableRenderComplete', { detail: { token: state._rowRenderToken, total } });
                        document.dispatchEvent(evt);
                    } catch(e) {}
                }, 0);
            } catch(e) {}
        },

        _attachResizeObserver(container, state, globalMaxOfferDate) {
            if (typeof ResizeObserver !== 'function') return;
            const self = this;
            const ro = new ResizeObserver((entries) => {
                try {
                    const w = entries[0] && entries[0].contentRect ? entries[0].contentRect.width : container.clientWidth;
                    const cols = self._columnsFor(w);
                    const last = container._goboCardCols;
                    if (last !== undefined && cols === last) return;
                    container._goboCardCols = cols;
                    self.render(container, state, globalMaxOfferDate);
                } catch(e) {}
            });
            ro.observe(container);
            this._resizeObserver = ro;
        },

        _dispatchComplete(state, total) {
            try {
                setTimeout(() => {
                    try {
                        const evt = new CustomEvent('tableRenderComplete', { detail: { token: state._rowRenderToken, total } });
                        document.dispatchEvent(evt);
                    } catch(e) {}
                }, 0);
            } catch(e) {}
        },

        mountFilterBar(state) {
            const preds = (state.advancedSearch && state.advancedSearch.predicates) || [];
            const panel = (state.advancedSearchPanel) || document.getElementById('advanced-search-panel');
            const open = preds.length > 0 || (panel && panel.classList.contains('gobo-card-filter-sheet') && !panel.classList.contains('adv-collapsed'));
            if (!open) return;
            this.openFilterSheet(state);
        },

        openFilterSheet(state) {
            try {
                state.advancedSearch.enabled = true;
                const advContainer = document.querySelector('.breadcrumb-container') || document.body;
                try { App.AdvancedSearch.scaffoldPanel(state, advContainer); } catch(e) {}
                try { App.AdvancedSearch.restorePredicates(state); } catch(e) {}
                try { App.AdvancedSearch.updateBadge(state); } catch(e) {}
                const panel = state.advancedSearchPanel || document.getElementById('advanced-search-panel');
                if (panel) {
                    panel.classList.add('gobo-card-filter-sheet');
                    panel.classList.remove('adv-collapsed');
                }
                const backdrop = document.querySelector('.gobo-card-filter-backdrop');
                if (backdrop) backdrop.remove();
            } catch(e) { console.debug('[cardView] openFilterSheet error', e); }
        },

        closeFilterSheet(state) {
            try {
                const preds = (state.advancedSearch && state.advancedSearch.predicates) || [];
                const backdrop = document.querySelector('.gobo-card-filter-backdrop');
                if (backdrop) backdrop.remove();
                if (preds.length) return;
                const panel = state.advancedSearchPanel || document.getElementById('advanced-search-panel');
                if (panel) panel.classList.add('adv-collapsed');
                const filterBtn = document.querySelector('.gobo-card-filter');
                if (filterBtn) filterBtn.setAttribute('aria-expanded', 'false');
            } catch(e) { console.debug('[cardView] closeFilterSheet error', e); }
        },

        hideCards(state) {
            try {
                this.closeFilterSheet(state);
                const panel = state.advancedSearchPanel || document.getElementById('advanced-search-panel');
                if (panel) {
                    panel.classList.remove('gobo-card-filter-sheet');
                    const home = document.querySelector('.breadcrumb-container');
                    if (home && panel.parentElement !== home) home.appendChild(panel);
                }
            } catch(e) {}
        },
    };

    window.CardView = CardView;
    try { module.exports = CardView; } catch(e) {}
})();
