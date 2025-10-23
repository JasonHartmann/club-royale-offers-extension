const AccordionBuilder = {
    createGroupedData(sortedOffers, currentGroupColumn) {
        const groupedData = {};
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
                case 'tradeInValue':
                    // Use the same formatting as table rows so group labels match displayed values
                    groupKey = App.Utils.formatTradeValue(offer.campaignOffer?.tradeInValue);
                    // Debug: show mapping from raw value to group key for troubleshooting
                    try { console.debug('[AccordionBuilder] tradeInValue grouping:', { raw: offer.campaignOffer?.tradeInValue, groupKey }); } catch(e) {}
                    break;
                case 'offerName':
                    groupKey = offer.campaignOffer?.name || '-';
                    break;
                case 'shipClass':
                    groupKey = App.Utils.getShipClass(sailing.shipName) || '-';
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
                case 'category': {
                    let room = sailing.roomType;
                    if (sailing.isGTY) room = room ? room + ' GTY' : 'GTY';
                    groupKey = room || '-';
                    break;
                }
                case 'guests': {
                    groupKey = sailing.isGOBO ? '1 Guest' : '2 Guests';
                    if (sailing.isDOLLARSOFF && sailing.DOLLARSOFF_AMT > 0) groupKey += ` + $${sailing.DOLLARSOFF_AMT} off`;
                    if (sailing.isFREEPLAY && sailing.FREEPLAY_AMT > 0) groupKey += ` + $${sailing.FREEPLAY_AMT} freeplay`;
                    break;
                }
                case 'perks': {
                    groupKey = App.Utils.computePerks(offer, sailing);
                    break;
                }
                default:
                    groupKey = '-';
            }
            if (!groupedData[groupKey]) groupedData[groupKey] = [];
            groupedData[groupKey].push({ offer, sailing });
        });
        return groupedData;
    },
    sortGroupKeys(keys, column) {
        if (!Array.isArray(keys)) return [];
        const isDateCol = ['offerDate','expiration','sailDate','departureDate','offerDate','offerStart','offerEnd'].includes(column) || /date/i.test(column || '');
        const numericCols = ['nights'];
        return [...keys].sort((a,b) => {
            if (a === b) return 0;
            // Always push placeholder '-' to end
            if (a === '-') return 1;
            if (b === '-') return -1;
            if (numericCols.includes(column)) {
                const na = parseInt(a,10); const nb = parseInt(b,10);
                const aValid = !isNaN(na); const bValid = !isNaN(nb);
                if (aValid && bValid) return na-nb;
                if (aValid) return -1;
                if (bValid) return 1;
            }
            if (isDateCol) {
                const da = new Date(a); const db = new Date(b);
                const aValid = !isNaN(da.getTime()); const bValid = !isNaN(db.getTime());
                if (aValid && bValid) return da - db;
                if (aValid) return -1;
                if (bValid) return 1;
            }
            // Fallback: case-insensitive alphabetical
            return a.toString().localeCompare(b.toString(), undefined, { sensitivity:'base' });
        });
    },
    // Append grouping header (column) names, not selection values, to parent headers along the currently open path
    updateHeaderTitles(rootContainer, state) {
        if (!rootContainer || !state) return;
        const valuePath = state.groupKeysStack || []; // selected values path
        const groupingCols = state.groupingStack || []; // grouping column keys in order
        const headers = rootContainer.querySelectorAll('.accordion-header');
        headers.forEach(h => {
            const baseKey = h.dataset.baseKey;
            if (!baseKey) return;
            const count = parseInt(h.dataset.offerCount || '0', 10);
            const keyPathValues = (h.dataset.keyPath || '').split('>').filter(Boolean); // values representing this header path
            // Only decorate if this header is a prefix of current open value path
            let isPrefix = true;
            if (keyPathValues.length > valuePath.length) isPrefix = false;
            else {
                for (let i = 0; i < keyPathValues.length; i++) {
                    if (keyPathValues[i] !== valuePath[i]) { isPrefix = false; break; }
                }
            }
            let displayKey = baseKey;
            if (isPrefix) {
                // For each deeper level that has a selected value, append its grouping column header label
                // keyPathValues length corresponds to number of selected values up to this header (depth+1)
                const headerLabelMap = state.headerLabelMap || {};
                const appendedLabels = [];
                for (let i = keyPathValues.length; i < valuePath.length; i++) {
                    const groupingColKey = groupingCols[i]; // grouping column key at this depth
                    if (groupingColKey) {
                        const lbl = headerLabelMap[groupingColKey] || groupingColKey;
                        appendedLabels.push(lbl);
                    }
                }
                if (appendedLabels.length) displayKey = baseKey + ' > ' + appendedLabels.join(' > ');
            }

            // Build a left-side group (icon + label) so we can keep the count right-aligned
            const iconSvg = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 2V1.5C6 1.22 6.22 1 6.5 1H9.5C9.78 1 10 1.22 10 1.5V2M2 4H14M12.5 4V13.5C12.5 13.78 12.28 14 12 14H4C3.72 14 3.5 13.78 3.5 13.5V4M5.5 7V11M8 7V11M10.5 7V11" stroke="#888" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            let trashIconHtml = `<span class="trash-icon" title="Delete group" style="cursor:pointer; vertical-align:middle; display:inline-flex; align-items:center; margin-right:6px;">${iconSvg}</span>`;
            if ((h.dataset.depth && parseInt(h.dataset.depth, 10) > 0)) {
                trashIconHtml = '';
            }
            // Left group contains icon (if any) and the flexible label. Count remains as the last child so justify-content:space-between keeps it right-aligned.
            const leftGroup = trashIconHtml ? `<span style="display:flex; align-items:center; gap:0; min-width:0;">${trashIconHtml}<span style="flex:1; min-width:0; margin-left:3px; overflow:hidden; text-overflow:ellipsis;">${displayKey}</span></span>` : `<span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis;">${displayKey}</span>`;
            h.innerHTML = `${leftGroup}<span style="margin-left:12px">${count} offer${count === 1 ? '' : 's'}</span>`;
            // Add trash icon click handler
            const trashIcon = h.querySelector('.trash-icon');
            if (trashIcon) {
                trashIcon.addEventListener('click', function(e) {
                    e.stopPropagation();
                    // Build breadcrumb for this group
                    const keyPathValues = (h.dataset.keyPath || '').split('>').filter(Boolean);
                    const groupingCols = state.groupingStack || [];
                    const headerLabelMap = state.headerLabelMap || {};
                    let breadcrumb = '';
                    for (let i = 0; i < keyPathValues.length; i++) {
                        const colKey = groupingCols[i];
                        const label = headerLabelMap[colKey] || colKey || '';
                        breadcrumb += (i > 0 ? ' > ' : '') + label + ': ' + keyPathValues[i];
                    }
                    const groupHeader = h;
                    const groupContainer = groupHeader.parentElement;
                    const confirmMsg = `Are you sure you want to hide this group from all results?\n\n${breadcrumb}`;
                    if (window.confirm(confirmMsg)) {
                        // Hide header and its content (accordion-content)
                        groupHeader.style.display = 'none';
                        const content = groupContainer.querySelector('.accordion-content');
                        if (content) content.style.display = 'none';
                        Filtering.addHiddenGroup(state, breadcrumb);
                    }
                });
            }
        });
    },
    renderAccordion(accordionContainer, groupedData, groupSortStates, state, groupingStack = [], groupKeysStack = [], globalMaxOfferDate = null) {
        state.groupingStack = [...groupingStack];
        state.groupKeysStack = [...groupKeysStack];
        if (!state.openGroups) state.openGroups = new Set();
        if (!state.rootAccordionContainer) state.rootAccordionContainer = accordionContainer;
        const { headers, openGroups } = state;
        // build header label map once
        if (!state.headerLabelMap && headers) {
            state.headerLabelMap = headers.reduce((m, h) => { m[h.key] = h.label; return m; }, {});
        }
        accordionContainer.innerHTML = '';

        const currentGroupColumn = groupingStack.length ? groupingStack[groupingStack.length -1] : null;
        const sortedKeys = AccordionBuilder.sortGroupKeys(Object.keys(groupedData), currentGroupColumn);
        sortedKeys.forEach(groupKey => {
            const accordion = document.createElement('div');
            accordion.className = 'border mb-2';

            const header = document.createElement('div');
            const depth = groupingStack.length - 1; // keep legacy depth logic
            header.className = 'accordion-header';
            header.dataset.depth = depth;
            header.dataset.baseKey = groupKey; // store original group value for restoration
            header.dataset.keyPath = [...groupKeysStack, groupKey].join('>');
            header.dataset.offerCount = groupedData[groupKey].length;
            // Make header a flex container so child spans using flex (e.g. `<span style="flex:1;">`) work
            // and spacing (gap/margin) between the trash icon and label is reliable.
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.gap = '11px';
            header.innerHTML = `${groupKey} <span>${groupedData[groupKey].length} offer${groupedData[groupKey].length > 1 ? 's' : ''}</span>`;

            const content = document.createElement('div');
            content.className = 'accordion-content';
            const fullPath = [...groupKeysStack, groupKey].join('>');
            if (openGroups instanceof Set && openGroups.has(fullPath)) content.classList.add('open');

            const table = document.createElement('table');
            table.className = 'w-full border-collapse table-auto accordion-table';
            table.dataset.groupKey = groupKey;

            const thead = document.createElement('thead');
            thead.className = 'accordion-table-header';
            const tr = document.createElement('tr');

            headers.forEach(headerObj => {
                const th = document.createElement('th');
                th.className = 'border p-2 text-left font-semibold';
                th.dataset.key = headerObj.key;
                if (headerObj.key === 'favorite') {
                    // No grouping/sorting UI for favorites column inside accordions
                    th.innerHTML = `<span>${headerObj.label}</span>`;
                    tr.appendChild(th);
                    return; // skip adding listeners
                }
                th.innerHTML = `<span class="group-icon" title="Group by ${headerObj.label}">🗂️</span> <span class="sort-label cursor-pointer">${headerObj.label}</span>`;

                // Group (nested) click
                th.querySelector('.group-icon').addEventListener('click', e => {
                    e.stopPropagation();
                    if (groupingStack[groupingStack.length - 1] === headerObj.key) return; // avoid redundant grouping
                    if (state.groupKeysStack.length < groupingStack.length) {
                        state.groupKeysStack = [...groupKeysStack, groupKey];
                    }
                    const newGroupingStack = [...state.groupingStack, headerObj.key];
                    const newGroupKeysStack = [...state.groupKeysStack];
                    state.groupingStack = newGroupingStack;
                    state.groupKeysStack = newGroupKeysStack;
                    const offers = groupedData[groupKey];
                    const nestedGrouped = AccordionBuilder.createGroupedData(offers, headerObj.key);
                    content.innerHTML = '';
                    AccordionBuilder.renderAccordion(content, nestedGrouped, groupSortStates, state, newGroupingStack, newGroupKeysStack, globalMaxOfferDate);
                    content.classList.add('open');
                    state.openGroups.add(fullPath);
                    if (App?.TableRenderer?.updateBreadcrumb) App.TableRenderer.updateBreadcrumb(state.groupingStack, state.groupKeysStack);
                    AccordionBuilder.updateHeaderTitles(state.rootAccordionContainer, state);
                });

                // Sort click
                th.querySelector('.sort-label').addEventListener('click', e => {
                    e.stopPropagation();
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
                    let soonest = null; const now = Date.now(); const twoDays = 2*24*60*60*1000;
                    offers.forEach(({ offer }) => { const exp=offer.campaignOffer?.reserveByDate; if(exp){ const ms=new Date(exp).getTime(); if(ms>=now && ms-now<=twoDays){ if(!soonest|| ms<soonest) soonest=ms; } } });
                    const sorted = newOrder !== 'original' ? App.SortUtils.sortOffers([...offers], headerObj.key, newOrder) : offers;
                    const tbodyRef = table.querySelector('tbody');
                    if (tbodyRef) tbodyRef.innerHTML='';
                    sorted.forEach(({ offer, sailing }) => {
                        const isNewest = globalMaxOfferDate && offer.campaignOffer?.startDate && new Date(offer.campaignOffer.startDate).getTime() === globalMaxOfferDate;
                        const expDate = offer.campaignOffer?.reserveByDate;
                        const isExpiringSoon = expDate && new Date(expDate).getTime() === soonest;
                        const row = App.Utils.createOfferRow({ offer, sailing }, isNewest, isExpiringSoon);
                        tbodyRef.appendChild(row);
                    });
                    tr.querySelectorAll('th').forEach(h=>h.classList.remove('sort-asc','sort-desc'));
                    if (newOrder==='asc') th.classList.add('sort-asc'); else if(newOrder==='desc') th.classList.add('sort-desc');
                });

                tr.appendChild(th);
            });
            thead.appendChild(tr);

            // Baseline soonest expiring for initial (unsorted) render rows
            let soonestExpDate = null; const now = Date.now(); const twoDays = 2*24*60*60*1000;
            groupedData[groupKey].forEach(({ offer }) => { const exp=offer.campaignOffer?.reserveByDate; if(exp){ const ms=new Date(exp).getTime(); if(ms>=now && ms-now<=twoDays){ if(!soonestExpDate || ms<soonestExpDate) soonestExpDate=ms; } }});
            const tbody = document.createElement('tbody');
            if (groupingStack.length === 0 || groupKeysStack.length < groupingStack.length) {
                groupedData[groupKey].forEach(({ offer, sailing }) => {
                    const offerDate = offer.campaignOffer?.startDate;
                    const isNewest = globalMaxOfferDate && offerDate && new Date(offerDate).getTime() === globalMaxOfferDate;
                    const expDate = offer.campaignOffer?.reserveByDate;
                    const isExpiringSoon = expDate && new Date(expDate).getTime() === soonestExpDate;
                    const row = App.Utils.createOfferRow({ offer, sailing }, isNewest, isExpiringSoon);
                    tbody.appendChild(row);
                });
            }
            table.appendChild(thead);
            table.appendChild(tbody);
            content.appendChild(table);
            accordion.appendChild(header);
            accordion.appendChild(content);
            accordionContainer.appendChild(accordion);

            header.addEventListener('click', () => {
                const keyPath = [...groupKeysStack, groupKey].join('>');
                const isOpen = content.classList.contains('open');
                const currentDepth = groupKeysStack.length; // depth index for this header's grouping column

                // Close sibling groups at same level
                accordionContainer.querySelectorAll(':scope > .border > .accordion-content.open').forEach(c => { if (c !== content) c.classList.remove('open'); });

                // Always prune deeper open group paths (values) beneath this one
                const deeperPrefix = keyPath + '>';
                Array.from(state.openGroups).forEach(p => { if (p.startsWith(deeperPrefix)) state.openGroups.delete(p); });

                if (!isOpen) {
                    // Restore flat table view (remove any nested accordions under this content)
                    if (content.querySelector('.accordion-header')) {
                        content.innerHTML = '';
                        content.appendChild(table);
                    }
                    content.classList.add('open');
                    state.openGroups.add(keyPath);

                    // Trim groupingStack to this depth + 1 (keep this column only, drop deeper columns)
                    state.groupingStack = state.groupingStack.slice(0, currentDepth + 1);
                    // Set groupKeysStack to include this group's value only up to this depth
                    state.groupKeysStack = state.groupKeysStack.slice(0, currentDepth).concat(groupKey);
                } else {
                    // Collapse: remove this open state and its value selection
                    content.classList.remove('open');
                    state.openGroups.delete(keyPath);
                    // Keep grouping columns up to this depth (no deeper ones)
                    state.groupingStack = state.groupingStack.slice(0, currentDepth + 1);
                    // Remove the value at this depth so user is back at parent list
                    state.groupKeysStack = state.groupKeysStack.slice(0, currentDepth);
                }

                if (App?.TableRenderer?.updateBreadcrumb) App.TableRenderer.updateBreadcrumb(state.groupingStack, state.groupKeysStack);
                AccordionBuilder.updateHeaderTitles(state.rootAccordionContainer, state);
            });
        });
        AccordionBuilder.updateHeaderTitles(state.rootAccordionContainer, state);
    }
};
