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
            // tbody for group rows, declared before header loop so sort callback can reference it
            const groupTbody = document.createElement('tbody');

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
                    if (groupingStack[groupingStack.length - 1] === headerObj.key) return;
                    const newGroupingStack = [...groupingStack, headerObj.key];
                    const newGroupKeysStack = [...groupKeysStack, groupKey];
                    const offers = groupedData[groupKey];
                    const nestedGroupedData = AccordionBuilder.createGroupedData(offers, headerObj.key);
                    content.innerHTML = '';
                    AccordionBuilder.renderAccordion(content, nestedGroupedData, groupSortStates, state, newGroupingStack, newGroupKeysStack);
                    // auto-expand this group container
                    content.classList.add('open');
                    state.openGroups.add([...groupKeysStack, groupKey].join('>'));
                    if (typeof App !== 'undefined' && App.TableRenderer && App.TableRenderer.updateBreadcrumb) {
                        App.TableRenderer.updateBreadcrumb(newGroupingStack, newGroupKeysStack);
                    }
                });
                // Sort label click for this group's rows
                th.querySelector('.sort-label').addEventListener('click', event => {
                    event.stopPropagation();
                    const groupPath = [...groupKeysStack, groupKey].join('>');
                    const gs = groupSortStates[groupPath] || { currentSortColumn: null, currentSortOrder: 'original' };
                    let newOrder = 'asc';
                    if (gs.currentSortColumn === headerObj.key) {
                        newOrder = gs.currentSortOrder === 'asc' ? 'desc' : (gs.currentSortOrder === 'desc' ? 'original' : 'asc');
                    }
                    gs.currentSortColumn = headerObj.key;
                    gs.currentSortOrder = newOrder;
                    groupSortStates[groupPath] = gs;
                    const offers = groupedData[groupKey];
                    const sorted = newOrder !== 'original' ? App.SortUtils.sortOffers([...offers], headerObj.key, newOrder) : offers;
                    groupTbody.innerHTML = '';
                    sorted.forEach(({ offer, sailing }) => {
                        // delegate row rendering to Utils
                        const row = App.Utils.createOfferRow({ offer, sailing });
                        groupTbody.appendChild(row);
                    });
                });
                groupTr.appendChild(th);
            });
            groupThead.appendChild(groupTr);

            // Only show rows if not further grouped
            if (groupingStack.length === 0 || groupKeysStack.length < groupingStack.length) {
                groupedData[groupKey].forEach(({ offer, sailing }) => {
                    // delegate row rendering
                    const row = App.Utils.createOfferRow({ offer, sailing });
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