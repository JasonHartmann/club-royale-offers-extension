const TableBuilder = {
    createMainTable() {
        const table = document.createElement('table');
        table.className = 'w-full border-collapse table-auto';
        return table;
    },
    createTableHeader(headers, currentSortColumn, currentSortOrder, viewMode, sortedOffers, originalOffers, currentGroupColumn, groupSortStates, table, tbody, accordionContainer, backButton, container, backdrop) {
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
                App.TableRenderer.updateView({
                    sortedOffers,
                    originalOffers,
                    currentSortColumn: header.key,
                    currentSortOrder: newSortOrder,
                    currentGroupColumn,
                    viewMode: 'table',
                    groupSortStates,
                    table,
                    thead,
                    tbody,
                    accordionContainer,
                    backButton,
                    headers,
                    container,
                    backdrop
                });
            });
            th.querySelector('.group-icon').addEventListener('click', () => {
                console.log(`Grouping by ${header.key}`);
                App.TableRenderer.updateView({
                    sortedOffers,
                    originalOffers,
                    currentSortColumn,
                    currentSortOrder,
                    currentGroupColumn: header.key,
                    viewMode: 'accordion',
                    groupSortStates: {},
                    table,
                    thead,
                    tbody,
                    accordionContainer,
                    backButton,
                    headers,
                    container,
                    backdrop
                });
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
            row.innerHTML = `<td colspan="9" class="border p-2 text-center">No offers available</td>`;
            tbody.appendChild(row);
        } else {
            sortedOffers.forEach(({ offer, sailing }) => {
                const row = document.createElement('tr');
                row.className = 'hover:bg-gray-50';
                row.innerHTML = `
                    <td class="border p-2">${offer.campaignOffer?.offerCode || '-'}</td>
                    <td class="border p-2">${new Date(offer.campaignOffer?.startDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) || '-'}</td>
                    <td class="border p-2">${new Date(offer.campaignOffer?.reserveByDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) || '-'}</td>
                    <td class="border p-2">${offer.campaignOffer.name || '-'}</td>
                    <td class="border p-2">${sailing.shipName || '-'}</td>
                    <td class="border p-2">${new Date(sailing.sailDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) || '-'}</td>
                    <td class="border p-2">${sailing.departurePort?.name || '-'}</td>
                    <td class="border p-2">${sailing.itineraryDescription || sailing.sailingType?.name || '-'}</td>
                    <td class="border p-2">
                        <span class="${sailing.isGOBO ? 'bg-green-500 text-white' : 'bg-gray-300 text-black'} inline-block px-2 py-1 rounded text-sm">
                            ${sailing.isGOBO ? 'Yes' : 'No'}
                        </span>
                    </td>
                `;
                tbody.appendChild(row);
            });
        }
    }
};