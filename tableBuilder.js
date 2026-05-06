const TABLE_BUILDER_GROUP_ICON_SVG = '<svg width="16" height="14" viewBox="0 0 20 16" xmlns="http://www.w3.org/2000/svg"><path d="M2 4.5c0-1.105.895-2 2-2h4.172a2 2 0 0 1 1.414.586l1.242 1.242c.378.378.89.586 1.424.586H16a2 2 0 0 1 2 2V12c0 1.105-.895 2-2 2H4c-1.105 0-2-.895-2-2V4.5z" fill="#facc15" stroke="#b45309" stroke-width="1" stroke-linejoin="round"/></svg>';

const TableBuilder = {
    createMainTable() {
        console.debug('[tableBuilder] createMainTable ENTRY');
        const table = document.createElement('table');
        table.className = 'w-full border-collapse table-auto';
        console.debug('[tableBuilder] createMainTable EXIT');
        return table;
    },
    createTableHeader(state) {
        console.debug('[tableBuilder] createTableHeader ENTRY', state);
        const { headers } = state;
        let hiddenSet = null;
        try {
            if (App && App.TableRenderer && typeof App.TableRenderer.getHiddenColumnsSet === 'function') {
                hiddenSet = App.TableRenderer.getHiddenColumnsSet(state);
            }
        } catch(e) { hiddenSet = null; }
        const thead = document.createElement('thead');
        thead.className = 'table-header';
        const tr = document.createElement('tr');
        headers.forEach(header => {
            console.debug('[tableBuilder] createTableHeader header loop', header);
            const th = document.createElement('th');
            th.className = 'border p-2 text-left font-semibold';
            th.dataset.key = header.key;
            if (hiddenSet && hiddenSet.has(header.key)) th.classList.add('gobo-col-hidden');
            if (header.key === 'favorite') {
                th.style.width = '32px';
                th.style.textAlign = 'center';
                th.style.cursor = 'default';
                th.title = 'Toggle Favorite';
                th.innerHTML = '<span style="pointer-events:none;">★</span>';
            } else {
                th.classList.add('cursor-pointer');
                const groupIcon = document.createElement('span');
                groupIcon.className = 'group-icon';
                groupIcon.title = `Group by ${header.label}`;
                groupIcon.setAttribute('aria-hidden', 'true');
                groupIcon.innerHTML = TABLE_BUILDER_GROUP_ICON_SVG;

                const sortLabel = document.createElement('span');
                sortLabel.classList.add('sort-label', 'cursor-pointer');
                sortLabel.textContent = header.label;

                th.appendChild(groupIcon);
                th.appendChild(sortLabel);

                sortLabel.addEventListener('click', async () => {
                    console.debug('[tableBuilder] sort-label click', header.key);
                    let spinnerShown = false;
                    let hideAfterSort = false;
                    const isB2BColumn = header.key === 'b2bDepth';
                    if (isB2BColumn && App && App.TableRenderer) {
                        const pending = (typeof App.TableRenderer.isB2BDepthPending === 'function') ? App.TableRenderer.isB2BDepthPending() : false;
                        const missingDepths = (typeof App.TableRenderer.hasComputedB2BDepths === 'function')
                            ? !App.TableRenderer.hasComputedB2BDepths(state)
                            : (Array.isArray(state.sortedOffers) && state.sortedOffers.some(row => row && row.sailing && typeof row.sailing.__b2bDepth !== 'number'));
                        if (pending || missingDepths) {
                            try {
                                if (window.Spinner && typeof Spinner.showSpinner === 'function') {
                                    Spinner.showSpinner();
                                    spinnerShown = true;
                                }
                            } catch(e) {
                                console.debug('[tableBuilder] Unable to show spinner before B2B sort', e);
                            }
                            try {
                                if (typeof App.TableRenderer.waitForB2BDepths === 'function') {
                                    await App.TableRenderer.waitForB2BDepths();
                                }
                                hideAfterSort = spinnerShown;
                            } catch(waitErr) {
                                console.warn('[tableBuilder] waitForB2BDepths failed', waitErr);
                                if (spinnerShown && window.Spinner && typeof Spinner.hideSpinner === 'function') {
                                    try { Spinner.hideSpinner(); } catch(hideErr) { console.debug('[tableBuilder] Spinner.hideSpinner error', hideErr); }
                                }
                                spinnerShown = false;
                                hideAfterSort = false;
                            }
                        }
                    }

                    let newSortOrder = 'asc';
                    if (state.currentSortColumn === header.key) {
                        newSortOrder = state.currentSortOrder === 'asc' ? 'desc' : (state.currentSortOrder === 'desc' ? 'original' : 'asc');
                    }
                    state.currentSortColumn = header.key;
                    state.currentSortOrder = newSortOrder;
                    if (!state.groupingStack || state.groupingStack.length === 0) {
                        state.baseSortColumn = state.currentSortColumn;
                        state.baseSortOrder = state.currentSortOrder;
                    }
                    state.viewMode = 'table';
                    state.currentGroupColumn = null;
                    state.groupingStack = [];
                    state.groupKeysStack = [];
                    // Ensure token matches current profile to avoid stale-guard abort
                    try { if (App && App.TableRenderer) state._switchToken = App.TableRenderer.currentSwitchToken; } catch(e) { /* ignore */ }
                    console.debug('[tableBuilder] sort-label click: calling updateView', { token: state._switchToken });
                    App.TableRenderer.updateView(state);
                    if (hideAfterSort && window.Spinner && typeof Spinner.hideSpinner === 'function') {
                        try { Spinner.hideSpinner(); } catch(hideErr) { console.debug('[tableBuilder] Spinner.hideSpinner error post-sort', hideErr); }
                    }
                });
                groupIcon.addEventListener('click', () => {
                    console.debug('[tableBuilder] group-icon click', header.key);
                    state.currentSortColumn = header.key;
                    state.currentSortOrder = 'asc';
                    state.currentGroupColumn = header.key;
                    state.viewMode = 'accordion';
                    state.groupSortStates = {};
                    state.openGroups = new Set();
                    state.groupingStack = [header.key];
                    state.groupKeysStack = [];
                    // Propagate current switch token so updateView isn't aborted as stale
                    try { if (App && App.TableRenderer) state._switchToken = App.TableRenderer.currentSwitchToken; } catch(e) { /* ignore */ }
                    console.debug('[tableBuilder] group-icon click: calling updateView and updateBreadcrumb', { token: state._switchToken });
                    App.TableRenderer.updateView(state);
                    App.TableRenderer.updateBreadcrumb(state.groupingStack, state.groupKeysStack);
                });
            }
            tr.appendChild(th);
        });
        thead.appendChild(tr);
        console.debug('[tableBuilder] createTableHeader EXIT');
        return thead;
    },
    // ── Virtual-scroll constants ──
    VIRTUAL_SCROLL_THRESHOLD: 100,   // use virtual scroll when row count exceeds this
    ROW_HEIGHT_ESTIMATE: 32,         // px – initial guess, refined after first render
    BUFFER_ROWS: 20,                 // extra rows rendered above/below viewport

    /**
     * Render a single data row for index `idx` in state.sortedOffers.
     * Shared helper so both virtual and non-virtual paths use the same logic.
     */
    _createRow(state, idx, globalMaxOfferDate, soonestExpDate) {
        const { offer, sailing } = state.sortedOffers[idx];
        const offerDate = offer.campaignOffer?.startDate;
        const isNewest = globalMaxOfferDate && offerDate && new Date(offerDate).getTime() === globalMaxOfferDate;
        const expDate = offer.campaignOffer?.reserveByDate;
        const isExpiringSoon = expDate && new Date(expDate).getTime() === soonestExpDate;
        return App.Utils.createOfferRow({ offer, sailing }, isNewest, isExpiringSoon, idx);
    },

    /**
     * Pre-compute soonest-expiring date (within 2 days) across all sorted offers.
     */
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

    /**
     * Attach (or re-attach) the virtual-scroll listener to the scroll container.
     * Stores cleanup handle on state so it can be removed on next render.
     */
    _attachVirtualScroll(tbody, state, globalMaxOfferDate, soonestExpDate) {
        const self = this;
        const total = state.sortedOffers.length;
        const colSpan = (state.headers && state.headers.length) ? state.headers.length : 18;

        // Create spacer rows
        const topSpacer = document.createElement('tr');
        topSpacer.className = 'gobo-vs-spacer-top';
        topSpacer.innerHTML = `<td colspan="${colSpan}" style="padding:0;border:none;"></td>`;
        const bottomSpacer = document.createElement('tr');
        bottomSpacer.className = 'gobo-vs-spacer-bottom';
        bottomSpacer.innerHTML = `<td colspan="${colSpan}" style="padding:0;border:none;"></td>`;

        // Virtual-scroll state stored on the table state object
        const vs = {
            topSpacer,
            bottomSpacer,
            rowHeight: this.ROW_HEIGHT_ESTIMATE,
            renderedStart: 0,
            renderedEnd: 0,
            total,
            measured: false
        };
        state._virtualScroll = vs;

        tbody.innerHTML = '';
        tbody.appendChild(topSpacer);
        tbody.appendChild(bottomSpacer);

        // Find the scroll container (parent of the table)
        const findScrollContainer = () => {
            try {
                const tbl = tbody.parentElement;
                if (tbl) {
                    const sc = tbl.closest('.table-scroll-container');
                    if (sc) return sc;
                    if (tbl.parentElement && tbl.parentElement.classList.contains('table-scroll-container')) return tbl.parentElement;
                }
            } catch(e) {}
            return null;
        };

        const renderVisibleRows = () => {
            const scrollEl = findScrollContainer();
            const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
            const viewportHeight = scrollEl ? scrollEl.clientHeight : 600;
            const rh = vs.rowHeight;
            const buffer = self.BUFFER_ROWS;

            // Determine which rows should be in the DOM
            let startIdx = Math.floor(scrollTop / rh) - buffer;
            if (startIdx < 0) startIdx = 0;
            let endIdx = Math.ceil((scrollTop + viewportHeight) / rh) + buffer;
            if (endIdx > total) endIdx = total;

            // Skip if range hasn't changed
            if (startIdx === vs.renderedStart && endIdx === vs.renderedEnd) return;

            // Build fragment of rows for [startIdx, endIdx)
            const frag = document.createDocumentFragment();
            for (let i = startIdx; i < endIdx; i++) {
                const row = self._createRow(state, i, globalMaxOfferDate, soonestExpDate);
                if (row) {
                    row.dataset.vsIdx = i;
                    frag.appendChild(row);
                }
            }

            // Remove old data rows (everything between spacers)
            while (topSpacer.nextSibling && topSpacer.nextSibling !== bottomSpacer) {
                tbody.removeChild(topSpacer.nextSibling);
            }

            // Insert new rows before bottom spacer
            tbody.insertBefore(frag, bottomSpacer);

            // Update spacer heights
            topSpacer.firstChild.style.height = (startIdx * rh) + 'px';
            bottomSpacer.firstChild.style.height = ((total - endIdx) * rh) + 'px';

            vs.renderedStart = startIdx;
            vs.renderedEnd = endIdx;

            // Measure actual row height after first render for accuracy
            if (!vs.measured) {
                try {
                    const firstDataRow = topSpacer.nextSibling;
                    if (firstDataRow && firstDataRow !== bottomSpacer) {
                        const actualHeight = firstDataRow.getBoundingClientRect().height;
                        if (actualHeight > 0) {
                            vs.rowHeight = actualHeight;
                            vs.measured = true;
                            // Re-render with corrected height
                            vs.renderedStart = -1; // force re-render
                            renderVisibleRows();
                            return;
                        }
                    }
                } catch(e) {}
            }

            // Re-apply itinerary highlight if tracked
            try {
                if (typeof vs.highlightVsIdx === 'number') {
                    const hlRow = tbody.querySelector('tr[data-vs-idx="' + vs.highlightVsIdx + '"]');
                    if (hlRow) hlRow.classList.add('gobo-itinerary-highlight');
                }
            } catch(e) {}

            // Dispatch event so B2B depth badges can be applied to visible rows
            try {
                const evt = new CustomEvent('tableChunkRendered', { detail: { token: state._rowRenderToken, rendered: endIdx, virtualStart: startIdx, virtualEnd: endIdx } });
                document.dispatchEvent(evt);
            } catch(e) {}
        };

        // Throttled scroll handler
        let rafId = null;
        const onScroll = () => {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                try { renderVisibleRows(); } catch(e) { console.debug('[tableBuilder] virtual scroll error', e); }
            });
        };

        // Initial render
        renderVisibleRows();

        // Attach scroll listener (deferred so table is in DOM)
        const attachListener = () => {
            const scrollEl = findScrollContainer();
            if (scrollEl) {
                // Remove previous listener if any
                if (state._vsCleanup) { try { state._vsCleanup(); } catch(e) {} }
                scrollEl.addEventListener('scroll', onScroll, { passive: true });
                state._vsCleanup = () => {
                    scrollEl.removeEventListener('scroll', onScroll);
                    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
                };
            } else {
                // Retry once after a frame (table may not be in DOM yet)
                requestAnimationFrame(() => {
                    const el = findScrollContainer();
                    if (el) {
                        if (state._vsCleanup) { try { state._vsCleanup(); } catch(e) {} }
                        el.addEventListener('scroll', onScroll, { passive: true });
                        state._vsCleanup = () => {
                            el.removeEventListener('scroll', onScroll);
                            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
                        };
                    }
                });
            }
        };
        attachListener();

        // Expose re-render for external callers (e.g., after B2B depth computation)
        state._vsRenderVisible = renderVisibleRows;

        // Fire tableRenderComplete so downstream code (B2B, itinerary links) can proceed
        try {
            setTimeout(() => {
                try {
                    const evt = new CustomEvent('tableRenderComplete', { detail: { token: state._rowRenderToken, total } });
                    document.dispatchEvent(evt);
                } catch(e) {}
            }, 0);
        } catch(e) {}
    },

    renderTable(tbody, state, globalMaxOfferDate = null) {
        console.debug('[DEBUG] renderTable ENTRY', { sortedOffersLength: state.sortedOffers.length, tbody });
        const total = state.sortedOffers.length;
        // Cancel any in-flight incremental render & previous virtual scroll listener
        state._rowRenderToken = (Date.now().toString(36)+Math.random().toString(36).slice(2));
        const token = state._rowRenderToken;
        if (state._vsCleanup) { try { state._vsCleanup(); state._vsCleanup = null; } catch(e) {} }
        state._virtualScroll = null;
        state._vsRenderVisible = null;
        tbody.innerHTML = '';
        if (total === 0) {
            const row = document.createElement('tr');
            const colSpan = (state.headers && state.headers.length) ? state.headers.length : 18;
            row.innerHTML = `<td colspan="${colSpan}" class="border p-2 text-center">No offers available</td>`;
            tbody.appendChild(row);
        } else {
            const soonestExpDate = this._computeSoonestExpDate(state.sortedOffers);

            if (total > this.VIRTUAL_SCROLL_THRESHOLD) {
                // ── Virtual-scroll path: only render visible rows ──
                this._attachVirtualScroll(tbody, state, globalMaxOfferDate, soonestExpDate);
            } else {
                // ── Synchronous render for small datasets ──
                for (let idx = 0; idx < total; idx++) {
                    const row = this._createRow(state, idx, globalMaxOfferDate, soonestExpDate);
                    if (row) tbody.appendChild(row);
                }
                try {
                    setTimeout(() => { try { const evt = new CustomEvent('tableRenderComplete', { detail: { token, total } }); document.dispatchEvent(evt); } catch(e){} }, 0);
                } catch(e) { /* ignore */ }
            }
        }
        // Update sort indicators immediately (independent of incremental completion)
    state.headers.forEach(header => {
            const th = state.thead.querySelector(`th[data-key="${header.key}"]`);
            if (!th || header.key === 'favorite') return;
            th.classList.remove('sort-asc', 'sort-desc');
            if (state.currentSortColumn === header.key) {
                if (state.currentSortOrder === 'asc') th.classList.add('sort-asc');
                else if (state.currentSortOrder === 'desc') th.classList.add('sort-desc');
            }
        });
    }
};
