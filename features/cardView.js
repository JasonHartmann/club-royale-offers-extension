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

            const groups = this._buildGroups(state);
            const countEl = chrome.querySelector('.gobo-card-count');
            if (countEl) {
                const trips = groups.length;
                countEl.textContent = `${total} sailing${total === 1 ? '' : 's'} · ${trips} trip${trips === 1 ? '' : 's'}`;
            }
            const frag = document.createDocumentFragment();
            groups.forEach(group => {
                const card = this._createGroupCard(state, group, globalMaxOfferDate, soonestExpDate);
                if (card) frag.appendChild(card);
            });
            grid.appendChild(frag);
            this._dispatchComplete(state, total);

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
            this._updateDirButton(dirBtn, state.currentSortOrder);
            dirBtn.addEventListener('click', () => {
                const key = state.currentSortColumn || (current && current.key);
                const newOrder = state.currentSortOrder === 'desc' ? 'asc' : 'desc';
                this._applySort(state, key, newOrder);
                this._updateDirButton(dirBtn, newOrder);
            });
            toolbar.appendChild(dirBtn);

            return toolbar;
        },

        _updateDirButton(dirBtn, order) {
            const desc = order === 'desc';
            dirBtn.textContent = desc ? '\u2193' : '\u2191';
            dirBtn.setAttribute('aria-label', desc ? 'Descending' : 'Ascending');
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
                try {
                    if (App && App.SettingsStore && typeof App.SettingsStore.setCardSort === 'function') App.SettingsStore.setCardSort(key, order);
                } catch(e) {}
                if (!state._tableSort) state._tableSort = { column: state.currentSortColumn, order: state.currentSortOrder };
                state.currentSortColumn = key;
                state.currentSortOrder = order;
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

        _openMonths: null,

        _buildGroups(state) {
            const groups = [];
            const byKey = new Map();
            const rows = state.sortedOffers || [];
            for (let idx = 0; idx < rows.length; idx++) {
                const pair = rows[idx];
                if (!pair || !pair.sailing) continue;
                const key = this._groupKey(pair.sailing);
                let group = byKey.get(key);
                if (!group) {
                    group = { key, rows: [] };
                    byKey.set(key, group);
                    groups.push(group);
                }
                group.rows.push(idx);
            }
            return groups;
        },

        _groupKey(sailing) {
            const parsed = this._destParts(sailing);
            const ship = (sailing.shipCode || sailing.shipName || '-').toString().trim().toLowerCase();
            const port = (sailing.departurePort && sailing.departurePort.name) || '-';
            return [ship, parsed.nights, parsed.key, port.trim().toLowerCase()].join('|');
        },

        _destParts(sailing) {
            const itin = (sailing && (sailing.itineraryDescription || (sailing.sailingType && sailing.sailingType.name))) || '-';
            let nights = '-';
            let destination = itin;
            try {
                const parsed = Utils.parseItinerary(itin);
                nights = parsed.nights != null ? String(parsed.nights) : '-';
                destination = parsed.destination || itin;
            } catch(e) {}
            if (sailing && sailing.totalNights) nights = String(sailing.totalNights);
            const stripped = String(destination || '-').replace(/\s+cruise$/i, '').trim();
            let label = stripped;
            try { if (Utils.toTitleCase) label = Utils.toTitleCase(stripped); } catch(e) {}
            return { nights, label, key: stripped.toLowerCase() };
        },

        _guestsText(sailing) {
            let guestsText = sailing && sailing.isGOBO ? '1 Guest' : '2 Guests';
            if (sailing && sailing.isDOLLARSOFF && sailing.DOLLARSOFF_AMT > 0) guestsText += ` + $${sailing.DOLLARSOFF_AMT} off`;
            if (sailing && sailing.isFREEPLAY && sailing.FREEPLAY_AMT > 0) guestsText += ` + $${sailing.FREEPLAY_AMT} freeplay`;
            return guestsText;
        },

        _roomLabel(sailing) {
            let room = (sailing && sailing.roomType) || '';
            if (!room && sailing && Array.isArray(sailing.roomTypeList) && sailing.roomTypeList[0]) {
                room = sailing.roomTypeList[0].name || sailing.roomTypeList[0].code || '';
            }
            if (sailing && sailing.isGTY) room = room ? room + ' GTY' : 'GTY';
            return room;
        },

        _includeTaxes(state) {
            try { return App.Utils.getIncludeTaxesAndFeesPreference(state); } catch(e) { return true; }
        },

        _cabinPrices(offer, sailing, state, isHiddenCol) {
            const opts = { includeTaxes: this._includeTaxes(state), state };
            const cols = [
                ['interior', 'Int', 'Interior'],
                ['oceanViewUpgrade', 'OV', 'Ocean View'],
                ['balconyUpgrade', 'Bal', 'Balcony'],
                ['suiteUpgrade', 'Ste', 'Suite']
            ];
            const out = [];
            cols.forEach(([key, shortLabel, label]) => {
                if (isHiddenCol(key)) return;
                let raw = null;
                try {
                    if (key === 'interior' && App.Utils.computeInteriorYouPayPrice) {
                        raw = App.Utils.computeInteriorYouPayPrice(offer, sailing, opts);
                    } else if (App.Utils.computeUpgradePriceForColumn) {
                        raw = App.Utils.computeUpgradePriceForColumn(key, offer, sailing, opts);
                    }
                } catch(e) { raw = null; }
                const num = Number(raw);
                if (raw == null || !isFinite(num)) return;
                let text = '';
                try { text = App.Utils.formatOfferValue(num); } catch(e) { text = '$' + Math.round(num); }
                out.push({ key, shortLabel, label, raw: num, text });
            });
            return out;
        },

        _anchorKey(state, isHiddenCol) {
            const priceKeys = ['interior', 'oceanViewUpgrade', 'balconyUpgrade', 'suiteUpgrade'];
            const sortKey = state && state.currentSortColumn;
            if (priceKeys.indexOf(sortKey) !== -1 && !isHiddenCol(sortKey)) return sortKey;
            if (!isHiddenCol('interior')) return 'interior';
            for (let i = 0; i < priceKeys.length; i++) {
                if (!isHiddenCol(priceKeys[i])) return priceKeys[i];
            }
            return null;
        },

        _minCabin(idxs, key, state, isHiddenCol) {
            let best = null;
            idxs.forEach(idx => {
                const pair = state.sortedOffers[idx];
                if (!pair) return;
                const cabins = this._cabinPrices(pair.offer, pair.sailing, state, isHiddenCol);
                const found = cabins.find(c => c.key === key);
                if (!found) return;
                if (!best || found.raw < best.raw) best = found;
            });
            return best;
        },

        // Collapse a group's rows (one per offer) into one entry per unique sail date.
        // For each date, keep the best (lowest) price per cabin across all offers and
        // pick a representative offer (lowest anchor price) for the row's metadata.
        _mergedDates(state, group, isHiddenCol) {
            const byDate = new Map();
            group.rows.forEach(idx => {
                const pair = state.sortedOffers[idx];
                if (!pair || !pair.sailing) return;
                const date = pair.sailing.sailDate ? String(pair.sailing.sailDate).slice(0, 10) : 'unknown';
                let bucket = byDate.get(date);
                if (!bucket) { bucket = { date, rows: [] }; byDate.set(date, bucket); }
                bucket.rows.push(idx);
            });
            const order = ['interior', 'oceanViewUpgrade', 'balconyUpgrade', 'suiteUpgrade'];
            const out = [];
            byDate.forEach(bucket => {
                const best = {};
                let repIdx = bucket.rows[0];
                let repPrice = Infinity;
                bucket.rows.forEach(idx => {
                    const pair = state.sortedOffers[idx];
                    const cabins = this._cabinPrices(pair.offer, pair.sailing, state, isHiddenCol);
                    cabins.forEach(c => {
                        if (!best[c.key] || c.raw < best[c.key].raw) best[c.key] = c;
                    });
                    const anchor = cabins.find(c => c.key === 'interior') || cabins[0];
                    const p = anchor ? anchor.raw : Infinity;
                    if (p < repPrice) { repPrice = p; repIdx = idx; }
                });
                const cabins = order.map(k => best[k]).filter(Boolean);
                out.push({ date: bucket.date, repIdx, rows: bucket.rows, cabins });
            });
            out.sort((a, b) => a.date.localeCompare(b.date));
            return out;
        },

        _urgency(reserveIso) {
            if (!reserveIso) return null;
            const day = String(reserveIso).slice(0, 10);
            const end = new Date(day + 'T12:00:00');
            if (isNaN(end.getTime())) return null;
            const today = new Date();
            today.setHours(12, 0, 0, 0);
            const days = Math.round((end - today) / 86400000);
            let label = 'Expires ' + day;
            try { label = 'Expires ' + Utils.formatDate(reserveIso); } catch(e) {}
            if (days < 0) return { cls: 'red', days, label: 'Expired ' + label.replace(/^Expires\s/, '') };
            if (days === 0) return { cls: 'red', days, label: 'Expires today' };
            if (days === 1) return { cls: 'red', days, label: 'Expires tomorrow' };
            if (days < 4) return { cls: 'red', days, label: 'Expires in ' + days + ' days' };
            if (days <= 14) return { cls: 'amber', days, label: 'Expires in ' + days + ' days' };
            return { cls: 'green', days, label: 'Expires in ' + days + ' days' };
        },

        _formatDay(iso) {
            const day = String(iso || '').slice(0, 10);
            try {
                const formatted = Utils.formatDate(day);
                if (formatted && formatted !== '-') return formatted;
            } catch(e) {}
            return day || '-';
        },

        _monthLabel(key) {
            const parts = String(key || '').split('-');
            if (parts.length < 2) return key || '';
            const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const month = names[Number(parts[1]) - 1] || parts[1];
            return month + ' ' + parts[0];
        },

        _createGroupCard(state, group, globalMaxOfferDate, soonestExpDate) {
            const firstPair = state.sortedOffers[group.rows[0]];
            if (!firstPair) return null;
            const hiddenSet = this._hiddenColumnsSet(state);
            const isHiddenCol = (key) => !!(hiddenSet && hiddenSet.has(key));
            const offer = firstPair.offer;
            const sailing = firstPair.sailing;
            const parsed = this._destParts(sailing);
            const anchorKey = this._anchorKey(state, isHiddenCol);
            const anchor = anchorKey ? this._minCabin(group.rows, anchorKey, state, isHiddenCol) : null;
            const merged = this._mergedDates(state, group, isHiddenCol);
            let bestIdx = group.rows[0];
            let bestPrice = Infinity;
            group.rows.forEach(idx => {
                const pair = state.sortedOffers[idx];
                if (!pair) return;
                const cabins = this._cabinPrices(pair.offer, pair.sailing, state, isHiddenCol);
                const a = cabins.find(c => c.key === anchorKey) || cabins[0];
                const p = a ? a.raw : Infinity;
                if (p < bestPrice) { bestPrice = p; bestIdx = idx; }
            });
            const bestOffer = state.sortedOffers[bestIdx].offer;
            let soonestReserve = null;
            group.rows.forEach(idx => {
                const pair = state.sortedOffers[idx];
                const rb = pair && pair.offer && pair.offer.campaignOffer && pair.offer.campaignOffer.reserveByDate;
                if (rb) {
                    const t = new Date(rb).getTime();
                    if (!soonestReserve || t < new Date(soonestReserve).getTime()) soonestReserve = rb;
                }
            });
            const urgent = isHiddenCol('expiration') ? null : this._urgency(soonestReserve);
            const newest = group.rows.some(idx => {
                const pair = state.sortedOffers[idx];
                const offerDate = pair && pair.offer && pair.offer.campaignOffer && pair.offer.campaignOffer.startDate;
                return globalMaxOfferDate && offerDate && new Date(offerDate).getTime() === globalMaxOfferDate;
            });
            const expiringSoon = group.rows.some(idx => {
                const pair = state.sortedOffers[idx];
                const expDate = pair && pair.offer && pair.offer.campaignOffer && pair.offer.campaignOffer.reserveByDate;
                return expDate && soonestExpDate && new Date(expDate).getTime() === soonestExpDate;
            });

            const article = document.createElement('article');
            article.className = 'gobo-sailing-card';
            const code = (bestOffer.campaignOffer && bestOffer.campaignOffer.offerCode) || '-';
            article.dataset.offerCode = String(code).trim();
            if (newest) article.classList.add('newest-offer-row');
            if (expiringSoon) article.classList.add('expiring-soon-row');

            article.appendChild(this._buildHero(state, offer, sailing, parsed, urgent, newest));
            const body = document.createElement('div');
            body.className = 'gobo-card-body';
            body.appendChild(this._buildPriceBlock(anchor, urgent, state));
            const spec = this._buildSpec(state, group, parsed, sailing, isHiddenCol);
            if (spec) body.appendChild(spec);
            const perks = this._buildPerkChips(state, group, isHiddenCol);
            if (perks) body.appendChild(perks);

            const dates = document.createElement('div');
            dates.className = 'gobo-card-dates';
            if (merged.length > 4) {
                this._appendMonths(dates, state, group, merged, anchorKey, isHiddenCol);
            } else {
                merged.forEach(md => dates.appendChild(this._createDateRow(state, md, anchorKey, isHiddenCol, false)));
            }
            body.appendChild(dates);
            article.appendChild(body);

            if (!isHiddenCol('offerCode')) {
                const footer = document.createElement('footer');
                footer.className = 'gobo-card-footer';
                const codeBtn = document.createElement('button');
                codeBtn.type = 'button';
                codeBtn.className = 'gobo-card-code';
                codeBtn.textContent = code;
                codeBtn.setAttribute('aria-label', 'Open flyer for offer ' + code);
                codeBtn.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    try { OfferPdf.open(code, state); } catch(e) {}
                });
                footer.appendChild(codeBtn);
                article.appendChild(footer);
            }
            return article;
        },

        _buildHero(state, offer, sailing, parsed, urgent, newest) {
            const hero = document.createElement('div');
            hero.className = 'gobo-card-hero';
            const img = document.createElement('img');
            img.className = 'gobo-card-hero-img';
            img.alt = sailing.shipName || '';
            img.loading = 'lazy';
            let heroUrl = '';
            try { heroUrl = OfferPdf.heroFileUrl(offer); } catch(e) {}
            if (heroUrl) {
                img.addEventListener('error', () => { img.remove(); });
                try {
                    OfferPdf.heroSrc(heroUrl).then(src => { if (src) img.src = src; }).catch(() => {});
                } catch(e) {}
                hero.appendChild(img);
            }
            const scrim = document.createElement('div');
            scrim.className = 'gobo-hero-scrim';
            hero.appendChild(scrim);
            const content = document.createElement('div');
            content.className = 'gobo-hero-content';
            const copy = document.createElement('div');
            copy.className = 'gobo-hero-copy';
            const title = document.createElement('h2');
            title.className = 'gobo-card-ship';
            const byShip = state && state.currentSortColumn === 'ship';
            const dest = parsed.label || sailing.shipName || '-';
            const shipName = sailing.shipName || '-';
            title.textContent = byShip ? shipName : dest;
            copy.appendChild(title);
            const sub = document.createElement('p');
            sub.className = 'gobo-hero-sub';
            const portName = (sailing.departurePort && sailing.departurePort.name) || '';
            const nightsText = (parsed.nights && parsed.nights !== '-') ? (parsed.nights + (String(parsed.nights) === '1' ? ' night' : ' nights')) : '';
            sub.textContent = [byShip ? dest : shipName, portName, nightsText].filter(Boolean).join(' \u00b7 ');
            copy.appendChild(sub);
            content.appendChild(copy);
            if (urgent && urgent.cls === 'red') {
                const badge = document.createElement('span');
                badge.className = 'gobo-hero-badge gobo-hero-badge-expiring';
                badge.textContent = urgent.days < 0 ? 'Expired' : 'Expiring';
                content.appendChild(badge);
            } else if (newest) {
                const badge = document.createElement('span');
                badge.className = 'gobo-hero-badge gobo-hero-badge-newest';
                badge.textContent = 'Newest';
                content.appendChild(badge);
            }
            hero.appendChild(content);
            return hero;
        },

        _buildPriceBlock(anchor, urgent, state) {
            const block = document.createElement('div');
            block.className = 'gobo-price-block';
            if (anchor) {
                const main = document.createElement('div');
                main.className = 'gobo-price-main';
                const value = document.createElement('span');
                value.className = 'gobo-price-value';
                value.textContent = anchor.text;
                const label = document.createElement('span');
                label.className = 'gobo-price-label';
                label.textContent = anchor.label + ' you-pay';
                main.appendChild(value);
                main.appendChild(label);
                block.appendChild(main);
            }
            if (urgent) {
                const chip = document.createElement('span');
                chip.className = 'gobo-urgency gobo-urgency-' + urgent.cls;
                chip.textContent = urgent.label;
                block.appendChild(chip);
            }
            return block;
        },

        _buildSpec(state, group, parsed, sailing, isHiddenCol) {
            if (isHiddenCol('offerName')) return null;
            const first = state.sortedOffers[group.rows[0]];
            const name = (first && first.offer.campaignOffer && first.offer.campaignOffer.name) || '';
            if (!name || name === '-') return null;
            const spec = document.createElement('dl');
            spec.className = 'gobo-spec';
            const dt = document.createElement('dt');
            dt.textContent = 'Offer';
            const dd = document.createElement('dd');
            dd.textContent = name;
            spec.appendChild(dt);
            spec.appendChild(dd);
            return spec;
        },

        _buildPerkChips(state, group, isHiddenCol) {
            if (isHiddenCol('perks')) return null;
            const names = [];
            group.rows.forEach(idx => {
                const pair = state.sortedOffers[idx];
                let perks = '';
                try { perks = Utils.computePerks(pair.offer, pair.sailing) || ''; } catch(e) {}
                String(perks).split('|').forEach(part => {
                    const name = part.trim();
                    if (!name || name === '-') return;
                    if (names.indexOf(name) === -1) names.push(name);
                });
            });
            if (!names.length) return null;
            const wrap = document.createElement('div');
            wrap.className = 'gobo-perks';
            names.forEach(name => {
                const chip = document.createElement('span');
                chip.className = 'gobo-perk';
                chip.textContent = name;
                wrap.appendChild(chip);
            });
            return wrap;
        },

        _appendMonths(container, state, group, merged, anchorKey, isHiddenCol) {
            if (!this._openMonths) this._openMonths = new Set();
            const months = [];
            const byMonth = new Map();
            merged.forEach(md => {
                const iso = md.date ? md.date.slice(0, 7) : 'unknown';
                let bucket = byMonth.get(iso);
                if (!bucket) {
                    bucket = { key: iso, items: [] };
                    byMonth.set(iso, bucket);
                    months.push(bucket);
                }
                bucket.items.push(md);
            });
            months.forEach(month => {
                const id = group.key + '|' + month.key;
                const open = this._openMonths.has(id);
                const block = document.createElement('div');
                block.className = 'gobo-month';
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'gobo-month-toggle';
                btn.setAttribute('aria-expanded', open ? 'true' : 'false');
                const chev = document.createElement('span');
                chev.className = 'gobo-chev';
                chev.textContent = open ? '\u25be' : '\u25b8';
                const label = document.createElement('span');
                label.className = 'gobo-month-label';
                label.textContent = this._monthLabel(month.key);
                const count = document.createElement('span');
                count.className = 'gobo-month-count';
                count.textContent = month.items.length + (month.items.length === 1 ? ' date' : ' dates');
                btn.appendChild(chev);
                btn.appendChild(label);
                btn.appendChild(count);
                const monthRows = month.items.reduce((acc, md) => acc.concat(md.rows), []);
                const from = anchorKey ? this._minCabin(monthRows, anchorKey, state, isHiddenCol) : null;
                if (from) {
                    const fromEl = document.createElement('span');
                    fromEl.className = 'gobo-month-from';
                    fromEl.textContent = 'from ' + from.text;
                    btn.appendChild(fromEl);
                }
                const panel = document.createElement('div');
                panel.className = 'gobo-month-panel' + (open ? ' is-open' : '');
                const inner = document.createElement('div');
                inner.className = 'gobo-month-panel-inner';
                month.items.forEach(md => inner.appendChild(this._createDateRow(state, md, anchorKey, isHiddenCol, true)));
                panel.appendChild(inner);
                btn.addEventListener('click', () => {
                    const willOpen = !panel.classList.contains('is-open');
                    panel.classList.toggle('is-open', willOpen);
                    btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
                    chev.textContent = willOpen ? '\u25be' : '\u25b8';
                    if (willOpen) this._openMonths.add(id);
                    else this._openMonths.delete(id);
                });
                block.appendChild(btn);
                block.appendChild(panel);
                container.appendChild(block);
            });
        },

        _createDateRow(state, md, anchorKey, isHiddenCol, nested) {
            const idx = md.repIdx;
            const pair = state.sortedOffers[idx];
            const offer = pair.offer;
            const sailing = pair.sailing;
            const row = document.createElement('div');
            row.className = 'gobo-date-row' + (nested ? ' is-nested' : '');
            row.dataset.vsIdx = String(idx);
            try {
                if (sailing && !sailing.__b2bRowId) sailing.__b2bRowId = B2BUtils.buildB2BRowId(offer, sailing, idx);
                if (sailing && sailing.__b2bRowId) row.dataset.b2bRowId = sailing.__b2bRowId;
            } catch(e) {}
            try {
                const viewingFavorites = App.CurrentProfile && App.CurrentProfile.key === 'goob-favorites';
                if (!viewingFavorites && window.BackToBackTool && BackToBackTool._selectedRowId && row.dataset.b2bRowId && String(row.dataset.b2bRowId) === String(BackToBackTool._selectedRowId)) {
                    row.classList.add('gobo-b2b-selected');
                }
            } catch(e) {}

            const main = document.createElement('div');
            main.className = 'gobo-date-main';
            const top = document.createElement('div');
            top.className = 'gobo-date-top';
            const when = document.createElement('span');
            when.className = 'gobo-date-when';
            when.textContent = this._formatDay(sailing.sailDate);
            top.appendChild(when);
            const room = this._roomLabel(sailing);
            if (room && !isHiddenCol('category')) {
                const roomEl = document.createElement('span');
                roomEl.className = 'gobo-date-room';
                roomEl.textContent = room;
                top.appendChild(roomEl);
            }
            if (!isHiddenCol('guests')) {
                const guests = document.createElement('span');
                guests.className = 'gobo-card-date';
                guests.textContent = this._guestsText(sailing);
                top.appendChild(guests);
            }
            main.appendChild(top);

            const cabins = md.cabins;
            if (cabins.length) {
                const prices = document.createElement('div');
                prices.className = 'gobo-youpays';
                cabins.forEach(cabin => {
                    const item = document.createElement('span');
                    item.className = 'gobo-youpay';
                    const lab = document.createElement('span');
                    lab.className = 'gobo-youpay-label';
                    lab.textContent = cabin.shortLabel;
                    const val = document.createElement('span');
                    val.className = 'gobo-youpay-val';
                    val.textContent = cabin.text;
                    item.appendChild(val);
                    item.appendChild(lab);
                    prices.appendChild(item);
                });
                main.appendChild(prices);
            }

            const actions = document.createElement('div');
            actions.className = 'gobo-date-actions';
            const itineraryLink = this._buildItineraryLink(offer, sailing);
            actions.appendChild(itineraryLink);
            let isFavoritesView = false;
            try { isFavoritesView = App.CurrentProfile && App.CurrentProfile.key === 'goob-favorites'; } catch(e) {}
            actions.appendChild(this._buildFavoriteControl(offer, sailing, idx, isFavoritesView));
            if (!isHiddenCol('b2bDepth')) {
                const b2b = this._buildB2BCell(offer, sailing, idx);
                actions.appendChild(b2b);
            }
            row.appendChild(main);
            row.appendChild(actions);
            return row;
        },

        _buildItineraryLink(offer, sailing) {
            let itineraryKey = 'SD_UNKNOWN';
            try {
                const sailDate = sailing && sailing.sailDate ? String(sailing.sailDate).trim().slice(0, 10) : '';
                const shipCode = sailing && sailing.shipCode ? String(sailing.shipCode).trim() : '';
                itineraryKey = (shipCode && sailDate) ? `SD_${shipCode}_${sailDate}` : (sailDate ? `SD_UNKNOWN_${sailDate}` : 'SD_UNKNOWN');
            } catch(e) {}
            const link = document.createElement('button');
            link.type = 'button';
            link.className = 'gobo-itinerary-link';
            link.textContent = 'Itinerary';
            link.dataset.itineraryKey = itineraryKey;
            try { link.dataset.offerCategory = (offer.campaignOffer && offer.campaignOffer.category) ? String(offer.campaignOffer.category) : (sailing.roomType || ''); } catch(e) {}
            link.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                try { if (ItineraryCache && typeof ItineraryCache.showModal === 'function') ItineraryCache.showModal(itineraryKey, link); } catch(e) {}
            });
            return link;
        },

        _buildB2BCell(offer, sailing, idx) {
            const b2b = document.createElement('div');
            b2b.className = 'b2b-depth-cell b2b-depth-cell-action';
            b2b.dataset.vsIdx = String(idx);
            let rowId = sailing && sailing.__b2bRowId;
            try {
                if (sailing && !sailing.__b2bRowId) sailing.__b2bRowId = B2BUtils.buildB2BRowId(offer, sailing, idx);
                rowId = sailing && sailing.__b2bRowId;
            } catch(e) {}
            if (rowId) {
                b2b.dataset.b2bRowId = rowId;
                try {
                    const depth = (typeof sailing.__b2bDepth === 'number') ? sailing.__b2bDepth : null;
                    const chainId = sailing && sailing.__b2bChainId ? sailing.__b2bChainId : null;
                    if (depth !== null && App.TableRenderer && typeof App.TableRenderer.updateB2BDepthCell === 'function') {
                        App.TableRenderer.updateB2BDepthCell(b2b, depth, chainId);
                    }
                } catch(e) {}
                const handler = (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    if (!window.BackToBackTool || typeof BackToBackTool.openByRowId !== 'function') return;
                    try { BackToBackTool.openByRowId(rowId); } catch(e) {}
                };
                b2b.addEventListener('click', handler, true);
                b2b.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); handler(ev); }
                }, true);
                b2b.setAttribute('role', 'button');
                b2b.setAttribute('tabindex', '0');
            }
            try { if (window.BackToBackTool && typeof BackToBackTool.attachToCell === 'function') BackToBackTool.attachToCell(b2b, { offer, sailing }); } catch(e) {}
            return b2b;
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
