const AccordionBuilder = {
    createGroupedData(sortedOffers, currentGroupColumn) {
        const groupedData = {};
        sortedOffers.forEach(({ offer, sailing }) => {
            let groupKey;
            switch (currentGroupColumn) {
                case 'offerCode':
                    groupKey = offer.campaignOffer?.offerCode || '-';
                    break;
                case 'offerDate':
                    groupKey = new Date(offer.campaignOffer?.startDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) || '-';
                    break;
                case 'expiration':
                    groupKey = new Date(offer.campaignOffer?.reserveByDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) || '-';
                    break;
                case 'offerName':
                    groupKey = offer.campaignOffer?.name || '-';
                    break;
                case 'ship':
                    groupKey = sailing.shipName || '-';
                    break;
                case 'sailDate':
                    groupKey = new Date(sailing.sailDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) || '-';
                    break;
                case 'departurePort':
                    groupKey = sailing.departurePort?.name || '-';
                    break;
                case 'itinerary':
                    groupKey = sailing.itineraryDescription || sailing.sailingType?.name || '-';
                    break;
                case 'category':
                    let room = sailing.roomType;
                    if (sailing.isGTY) {
                        if (room) {
                            room += ' GTY';
                        } else {
                            room = 'GTY';
                        }
                    }
                    groupKey = room || '-';
                    break;
                case 'quality':
                    groupKey = sailing.isGOBO ? '2 Guests' : '1 Guest';
                    if (sailing.isDOLLARSOFF && sailing.DOLLARSOFF_AMT > 0) {
                        groupKey += ` + $${sailing.DOLLARSOFF_AMT} off`;
                    }
                    if (sailing.isFREEPLAY && sailing.FREEPLAY_AMT > 0) {
                        groupKey += ` + $${sailing.FREEPLAY_AMT} freeplay`;
                    }
                    break;
            }
            if (!groupedData[groupKey]) groupedData[groupKey] = [];
            groupedData[groupKey].push({ offer, sailing });
        });
        return groupedData;
    },
    renderAccordion(accordionContainer, groupedData, groupSortStates, state) {
        const { headers, sortedOffers, originalOffers, currentSortColumn, currentSortOrder, currentGroupColumn, viewMode, table, thead, tbody, backButton, container, backdrop, openGroups } = state;
        accordionContainer.innerHTML = '';
        Object.keys(groupedData).forEach((groupKey) => {
            const accordion = document.createElement('div');
            accordion.className = 'border mb-2';
            const header = document.createElement('div');
            header.className = 'accordion-header';
            header.innerHTML = `
                ${groupKey} <span>${groupedData[groupKey].length} offer${groupedData[groupKey].length > 1 ? 's' : ''}</span>
            `;
            const content = document.createElement('div');
            content.className = 'accordion-content';
            if (openGroups instanceof Set && openGroups.has(groupKey)) {
                content.classList.add('open');
            }
            const groupTable = document.createElement('table');
            groupTable.className = 'w-full border-collapse table-auto accordion-table';
            groupTable.dataset.groupKey = groupKey;

            const groupThead = document.createElement('thead');
            groupThead.className = 'accordion-table-header';
            const groupTr = document.createElement('tr');
            headers.forEach(header => {
                const th = document.createElement('th');
                th.className = 'border p-2 text-left font-semibold cursor-pointer';
                th.dataset.key = header.key;
                th.innerHTML = `
                    <span class="sort-label">${header.label}</span>
                `;
                th.addEventListener('click', (event) => {
                    event.stopPropagation();
                    console.log(`Sorting accordion group ${groupKey} by ${header.key}`);
                    if (!groupSortStates[groupKey]) groupSortStates[groupKey] = { column: null, order: 'original' };
                    if (groupSortStates[groupKey].column === header.key) {
                        groupSortStates[groupKey].order = groupSortStates[groupKey].order === 'asc' ? 'desc' : groupSortStates[groupKey].order === 'desc' ? 'original' : 'asc';
                    } else {
                        groupSortStates[groupKey].column = header.key;
                        groupSortStates[groupKey].order = 'asc';
                    }
                    content.classList.add('open');
                    state.groupSortStates = groupSortStates;
                    App.TableRenderer.updateView(state);
                });
                groupTr.appendChild(th);
            });
            groupThead.appendChild(groupTr);

            const groupTbody = document.createElement('tbody');
            let groupRows = [...groupedData[groupKey]];
            if (groupSortStates[groupKey] && groupSortStates[groupKey].order !== 'original') {
                groupRows = App.SortUtils.sortOffers(groupRows, groupSortStates[groupKey].column, groupSortStates[groupKey].order);
            }
            groupRows.forEach(({ offer, sailing }) => {
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
                groupTbody.appendChild(row);
            });

            headers.forEach(header => {
                const th = groupThead.querySelector(`th[data-key="${header.key}"]`);
                th.classList.remove('sort-asc', 'sort-desc');
                if (groupSortStates[groupKey] && groupSortStates[groupKey].column === header.key) {
                    if (groupSortStates[groupKey].order === 'asc') th.classList.add('sort-asc');
                    else if (groupSortStates[groupKey].order === 'desc') th.classList.add('sort-desc');
                }
            });

            groupTable.appendChild(groupThead);
            groupTable.appendChild(groupTbody);
            content.appendChild(groupTable);
            accordion.appendChild(header);
            accordion.appendChild(content);
            accordionContainer.appendChild(accordion);

            header.addEventListener('click', () => {
                console.log(`Toggling accordion for group: ${groupKey}`);
                const isOpen = content.classList.contains('open');
                document.querySelectorAll('.accordion-content.open').forEach(c => {
                    c.classList.remove('open');
                });
                if (!isOpen) {
                    content.classList.add('open');
                    state.openGroups.add(groupKey);
                } else {
                    content.classList.remove('open');
                    state.openGroups.delete(groupKey);
                }
            });
        });
    }
};