const AccordionBuilder = {
    createGroupedData(sortedOffers, currentGroupColumn) {
        const groupedData = {};
        // Map to normalize destination keys (case-insensitive)
        const normalizedDestMap = {};
        sortedOffers.forEach(({ offer, sailing }) => {
            let groupKey;
            switch (currentGroupColumn) {
                case 'nights': {
                    const itinerary = sailing.itineraryDescription || sailing.sailingType?.name || '-';
                    groupKey = App.Utils.parseItinerary(itinerary).nights;
                    break;
                }
                case 'destination': {
                    const itinerary = sailing.itineraryDescription || sailing.sailingType?.name || '-';
                    // Normalize destination to merge identical names regardless of case or whitespace
                    const rawDest = App.Utils.parseItinerary(itinerary).destination || '-';
                    const trimmedDest = rawDest.trim();
                    const keyLower = trimmedDest.toLowerCase();
                    if (!normalizedDestMap[keyLower]) normalizedDestMap[keyLower] = trimmedDest;
                    groupKey = normalizedDestMap[keyLower];
                    break;
                }
                case 'offerCode':
                    groupKey = offer.campaignOffer?.offerCode || '-';
                    break;
                case 'offerDate':
                    groupKey = App.Utils.formatDate(offer.campaignOffer?.startDate);
                    break;
                case 'expiration':
                    groupKey = App.Utils.formatDate(offer.campaignOffer?.reserveByDate);
                    break;
                case 'offerName':
                    groupKey = offer.campaignOffer?.name || '-';
                    break;
                case 'ship':
                    groupKey = sailing.shipName || '-';
                    break;
                case 'sailDate':
                    groupKey = App.Utils.formatDate(sailing.sailDate);
                    break;
                case 'departurePort':
                    groupKey = sailing.departurePort?.name || '-';
                    break;
                case 'itinerary':
                    groupKey = sailing.itineraryDescription || sailing.sailingType?.name || '-';
                    break;
                case 'category': {
                    let room = sailing.roomType;
                    if (sailing.isGTY) {
                        room = room ? room + ' GTY' : 'GTY';
                    }
                    groupKey = room || '-';
                    break;
                }
                case 'quality': {
                    groupKey = sailing.isGOBO ? '1 Guest' : '2 Guests';
                    if (sailing.isDOLLARSOFF && sailing.DOLLARSOFF_AMT > 0) {
                        groupKey += ` + $${sailing.DOLLARSOFF_AMT} off`;
                    }
                    if (sailing.isFREEPLAY && sailing.FREEPLAY_AMT > 0) {
                        groupKey += ` + $${sailing.FREEPLAY_AMT} freeplay`;
                    }
                    break;
                }
            }
            if (!groupedData[groupKey]) groupedData[groupKey] = [];
            groupedData[groupKey].push({ offer, sailing });
        });
        return groupedData;
    },
    // Helper to format date string as MM/DD/YY without timezone shift
    formatDate(dateStr) {
        if (!dateStr) return '-';
        const [year, month, day] = dateStr.split('T')[0].split('-');
        return `${month}/${day}/${year.slice(-2)}`;
    },
    // Recursive function to render nested accordions
    renderAccordion(accordionContainer, groupedData, groupSortStates, state, groupingStack = [], groupKeysStack = []) {
        const { headers, openGroups } = state;
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
            if (openGroups instanceof Set && openGroups.has([...groupKeysStack, groupKey].join('>'))) {
                content.classList.add('open');
            }
            const groupTable = document.createElement('table');
            groupTable.className = 'w-full border-collapse table-auto accordion-table';
            groupTable.dataset.groupKey = groupKey;

            const groupThead = document.createElement('thead');
            groupThead.className = 'accordion-table-header';
            const groupTr = document.createElement('tr');
            headers.forEach(headerObj => {
                const th = document.createElement('th');
                th.className = 'border p-2 text-left font-semibold cursor-pointer';
                th.dataset.key = headerObj.key;
                th.innerHTML = `
                    <span class="group-icon" title="Group by ${headerObj.label}">🗂️</span>
                    <span class="sort-label">${headerObj.label}</span>
                `;
                // Group icon click for nested grouping
                th.querySelector('.group-icon').addEventListener('click', (event) => {
                    event.stopPropagation();
                    // Prevent grouping by the same column twice in a row
                    if (groupingStack[groupingStack.length - 1] === headerObj.key) return;
                    // Push new grouping
                    const newGroupingStack = [...groupingStack, headerObj.key];
                    const newGroupKeysStack = [...groupKeysStack, groupKey];
                    // Get offers for this group
                    let offers = groupedData[groupKey];
                    // Group by new column
                    const nestedGroupedData = AccordionBuilder.createGroupedData(offers, headerObj.key);
                    // Render nested accordion
                    content.innerHTML = '';
                    AccordionBuilder.renderAccordion(content, nestedGroupedData, groupSortStates, state, newGroupingStack, newGroupKeysStack);
                    // Update breadcrumb
                    if (typeof App !== 'undefined' && App.TableRenderer && App.TableRenderer.updateBreadcrumb) {
                        App.TableRenderer.updateBreadcrumb(newGroupingStack, newGroupKeysStack);
                    }
                });
                groupTr.appendChild(th);
            });
            groupThead.appendChild(groupTr);

            const groupTbody = document.createElement('tbody');
            // Only show rows if not further grouped
            if (groupingStack.length === 0 || groupKeysStack.length < groupingStack.length) {
                groupedData[groupKey].forEach(({ offer, sailing }) => {
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
                    const itinerary = sailing.itineraryDescription || sailing.sailingType?.name || '-';
                    const { nights, destination } = App.Utils.parseItinerary(itinerary);
                    row.innerHTML = `
                        <td class="border p-2">${offer.campaignOffer?.offerCode || '-'}</td>
                        <td class="border p-2">${App.Utils.formatDate(offer.campaignOffer?.startDate)}</td>
                        <td class="border p-2">${App.Utils.formatDate(offer.campaignOffer?.reserveByDate)}</td>
                        <td class="border p-2">${offer.campaignOffer.name || '-'}</td>
                        <td class="border p-2">${sailing.shipName || '-'}</td>
                        <td class="border p-2">${App.Utils.formatDate(sailing.sailDate)}</td>
                        <td class="border p-2">${sailing.departurePort?.name || '-'}</td>
                        <td class="border p-2">${nights}</td>
                        <td class="border p-2">${destination}</td>
                        <td class="border p-2">${room || '-'}</td>
                        <td class="border p-2">${qualityText}</td>
                    `;
                    groupTbody.appendChild(row);
                });
            }
            groupTable.appendChild(groupThead);
            groupTable.appendChild(groupTbody);
            content.appendChild(groupTable);
            accordion.appendChild(header);
            accordion.appendChild(content);
            accordionContainer.appendChild(accordion);

            header.addEventListener('click', () => {
                const keyPath = [...groupKeysStack, groupKey].join('>');
                const isOpen = content.classList.contains('open');
                document.querySelectorAll('.accordion-content.open').forEach(c => {
                    c.classList.remove('open');
                });
                if (!isOpen) {
                    content.classList.add('open');
                    state.openGroups.add(keyPath);
                } else {
                    content.classList.remove('open');
                    state.openGroups.delete(keyPath);
                }
            });
        });
    }
};