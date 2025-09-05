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
                if (currentSortColumn === header.key) {
                    newSortOrder = currentSortOrder === 'asc' ? 'desc' : currentSortOrder === 'desc' ? 'original' : 'asc';
                }
                state.currentSortColumn = header.key;
                state.currentSortOrder = newSortOrder;
                state.viewMode = 'table';
                App.TableRenderer.updateView(state);
            });
            th.querySelector('.group-icon').addEventListener('click', () => {
                console.log(`Grouping by ${header.key}`);
                state.currentGroupColumn = header.key;
                state.viewMode = 'accordion';
                state.groupSortStates = {};
                state.openGroups = new Set();
                App.TableRenderer.updateView(state);
            });
            if (header.key === currentSortColumn && viewMode === 'table') {
                if (currentSortOrder === 'asc') th.classList.add('sort-asc');
                else if (currentSortOrder === 'desc') th.classList.add('sort-desc');
            }
            tr.appendChild(th);
        });
        thead.appendChild(tr);
        return thead;
    },
    renderTable(tbody, sortedOffers) {
        tbody.innerHTML = '';
        if (sortedOffers.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="10" class="border p-2 text-center">No offers available</td>`;
            tbody.appendChild(row);
        } else {
            sortedOffers.forEach(({ offer, sailing }) => {
                const row = document.createElement('tr');
                row.className = 'hover:bg-gray-50';
                let qualityText = sailing.isGOBO ? '2 Guests' : '1 Guest';
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
                    <td class="border p-2">${new Date(offer.campaignOffer?.startDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) || '-'}</td>
                    <td class="border p-2">${new Date(offer.campaignOffer?.reserveByDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) || '-'}</td>
                    <td class="border p-2">${offer.campaignOffer.name || '-'}</td>
                    <td class="border p-2">${sailing.shipName || '-'}</td>
                    <td class="border p-2">${new Date(sailing.sailDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) || '-'}</td>
                    <td class="border p-2">${sailing.departurePort?.name || '-'}</td>
                    <td class="border p-2">${sailing.itineraryDescription || sailing.sailingType?.name || '-'}</td>
                    <td class="border p-2">${room || '-'}</td>
                    <td class="border p-2">${qualityText}</td>
                `;
                tbody.appendChild(row);
            });
        }
    }
};