const TableBuilder = {
    createMainTable() {
        const table = document.createElement('table');
        table.className = 'w-full border-collapse table-auto';
        return table;
    },
    createTableHeader(state) {
        const { headers } = state;
        const thead = document.createElement('thead');
        thead.className = 'table-header';
        const tr = document.createElement('tr');
        headers.forEach(header => {
            const th = document.createElement('th');
            th.className = 'border p-2 text-left font-semibold cursor-pointer';
            th.dataset.key = header.key;
            th.innerHTML = `
                <span class="group-icon" title="Group by ${header.label}">🗂️</span>
                <span class="sort-label">${header.label}</span>
            `;
            th.querySelector('.sort-label').addEventListener('click', () => {
                let newSortOrder = 'asc';
                if (state.currentSortColumn === header.key) {
                    newSortOrder = state.currentSortOrder === 'asc' ? 'desc' : (state.currentSortOrder === 'desc' ? 'original' : 'asc');
                }
                state.currentSortColumn = header.key;
                state.currentSortOrder = newSortOrder;
                // If not grouped, remember base sort
                if (!state.groupingStack || state.groupingStack.length === 0) {
                    state.baseSortColumn = state.currentSortColumn;
                    state.baseSortOrder = state.currentSortOrder;
                }
                state.viewMode = 'table';
                // Reset grouping stacks when returning to table sort
                state.currentGroupColumn = null;
                state.groupingStack = [];
                state.groupKeysStack = [];
                App.TableRenderer.updateView(state);
            });
            th.querySelector('.group-icon').addEventListener('click', () => {
                // Initial (top-level) grouping by this column
                state.currentSortColumn = header.key;
                state.currentSortOrder = 'asc';
                state.currentGroupColumn = header.key;
                state.viewMode = 'accordion';
                state.groupSortStates = {};
                state.openGroups = new Set();
                state.groupingStack = [header.key];
                state.groupKeysStack = []; // no selected key yet at top-level
                App.TableRenderer.updateView(state);
                App.TableRenderer.updateBreadcrumb(state.groupingStack, state.groupKeysStack);
            });
            tr.appendChild(th);
        });
        thead.appendChild(tr);
        return thead;
    },
    renderTable(tbody, state, globalMaxOfferDate = null) {
        console.log('[DEBUG] renderTable ENTRY', { sortedOffersLength: state.sortedOffers.length, tbody });
        tbody.innerHTML = '';
        if (state.sortedOffers.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="13" class="border p-2 text-center">No offers available</td>`;
            tbody.appendChild(row);
            console.log('[DEBUG] renderTable: No offers available row appended');
        } else {
            // Find the soonest expiring offer in the next 2 days
            let soonestExpDate = null;
            const now = Date.now();
            const twoDays = 2 * 24 * 60 * 60 * 1000;
            state.sortedOffers.forEach(({ offer }) => {
                const expStr = offer.campaignOffer?.reserveByDate;
                if (expStr) {
                    const expDate = new Date(expStr).getTime();
                    if (expDate >= now && expDate - now <= twoDays) {
                        if (!soonestExpDate || expDate < soonestExpDate) soonestExpDate = expDate;
                    }
                }
            });
            state.sortedOffers.forEach(({ offer, sailing }, idx) => {
                const offerDate = offer.campaignOffer?.startDate;
                const isNewest = globalMaxOfferDate && offerDate && new Date(offerDate).getTime() === globalMaxOfferDate;
                const expDate = offer.campaignOffer?.reserveByDate;
                const isExpiringSoon = expDate && new Date(expDate).getTime() === soonestExpDate;
                const row = App.Utils.createOfferRow({ offer, sailing }, isNewest, isExpiringSoon);
                if (row) {
                    tbody.appendChild(row);
                } else {
                    console.warn('[DEBUG] renderTable: createOfferRow returned null/undefined', { idx, offer, sailing });
                }
            });
            console.log('[DEBUG] renderTable: Finished appending ' + state.sortedOffers.length + ' rows');
        }

        state.headers.forEach(header => {
            const th = state.thead.querySelector(`th[data-key="${header.key}"]`);
            th.classList.remove('sort-asc', 'sort-desc');
            if (state.currentSortColumn === header.key) {
                if (state.currentSortOrder === 'asc') th.classList.add('sort-asc');
                else if (state.currentSortOrder === 'desc') th.classList.add('sort-desc');
            }
        });
    }
};