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

            const backdrop = App.Modal.createBackdrop();
            const container = App.Modal.createModalContainer();
            const table = App.TableBuilder.createMainTable();
            const tbody = document.createElement('tbody');
            const accordionContainer = document.createElement('div');
            accordionContainer.className = 'w-full';

            const backButton = document.createElement('button');
            backButton.className = 'bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-700 mb-4';
            backButton.textContent = 'Back to Table';
            backButton.style.display = 'none';
            backButton.addEventListener('click', () => {
                console.log('Switching back to table view');
                this.updateView({
                    sortedOffers,
                    originalOffers,
                    currentSortColumn,
                    currentSortOrder,
                    currentGroupColumn: null,
                    viewMode: 'table',
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

            const { originalOffers, sortedOffers } = this.prepareOfferData(data);
            let currentSortColumn = null;
            let currentSortOrder = 'original';
            let currentGroupColumn = null;
            let viewMode = 'table';
            let groupSortStates = {};

            const headers = [
                { key: 'offerCode', label: 'Offer Code' },
                { key: 'offerDate', label: 'Offer Date' },
                { key: 'expiration', label: 'Expiration' },
                { key: 'offerName', label: 'Offer Name' },
                { key: 'ship', label: 'Ship' },
                { key: 'sailDate', label: 'Sail Date' },
                { key: 'departurePort', label: 'Departure Port' },
                { key: 'itinerary', label: 'Itinerary' },
                { key: 'gobo', label: 'GOBO' }
            ];

            const thead = App.TableBuilder.createTableHeader(headers, currentSortColumn, currentSortOrder, viewMode, sortedOffers, originalOffers, currentGroupColumn, groupSortStates, table, tbody, accordionContainer, backButton, container, backdrop);

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

            App.Modal.setupModal(container, backdrop, table, tbody, accordionContainer, backButton, overlappingElements);
            this.updateView({ sortedOffers, originalOffers, currentSortColumn, currentSortOrder, currentGroupColumn, viewMode, groupSortStates, table, thead, tbody, accordionContainer, backButton, headers, container, backdrop });

            console.log('Table displayed');
        } catch (error) {
            console.error('Failed to display table:', error.message);
            App.ErrorHandler.showError('Failed to display table. Please try again.');
            document.body.style.overflow = '';
            const existingBackdrop = document.getElementById('gobo-backdrop');
            if (existingBackdrop) existingBackdrop.remove();
        }
    },
    updateView({ sortedOffers, originalOffers, currentSortColumn, currentSortOrder, currentGroupColumn, viewMode, groupSortStates, table, thead, tbody, accordionContainer, backButton, headers, container, backdrop }) {
        table.style.display = viewMode === 'table' ? 'table' : 'none';
        accordionContainer.style.display = viewMode === 'accordion' ? 'block' : 'none';
        backButton.style.display = viewMode === 'accordion' ? 'block' : 'none';

        if (viewMode === 'table') {
            if (currentSortOrder !== 'original') {
                sortedOffers = App.SortUtils.sortOffers(sortedOffers, currentSortColumn, currentSortOrder);
            } else {
                sortedOffers = [...originalOffers];
            }
            App.TableBuilder.renderTable(tbody, sortedOffers);
            table.appendChild(thead); // Ensure headers are reattached
        } else {
            const groupedData = App.AccordionBuilder.createGroupedData(sortedOffers, currentGroupColumn);
            App.AccordionBuilder.renderAccordion(accordionContainer, groupedData, groupSortStates, headers, sortedOffers, originalOffers, currentSortColumn, currentSortOrder, currentGroupColumn, viewMode, table, thead, tbody, accordionContainer, backButton, container, backdrop);
        }
    }
};