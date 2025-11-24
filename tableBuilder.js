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
        const thead = document.createElement('thead');
        thead.className = 'table-header';
        const tr = document.createElement('tr');
        headers.forEach(header => {
            console.debug('[tableBuilder] createTableHeader header loop', header);
            const th = document.createElement('th');
            th.className = 'border p-2 text-left font-semibold';
            th.dataset.key = header.key;
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
    renderTable(tbody, state, globalMaxOfferDate = null) {
        console.debug('[DEBUG] renderTable ENTRY', { sortedOffersLength: state.sortedOffers.length, tbody });
        const total = state.sortedOffers.length;
        // Cancel any in-flight incremental render
        state._rowRenderToken = (Date.now().toString(36)+Math.random().toString(36).slice(2));
        const token = state._rowRenderToken;
        tbody.innerHTML = '';
        if (total === 0) {
            const row = document.createElement('tr');
            const colSpan = (state.headers && state.headers.length) ? state.headers.length : 14;
            row.innerHTML = `<td colspan="${colSpan}" class="border p-2 text-center">No offers available</td>`;
            tbody.appendChild(row);
        } else {
            // Pre-compute soonest expiring (within 2 days) once
            let soonestExpDate = null;
            const now = Date.now();
            const twoDays = 2 * 24 * 60 * 60 * 1000;
            for (let i=0;i<total;i++) {
                const offer = state.sortedOffers[i].offer; const expStr = offer.campaignOffer?.reserveByDate; if (!expStr) continue; const expDate = new Date(expStr).getTime(); if (expDate >= now && expDate - now <= twoDays) { if (!soonestExpDate || expDate < soonestExpDate) soonestExpDate = expDate; }
            }
            // Threshold for incremental rendering
            const CHUNK_THRESHOLD = 400; // if over this many rows, chunk rendering
            if (total > CHUNK_THRESHOLD) {
                const CHUNK_SIZE_BASE = 200; // base chunk size
                let index = 0;
                // Optional status row to indicate progressive rendering (removed once complete)
                const statusRow = document.createElement('tr');
                const colSpan = (state.headers && state.headers.length) ? state.headers.length : 14;
                statusRow.innerHTML = `<td colspan="${colSpan}" class="border p-2 text-left" style="font-size:12px;color:#666;">Rendering ${total.toLocaleString()} offers…</td>`;
                tbody.appendChild(statusRow);
                statusRow.classList.add('adv-render-status-row');
                const processChunk = () => {
                    if (token !== state._rowRenderToken) return; // aborted by a newer render
                    // Dynamically adjust chunk size to ~16ms frame budget (rough heuristic)
                    let chunkSize = CHUNK_SIZE_BASE;
                    const tStart = performance.now();
                    const frag = document.createDocumentFragment();
                    for (let c=0; c<chunkSize && index < total; c++, index++) {
                        const { offer, sailing } = state.sortedOffers[index];
                        const offerDate = offer.campaignOffer?.startDate;
                        const isNewest = globalMaxOfferDate && offerDate && new Date(offerDate).getTime() === globalMaxOfferDate;
                        const expDate = offer.campaignOffer?.reserveByDate;
                        const isExpiringSoon = expDate && new Date(expDate).getTime() === soonestExpDate;
                        const row = App.Utils.createOfferRow({ offer, sailing }, isNewest, isExpiringSoon, index);
                        if (row) frag.appendChild(row);
                        if (performance.now() - tStart > 12) break; // yield to keep frame responsive
                    }
                    if (statusRow.parentNode) tbody.insertBefore(frag, statusRow);
                    // Notify that a chunk was rendered so other modules can react (e.g., B2B depth badges)
                    try {
                        const chunkEvt = new CustomEvent('tableChunkRendered', { detail: { token, rendered: Math.min(index, total) } });
                        document.dispatchEvent(chunkEvt);
                    } catch(e) { /* ignore dispatch errors */ }
                    // Update status text
                    if (statusRow && statusRow.firstChild) {
                        const rendered = Math.min(index, total);
                        statusRow.firstChild.textContent = `Rendering ${rendered.toLocaleString()} / ${total.toLocaleString()} offers…`;
                    }
                    if (index < total) {
                        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(processChunk); else setTimeout(processChunk, 0);
                    } else {
                        if (statusRow && statusRow.parentNode) statusRow.remove();
                        console.debug('[DEBUG] renderTable incremental complete', { total });
                        try {
                            setTimeout(() => { try { const evt = new CustomEvent('tableRenderComplete', { detail: { token, total } }); document.dispatchEvent(evt); } catch(e){} }, 0);
                        } catch(e){ /* ignore */ }
                    }
                };
                processChunk();
            } else {
                // Synchronous render for smaller datasets (original path)
                for (let idx=0; idx<total; idx++) {
                    const { offer, sailing } = state.sortedOffers[idx];
                    const offerDate = offer.campaignOffer?.startDate;
                    const isNewest = globalMaxOfferDate && offerDate && new Date(offerDate).getTime() === globalMaxOfferDate;
                    const expDate = offer.campaignOffer?.reserveByDate;
                    const isExpiringSoon = expDate && new Date(expDate).getTime() === soonestExpDate;
                    const row = App.Utils.createOfferRow({ offer, sailing }, isNewest, isExpiringSoon, idx);
                    if (row) tbody.appendChild(row); else console.warn('[DEBUG] renderTable: createOfferRow returned null/undefined', { idx, offer, sailing });
                }
                try {
                    setTimeout(() => { try { const evt = new CustomEvent('tableRenderComplete', { detail: { token, total } }); document.dispatchEvent(evt); } catch(e){} }, 0);
                } catch(e){ /* ignore */ }
            }
        }
        // Update sort indicators immediately (independent of incremental completion)
    state.headers.forEach(header => {
            const th = state.thead.querySelector(`th[data-key="${header.key}"]`);
            if (!th || header.key === 'favorite') return; // skip favorite column for sorting indicators
            th.classList.remove('sort-asc', 'sort-desc');
            if (state.currentSortColumn === header.key) {
                if (state.currentSortOrder === 'asc') th.classList.add('sort-asc');
                else if (state.currentSortOrder === 'desc') th.classList.add('sort-desc');
            }
        });
    }
};
