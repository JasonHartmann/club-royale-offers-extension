const TableBuilder = {
    createMainTable() {
        const table = document.createElement('table');
        table.className = 'w-full border-collapse table-auto';
        return table;
    },
    createTableHeader(state) {
        const { headers, currentSortColumn, currentSortOrder, viewMode, sortedOffers, originalOffers, currentGroupColumn, groupSortStates, table, tbody, accordionContainer, backButton, container, backdrop, openGroups } = state;
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
                console.log(`Sorting by ${header.key}`);
                let newSortOrder = 'asc';
                if (state.currentSortColumn === header.key) {
                    newSortOrder = state.currentSortOrder === 'asc' ? 'desc' : (state.currentSortOrder === 'desc' ? 'original' : 'asc');
                }
                state.currentSortColumn = header.key;
                state.currentSortOrder = newSortOrder;
                state.viewMode = 'table';
                App.TableRenderer.updateView(state);
            });
            th.querySelector('.group-icon').addEventListener('click', () => {
                console.log(`Grouping by ${header.key}`);
                // Force sort on this column to Ascending before grouping
                state.currentSortColumn = header.key;
                state.currentSortOrder = 'asc';
                state.currentGroupColumn = header.key;
                state.viewMode = 'accordion';
                state.groupSortStates = {};
                state.openGroups = new Set();
                App.TableRenderer.updateView(state);
            });
            tr.appendChild(th);
        });
        thead.appendChild(tr);
        return thead;
    },
    // Helper to format date string as MM/DD/YY without timezone shift
    formatDate(dateStr) {
        if (!dateStr) return '-';
        const [year, month, day] = dateStr.split('T')[0].split('-');
        return `${month}/${day}/${year.slice(-2)}`;
    },
    renderTable(tbody, state) {
        tbody.innerHTML = '';
        if (state.sortedOffers.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="10" class="border p-2 text-center">No offers available</td>`;
            tbody.appendChild(row);
        } else {
            state.sortedOffers.forEach(({ offer, sailing }) => {
                const row = document.createElement('tr');
                row.className = 'hover:bg-gray-50';
                let qualityText = sailing.isGOBO ? '1 Guest' : '2 Guests';
                if (sailing.isDOLLARSOFF && sailing.DOLLARSOFF_AMT > 0) {
                    qualityText += ` + $${sailing.DOLLARSOFF_AMT} off`;
                }
                if (sailing.isFREEPLAY && sailing.FREEPLAY_AMT > 0) {
                    qualityText += ` + $${sailing.FREEPLAY_AMT} freeplay`;
                }
                let room = sailing.roomType;
                if (sailing.isGTY) {
                    if (room) {
                        room += ' GTY';
                    } else {
                        room = 'GTY';
                    }
                }
                row.innerHTML = `
                    <td class="border p-2">${offer.campaignOffer?.offerCode || '-'}</td>
                    <td class="border p-2">${TableBuilder.formatDate(offer.campaignOffer?.startDate)}</td>
                    <td class="border p-2">${TableBuilder.formatDate(offer.campaignOffer?.reserveByDate)}</td>
                    <td class="border p-2">${offer.campaignOffer.name || '-'}</td>
                    <td class="border p-2">${sailing.shipName || '-'}</td>
                    <td class="border p-2">${TableBuilder.formatDate(sailing.sailDate)}</td>
                    <td class="border p-2">${sailing.departurePort?.name || '-'}</td>
                    <td class="border p-2">${sailing.itineraryDescription || sailing.sailingType?.name || '-'}</td>
                    <td class="border p-2">${room || '-'}</td>
                    <td class="border p-2">${qualityText}</td>
                `;
                tbody.appendChild(row);
            });
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