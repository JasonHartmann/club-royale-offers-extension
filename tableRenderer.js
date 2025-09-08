const TableRenderer = {
    prepareOfferData(data) {
        let originalOffers = [];
        let sortedOffers = [];
        if (data.offers && data.offers.length > 0) {
            data.offers.forEach(offer => {
                if (offer.campaignOffer && offer.campaignOffer.sailings) {
                    offer.campaignOffer.sailings.forEach(sailing => {
                        originalOffers.push({ offer, sailing });
                    });
                }
            });
            sortedOffers = [...originalOffers];
        }
        return { originalOffers, sortedOffers };
    },
    displayTable(data) {
        try {
            const existingTable = document.getElementById('gobo-offers-table');
            if (existingTable) existingTable.remove();
            const existingBackdrop = document.getElementById('gobo-backdrop');
            if (existingBackdrop) existingBackdrop.remove();

            document.body.style.overflow = 'hidden';

            const state = {
                backdrop: App.Modal.createBackdrop(),
                container: App.Modal.createModalContainer(),
                table: App.TableBuilder.createMainTable(),
                tbody: document.createElement('tbody'),
                accordionContainer: document.createElement('div'),
                backButton: document.createElement('button'),
                headers: [
                    { key: 'offerCode', label: 'Code' },
                    { key: 'offerDate', label: 'Received' },
                    { key: 'expiration', label: 'Expiration' },
                    { key: 'offerName', label: 'Name' },
                    { key: 'ship', label: 'Ship' },
                    { key: 'sailDate', label: 'Sail Date' },
                    { key: 'departurePort', label: 'Departure Port' },
                    { key: 'nights', label: 'Nights' },
                    { key: 'destination', label: 'Destination' },
                    { key: 'category', label: 'Category' },
                    { key: 'quality', label: 'Quality' }
                ],
                currentSortColumn: null,
                currentSortOrder: 'original',
                currentGroupColumn: null,
                viewMode: 'table',
                groupSortStates: {},
                openGroups: new Set(),
                ...this.prepareOfferData(data)
            };
            state.accordionContainer.className = 'w-full';
            state.backButton.style.display = 'none';
            state.backButton.onclick = () => {
                console.log('Switching back to table view');
                state.currentGroupColumn = null;
                state.viewMode = 'table';
                state.groupSortStates = {};
                state.openGroups = new Set();
                this.updateView(state);
            };

            state.thead = App.TableBuilder.createTableHeader(state);

            const overlappingElements = [];
            document.querySelectorAll('[style*="position: fixed"], [style*="position: absolute"], [style*="z-index"], .fixed, .absolute, iframe:not(#gobo-offers-table):not(#gobo-backdrop), .sign-modal-overlay, .email-capture, .bg-purple-overlay, .heading1, [class*="relative"][class*="overflow-hidden"][class*="flex-col"]').forEach(el => {
                const computedStyle = window.getComputedStyle(el);
                if ((parseInt(computedStyle.zIndex) > 0 || computedStyle.position === 'fixed' || computedStyle.position === 'absolute' || el.classList.contains('sign-modal-overlay') || el.classList.contains('email-capture') || el.classList.contains('bg-purple-overlay') || el.classList.contains('heading1') || el.classList.contains('relative')) && el.id !== 'gobo-offers-table' && el.id !== 'gobo-backdrop') {
                    el.dataset.originalDisplay = el.style.display;
                    el.style.display = 'none';
                    overlappingElements.push(el);
                }
            });
            if (overlappingElements.length > 0) {
                console.log(`Hid ${overlappingElements.length} overlapping elements`);
            }

            App.Modal.setupModal(state, overlappingElements);
            this.updateView(state);

            console.log('Table displayed');
        } catch (error) {
            console.error('Failed to display table:', error.message);
            App.ErrorHandler.showError('Failed to display table. Please try again.');
            document.body.style.overflow = '';
            const existingBackdrop = document.getElementById('gobo-backdrop');
            if (existingBackdrop) existingBackdrop.remove();
        }
    },
    updateView(state) {
        App.TableRenderer.lastState = state;
        const { table, accordionContainer, backButton, currentSortOrder, currentSortColumn, viewMode, sortedOffers, originalOffers, groupSortStates, openGroups, thead, tbody, headers, container, backdrop } = state;
        table.style.display = viewMode === 'table' ? 'table' : 'none';
        accordionContainer.style.display = viewMode === 'accordion' ? 'block' : 'none';

        const breadcrumbContainer = document.querySelector('.breadcrumb-container');
        if (breadcrumbContainer) {
            breadcrumbContainer.classList.toggle('accordion-view', viewMode === 'accordion');
        }

        const groupTitle = document.getElementById('group-title');
        if (groupTitle) {
            groupTitle.textContent = viewMode === 'accordion' && state.currentGroupColumn ? headers.find(h => h.key === state.currentGroupColumn)?.label || '' : '';
        }

        // Compute global max offer date
        let globalMaxOfferDate = null;
        (sortedOffers || []).forEach(({ offer }) => {
            const dateStr = offer.campaignOffer?.startDate;
            if (dateStr) {
                const date = new Date(dateStr).getTime();
                if (!globalMaxOfferDate || date > globalMaxOfferDate) globalMaxOfferDate = date;
            }
        });

        if (viewMode === 'table') {
            if (currentSortOrder !== 'original') {
                state.sortedOffers = App.SortUtils.sortOffers(sortedOffers, currentSortColumn, currentSortOrder);
            } else {
                state.sortedOffers = [...originalOffers];
            }
            App.TableBuilder.renderTable(tbody, state, globalMaxOfferDate);
            table.appendChild(thead);
        } else {
            // Always sort before grouping in accordion view
            if (currentSortOrder !== 'original') {
                state.sortedOffers = App.SortUtils.sortOffers(sortedOffers, currentSortColumn, currentSortOrder);
            } else {
                state.sortedOffers = [...originalOffers];
            }
            const groupedData = App.AccordionBuilder.createGroupedData(state.sortedOffers, state.currentGroupColumn);
            App.AccordionBuilder.renderAccordion(accordionContainer, groupedData, groupSortStates, state, [], [], globalMaxOfferDate);
        }
    },
    updateBreadcrumb(groupingStack, groupKeysStack) {
        const breadcrumbContainer = document.querySelector('.breadcrumb-container');
        if (!breadcrumbContainer) return;
        breadcrumbContainer.innerHTML = '';
        // Always start with 'All Offers'
        const allOffersLink = document.createElement('span');
        allOffersLink.className = 'breadcrumb-link';
        allOffersLink.textContent = 'All Offers';
        allOffersLink.addEventListener('click', () => {
            // Reset to top-level grouping
            App.TableRenderer.updateView(App.TableRenderer.lastState);
        });
        breadcrumbContainer.appendChild(allOffersLink);
        let path = '';
        groupingStack.forEach((col, idx) => {
            const arrow = document.createElement('span');
            arrow.className = 'breadcrumb-arrow';
            arrow.textContent = '→';
            breadcrumbContainer.appendChild(arrow);
            const crumb = document.createElement('span');
            crumb.className = 'breadcrumb-link';
            crumb.textContent = `${App.TableRenderer.lastState.headers.find(h => h.key === col)?.label || col}: ${groupKeysStack[idx]}`;
            crumb.addEventListener('click', () => {
                // Re-render up to this grouping level
                const newGroupingStack = groupingStack.slice(0, idx + 1);
                const newGroupKeysStack = groupKeysStack.slice(0, idx + 1);
                // Find offers for this path
                let offers = App.TableRenderer.lastState.sortedOffers;
                for (let i = 0; i <= idx; i++) {
                    const grouped = App.AccordionBuilder.createGroupedData(offers, groupingStack[i]);
                    offers = grouped[groupKeysStack[i]] || [];
                }
                const groupedData = App.AccordionBuilder.createGroupedData(offers, groupingStack[idx]);
                const accordionContainer = App.TableRenderer.lastState.accordionContainer;
                App.AccordionBuilder.renderAccordion(accordionContainer, groupedData, App.TableRenderer.lastState.groupSortStates, App.TableRenderer.lastState, newGroupingStack, newGroupKeysStack);
                App.TableRenderer.updateBreadcrumb(newGroupingStack, newGroupKeysStack);
            });
            breadcrumbContainer.appendChild(crumb);
        });
    }
};