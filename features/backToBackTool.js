(function(){
    const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
    const DOW_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

    function normalizeIso(value) {
        if (!value) return '';
        const str = String(value).trim();
        if (!str) return '';
        if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
        const d = new Date(str);
        if (isNaN(d)) return '';
        return d.toISOString().slice(0, 10);
    }

    function addDays(iso, delta) {
        if (!iso) return '';
        const d = new Date(iso + 'T00:00:00Z');
        if (isNaN(d)) return iso;
        d.setUTCDate(d.getUTCDate() + delta);
        return d.toISOString().slice(0, 10);
    }
    function diffDays(next, prev) {
        if (!(next && prev)) return null;
        const a = new Date(next + 'T00:00:00Z');
        const b = new Date(prev + 'T00:00:00Z');
        if (isNaN(a) || isNaN(b)) return null;
        return Math.round((a.getTime() - b.getTime()) / 86400000);
    }

    function formatDateLabel(iso, includeDow) {
        if (!iso) return 'Date TBA';
        try {
            const d = new Date(iso + 'T00:00:00Z');
            if (isNaN(d)) return iso;
            const base = DATE_FMT.format(d);
            return includeDow ? `${DOW_FMT.format(d)} ${base}` : base;
        } catch (e) {
            return iso;
        }
    }

    function formatRange(meta) {
        if (!meta) return 'Dates TBA';
        const start = formatDateLabel(meta.startISO, true);
        const end = formatDateLabel(meta.endISO || meta.startISO, true);
        const nights = Number.isFinite(meta.nights) ? `${meta.nights} night${meta.nights === 1 ? '' : 's'}` : '';
        return nights ? `${start} → ${end} (${nights})` : `${start} → ${end}`;
    }

    function safeOfferCode(entry) {
        try {
            return (entry && entry.offer && entry.offer.campaignOffer && entry.offer.campaignOffer.offerCode) ? entry.offer.campaignOffer.offerCode : '';
        } catch (e) {
            return '';
        }
    }

    function getPerks(entry) {
        try {
            if (window.App && App.Utils && typeof App.Utils.computePerks === 'function') {
                return App.Utils.computePerks(entry.offer, entry.sailing) || '';
            }
        } catch (e) {}
        try {
            if (window.Utils && typeof Utils.computePerks === 'function') {
                return Utils.computePerks(entry.offer, entry.sailing) || '';
            }
        } catch (e) {}
        return '';
    }

    function escapeSelector(value) {
        if (!value) return '';
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
        return String(value).replace(/([ #.;?+*~':"!^$\[\]()=>|\/])/g, '\\$1');
    }

    function lookupItineraryRecord(sailing) {
        if (!sailing) return null;
        const shipCode = (sailing.shipCode || '').toString().trim();
        const sailDate = normalizeIso(sailing.sailDate);
        if (!shipCode || !sailDate) return null;
        const cache = (window.App && App.ItineraryCache) ? App.ItineraryCache : (typeof ItineraryCache !== 'undefined' ? ItineraryCache : null);
        if (cache && typeof cache.getByShipDate === 'function') {
            try { return cache.getByShipDate(shipCode, sailDate) || null; } catch (e) { return null; }
        }
        return null;
    }

    function parseNights(entry, itineraryRecord) {
        const sailing = entry && entry.sailing ? entry.sailing : {};
        const sources = [sailing.totalNights, sailing.sailingNights, sailing.lengthOfStay, itineraryRecord && itineraryRecord.totalNights];
        for (let i = 0; i < sources.length; i++) {
            const val = sources[i];
            if (val == null) continue;
            const num = parseInt(val, 10);
            if (!isNaN(num) && num > 0 && num < 80) return num;
        }
        try {
            const description = sailing.itineraryDescription || '';
            if (description) {
                const parsed = (window.App && App.Utils && typeof App.Utils.parseItinerary === 'function')
                    ? App.Utils.parseItinerary(description)
                    : (window.Utils && typeof Utils.parseItinerary === 'function' ? Utils.parseItinerary(description) : null);
                if (parsed && parsed.nights) {
                    const num = parseInt(parsed.nights, 10);
                    if (!isNaN(num)) return num;
                }
                const quickMatch = description.match(/(\d+)\s+Night/i);
                if (quickMatch && quickMatch[1]) {
                    const num = parseInt(quickMatch[1], 10);
                    if (!isNaN(num)) return num;
                }
            }
        } catch (e) {}
        return null;
    }

    function buildTimeline(itineraryRecord, sailing) {
        const days = itineraryRecord && Array.isArray(itineraryRecord.days) ? itineraryRecord.days : [];
        if (!days.length) {
            const summary = (sailing && sailing.itineraryDescription) ? sailing.itineraryDescription : '';
            return summary ? [{ day: 'Itinerary', label: summary, window: '' }] : [];
        }
        return days.slice(0, 6).map(day => {
            const idxLabel = day && day.number ? `Day ${day.number}` : 'Day';
            let label = '';
            let window = '';
            try {
                const primaryPort = Array.isArray(day.ports) && day.ports.length ? day.ports[0] : null;
                if (primaryPort && primaryPort.port) {
                    label = primaryPort.port.name || primaryPort.port.code || primaryPort.port.region || day.type || 'Port Day';
                } else {
                    label = day.type || 'Sea Day';
                }
                const arrival = primaryPort && primaryPort.arrivalTime ? primaryPort.arrivalTime : '';
                const departure = primaryPort && primaryPort.departureTime ? primaryPort.departureTime : '';
                if (arrival || departure) {
                    window = [arrival, departure].filter(Boolean).join(' - ');
                }
            } catch (e) {
                label = day && day.type ? day.type : 'Port Day';
            }
            return { day: idxLabel, label: label || 'Port Day', window };
        });
    }

    const BackToBackTool = {
        _context: { rows: [], rowMap: new Map(), allowSideBySide: true, stateKey: null },
        _metaCache: new Map(),
        _activeSession: null,

        registerEnvironment(opts) {
            if (!opts) return;
            const rows = Array.isArray(opts.rows) ? opts.rows : [];
            const allowSideBySide = opts.allowSideBySide !== false;
            const rowMap = new Map();
            rows.forEach((entry, idx) => {
                if (!entry || !entry.sailing) return;
                if (!entry.sailing.__b2bRowId) {
                    const baseParts = [safeOfferCode(entry), entry.sailing.shipCode, entry.sailing.shipName, normalizeIso(entry.sailing.sailDate), idx];
                    const safe = baseParts.filter(Boolean).join('-').replace(/[^a-zA-Z0-9_-]/g, '_');
                    entry.sailing.__b2bRowId = `b2b-${safe || idx}`;
                }
                rowMap.set(entry.sailing.__b2bRowId, entry);
            });
            this._context = { rows, rowMap, allowSideBySide, stateKey: opts.stateKey || null };
            this._metaCache.clear();
        },

        attachToCell(cell, context) {
            if (!cell) return;
            const pill = cell.querySelector('.b2b-chevrons');
            if (!pill) return;
            const sailing = context && context.sailing;
            const rowId = sailing && sailing.__b2bRowId;
            if (!rowId) return;
            try { console.debug('[B2B] attachToCell binding', { rowId }); } catch(e){}
            pill.classList.add('b2b-pill-button');
            pill.setAttribute('role', 'button');
            pill.setAttribute('tabindex', '0');
            pill.dataset.b2bRowId = rowId;
            if (pill.dataset.b2bBound === 'true') return;
            const handler = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                this.openByRowId(rowId);
            };
            pill.addEventListener('click', handler, true);
            pill.addEventListener('pointerdown', handler, true);
            pill.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    handler(ev);
                }
            }, true);
            pill.dataset.b2bBound = 'true';
        },

        // Debugging helper: capture-phase listener to detect clicks that never reach our handlers
        _installGlobalDebugCapture() {
            try {
                if (typeof window === 'undefined' || !window.GOBO_DEBUG_ENABLED) return;
                if (this._debugCaptureInstalled) return;
                const dbg = (ev) => {
                    try {
                        const t = ev.target;
                        const pill = t.closest && t.closest('.b2b-chevrons');
                        const cell = t.closest && t.closest('.b2b-depth-cell');
                        if (pill || cell) {
                                try { console.debug('[B2B] capture click', { target: t.tagName, hasPill: !!pill, hasCell: !!cell, className: (t.className||'') }); } catch(e){}
                        }
                    } catch(e) {}
                };
                // Defensive auto-open: in debug mode, if click reaches capture phase but our handlers didn't run,
                // attempt to open the B2B modal using nearest data-b2b-row-id. This helps diagnose/mitigate
                // other site scripts that may block propagation or swap DOM nodes.
                const autoOpen = (ev) => {
                    try {
                        const t = ev.target;
                        const pill = t.closest && t.closest('.b2b-chevrons');
                        const cell = t.closest && t.closest('.b2b-depth-cell');
                        const el = pill || cell;
                        if (!el) return;
                        // Prefer dataset on pill, then cell, then nearest tr
                        let rowId = el.dataset && el.dataset.b2bRowId ? el.dataset.b2bRowId : null;
                        if (!rowId) {
                            const tr = el.closest && el.closest('tr');
                            if (tr && tr.dataset && tr.dataset.b2bRowId) rowId = tr.dataset.b2bRowId;
                        }
                        if (!rowId) return;
                        // If BackToBackTool exists and openByRowId available, call it. Don't prevent other handlers.
                        if (window.BackToBackTool && typeof BackToBackTool.openByRowId === 'function') {
                            try { console.debug('[B2B] autoOpen attempt', { rowId }); } catch(e){}
                            try { BackToBackTool.openByRowId(rowId); } catch(e) { try { console.debug('[B2B] autoOpen error', e); } catch(ee){} }
                        }
                    } catch(e) {}
                };
                document.addEventListener('click', dbg, true);
                document.addEventListener('pointerdown', dbg, true);
                document.addEventListener('click', autoOpen, true);
                document.addEventListener('pointerdown', autoOpen, true);
                    this._debugCaptureInstalled = true;
                } catch(e) { try { console.debug('[B2B] installGlobalDebugCapture failed', e); } catch(e){} }
        },

        openByRowId(rowId) {
            try { console.debug('[B2B] openByRowId called', { rowId, hasMap: !!this._context.rowMap.has(rowId) }); } catch(e){}
            if (!rowId) return;
            if (!this._context.rowMap.has(rowId)) {
                try { console.debug('[B2B] row not found in rowMap, attempting DOM reconstruction', rowId); } catch(e){}
                try {
                    const sel = `[data-b2b-row-id="${escapeSelector(rowId)}"]`;
                    const el = document.querySelector(sel);
                    if (el) {
                        const tr = el.closest && el.closest('tr') ? el.closest('tr') : el;
                        const sailing = {
                            __b2bRowId: rowId,
                            shipCode: tr.dataset ? tr.dataset.shipCode : (el.dataset ? el.dataset.shipCode : ''),
                            shipName: tr.dataset ? tr.dataset.shipName : (el.dataset ? el.dataset.shipName : ''),
                            sailDate: tr.dataset ? tr.dataset.sailDate : (el.dataset ? el.dataset.sailDate : '')
                        };
                        const offer = { campaignOffer: { offerCode: (tr.dataset && tr.dataset.offerCode) ? tr.dataset.offerCode : '' } };
                        const entry = { offer, sailing };
                        this._context.rowMap.set(rowId, entry);
                        if (Array.isArray(this._context.rows)) this._context.rows.push(entry);
                        try { console.debug('[B2B] reconstructed entry from DOM', { rowId }); } catch(e){}
                    } else {
                        try { console.debug('[B2B] DOM element not found for rowId', rowId); } catch(e){}
                        return;
                    }
                } catch(e) { try { console.debug('[B2B] DOM reconstruction error', e); } catch(e){}; return; }
            }
            try { this._startSession(rowId); } catch(e) { try { console.debug('[B2B] _startSession error', e); } catch(ee){} }
        },

        _startSession(rowId) {
            this._closeOverlay();
            this._activeSession = {
                chain: [rowId],
                rootRowId: rowId,
                allowSideBySide: !!this._context.allowSideBySide,
                bannerTimeout: null,
                ui: null,
                keyHandler: null
            };
            this._renderOverlay();
        },

        _renderOverlay() {
            if (!this._activeSession) return;
            const overlay = document.createElement('div');
            overlay.className = 'b2b-visualizer-overlay';
            const modal = document.createElement('div');
            modal.className = 'b2b-visualizer-modal';

            const header = document.createElement('div');
            header.className = 'b2b-visualizer-header';
            const headText = document.createElement('div');
            const title = document.createElement('h2');
            title.className = 'b2b-visualizer-title';
            title.textContent = 'Back-to-Back Tool';
            const subtitle = document.createElement('p');
            subtitle.className = 'b2b-visualizer-subtitle';
            const rootMeta = this._getMeta(this._activeSession.rootRowId);
            const allowMsg = this._activeSession.allowSideBySide ? 'Side-by-side sailings are allowed.' : 'Side-by-side sailings are disabled.';
            subtitle.textContent = rootMeta
                ? `${rootMeta.shipName || rootMeta.shipCode || 'Ship'} - ${formatRange(rootMeta)} - ${allowMsg}`
                : allowMsg;
            headText.appendChild(title);
            headText.appendChild(subtitle);
            const closeBtn = document.createElement('button');
            closeBtn.className = 'b2b-visualizer-close';
            closeBtn.setAttribute('aria-label', 'Close Back-to-Back Tool');
            closeBtn.innerHTML = '&times;';
            closeBtn.addEventListener('click', () => this._closeOverlay());
            header.appendChild(headText);
            header.appendChild(closeBtn);
            modal.appendChild(header);

            const body = document.createElement('div');
            body.className = 'b2b-visualizer-body';

            const chainColumn = document.createElement('div');
            chainColumn.className = 'b2b-chain-column';
            const chainTitle = document.createElement('h3');
            chainTitle.className = 'b2b-section-title';
            chainTitle.innerHTML = '<span>Selected Sailings</span><small>Build your chain</small>';
            const chainCards = document.createElement('div');
            chainCards.className = 'b2b-chain-cards';
            chainColumn.appendChild(chainTitle);
            chainColumn.appendChild(chainCards);

            const optionColumn = document.createElement('div');
            optionColumn.className = 'b2b-option-column';
            const optionTitle = document.createElement('h3');
            optionTitle.className = 'b2b-section-title';
            optionTitle.innerHTML = '<span>Next Connections</span><small>Matches by port & dates</small>';
            const optionList = document.createElement('div');
            optionList.className = 'b2b-option-list';
            optionColumn.appendChild(optionTitle);
            optionColumn.appendChild(optionList);

            body.appendChild(chainColumn);
            body.appendChild(optionColumn);
            modal.appendChild(body);

            const banner = document.createElement('div');
            banner.className = 'b2b-banner';
            const statusSpan = document.createElement('span');
            statusSpan.className = 'b2b-banner-status';
            const messageSpan = document.createElement('span');
            messageSpan.className = 'b2b-banner-message';
            banner.appendChild(statusSpan);
            banner.appendChild(messageSpan);
            modal.appendChild(banner);

            const actions = document.createElement('div');
            actions.className = 'b2b-actions';
            const resetBtn = document.createElement('button');
            resetBtn.className = 'b2b-action-btn secondary';
            resetBtn.textContent = 'Back to Root';
            resetBtn.addEventListener('click', () => this._clearChain());
            const saveBtn = document.createElement('button');
            saveBtn.className = 'b2b-action-btn primary';
            saveBtn.textContent = 'Save Chain to Favorites';
            saveBtn.addEventListener('click', () => this._saveChain());
            actions.appendChild(resetBtn);
            actions.appendChild(saveBtn);
            modal.appendChild(actions);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const keyHandler = (ev) => {
                if (ev.key === 'Escape') this._closeOverlay();
            };
            overlay.addEventListener('click', (ev) => {
                if (ev.target === overlay) this._closeOverlay();
            });
            document.addEventListener('keydown', keyHandler);

            this._activeSession.ui = {
                overlay,
                modal,
                chainCards,
                optionList,
                banner,
                statusSpan,
                messageSpan,
                saveBtn,
                resetBtn
            };
            this._activeSession.keyHandler = keyHandler;
            this._renderChain();
            this._renderOptions();
        },

        _getEntry(rowId) {
            return this._context && this._context.rowMap ? this._context.rowMap.get(rowId) : null;
        },

        _getMeta(rowId) {
            if (this._metaCache.has(rowId)) return this._metaCache.get(rowId);
            const entry = this._getEntry(rowId);
            if (!entry) return null;
            const itineraryRecord = lookupItineraryRecord(entry.sailing);
            const startISO = normalizeIso(entry.sailing && entry.sailing.sailDate);
            const nights = parseNights(entry, itineraryRecord);
            const explicitEnd = normalizeIso((entry.sailing && (entry.sailing.endDate || entry.sailing.disembarkDate)) || '');
            const computedEnd = (!explicitEnd && startISO && Number.isFinite(nights)) ? addDays(startISO, nights) : explicitEnd || startISO;
            const departurePort = (entry.sailing && entry.sailing.departurePort && entry.sailing.departurePort.name) || (itineraryRecord && itineraryRecord.departurePortName) || '';
            const arrivalPort = (entry.sailing && entry.sailing.arrivalPort && entry.sailing.arrivalPort.name)
                || (itineraryRecord && itineraryRecord.destinationName)
                || (itineraryRecord && itineraryRecord.arrivalPortName)
                || departurePort;
            const timeline = buildTimeline(itineraryRecord, entry.sailing);
            const perks = getPerks(entry);
            const meta = {
                rowId,
                offerCode: safeOfferCode(entry),
                offerName: entry.offer && entry.offer.campaignOffer ? entry.offer.campaignOffer.name : '',
                shipName: (entry.sailing && entry.sailing.shipName) || (itineraryRecord && itineraryRecord.shipName) || '',
                shipCode: (entry.sailing && entry.sailing.shipCode) || (itineraryRecord && itineraryRecord.shipCode) || '',
                shipKey: ((entry.sailing && (entry.sailing.shipCode || entry.sailing.shipName)) || '').toString().trim().toLowerCase(),
                startISO,
                endISO: computedEnd,
                nights,
                embarkPort: departurePort,
                disembarkPort: arrivalPort,
                itineraryName: (entry.sailing && entry.sailing.itineraryDescription) || (itineraryRecord && itineraryRecord.itineraryDescription) || '',
                timeline,
                perksLabel: perks,
                guestsLabel: entry.sailing && entry.sailing.isGOBO ? '1 Guest' : '2 Guests',
                roomLabel: entry.sailing && entry.sailing.roomType ? entry.sailing.roomType : '',
                entry
            };
            this._metaCache.set(rowId, meta);
            return meta;
        },

        _renderChain() {
            if (!this._activeSession || !this._activeSession.ui) return;
            const container = this._activeSession.ui.chainCards;
            container.innerHTML = '';
            this._activeSession.chain.forEach((rowId, idx) => {
                const meta = this._getMeta(rowId);
                if (!meta) return;
                const card = document.createElement('div');
                card.className = 'b2b-chain-card' + (idx === 0 ? ' is-root' : '');
                card.dataset.rowId = rowId;
                const head = document.createElement('div');
                head.className = 'b2b-chain-step-head';
                const title = document.createElement('h4');
                title.textContent = `${meta.shipName || meta.shipCode || 'Ship'} - ${meta.nights ? `${meta.nights} night${meta.nights === 1 ? '' : 's'}` : 'Length TBA'}`;
                const step = document.createElement('span');
                step.textContent = idx === 0 ? 'Root sailing' : `Leg ${idx + 1}`;
                head.appendChild(title);
                head.appendChild(step);
                card.appendChild(head);

                const metaBlock = document.createElement('div');
                metaBlock.className = 'b2b-chain-meta';
                metaBlock.innerHTML = `
                    <strong>${formatRange(meta)}</strong>
                    <span>${meta.embarkPort || 'Embark TBA'} → ${meta.disembarkPort || 'Return TBA'}</span>
                    <span>Offer ${meta.offerCode || 'TBA'} - ${meta.guestsLabel}${meta.roomLabel ? ` - ${meta.roomLabel}` : ''}</span>
                    ${meta.perksLabel ? `<span>${meta.perksLabel}</span>` : ''}
                `;
                card.appendChild(metaBlock);

                if (meta.timeline && meta.timeline.length) {
                    const list = document.createElement('ul');
                    list.className = 'b2b-timeline';
                    meta.timeline.slice(0, 5).forEach(item => {
                        const li = document.createElement('li');
                        const dot = document.createElement('span');
                        dot.className = 'dot';
                        const text = document.createElement('div');
                        text.innerHTML = `<strong>${item.day}</strong> ${item.label}${item.window ? ` - ${item.window}` : ''}`;
                        li.appendChild(dot);
                        li.appendChild(text);
                        list.appendChild(li);
                    });
                    if (meta.timeline.length > 5) {
                        const li = document.createElement('li');
                        li.innerHTML = '<span class="dot" style="opacity:0;"></span><div>...</div>';
                        list.appendChild(li);
                    }
                    card.appendChild(list);
                }

                if (idx > 0) {
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'b2b-chain-remove';
                    removeBtn.type = 'button';
                    removeBtn.setAttribute('aria-label', 'Remove sailing from chain');
                    removeBtn.textContent = 'x';
                    removeBtn.addEventListener('click', () => this._removeFromChain(rowId));
                    card.appendChild(removeBtn);
                }

                container.appendChild(card);
            });
            const canSave = this._activeSession.chain.length >= 2;
            this._activeSession.ui.saveBtn.disabled = !canSave;
            this._activeSession.ui.resetBtn.disabled = this._activeSession.chain.length <= 1;
            this._setStatusText();
        },

        _setStatusText() {
            if (!this._activeSession || !this._activeSession.ui) return;
            const depth = this._activeSession.chain.length;
            const status = `Depth: ${depth} sailing${depth === 1 ? '' : 's'} - Side-by-side ${this._activeSession.allowSideBySide ? 'Allowed' : 'Disabled'}`;
            this._activeSession.ui.statusSpan.textContent = status;
        },

        _flashMessage(text, tone) {
            if (!this._activeSession || !this._activeSession.ui) return;
            const banner = this._activeSession.ui.banner;
            const messageEl = this._activeSession.ui.messageSpan;
            banner.style.background = tone === 'success' ? '#dcfce7' : (tone === 'warn' ? '#fee2e2' : '#e2e8f0');
            banner.style.color = tone === 'success' ? '#064e3b' : (tone === 'warn' ? '#991b1b' : '#0f172a');
            messageEl.textContent = text;
            if (this._activeSession.bannerTimeout) clearTimeout(this._activeSession.bannerTimeout);
            this._activeSession.bannerTimeout = setTimeout(() => {
                messageEl.textContent = '';
                banner.style.background = '#e2e8f0';
                banner.style.color = '#0f172a';
            }, 3200);
        },

        _computeNextOptions() {
            if (!this._activeSession) return [];
            const chain = this._activeSession.chain;
            const lastId = chain[chain.length - 1];
            const lastMeta = this._getMeta(lastId);
            if (!lastMeta) return [];
            const allowSideBySide = this._activeSession.allowSideBySide;
            const usedOfferCodes = new Set(chain.map(id => {
                const meta = this._getMeta(id);
                return meta && meta.offerCode ? meta.offerCode : null;
            }).filter(Boolean));
            const options = [];
            this._context.rowMap.forEach((entry, rowId) => {
                if (chain.includes(rowId)) return;
                const candidateMeta = this._getMeta(rowId);
                if (!candidateMeta) return;
                if (candidateMeta.offerCode && usedOfferCodes.has(candidateMeta.offerCode)) return;
                if (!this._isLinkable(lastMeta, candidateMeta, allowSideBySide)) return;
                const lag = diffDays(candidateMeta.startISO, lastMeta.endISO) || 0;
                options.push({
                    rowId,
                    meta: candidateMeta,
                    isSideBySide: lastMeta.shipKey && candidateMeta.shipKey && lastMeta.shipKey !== candidateMeta.shipKey,
                    lag
                });
            });
            options.sort((a, b) => {
                if (a.meta.startISO === b.meta.startISO) return 0;
                return a.meta.startISO < b.meta.startISO ? -1 : 1;
            });
            return options;
        },

        _isLinkable(currentMeta, nextMeta, allowSideBySide) {
            if (!(currentMeta && nextMeta)) return false;
            if (!(currentMeta.endISO && nextMeta.startISO)) return false;
            const lag = diffDays(nextMeta.startISO, currentMeta.endISO);
            if (lag == null || lag < 0 || lag > 1) return false;
            const currentPort = (currentMeta.disembarkPort || '').toLowerCase();
            const nextPort = (nextMeta.embarkPort || nextMeta.disembarkPort || '').toLowerCase();
            if (currentPort && nextPort && currentPort !== nextPort) return false;
            if (!allowSideBySide) {
                if (currentMeta.shipKey && nextMeta.shipKey && currentMeta.shipKey !== nextMeta.shipKey) return false;
            }
            return true;
        },

        _renderOptions() {
            if (!this._activeSession || !this._activeSession.ui) return;
            const list = this._activeSession.ui.optionList;
            list.innerHTML = '';
            const options = this._computeNextOptions();
            if (!options.length) {
                const empty = document.createElement('div');
                empty.className = 'b2b-empty-state';
                empty.innerHTML = '<strong>No matching sailings found</strong>Try enabling side-by-side connections, or pick a different starting offer.';
                list.appendChild(empty);
                return;
            }
            options.forEach(opt => {
                const card = document.createElement('div');
                card.className = 'b2b-option-card' + (opt.isSideBySide ? ' b2b-side-by-side' : '');
                const badge = document.createElement('div');
                badge.className = 'badge';
                badge.textContent = opt.isSideBySide ? 'Side-by-side' : 'Same ship';
                const metaBlock = document.createElement('div');
                metaBlock.className = 'b2b-option-meta';
                const windowLabel = opt.lag === 0 ? 'Boards same day' : 'Boards next day';
                metaBlock.innerHTML = `
                    <strong>${opt.meta.shipName || opt.meta.shipCode || 'Ship'}</strong>
                    <span>${formatRange(opt.meta)}</span>
                    <span>${opt.meta.embarkPort || 'Embark TBA'} → ${opt.meta.disembarkPort || 'Return TBA'}</span>
                    <span>${windowLabel} - Offer ${opt.meta.offerCode || 'TBA'}</span>
                `;
                const selectBtn = document.createElement('button');
                selectBtn.className = 'b2b-option-select';
                selectBtn.type = 'button';
                selectBtn.textContent = 'Add to chain';
                selectBtn.addEventListener('click', () => this._selectOption(opt.rowId));
                card.appendChild(badge);
                card.appendChild(metaBlock);
                card.appendChild(selectBtn);
                list.appendChild(card);
            });
        },

        _selectOption(rowId) {
            if (!this._activeSession || !rowId) return;
            if (this._activeSession.chain.includes(rowId)) {
                this._flashMessage('That sailing is already in your chain.', 'warn');
                return;
            }
            this._activeSession.chain.push(rowId);
            this._renderChain();
            this._renderOptions();
            const meta = this._getMeta(rowId);
            this._flashMessage(meta ? `Added ${meta.shipName || meta.shipCode || 'sailing'}` : 'Sailing added.', 'info');
        },

        _removeFromChain(rowId) {
            if (!this._activeSession) return;
            const idx = this._activeSession.chain.indexOf(rowId);
            if (idx <= 0) return; // never remove root via this path
            this._activeSession.chain.splice(idx, 1);
            this._renderChain();
            this._renderOptions();
            this._flashMessage('Removed sailing from chain.', 'info');
        },

        _clearChain() {
            if (!this._activeSession) return;
            this._activeSession.chain = [this._activeSession.rootRowId];
            this._renderChain();
            this._renderOptions();
            this._flashMessage('Chain reset to root sailing.', 'info');
        },

        _saveChain() {
            if (!this._activeSession) return;
            const chain = this._activeSession.chain;
            if (chain.length < 2) {
                this._flashMessage('Add at least one connecting sailing first.', 'warn');
                return;
            }
            if (!(window.Favorites && typeof Favorites.addFavorite === 'function')) {
                this._flashMessage('Favorites module is unavailable.', 'warn');
                return;
            }
            try { if (Favorites.ensureProfileExists) Favorites.ensureProfileExists(); } catch (e) {}
            const profileId = this._currentProfileId();
            const depth = chain.length;
            let saved = 0;
            chain.forEach(rowId => {
                const entry = this._getEntry(rowId);
                if (!entry) return;
                try {
                    entry.sailing.__b2bDepth = depth;
                    Favorites.addFavorite(entry.offer, entry.sailing, profileId);
                    saved++;
                } catch (e) {
                    console.warn('[BackToBackTool] Unable to save favorite', e);
                }
            });
            if (saved) {
                this._applyDepthToDom(chain, depth);
                this._flashMessage('Saved chain to Favorites. View it under the Favorites tab.', 'success');
                setTimeout(() => this._closeOverlay(), 900);
            } else {
                this._flashMessage('Nothing was saved. Please try again.', 'warn');
            }
        },

        _applyDepthToDom(rowIds, depth) {
            rowIds.forEach(rowId => {
                const selector = `tr[data-b2b-row-id="${escapeSelector(rowId)}"] .b2b-depth-cell`;
                document.querySelectorAll(selector).forEach(cell => {
                    try {
                        if (window.App && App.TableRenderer && typeof App.TableRenderer.updateB2BDepthCell === 'function') {
                            App.TableRenderer.updateB2BDepthCell(cell, depth);
                        } else {
                            cell.textContent = String(depth);
                        }
                    } catch (e) {}
                });
            });
        },

        _currentProfileId() {
            try {
                if (window.App && App.CurrentProfile && App.CurrentProfile.state && App.CurrentProfile.state.profileId != null) {
                    return App.CurrentProfile.state.profileId;
                }
            } catch (e) {}
            return null;
        },

        _closeOverlay() {
            if (!this._activeSession) return;
            if (this._activeSession.bannerTimeout) {
                clearTimeout(this._activeSession.bannerTimeout);
                this._activeSession.bannerTimeout = null;
            }
            if (this._activeSession.keyHandler) {
                document.removeEventListener('keydown', this._activeSession.keyHandler);
            }
            if (this._activeSession.ui && this._activeSession.ui.overlay) {
                this._activeSession.ui.overlay.remove();
            }
            this._activeSession = null;
        }
    };

    window.BackToBackTool = BackToBackTool;
    // Auto-install capture-phase debug helpers when debug enabled
    try { BackToBackTool._installGlobalDebugCapture(); } catch(e) { /* ignore */ }
})();
