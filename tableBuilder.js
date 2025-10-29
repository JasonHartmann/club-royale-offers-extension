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
                th.innerHTML = `
                <span class="group-icon" title="Group by ${header.label}">📂</span>
                <span class="sort-label">${header.label}</span>
            `;
                th.querySelector('.sort-label').addEventListener('click', () => {
                    console.debug('[tableBuilder] sort-label click', header.key);
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
                });
                th.querySelector('.group-icon').addEventListener('click', () => {
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
