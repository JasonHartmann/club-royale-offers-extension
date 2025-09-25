const TableRenderer = {
    switchProfile(key) {
        const cached = App.ProfileCache[key];
        console.log('[DEBUG] switchProfile ENTRY', { key, cached });
        if (!cached || App.CurrentProfile.key === key) {
            console.log('[DEBUG] switchProfile: No cached profile or already active', { key });
            return;
        }
        // Cache current profile's scrollContainer and state
        const currentScroll = document.querySelector('.table-scroll-container');
        console.log('[DEBUG] switchProfile: currentScroll', currentScroll);
        if (currentScroll && App.CurrentProfile.key) {
            App.ProfileCache[App.CurrentProfile.key] = {
                scrollContainer: currentScroll,
                state: App.TableRenderer.lastState
            };
            console.log('[DEBUG] switchProfile: Cached current profile', App.CurrentProfile.key);
        }
        // Inspect cached scrollContainer and state
        console.log('[DEBUG] switchProfile: cached.scrollContainer', cached.scrollContainer);
        console.log('[DEBUG] switchProfile: cached.state', cached.state);
        // Swap scrollContainer
        if (currentScroll && cached.scrollContainer) {
            currentScroll.replaceWith(cached.scrollContainer);
            console.log('[DEBUG] switchProfile: Replaced scrollContainer in DOM');
        } else {
            console.warn('[DEBUG] switchProfile: Missing scrollContainer for swap', { currentScroll, cachedScroll: cached.scrollContainer });
        }
        // Update lastState and current profile
        App.TableRenderer.lastState = cached.state;
        App.CurrentProfile = {
            key,
            scrollContainer: cached.scrollContainer,
            state: cached.state
        };
        console.log('[DEBUG] switchProfile: Updated lastState and CurrentProfile', App.TableRenderer.lastState, App.CurrentProfile);
        // Check if table exists in DOM after swap
        const tableInDom = cached.scrollContainer.querySelector('table');
        console.log('[DEBUG] switchProfile: table in DOM after swap', tableInDom);
        // If table is missing, force re-render
        if (!tableInDom) {
            console.warn('[DEBUG] switchProfile: Table missing after swap, forcing updateView');
            this.updateView(cached.state);
        }
        // Update breadcrumb if needed (since DOM is swapped, it should be preserved, but force update to ensure consistency)
        this.updateBreadcrumb(cached.state.groupingStack, cached.state.groupKeysStack);
        console.log('[DEBUG] switchProfile EXIT', { key });
    },
    loadProfile(key, payload) {
        console.log('[DEBUG] loadProfile ENTRY', { key, payload, typeofKey: typeof key, typeofPayload: typeof payload });
        console.log('[DEBUG] App.ProfileCache:', App.ProfileCache);
        console.log('[DEBUG] App.CurrentProfile:', App.CurrentProfile);
        if (App.ProfileCache[key]) {
            console.log('[DEBUG] Profile found in cache, switching profile', key);
            this.switchProfile(key);
            console.log('[DEBUG] loadProfile EXIT after switchProfile', { key });
        } else {
            console.log('[DEBUG] Building new profile for key', key);
            let preparedData;
            try {
                preparedData = this.prepareOfferData(payload.data);
                console.log('[DEBUG] prepareOfferData result:', preparedData);
            } catch (e) {
                console.error('[DEBUG] Error in prepareOfferData', e, payload);
                preparedData = {};
            }
            // Build new profile content
            const state = {
                headers: [
                    { key: 'offerCode', label: 'Code' },
                    { key: 'offerDate', label: 'Received' },
                    { key: 'expiration', label: 'Expiration' },
                    { key: 'offerName', label: 'Name' },
                    { key: 'shipClass', label: 'Class' },
                    { key: 'ship', label: 'Ship' },
                    { key: 'sailDate', label: 'Sail Date' },
                    { key: 'departurePort', label: 'Departure Port' },
                    { key: 'nights', label: 'Nights' },
                    { key: 'destination', label: 'Destination' },
                    { key: 'category', label: 'Category' },
                    { key: 'quality', label: 'Quality' },
                    { key: 'perks', label: 'Perks' }
                ],
                currentSortColumn: null,
                currentSortOrder: 'original',
                currentGroupColumn: null,
                viewMode: 'table',
                groupSortStates: {},
                openGroups: new Set(),
                groupingStack: [],
                groupKeysStack: [],
                hideTierSailings: false,
                selectedProfileKey: key,
                ...preparedData
            };
            // Load persisted preference for Hide TIER
            try {
                const savedPref = localStorage.getItem('goboHideTier');
                console.log('[DEBUG] localStorage goboHideTier:', savedPref);
                if (savedPref !== null) state.hideTierSailings = savedPref === 'true';
            } catch (e) {
                console.error('[DEBUG] Error accessing localStorage for goboHideTier', e);
            }
            state.fullOriginalOffers = [...(state.originalOffers || [])];
            state.accordionContainer = document.createElement('div');
            state.accordionContainer.className = 'w-full';
            state.backButton = document.createElement('button');
            state.backButton.style.display = 'none';
            state.backButton.onclick = () => {
                state.currentGroupColumn = null;
                state.viewMode = 'table';
                state.groupSortStates = {};
                state.openGroups = new Set();
                state.groupingStack = [];
                state.groupKeysStack = [];
                this.updateView(state);
            };
            state.thead = App.TableBuilder.createTableHeader(state);
            state.table = App.TableBuilder.createMainTable();
            state.tbody = document.createElement('tbody');
            console.log('[DEBUG] New profile state built', state);
            // Create breadcrumbContainer
            const breadcrumbContainer = document.createElement('div');
            breadcrumbContainer.className = 'breadcrumb-container';
            const allOffersLink = document.createElement('span');
            allOffersLink.className = 'breadcrumb-link';
            allOffersLink.textContent = 'All Offers';
            allOffersLink.addEventListener('click', state.backButton.onclick);
            const arrow = document.createElement('span');
            arrow.className = 'breadcrumb-arrow';
            const groupTitle = document.createElement('span');
            groupTitle.id = 'group-title';
            groupTitle.className = 'group-title';
            breadcrumbContainer.appendChild(allOffersLink);
            breadcrumbContainer.appendChild(arrow);
            breadcrumbContainer.appendChild(groupTitle);
            // Create scrollContainer
            const scrollContainer = document.createElement('div');
            scrollContainer.className = 'table-scroll-container';
            scrollContainer.appendChild(breadcrumbContainer);
            scrollContainer.appendChild(state.table);
            scrollContainer.appendChild(state.accordionContainer);
            // Cache current if exists
            const currentScroll = document.querySelector('.table-scroll-container');
            console.log('[DEBUG] currentScroll:', currentScroll);
            if (currentScroll && App.CurrentProfile && App.CurrentProfile.key) {
                App.ProfileCache[App.CurrentProfile.key] = {
                    scrollContainer: currentScroll,
                    state: App.TableRenderer.lastState
                };
                console.log('[DEBUG] Cached current profile', App.CurrentProfile.key);
            }
            // Replace scrollContainer
            if (currentScroll) {
                currentScroll.replaceWith(scrollContainer);
                console.log('[DEBUG] Replaced scrollContainer in DOM');
            }
            // Update lastState and current profile
            App.TableRenderer.lastState = state;
            App.CurrentProfile = {
                key,
                scrollContainer: scrollContainer,
                state: state
            };
            // Cache the newly built profile for future tab switches
            App.ProfileCache[key] = {
                scrollContainer: scrollContainer,
                state: state
            };
            console.log('[DEBUG] Cached new profile', key);
            console.log('[DEBUG] Updated App.TableRenderer.lastState and App.CurrentProfile', App.TableRenderer.lastState, App.CurrentProfile);
            // Render the view
            console.log('[DEBUG] Calling updateView with state');
            this.updateView(state);
            console.log('[DEBUG] loadProfile EXIT after updateView', { key });
        }

        // Update active tab visuals (since breadcrumb is rebuilt in updateView if needed)
        document.querySelectorAll('.profile-tab').forEach(tb => {
            const label = key.replace(/^gobo-/, '').replace(/_/g, '@');
            tb.classList.toggle('active', tb.textContent === label);
            tb.setAttribute('aria-pressed', tb.classList.contains('active') ? 'true' : 'false');
        });
    },
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
    displayTable(data, selectedProfileKey, overlappingElements) {
        try {
            // Check for last active profile and load it if different from current
            let currentKey = null;
            try {
                const sessionRaw = localStorage.getItem('persist:session');
                if (sessionRaw) {
                    const parsed = JSON.parse(sessionRaw);
                    const user = parsed.user ? JSON.parse(parsed.user) : null;
                    if (user) {
                        const rawKey = String(user.username || user.userName || user.email || user.name || user.accountId || '');
                        const usernameKey = rawKey.replace(/[^a-zA-Z0-9-_.]/g, '_');
                        currentKey = `gobo-${usernameKey}`;
                    }
                }
            } catch (e) { /* ignore */ }

            const lastActive = localStorage.getItem('goboActiveProfile');
            if (lastActive && lastActive !== currentKey) {
                try {
                    const raw = localStorage.getItem(lastActive);
                    if (raw) {
                        const payload = JSON.parse(raw);
                        if (payload && payload.data) {
                            selectedProfileKey = lastActive;
                            data = payload.data;
                        }
                    }
                } catch (e) { /* ignore */ }
            }

            const existingTable = document.getElementById('gobo-offers-table');
            if (existingTable) {
                // Modal is already open, treat as profile load/switch
                this.loadProfile(selectedProfileKey, { data });
                return;
            }

            const existingBackdrop = document.getElementById('gobo-backdrop');
            if (existingBackdrop) existingBackdrop.remove();
            document.body.style.overflow = 'hidden';
            // Always show current user's tab as active on initial open
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
                    { key: 'shipClass', label: 'Class' },
                    { key: 'ship', label: 'Ship' },
                    { key: 'sailDate', label: 'Sail Date' },
                    { key: 'departurePort', label: 'Departure Port' },
                    { key: 'nights', label: 'Nights' },
                    { key: 'destination', label: 'Destination' },
                    { key: 'category', label: 'Category' },
                    { key: 'quality', label: 'Quality' },
                    { key: 'perks', label: 'Perks' }
                ],
                currentSortColumn: null,
                currentSortOrder: 'original',
                currentGroupColumn: null,
                viewMode: 'table',
                groupSortStates: {},
                openGroups: new Set(),
                groupingStack: [],
                groupKeysStack: [],
                hideTierSailings: false,
                selectedProfileKey: selectedProfileKey || currentKey || null,
                ...this.prepareOfferData(data)
            };
            // Load persisted preference for Hide TIER
            try {
                const savedPref = localStorage.getItem('goboHideTier');
                if (savedPref !== null) state.hideTierSailings = savedPref === 'true';
            } catch (e) { /* ignore storage errors */ }
            state.fullOriginalOffers = [...state.originalOffers];

            state.accordionContainer.className = 'w-full';
            state.backButton.style.display = 'none';
            state.backButton.onclick = () => {
                state.currentGroupColumn = null;
                state.viewMode = 'table';
                state.groupSortStates = {};
                state.openGroups = new Set();
                state.groupingStack = [];
                state.groupKeysStack = [];
                this.updateView(state);
            };
            state.thead = App.TableBuilder.createTableHeader(state);
            // Only collect overlappingElements if not provided (first open)
            let overlapping = overlappingElements;
            if (!overlapping) {
                overlapping = [];
                document.querySelectorAll('[style*="position: fixed"], [style*="position: absolute"], [style*="z-index"], .fixed, .absolute, iframe:not(#gobo-offers-table):not(#gobo-backdrop), .sign-modal-overlay, .email-capture, .bg-purple-overlay, .heading1, [class*="relative"][class*="overflow-hidden"][class*="flex-col"]').forEach(el => {
                    const computedStyle = window.getComputedStyle(el);
                    if ((parseInt(computedStyle.zIndex) > 0 || computedStyle.position === 'fixed' || computedStyle.position === 'absolute' || el.classList.contains('sign-modal-overlay') || el.classList.contains('email-capture') || el.classList.contains('bg-purple-overlay') || el.classList.contains('heading1') || el.classList.contains('relative')) && el.id !== 'gobo-offers-table' && el.id !== 'gobo-backdrop') {
                        el.dataset.originalDisplay = el.style.display;
                        el.style.display = 'none';
                        overlapping.push(el);
                    }
                });
            }
            // Store globally for reuse on tab switch
            App.Modal._overlappingElements = overlapping;
            App.Modal.setupModal(state, overlapping);
            this.updateView(state);
        } catch (error) {
            console.log('Failed to display table:', error.message);
            App.ErrorHandler.showError('Failed to display table. Please try again.');
            document.body.style.overflow = '';
            const existingBackdrop = document.getElementById('gobo-backdrop');
            if (existingBackdrop) existingBackdrop.remove();
        }
    },
    updateView(state) {
        App.TableRenderer.lastState = state;
        // Ensure master copy exists
        if (!state.fullOriginalOffers) state.fullOriginalOffers = [...state.originalOffers];
        // Apply filter
        const base = state.fullOriginalOffers;
        const filtered = state.hideTierSailings ? base.filter(({ offer }) => !((offer.campaignOffer?.offerCode || '').toUpperCase().includes('TIER'))) : base;
        state.originalOffers = filtered;
        const { table, accordionContainer, currentSortOrder, currentSortColumn, viewMode, groupSortStates, thead, tbody, headers } = state;
        table.style.display = viewMode === 'table' ? 'table' : 'none';
        accordionContainer.style.display = viewMode === 'accordion' ? 'block' : 'none';

        const breadcrumbContainer = document.querySelector('.breadcrumb-container');
        if (breadcrumbContainer) breadcrumbContainer.style.display = '';

        // Prune grouping path if now invalid
        if (state.groupingStack.length && state.groupKeysStack.length) {
            let subset = filtered;
            let validDepth = 0;
            for (let d = 0; d < state.groupingStack.length && d < state.groupKeysStack.length; d++) {
                const col = state.groupingStack[d];
                const grouped = App.AccordionBuilder.createGroupedData(subset, col);
                const key = state.groupKeysStack[d];
                if (grouped && Object.prototype.hasOwnProperty.call(grouped, key)) {
                    subset = grouped[key];
                    validDepth++;
                } else break;
            }
            if (validDepth < state.groupKeysStack.length) state.groupKeysStack = state.groupKeysStack.slice(0, validDepth);
        }

        const groupTitle = document.getElementById('group-title');
        if (groupTitle) {
            const activeGroupCol = state.groupingStack.length ? state.groupingStack[state.groupingStack.length - 1] : state.currentGroupColumn;
            groupTitle.textContent = viewMode === 'accordion' && activeGroupCol ? (headers.find(h => h.key === activeGroupCol)?.label || '') : '';
        }

        let globalMaxOfferDate = null;
        (filtered || []).forEach(({ offer }) => {
            const ds = offer.campaignOffer?.startDate; if (ds) { const t = new Date(ds).getTime(); if (!globalMaxOfferDate || t > globalMaxOfferDate) globalMaxOfferDate = t; }
        });
        state.sortedOffers = currentSortOrder !== 'original' ? App.SortUtils.sortOffers(filtered, currentSortColumn, currentSortOrder) : [...filtered];
        if (viewMode === 'table') {
            App.TableBuilder.renderTable(tbody, state, globalMaxOfferDate);
            if (!table.contains(thead)) table.appendChild(thead);
        } else {
            if (!state.groupingStack.length) { state.viewMode = 'table'; this.updateView(state); return; }
            accordionContainer.innerHTML = '';
            let subset = state.sortedOffers;
            let currentContainer = accordionContainer;
            for (let depth = 0; depth < state.groupingStack.length; depth++) {
                const col = state.groupingStack[depth];
                const groupedData = App.AccordionBuilder.createGroupedData(subset, col);
                const partialGroupingStack = state.groupingStack.slice(0, depth + 1);
                const partialKeysStack = state.groupKeysStack.slice(0, depth);
                App.AccordionBuilder.renderAccordion(currentContainer, groupedData, groupSortStates, state, partialGroupingStack, partialKeysStack, globalMaxOfferDate);
                if (depth < state.groupKeysStack.length) {
                    const key = state.groupKeysStack[depth];
                    const escKey = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(key) : key.replace(/([ #.;?+*~':"!^$\\\[\]()=>|\/])/g, '\\$1');
                    const tableEl = currentContainer.querySelector(`.accordion-table[data-group-key="${escKey}"]`);
                    if (tableEl) {
                        const contentEl = tableEl.closest('.accordion-content');
                        if (contentEl) { contentEl.classList.add('open'); currentContainer = contentEl; } else break;
                    } else break;
                } else break;
            }
        }
        this.updateBreadcrumb(state.groupingStack, state.groupKeysStack);
    },
    updateBreadcrumb(groupingStack, groupKeysStack) {
        const state = App.TableRenderer.lastState;
        if (!state) return;
        const container = document.querySelector('.breadcrumb-container');
        if (!container) return;
        container.innerHTML = '';
        // Create two rows: one for tabs (top), one for breadcrumbs (below)
        const tabsRow = document.createElement('div');
        tabsRow.className = 'breadcrumb-tabs-row';
        tabsRow.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:8px;';
        const crumbsRow = document.createElement('div');
        crumbsRow.className = 'breadcrumb-crumb-row';
        crumbsRow.style.cssText = 'display:flex; align-items:center; gap:8px; flex-wrap:wrap;';
        container.appendChild(tabsRow);
        container.appendChild(crumbsRow);

        // Render profile tabs (saved profiles from localStorage prefixed with 'gobo-')
        try {
            const profiles = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k) continue;
                if (k.startsWith('gobo-')) {
                    let payload = null;
                    try {
                        payload = JSON.parse(localStorage.getItem(k));
                        if (payload && payload.data && payload.savedAt) {
                            profiles.push({ key: k, label: k.replace(/^gobo-/, '').replace(/_/g, '@'), savedAt: payload.savedAt });
                        }
                    } catch (e) { /* ignore invalid */ }
                }
            }

            if (profiles.length) {
                // Determine current user's storage key (same logic as ApiClient)
                let currentKey = null;
                try {
                    const sessionRaw = localStorage.getItem('persist:session');
                    if (sessionRaw) {
                        const parsed = JSON.parse(sessionRaw);
                        const user = parsed.user ? JSON.parse(parsed.user) : null;
                        if (user) {
                            const rawKey = String(user.username || user.userName || user.email || user.name || user.accountId || '');
                            const usernameKey = rawKey.replace(/[^a-zA-Z0-9-_.]/g, '_');
                            currentKey = `gobo-${usernameKey}`;
                        }
                    }
                } catch (e) { /* ignore */ }

                // Sort by savedAt desc (most recent first)
                profiles.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
                // If currentKey exists, move it to front
                if (currentKey) {
                    const idx = profiles.findIndex(p => p.key === currentKey);
                    if (idx > 0) profiles.unshift(profiles.splice(idx, 1)[0]);
                }

                const tabs = document.createElement('div');
                tabs.className = 'profile-tabs';

                // prefer state.selectedProfileKey (set when displayTable called or from persisted last choice)
                const activeKey = state.selectedProfileKey || currentKey;

                profiles.forEach(p => {
                    const btn = document.createElement('button');
                    btn.className = 'profile-tab';
                    btn.textContent = p.label || p.key;
                    if (p.key === activeKey) {
                        btn.classList.add('active');
                        btn.setAttribute('aria-pressed', 'true');
                    } else {
                        btn.setAttribute('aria-pressed', 'false');
                    }
                    if (p.savedAt) {
                        try { btn.title = new Date(p.savedAt).toLocaleString(); } catch(e) { /* ignore */ }
                    }

                    btn.addEventListener('click', () => {
                        // Persist last-selected profile so it remains active across modal reopenings
                        try { localStorage.setItem('goboActiveProfile', p.key); } catch (e) { /* ignore */ }
                        // Update visual active state
                        tabs.querySelectorAll('.profile-tab').forEach(tb => { tb.classList.remove('active'); tb.setAttribute('aria-pressed', 'false'); });
                        btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true');
                        // Load the saved profile and re-render modal, passing selected key so active tab remains
                        try {
                            const raw = localStorage.getItem(p.key);
                            if (!raw) { App.ErrorHandler.showError('Selected profile is no longer available.'); return; }
                            const payload = JSON.parse(raw);
                            if (payload && payload.data) {
                                console.log('[DEBUG] Calling LoadProfile');
                                // Use loadProfile instead of displayTable
                                App.TableRenderer.loadProfile(p.key, payload);
                            } else {
                                App.ErrorHandler.showError('Saved profile data is malformed.');
                            }
                        } catch (err) {
                            App.ErrorHandler.showError('Failed to load saved profile.');
                        }
                    });

                    tabs.appendChild(btn);
                });

                // Insert tabs into the tabs row (above the breadcrumb row)
                tabsRow.appendChild(tabs);
            }
        } catch (e) {
            // don't break breadcrumb rendering if storage access fails
            console.warn('Failed to render profile tabs', e);
        }

        // All Offers root crumb - placed in crumbsRow (below tabs)
        const all = document.createElement('span');
        all.className = 'breadcrumb-link';
        all.textContent = 'All Offers';
        all.addEventListener('click', () => {
            state.viewMode = 'table';
            state.groupingStack = [];
            state.groupKeysStack = [];
            state.groupSortStates = {};
            state.openGroups = new Set();
            state.currentSortColumn = null;
            state.currentSortOrder = 'original';
            state.currentGroupColumn = null;
            this.updateView(state);
        });
        crumbsRow.appendChild(all);

        container.classList.toggle('accordion-view', groupingStack.length > 0);

        // Build crumbs into crumbsRow: for each grouping column, add its label; if a value is selected at this depth add value after it
        for (let i = 0; i < groupingStack.length; i++) {
            // Arrow before column label
            const arrowToCol = document.createElement('span');
            arrowToCol.className = 'breadcrumb-arrow';
            crumbsRow.appendChild(arrowToCol);

            const colKey = groupingStack[i];
            const colLabel = state.headers.find(h => h.key === colKey)?.label || colKey;
            const colCrumb = document.createElement('span');
            colCrumb.className = 'breadcrumb-crumb breadcrumb-col';
            colCrumb.textContent = colLabel;
            crumbsRow.appendChild(colCrumb);

            // If user has selected a specific group value at this depth, add it
            if (i < groupKeysStack.length) {
                const arrowToVal = document.createElement('span');
                arrowToVal.className = 'breadcrumb-arrow';
                crumbsRow.appendChild(arrowToVal);

                const valCrumb = document.createElement('span');
                valCrumb.className = 'breadcrumb-crumb breadcrumb-val';
                valCrumb.textContent = groupKeysStack[i];
                crumbsRow.appendChild(valCrumb);
            }
        }

        // Persisted Hide TIER toggle
        const tierToggle = document.createElement('label');
        tierToggle.className = 'tier-filter-toggle';
        tierToggle.style.marginLeft = 'auto';
        tierToggle.title = 'Hide/Show TIER sailings';
        const tierCheckbox = document.createElement('input');
        tierCheckbox.type = 'checkbox';
        tierCheckbox.checked = !!state.hideTierSailings;
        const tierText = document.createElement('span');
        tierText.textContent = 'Hide TIER';
        tierCheckbox.addEventListener('change', () => {
            state.hideTierSailings = tierCheckbox.checked;
            try { localStorage.setItem('goboHideTier', String(state.hideTierSailings)); } catch (e) { /* ignore */ }
            App.TableRenderer.updateView(state);
        });
        tierToggle.appendChild(tierCheckbox);
        tierToggle.appendChild(tierText);
        // Place the tier toggle at the end of the crumbs row
        crumbsRow.appendChild(tierToggle);
    }
};