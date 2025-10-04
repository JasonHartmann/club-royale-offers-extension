const TableRenderer = {
    // Track if the default tab has been selected for the current popup display
    hasSelectedDefaultTab: false,
    // One-time flag to force selecting the first (current profile) tab only on initial modal open
    _initialOpenPending: false,
    // Token used to validate most recent profile switch/render cycle
    currentSwitchToken: null,
    // Map of DOM tab keys to underlying storage keys (handles duplicate storage key collisions)
    TabKeyMap: {},
    // Centralized tab highlight helper (called only when token matches)
    _applyActiveTabHighlight(activeKey) {
        const tabs = document.querySelectorAll('.profile-tab');
        tabs.forEach(tb => {
            const storageKey = tb.getAttribute('data-storage-key') || tb.getAttribute('data-key');
            const isActive = storageKey === activeKey; // compare against underlying storage key
            tb.classList.toggle('active', isActive);
            tb.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            const label = tb.querySelector('div');
            if (label) label.style.fontWeight = isActive ? 'bold' : 'normal';
        });
    },
    switchProfile(key, payload) {
        // Begin guarded profile switch
        const switchToken = Date.now() + '_' + Math.random().toString(36).slice(2);
        this.currentSwitchToken = switchToken;
        console.log('[tableRenderer] switchProfile ENTRY', { key, switchToken });
        const cached = App.ProfileCache[key];
        const activeDomTab = document.querySelector('.profile-tab.active');
        const activeDomKey = activeDomTab && (activeDomTab.getAttribute('data-storage-key') || activeDomTab.getAttribute('data-key'));
        if (!cached) {
            console.log('[tableRenderer] switchProfile: No cached profile', { key });
            return;
        }
        const alreadyLogical = App.CurrentProfile && App.CurrentProfile.key === key;
        const highlightMatches = activeDomKey === key;
        // Only no-op if BOTH logical and highlight already correct
        if (alreadyLogical && highlightMatches) {
            console.debug('[tableRenderer] switchProfile: already active & highlight matches, no-op', { key });
            return;
        }
        // If logical current matches but highlight doesn't, just fix highlight & state without rebuild
        if (alreadyLogical && !highlightMatches) {
            console.debug('[tableRenderer] switchProfile: correcting highlight without rebuild', { key, activeDomKey });
            this._applyActiveTabHighlight(key);
            try {
                if (App.TableRenderer.lastState) {
                    App.TableRenderer.lastState.selectedProfileKey = key;
                }
            } catch(e){/* ignore */}
            this.updateBreadcrumb(App.TableRenderer.lastState?.groupingStack||[], App.TableRenderer.lastState?.groupKeysStack||[]);
            return;
        }
        const currentScroll = document.querySelector('.table-scroll-container');
        console.log('[tableRenderer] switchProfile: currentScroll', currentScroll);
        if (currentScroll && App.CurrentProfile && App.CurrentProfile.key) {
            if (!currentScroll._cachedAt) currentScroll._cachedAt = Date.now();
            App.ProfileCache[App.CurrentProfile.key] = {
                scrollContainer: currentScroll,
                state: App.TableRenderer.lastState
            };
            console.log('[tableRenderer] switchProfile: Cached current profile', App.CurrentProfile.key);
        }
        const dataSavedAt = (payload && payload.savedAt) || cached.state?.savedAt || 0;
        const domCachedAt = cached.scrollContainer?._cachedAt || 0;
        console.debug('[tableRenderer] switchProfile timestamp check', { key, dataSavedAt, domCachedAt, isStale: !cached.scrollContainer || dataSavedAt > domCachedAt });
        // Always rebuild to ensure fresh rows
        console.log('[tableRenderer] switchProfile: rebuilding (forced)');
        cached.state._switchToken = switchToken;
        this.rebuildProfileView(key, cached.state, payload, switchToken);
        console.log('[tableRenderer] switchProfile EXIT (forced rebuild)');
    },
    loadProfile(key, payload) {
        const switchToken = Date.now() + '_' + Math.random().toString(36).slice(2);
        this.currentSwitchToken = switchToken;
        // Ensure profileId map exists
        if (!App.ProfileIdMap) App.ProfileIdMap = {};
        // Ensure stable ID for this key immediately (even before breadcrumb build)
        try {
            if (typeof ProfileIdManager !== 'undefined' && ProfileIdManager) {
                ProfileIdManager.ensureIds([key]);
                App.ProfileIdMap = { ...ProfileIdManager.map };
            }
        } catch(e) { /* ignore */ }
        console.log('[DEBUG] loadProfile ENTRY', { key, payload, typeofKey: typeof key, typeofPayload: typeof payload, switchToken });
        console.log('[DEBUG] App.ProfileCache:', App.ProfileCache);
        console.log('[DEBUG] App.CurrentProfile:', App.CurrentProfile);
        if (App.ProfileCache[key]) {
            const hasDomContainer = !!document.querySelector('.table-scroll-container');
            if (hasDomContainer) {
                console.log('[DEBUG] Profile found in cache with existing DOM, switching profile', key);
                // Ensure cached state carries token
                if (App.ProfileCache[key].state) App.ProfileCache[key].state._switchToken = switchToken;
                this.switchProfile(key, payload);
                console.log('[DEBUG] loadProfile EXIT after switchProfile', { key });
            } else {
                console.log('[DEBUG] Profile found in cache but no active DOM; rebuilding from cached state', key);
                const cachedState = App.ProfileCache[key].state || {};
                // Ensure token set
                cachedState._switchToken = switchToken;
                try {
                    this.rebuildProfileView(key, cachedState, payload, switchToken);
                    console.log('[DEBUG] loadProfile EXIT after rebuildProfileView (from cache)', { key });
                } catch(rebErr) {
                    console.error('[DEBUG] rebuild from cache failed, falling back to full build', rebErr);
                    // Fallback to fresh build path below
                }
            }
            return;
        }
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
                { key: 'favorite', label: '★' },
                { key: 'offerCode', label: 'Code' },
                { key: 'offerDate', label: 'Rcvd' },
                { key: 'expiration', label: 'Expires' },
                { key: 'offerName', label: 'Name' },
                { key: 'shipClass', label: 'Class' },
                { key: 'ship', label: 'Ship' },
                { key: 'sailDate', label: 'Sail Date' },
                { key: 'departurePort', label: 'Departs' },
                { key: 'nights', label: 'Nights' },
                { key: 'destination', label: 'Destination' },
                { key: 'category', label: 'Category' },
                { key: 'guests', label: 'Guests' },
                { key: 'perks', label: 'Perks' }
            ],
            profileId: App.ProfileIdMap[key] || null,
            currentSortColumn: 'offerDate', // Default sort by Rcvd
            currentSortOrder: 'desc', // Descending (newest first)
            currentGroupColumn: null,
            viewMode: 'table',
            groupSortStates: {},
            openGroups: new Set(),
            groupingStack: [],
            groupKeysStack: [],
            hideTierSailings: false,
            selectedProfileKey: key,
            _switchToken: switchToken,
            ...preparedData
        };
        // Load persisted preference for Hide TIER
        try {
            const savedPref = (typeof goboStorageGet === 'function' ? goboStorageGet('goboHideTier') : localStorage.getItem('goboHideTier'));
            console.log('[DEBUG] gobo storage goboHideTier:', savedPref);
            if (savedPref !== null) state.hideTierSailings = savedPref === 'true';
        } catch (e) {
            console.error('[DEBUG] Error accessing storage for goboHideTier', e);
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
        scrollContainer._cachedAt = Date.now();
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
        // Final highlight guard
        if (this.currentSwitchToken === switchToken) this._applyActiveTabHighlight(key);
        console.log('[DEBUG] loadProfile EXIT after updateView', { key });
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
            // Always determine current user's key
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
                        selectedProfileKey = currentKey;
                    }
                }
            } catch (e) { /* ignore */ }

            // Pre-hydrate stable IDs for currently stored profile keys (so initial badges don't flicker)
            try {
                if (typeof ProfileIdManager !== 'undefined' && ProfileIdManager) {
                    const keys = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k && /^gobo-/.test(k)) keys.push(k);
                    }
                    if (selectedProfileKey && /^gobo-/.test(selectedProfileKey) && !keys.includes(selectedProfileKey)) keys.push(selectedProfileKey);
                    if (currentKey && /^gobo-/.test(currentKey) && !keys.includes(currentKey)) keys.push(currentKey);
                    if (keys.length) {
                        ProfileIdManager.ensureIds(keys);
                        App.ProfileIdMap = { ...ProfileIdManager.map };
                    }
                }
            } catch(e){ /* ignore */ }

            // Ensure we do NOT default to favorites tab on first modal open
            const existingTableCheck = document.getElementById('gobo-offers-table');
            if (!existingTableCheck) {
                // Fresh modal open: reset one-time flags so first tab (current profile) will be forced active
                this.hasSelectedDefaultTab = false;
                this._initialOpenPending = true;
                // Clear any stale current profile so highlight and logical state realign
                try { App.CurrentProfile = null; } catch(e) { /* ignore */ }
                // Modal is opening fresh; if selected is favorites, try to pick a real profile
                if (selectedProfileKey === 'goob-favorites') {
                    try {
                        const allKeys = Object.keys(localStorage || {}).filter(k => /^gobo-/.test(k));
                        if (currentKey && allKeys.includes(currentKey)) {
                            selectedProfileKey = currentKey;
                        } else if (allKeys.length) {
                            selectedProfileKey = allKeys[0];
                        } else {
                            // fall back to not favorites if combined will be generated later; leave as currentKey if set else unchanged
                            if (currentKey) selectedProfileKey = currentKey;
                        }
                    } catch(e) { /* ignore */ }
                }
                // If global App.CurrentProfile was left as favorites from a prior session, clear it so we don't highlight it
                try { if (App.CurrentProfile && App.CurrentProfile.key === 'goob-favorites') App.CurrentProfile = null; } catch(e) { /* ignore */ }
            }

            const existingTable = document.getElementById('gobo-offers-table');
            if (existingTable) {
                // Modal is already open, treat as profile load/switch
                this.loadProfile(selectedProfileKey, { data });
                return;
            }

            const existingBackdrop = document.getElementById('gobo-backdrop');
            if (existingBackdrop) {
                existingBackdrop.remove();
                // Reset flag when popup is closed
                this.hasSelectedDefaultTab = false;
            }
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
                    { key: 'favorite', label: (selectedProfileKey === 'goob-favorites' ? 'ID' : '★') },
                    { key: 'offerCode', label: 'Code' },
                    { key: 'offerDate', label: 'Rcvd' },
                    { key: 'expiration', label: 'Expires' },
                    { key: 'offerName', label: 'Name' },
                    { key: 'shipClass', label: 'Class' },
                    { key: 'ship', label: 'Ship' },
                    { key: 'sailDate', label: 'Sail Date' },
                    { key: 'departurePort', label: 'Departs' },
                    { key: 'nights', label: 'Nights' },
                    { key: 'destination', label: 'Destination' },
                    { key: 'category', label: 'Category' },
                    { key: 'guests', label: 'Guests' },
                    { key: 'perks', label: 'Perks' }
                ],
                profileId: (App.ProfileIdMap && (App.ProfileIdMap[selectedProfileKey] || App.ProfileIdMap[currentKey])) || null,
                currentSortColumn: 'offerDate',
                currentSortOrder: 'desc',
                currentGroupColumn: null,
                viewMode: 'table',
                groupSortStates: {},
                openGroups: new Set(),
                groupingStack: [],
                groupKeysStack: [],
                hideTierSailings: false,
                selectedProfileKey: selectedProfileKey || currentKey || null,
                _switchToken: null,
                ...this.prepareOfferData(data)
            };
            // Load persisted preference for Hide TIER
            try {
                const savedPref = (typeof goboStorageGet === 'function' ? goboStorageGet('goboHideTier') : localStorage.getItem('goboHideTier'));
                if (savedPref !== null) state.hideTierSailings = savedPref === 'true';
            } catch (e) { /* ignore */ }
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
            // Build & display the initial profile fully so logical current profile matches highlighted tab
            this.loadProfile(state.selectedProfileKey, { data });
        } catch (error) {
            console.log('Failed to display table:', error.message);
            App.ErrorHandler.showError('Failed to display table. Please try again.');
            document.body.style.overflow = '';
            const existingBackdrop = document.getElementById('gobo-backdrop');
            if (existingBackdrop) existingBackdrop.remove();
        }
    },
    rebuildProfileView(key, existingState, payload, switchToken) {
        console.debug('[tableRenderer] rebuildProfileView ENTRY', { key, hasExistingState: !!existingState, payloadProvided: !!payload, switchToken });
        const baseState = existingState || {};
        // Ensure headers include favorite column
        try {
            if (!baseState.headers) baseState.headers = [];
            const hasFav = baseState.headers.some(h => h.key === 'favorite');
            if (!hasFav) {
                baseState.headers = [ { key: 'favorite', label: '★' }, ...baseState.headers ];
            }
        } catch(e) { /* ignore */ }
        const state = { ...baseState, selectedProfileKey: key, _switchToken: switchToken || baseState._switchToken, profileId: App.ProfileIdMap ? App.ProfileIdMap[key] : null };
        // Ensure core structures
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
        state.table = App.TableBuilder.createMainTable();
        state.thead = App.TableBuilder.createTableHeader(state);
        state.tbody = document.createElement('tbody');
        // Breadcrumb
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
        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'table-scroll-container';
        scrollContainer._cachedAt = Date.now();
        scrollContainer.appendChild(breadcrumbContainer);
        scrollContainer.appendChild(state.table);
        scrollContainer.appendChild(state.accordionContainer);
        // Replace current
        const currentScroll = document.querySelector('.table-scroll-container');
        if (currentScroll) currentScroll.replaceWith(scrollContainer);
        App.TableRenderer.lastState = state;
        App.CurrentProfile = { key, scrollContainer, state };
        App.ProfileCache[key] = { scrollContainer, state };
        console.debug('[tableRenderer] rebuildProfileView: Cached and set current profile', { key, switchToken: state._switchToken });
        this.updateView(state);
        if (this.currentSwitchToken === state._switchToken) this._applyActiveTabHighlight(key);
    },
    updateView(state) {
        console.log('[tableRenderer] updateView ENTRY', state);
        const switchToken = state._switchToken;
        // Refined stale token handling: allow intra-profile interactions (like grouping to accordion)
        if (switchToken && this.currentSwitchToken && this.currentSwitchToken !== switchToken) {
            const currentProfileKey = App.CurrentProfile ? App.CurrentProfile.key : null;
            const sameProfile = state.selectedProfileKey === currentProfileKey;
            const isAccordionTransition = state.viewMode === 'accordion' && state.groupingStack && state.groupingStack.length > 0;
            if (sameProfile && isAccordionTransition) {
                console.debug('[tableRenderer] updateView: adopting token for intra-profile accordion interaction', { oldToken: this.currentSwitchToken, adoptedToken: switchToken, profile: currentProfileKey });
                this.currentSwitchToken = switchToken; // adopt this interaction's token
            } else {
                console.debug('[tableRenderer] updateView: stale token detected, aborting DOM update', { switchToken, currentSwitchToken: this.currentSwitchToken, sameProfile, isAccordionTransition });
                return; // Prevent outdated DOM from overwriting newer profile view
            }
        }
        // Always preserve selectedProfileKey, even in recursive calls
        state = preserveSelectedProfileKey(state, App.TableRenderer.lastState);
        App.TableRenderer.lastState = state;
        // Ensure master copy exists
        if (!state.fullOriginalOffers) state.fullOriginalOffers = [...state.originalOffers];
        // Apply filter
        const base = state.fullOriginalOffers;
        const filtered = Filtering.filterOffers(state, base);
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
            if (validDepth < state.groupKeysStack.length) {
                state.groupKeysStack = state.groupKeysStack.slice(0, validDepth);
                // Accordion reset: ensure selectedProfileKey is still valid
                const profileTabs = Array.from(document.querySelectorAll('.profile-tab'));
                const validKeys = profileTabs.map(tab => tab.getAttribute('data-storage-key') || tab.getAttribute('data-key'));
                // Only change selectedProfileKey if it is not valid
                if (!validKeys.includes(state.selectedProfileKey)) {
                    console.log('[DEBUG] selectedProfileKey invalid after accordion reset:', state.selectedProfileKey, 'validKeys:', validKeys);
                    state.selectedProfileKey = validKeys.includes(App.TableRenderer.lastState.selectedProfileKey) ? App.TableRenderer.lastState.selectedProfileKey : (validKeys[0] || null);
                    console.log('[DEBUG] selectedProfileKey set to:', state.selectedProfileKey);
                } else {
                    console.log('[DEBUG] selectedProfileKey preserved after accordion reset:', state.selectedProfileKey);
                }
            }
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
            if (!table.contains(tbody)) table.appendChild(tbody);
            table.style.display = 'table';
        } else {
            if (!state.groupingStack.length) {
                state.viewMode = 'table';
                // Always preserve selectedProfileKey in recursive call
                this.updateView(preserveSelectedProfileKey(state, App.TableRenderer.lastState));
                return;
            }
            accordionContainer.innerHTML = '';
            // Recursive function to render all open accordion levels
            function renderNestedAccordion(container, subset, groupingStack, groupKeysStack, depth) {
                if (depth >= groupingStack.length) return;
                const col = groupingStack[depth];
                const groupedData = App.AccordionBuilder.createGroupedData(subset, col);
                const partialGroupingStack = groupingStack.slice(0, depth + 1);
                const partialKeysStack = groupKeysStack.slice(0, depth);
                App.AccordionBuilder.renderAccordion(container, groupedData, groupSortStates, state, partialGroupingStack, partialKeysStack, globalMaxOfferDate);
                if (depth < groupKeysStack.length) {
                    const key = groupKeysStack[depth];
                    if (groupedData && Object.prototype.hasOwnProperty.call(groupedData, key)) {
                        // Find the correct nested container
                        const escKey = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(key) : key.replace(/([ #.;?+*~':"!^$\\\[\]()=>|\/])/g, '\\$1');
                        const tableEl = container.querySelector(`.accordion-table[data-group-key="${escKey}"]`);
                        if (tableEl) {
                            const contentEl = tableEl.closest('.accordion-content');
                            if (contentEl) {
                                contentEl.classList.add('open');
                                try {
                                    const openedPath = groupKeysStack.slice(0, depth + 1).join('>');
                                    if (openedPath) state.openGroups.add(openedPath);
                                } catch(e){/* ignore */}
                                // Recursively render the next level
                                renderNestedAccordion(contentEl, groupedData[key], groupingStack, groupKeysStack, depth + 1);
                            }
                        }
                    }
                }
            }
            renderNestedAccordion(accordionContainer, state.sortedOffers, state.groupingStack, state.groupKeysStack, 0);
        }
        this.updateBreadcrumb(state.groupingStack, state.groupKeysStack);
        if (switchToken && this.currentSwitchToken !== switchToken) {
            console.debug('[tableRenderer] updateView: token mismatch post-render, aborting highlight', { switchToken, currentSwitchToken: this.currentSwitchToken });
        } else if (switchToken) {
            this._applyActiveTabHighlight(state.selectedProfileKey);
            // Post-render sanity diagnostics
            try {
                const activeTabEl = document.querySelector('.profile-tab.active');
                const activeTabKey = activeTabEl ? activeTabEl.getAttribute('data-key') : null;
                const currentProfileKey = App.CurrentProfile ? App.CurrentProfile.key : null;
                if (activeTabKey && activeTabKey !== state.selectedProfileKey) {
                    console.warn('[tableRenderer][DIAG] Active tab key differs from state.selectedProfileKey', { activeTabKey, selectedProfileKey: state.selectedProfileKey });
                }
                if (currentProfileKey && currentProfileKey !== state.selectedProfileKey) {
                    console.warn('[tableRenderer][DIAG] CurrentProfile.key differs from state.selectedProfileKey', { currentProfileKey, selectedProfileKey: state.selectedProfileKey });
                }
                if (activeTabKey && currentProfileKey && activeTabKey !== currentProfileKey) {
                    console.warn('[tableRenderer][DIAG] Active tab key differs from CurrentProfile.key', { activeTabKey, currentProfileKey });
                }
            } catch (diagErr) { /* ignore diagnostic errors */ }
        }
        console.log('[tableRenderer] updateView EXIT');
    },
    updateBreadcrumb(groupingStack, groupKeysStack) {
        console.log('[tableRenderer] updateBreadcrumb ENTRY', { groupingStack, groupKeysStack });
        // If extension storage hasn't finished hydration yet, wait and retry once
        if (typeof GoboStore !== 'undefined' && GoboStore && !GoboStore.ready) {
            console.debug('[tableRenderer] GoboStore not ready; deferring breadcrumb render until goboStorageReady');
            const retry = () => {
                try { App.TableRenderer.updateBreadcrumb(groupingStack, groupKeysStack); } catch(e) { /* ignore */ }
            };
            document.addEventListener('goboStorageReady', retry, { once: true });
            return;
        }
        const state = App.TableRenderer.lastState;
        if (!state) return;
        const container = document.querySelector('.breadcrumb-container');
        if (!container) return;
        container.innerHTML = '';
        // Create two rows: one for tabs (top), one for breadcrumbs (below)
        const tabsRow = document.createElement('div');
        tabsRow.className = 'breadcrumb-tabs-row';
        // Use block so inner inline-flex can exceed width and trigger horizontal scroll
        tabsRow.style.cssText = 'display:block; margin-bottom:8px; overflow:hidden;';
        const crumbsRow = document.createElement('div');
        crumbsRow.className = 'breadcrumb-crumb-row';
        crumbsRow.style.cssText = 'display:flex; align-items:center; gap:8px; flex-wrap:wrap;';
        container.appendChild(tabsRow);
        container.appendChild(crumbsRow);

        // Render profile tabs (saved profiles from localStorage prefixed with 'gobo-')
        try {
            const profiles = [];
            // Ensure favorites profile exists
            try { if (window.Favorites && Favorites.ensureProfileExists) Favorites.ensureProfileExists(); } catch(e) { /* ignore */ }
            // Prefer GoboStore enumeration if available
            let profileKeys = [];
            if (typeof GoboStore !== 'undefined' && GoboStore && typeof GoboStore.getAllProfileKeys === 'function') {
                profileKeys = GoboStore.getAllProfileKeys();
            } else {
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith('gobo-')) profileKeys.push(k);
                }
            }
            // Manually include favorites key if present
            try {
                const favRaw = (typeof goboStorageGet === 'function' ? goboStorageGet('goob-favorites') : localStorage.getItem('goob-favorites'));
                if (favRaw) {
                    profileKeys.push('goob-favorites');
                }
            } catch(e){ /* ignore */ }
            // De-dupe
            profileKeys = Array.from(new Set(profileKeys));
            profileKeys.forEach(k => {
                let payload = null;
                try {
                    payload = JSON.parse((typeof goboStorageGet === 'function' ? goboStorageGet(k) : localStorage.getItem(k)));
                    if (payload && payload.data && payload.savedAt) {
                        profiles.push({ key: k, label: k === 'goob-favorites' ? 'Favorites' : k.replace(/^gobo-/, '').replace(/_/g, '@'), savedAt: k === 'goob-favorites' ? null : payload.savedAt });
                    }
                } catch (e) { /* ignore invalid */ }
            });
            if (profiles.length) {
                // Build/refresh stable profileId map using ProfileIdManager (no renumbering of existing IDs)
                try {
                    if (typeof ProfileIdManager !== 'undefined' && ProfileIdManager) {
                        const goboKeys = profiles.filter(p => /^gobo-/.test(p.key)).map(p => p.key);
                        ProfileIdManager.ensureIds(goboKeys);
                        App.ProfileIdMap = { ...ProfileIdManager.map };
                    } else {
                        // Fallback: preserve existing map without resetting to prevent churn
                        if (!App.ProfileIdMap) App.ProfileIdMap = {};
                        const existingIds = new Set(Object.values(App.ProfileIdMap));
                        let maxId = 0; Object.values(App.ProfileIdMap).forEach(v => { if (v > maxId) maxId = v; });
                        profiles.filter(p => /^gobo-/.test(p.key)).forEach(p => {
                            if (App.ProfileIdMap[p.key] == null) {
                                let candidate = maxId + 1;
                                while (existingIds.has(candidate)) candidate++;
                                App.ProfileIdMap[p.key] = candidate;
                                existingIds.add(candidate);
                                maxId = candidate;
                            }
                        });
                    }
                } catch(e){ /* ignore map errors */ }

                // Restore: move current user's tab to the front
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
                // Extract favorites (if present) so we can place it at the far right later
                let favoritesEntry = null;
                const favIdx = profiles.findIndex(p => p.key === 'goob-favorites');
                if (favIdx !== -1) {
                    favoritesEntry = profiles.splice(favIdx, 1)[0];
                }
                // Move current user's tab to the front if present (after removing favorites so favorites stays at end later)
                if (currentKey) {
                    const idx = profiles.findIndex(p => p.key === currentKey);
                    if (idx > 0) profiles.unshift(profiles.splice(idx, 1)[0]);
                }
                const tabs = document.createElement('div');
                tabs.className = 'profile-tabs';
                // Create a dedicated horizontal scroll wrapper so inner tabs do not shrink
                const tabsScroll = document.createElement('div');
                tabsScroll.className = 'profile-tabs-scroll';
                tabsScroll.style.cssText = 'overflow-x:auto; width:100%; -webkit-overflow-scrolling:touch;';
                // Let stylesheet control scrolling; ensure no inline overrides that enable shrinking
                tabs.style.cssText = 'display:inline-flex; flex-direction:row; gap:8px; flex-wrap:nowrap;';
                // Always use App.CurrentProfile.key as activeKey after a profile switch
                let activeKey = (App.CurrentProfile && App.CurrentProfile.key) ? App.CurrentProfile.key : state.selectedProfileKey;
                // If this is the very first modal open for this session, force the first (current profile) tab active exactly once
                if (TableRenderer._initialOpenPending && !TableRenderer.hasSelectedDefaultTab && profiles.length) {
                    activeKey = profiles[0].key;
                    state.selectedProfileKey = activeKey;
                    TableRenderer.hasSelectedDefaultTab = true; // prevent re-selection during this open
                    TableRenderer._initialOpenPending = false; // consume the one-time flag
                }
                console.debug('[DEBUG] ActiveKey before validation: ', activeKey);
                console.debug('CurrentProfile.key: ', App.CurrentProfile ? App.CurrentProfile.key : null);
                console.debug('selectedProfileKey: ', state.selectedProfileKey);
                // Instrumentation: list profiles before augmentation
                try { console.debug('[TABS BUILD] base profiles order', profiles.map(p=>p.key)); } catch(e){}
                // After profiles array is built and before profileKeys is used
                let linkedAccounts = getLinkedAccounts();
                profiles.push({
                    key: 'goob-combined-linked',
                    label: 'Combined Offers',
                    isCombined: true,
                    linkedEmails: linkedAccounts.map(acc => acc.email)
                });
                // Append favorites as the rightmost tab (after Combined Offers) if it exists
                if (favoritesEntry) {
                    profiles.push(favoritesEntry);
                }
                try { console.debug('[TABS BUILD] augmented profiles order', profiles.map(p=>p.key)); } catch(e){}
                const profileKeys = profiles.map(p => p.key);
                // Update activeKey logic to handle Combined Offers tab
                if (!profileKeys.includes(activeKey)) {
                    if (state.selectedProfileKey === 'goob-combined-linked') {
                        activeKey = 'goob-combined-linked';
                    } else {
                        activeKey = profileKeys.includes(state.selectedProfileKey) ? state.selectedProfileKey : (profileKeys[0] || null);
                    }
                }
                state.selectedProfileKey = activeKey;
                console.debug('*** Updated selectedProfileKey: ', state.selectedProfileKey);
                // Instrumentation: detect duplicate keys
                try { const seen = new Set(); const dups = []; profiles.forEach(p=>{ if (seen.has(p.key)) dups.push(p.key); else seen.add(p.key); }); if (dups.length) console.warn('[TABS BUILD] Duplicate profile keys detected', dups); } catch(e){}
                // Reset TabKeyMap for fresh build to avoid incrementing counts perpetually
                TableRenderer.TabKeyMap = {};
                profiles.forEach((p, idx) => {
                    console.debug('[TABS BUILD] creating tab', { index: idx, key: p.key, label: p.label, isCombined: !!p.isCombined });
                    // Generate a unique DOM key if this storage key has appeared before
                    const storageKey = p.key;
                    if (!TableRenderer.TabKeyMap[storageKey]) {
                        TableRenderer.TabKeyMap[storageKey] = { count: 0 };
                    } else {
                        TableRenderer.TabKeyMap[storageKey].count++;
                    }
                    const domKey = TableRenderer.TabKeyMap[storageKey].count === 0 ? storageKey : `${storageKey}#${TableRenderer.TabKeyMap[storageKey].count}`;
                    const btn = document.createElement('button');
                    btn.className = 'profile-tab';
                    btn.setAttribute('data-key', domKey); // DOM-unique key
                    btn.setAttribute('data-storage-key', storageKey); // underlying storage key
                    // Assign stable profileId for gobo-* (exclude favorites & combined)
                    let profileIdForTab = null;
                    if (/^gobo-/.test(storageKey)) {
                        try { profileIdForTab = App.ProfileIdMap ? App.ProfileIdMap[storageKey] : null; } catch(e){ profileIdForTab = null; }
                    }
                    // Safely derive loyaltyId per profile (was missing, caused ReferenceError)
                    let loyaltyId = null;
                    try {
                        const storedRaw = (typeof goboStorageGet === 'function' ? goboStorageGet(storageKey) : localStorage.getItem(storageKey));
                        if (storedRaw) {
                            const storedPayload = JSON.parse(storedRaw);
                            loyaltyId = storedPayload?.data?.loyaltyId || null;
                        }
                    } catch(e){ /* ignore */ }
                    let labelDiv = document.createElement('div');
                    labelDiv.className = 'profile-tab-label';
                    labelDiv.textContent = p.label || storageKey;
                    if (storageKey === 'goob-favorites') {
                        labelDiv.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;line-height:1.05;">'
                            + '<span style="font-weight:600;">Favorites</span>'
                            + '<span aria-hidden="true" style="color:#f5c518;font-size:27px;margin-top:2px;">★</span>'
                            + '</div>';
                    } else if (storageKey === 'goob-combined-linked') {
                        // Inject dynamic badge showing concatenated profile IDs and sum-based class for Combined Offers tab
                        const wrapper = document.createElement('div');
                        wrapper.style.display = 'flex';
                        wrapper.style.alignItems = 'center';
                        let badgeText = 'C';
                        let badgeClass = 'profile-id-badge-combined';
                        try {
                            const linked = getLinkedAccounts();
                            if (linked.length >= 2) {
                                const ids = linked.slice(0,2).map(acc => App.ProfileIdMap?.[acc.key] || 0);
                                badgeText = `${ids[0]}+${ids[1]}`;
                                const sum = ids[0] + ids[1];
                                badgeClass += ` profile-id-badge-combined-${sum}`;
                            }
                        } catch(e){}
                        const badge = document.createElement('span');
                        badge.className = badgeClass;
                        badge.textContent = badgeText;
                        badge.style.marginRight = '6px';
                        wrapper.appendChild(badge);
                        wrapper.appendChild(labelDiv);
                        labelDiv = wrapper;
                    }
                    // Inject profileId badge if applicable
                    if (profileIdForTab) {
                        const badge = document.createElement('span');
                        badge.className = `profile-id-badge profile-id-badge-${profileIdForTab}`;
                        badge.textContent = profileIdForTab;
                        badge.style.marginRight = '6px';
                        // Prepend badge
                        const wrapper = document.createElement('div');
                        wrapper.style.display = 'flex';
                        wrapper.style.alignItems = 'center';
                        wrapper.appendChild(badge);
                        wrapper.appendChild(labelDiv);
                        labelDiv = wrapper; // replace reference so container appends wrapper
                    }
                    const loyaltyDiv = document.createElement('div');
                    loyaltyDiv.className = 'profile-tab-loyalty';
                    loyaltyDiv.textContent = loyaltyId ? `${loyaltyId}` : '';

                    let refreshedDiv = null;
                    if (p.savedAt) {
                        refreshedDiv = document.createElement('div');
                        refreshedDiv.className = 'profile-tab-refreshed';
                        refreshedDiv.textContent = `Last Refreshed: ${formatTimeAgo(p.savedAt)}`;
                        try { btn.title = new Date(p.savedAt).toLocaleString(); } catch(e) { /* ignore */ }
                    }
                    const labelContainer = document.createElement('div');
                    labelContainer.className = 'profile-tab-label-container';
                    labelContainer.appendChild(labelDiv);
                    labelContainer.appendChild(loyaltyDiv);
                    if (refreshedDiv) labelContainer.appendChild(refreshedDiv);
                    btn.innerHTML = '';
                    btn.appendChild(labelContainer);
                    // Add icon container for link/unlink and trash can (skip for combined tab)
                    if (!p.isCombined && storageKey !== 'goob-favorites') {
                        const iconContainer = document.createElement('div');
                        iconContainer.style.display = 'flex';
                        iconContainer.style.flexDirection = 'column';
                        iconContainer.style.alignItems = 'center';
                        iconContainer.style.gap = '2px';
                        iconContainer.style.marginLeft = '4px'; // 4px gap between label and icons
                        // Link/unlink icon
                        const linkIcon = document.createElement('span');
                        const isLinked = getLinkedAccounts().some(acc => acc.key === storageKey);
                        linkIcon.innerHTML = isLinked
                            ? `<img src="${getAssetUrl('images/link.png')}" width="16" height="16" alt="Linked" style="vertical-align:middle;" />`
                            : `<img src="${getAssetUrl('images/link_off.png')}" width="16" height="16" alt="Unlinked" style="vertical-align:middle;" />`;
                        linkIcon.style.cursor = 'pointer';
                        linkIcon.title = isLinked ? 'Unlink account' : 'Link account';
                        linkIcon.style.marginBottom = '2px';
                        linkIcon.addEventListener('click', (e) => {
                            e.stopPropagation();
                            let updated = getLinkedAccounts();
                            if (isLinked) {
                                updated = updated.filter(acc => acc.key !== storageKey);
                                // Remove goob-combined if less than 2 linked accounts
                                if (updated.length < 2) {
                                    try {
                                        if (typeof goboStorageRemove === 'function') goboStorageRemove('goob-combined'); else localStorage.removeItem('goob-combined');
                                        if (App.ProfileCache && App.ProfileCache['goob-combined-linked']) {
                                            delete App.ProfileCache['goob-combined-linked'];
                                            console.log('[DEBUG] App.ProfileCache["goob-combined-linked"] deleted after goob-combined removal');
                                        }
                                    } catch (err) { /* ignore */ }
                                    console.debug('[LinkedAccounts] goob-combined removed from storage due to unlink');
                                }
                            } else {
                                if (updated.length >= 2) return; // Prevent linking a third account
                                let email = p.label;
                                try {
                                    const payload = JSON.parse((typeof goboStorageGet === 'function' ? goboStorageGet(storageKey) : localStorage.getItem(storageKey)));
                                    if (payload && payload.data && payload.data.email) email = payload.data.email;
                                } catch (e) { /* ignore */ }
                                updated.push({ key: storageKey, email });
                                // If this is the second linked account, merge both profiles and save to 'goob-combined'
                                if (updated.length === 2) {
                                    try {
                                        const raw1 = (typeof goboStorageGet === 'function' ? goboStorageGet(updated[0].key) : localStorage.getItem(updated[0].key));
                                        const raw2 = (typeof goboStorageGet === 'function' ? goboStorageGet(updated[1].key) : localStorage.getItem(updated[1].key));
                                        const profile1 = raw1 ? JSON.parse(raw1) : null;
                                        const profile2 = raw2 ? JSON.parse(raw2) : null;
                                        const merged = mergeProfiles(profile1, profile2);
                                        if (typeof goboStorageSet === 'function') goboStorageSet('goob-combined', JSON.stringify(merged)); else localStorage.setItem('goob-combined', JSON.stringify(merged));
                                    } catch (e) { /* ignore */ }
                                }
                            }
                            // Persist linked accounts, then ensure combined offers are recalculated and cache cleared
                            setLinkedAccounts(updated);
                            try {
                                // Recompute combined payload (no-op if not enough linked accounts)
                                if (typeof updateCombinedOffersCache === 'function') updateCombinedOffersCache();
                                // Clear any cached combined profile so UI will reload it from storage
                                if (App.ProfileCache && App.ProfileCache['goob-combined-linked']) {
                                    delete App.ProfileCache['goob-combined-linked'];
                                    console.log('[DEBUG] App.ProfileCache["goob-combined-linked"] deleted after linked accounts change');
                                }
                            } catch (err) { /* ignore */ }
                            // Rebuild the tabs/breadcrumb so the Combined Offers tab reflects the new linked accounts
                            App.TableRenderer.updateBreadcrumb(App.TableRenderer.lastState.groupingStack, App.TableRenderer.lastState.groupKeysStack);
                            // Activate this tab after linking/unlinking; defer slightly so UI updates first
                            setTimeout(() => btn.click(), 0);
                        });
                        iconContainer.appendChild(linkIcon);
                        // Trash can icon
                        const trashIcon = document.createElement('span');
                        trashIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 2V1.5C6 1.22 6.22 1 6.5 1H9.5C9.78 1 10 1.22 10 1.5V2M2 4H14M12.5 4V13.5C12.5 13.78 12.28 14 12 14H4C3.72 14 3.5 13.78 3.5 13.5V4M5.5 7V11M8 7V11M10.5 7V11" stroke="#888" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                        trashIcon.style.cursor = 'pointer';
                        trashIcon.style.marginTop = '4px';
                        trashIcon.title = 'Delete profile';
                        trashIcon.addEventListener('click', (e) => {
                            e.stopPropagation();
                            if (confirm('Are you sure you want to delete this saved profile? This action cannot be undone.')) {
                                try {
                                    // Unlink first if linked
                                    let linkedAccounts = getLinkedAccounts();
                                    if (linkedAccounts.some(acc => acc.key === storageKey)) {
                                        linkedAccounts = linkedAccounts.filter(acc => acc.key !== storageKey);
                                        setLinkedAccounts(linkedAccounts);
                                        // Remove combined offers if less than 2 linked accounts
                                        if (linkedAccounts.length < 2) {
                                            try {
                                                if (typeof goboStorageRemove === 'function') goboStorageRemove('goob-combined'); else localStorage.removeItem('goob-combined');
                                                if (App.ProfileCache && App.ProfileCache['goob-combined-linked']) {
                                                    delete App.ProfileCache['goob-combined-linked'];
                                                    console.log('[DEBUG] App.ProfileCache["goob-combined-linked"] deleted after combined removal');
                                                }
                                            } catch (err) { /* ignore */ }
                                            console.debug('[LinkedAccounts] goob-combined removed from storage due to unlink on delete');
                                        }
                                    }
                                    // Remove profile storage
                                    if (typeof goboStorageRemove === 'function') goboStorageRemove(storageKey); else localStorage.removeItem(storageKey);
                                    // Reclaim ID explicitly (do NOT trigger global renumber)
                                    try { if (typeof ProfileIdManager !== 'undefined' && ProfileIdManager && /^gobo-/.test(storageKey)) { ProfileIdManager.removeKeys([storageKey]); App.ProfileIdMap = { ...ProfileIdManager.map }; } } catch(reclaimErr){ console.warn('[ProfileIdManager] reclaim failed', reclaimErr); }
                                    if (storageKey === 'goob-combined-linked' && App.ProfileCache && App.ProfileCache['goob-combined-linked']) {
                                        delete App.ProfileCache['goob-combined-linked'];
                                        console.log('[DEBUG] App.ProfileCache["goob-combined-linked"] deleted after trash removal');
                                    }
                                    const wasActive = btn.classList.contains('active');
                                    btn.remove();
                                    if (App.ProfileCache) delete App.ProfileCache[storageKey];
                                    App.TableRenderer.updateBreadcrumb(App.TableRenderer.lastState.groupingStack, App.TableRenderer.lastState.groupKeysStack);
                                    if (wasActive) setTimeout(() => { const newTabs = document.querySelectorAll('.profile-tab'); if (newTabs.length) newTabs[0].click(); }, 0);
                                } catch (err) { App.ErrorHandler.showError('Failed to delete profile.'); }
                            }
                        });
                        iconContainer.appendChild(trashIcon);
                        btn.appendChild(iconContainer);
                    }
                    if (p.isCombined) {
                        const emailsDiv = document.createElement('div');
                        emailsDiv.className = 'profile-tab-linked-emails';
                        emailsDiv.style.fontSize = '11px';
                        emailsDiv.style.marginTop = '2px';
                        emailsDiv.style.color = '#2a7';
                        emailsDiv.style.textAlign = 'left';
                        let lines = [];
                        if (p.linkedEmails && p.linkedEmails.length) {
                            lines = p.linkedEmails.slice(0, 2);
                            while(lines.length < 2) lines.push('&nbsp;');
                        } else {
                            lines = ['&nbsp;', '&nbsp;'];
                        }
                        emailsDiv.innerHTML = lines.map(email => `<div>${email}</div>`).join('');
                        labelContainer.appendChild(emailsDiv);
                    } else if (storageKey === 'goob-favorites') {
                        // Intentionally left empty
                    }
                    if (storageKey === activeKey) {
                        btn.classList.add('active');
                        btn.setAttribute('aria-pressed', 'true');
                    } else {
                        btn.setAttribute('aria-pressed', 'false');
                    }
                    btn.addEventListener('click', () => {
                        const clickedStorageKey = btn.getAttribute('data-storage-key') || storageKey;
                        // Immediately set selectedProfileKey to avoid highlight reverting during async spinner operations
                        try { if (App.TableRenderer.lastState) App.TableRenderer.lastState.selectedProfileKey = clickedStorageKey; } catch(e){/* ignore */}
                        state.selectedProfileKey = clickedStorageKey;
                        console.debug('[TAB CLICK] start', { clickedKey: clickedStorageKey, domKey: domKey, currentProfile: App.CurrentProfile && App.CurrentProfile.key, cacheKeys: Object.keys(App.ProfileCache||{}), activeTabDom: (document.querySelector('.profile-tab.active')||{}).getAttribute ? document.querySelector('.profile-tab.active').getAttribute('data-key') : null });
                        if (typeof Spinner !== 'undefined' && Spinner.showSpinner) {
                            Spinner.showSpinner(); setTimeout(()=>{
                                console.debug('[TAB CLICK] processing', { clickedKey: clickedStorageKey, currentProfileBefore: App.CurrentProfile && App.CurrentProfile.key });
                                if (clickedStorageKey === 'goob-combined-linked') {
                                    try { const raw = (typeof goboStorageGet === 'function' ? goboStorageGet('goob-combined') : localStorage.getItem('goob-combined')); if (!raw) { App.ErrorHandler.showError('Link two accounts with the chain link icon in each tab to view combined offers.'); Spinner.hideSpinner(); return; } const payload = JSON.parse(raw); if (payload?.data) { App.TableRenderer.loadProfile('goob-combined-linked', payload); Spinner.hideSpinner(); } else { App.ErrorHandler.showError('Combined Offers data is malformed.'); Spinner.hideSpinner(); } } catch(err){ App.ErrorHandler.showError('Failed to load Combined Offers.'); Spinner.hideSpinner(); }
                                } else if (clickedStorageKey === 'goob-favorites') {
                                    try { const raw = (typeof goboStorageGet === 'function' ? goboStorageGet('goob-favorites') : localStorage.getItem('goob-favorites')); const payload = raw ? JSON.parse(raw) : { data:{ offers: [] }, savedAt: Date.now() }; App.TableRenderer.loadProfile('goob-favorites', payload); } catch(err){ App.ErrorHandler.showError('Failed to load Favorites profile.'); } Spinner.hideSpinner();
                                } else {
                                    try { const raw = (typeof goboStorageGet === 'function' ? goboStorageGet(clickedStorageKey) : localStorage.getItem(clickedStorageKey)); if (!raw) { App.ErrorHandler.showError('Selected profile is no longer available.'); Spinner.hideSpinner(); return; } let payload = JSON.parse(raw); if (!payload || typeof payload !== 'object') { console.warn('[profile-tab-click] payload not object, repairing', { key: clickedStorageKey, raw }); payload = { data:{ offers:[] }, savedAt: Date.now() }; } if (!payload.data || typeof payload.data !== 'object') { console.warn('[profile-tab-click] missing data field, repairing', payload); payload.data = { offers: [] }; } if (!Array.isArray(payload.data.offers)) { console.warn('[profile-tab-click] offers not array, coercing', payload.data.offers); payload.data.offers = []; } if (payload?.data) { App.TableRenderer.loadProfile(clickedStorageKey, payload); Spinner.hideSpinner(); } else { console.warn('[profile-tab-click] malformed payload (no data) after repair attempt', { key: clickedStorageKey, raw }); App.ErrorHandler.showError('Profile data is malformed.'); Spinner.hideSpinner(); } } catch(err){ console.error('[profile-tab-click] exception loading profile', { key: clickedStorageKey, error: err }); try { console.debug('[profile-tab-click] raw storage value for failing key:', (typeof goboStorageGet === 'function' ? goboStorageGet(clickedStorageKey) : localStorage.getItem(clickedStorageKey))); } catch(e2) { /* ignore */ } App.ErrorHandler.showError('Failed to load profile.'); Spinner.hideSpinner(); }
                                }
                                console.debug('[TAB CLICK] end', { selectedProfileKey: state.selectedProfileKey, currentProfileAfter: App.CurrentProfile && App.CurrentProfile.key });
                            },0);
                        } else {
                            try { const raw = (typeof goboStorageGet === 'function' ? goboStorageGet(clickedStorageKey) : localStorage.getItem(clickedStorageKey)); if (!raw) { App.ErrorHandler.showError('Selected profile is no longer available.'); return; } let payload = JSON.parse(raw); if (!payload || typeof payload !== 'object') { console.warn('[profile-tab-click][no-spinner] payload not object, repairing', { key: clickedStorageKey, raw }); payload = { data:{ offers:[] }, savedAt: Date.now() }; } if (!payload.data || typeof payload.data !== 'object') { console.warn('[profile-tab-click][no-spinner] missing data field, repairing', payload); payload.data = { offers: [] }; } if (!Array.isArray(payload.data.offers)) { console.warn('[profile-tab-click][no-spinner] offers not array, coercing', payload.data.offers); payload.data.offers = []; } if (payload?.data) App.TableRenderer.loadProfile(clickedStorageKey, payload); else App.ErrorHandler.showError('Saved profile data is malformed.'); } catch(err){ App.ErrorHandler.showError('Failed to load saved profile.'); }
                        }
                    });
                    tabs.appendChild(btn);
                });
                tabsScroll.appendChild(tabs);
                tabsRow.appendChild(tabsScroll);
            }
        } catch(e) { console.warn('Failed to render profile tabs', e); }
        const all = document.createElement('span'); all.className='breadcrumb-link'; all.textContent='All Offers'; all.addEventListener('click', () => { state.viewMode='table'; state.groupingStack=[]; state.groupKeysStack=[]; state.groupSortStates={}; state.openGroups=new Set(); if (state.baseSortColumn) { state.currentSortColumn=state.baseSortColumn; state.currentSortOrder=state.baseSortOrder; } else { state.currentSortColumn='offerDate'; state.currentSortOrder='desc'; } state.currentGroupColumn=null; App.TableRenderer.updateView(state); }); crumbsRow.appendChild(all);
        container.classList.toggle('accordion-view', groupingStack.length > 0);
        for (let i=0;i<groupingStack.length;i++) {
            const arrowToCol = document.createElement('span'); arrowToCol.className='breadcrumb-arrow'; crumbsRow.appendChild(arrowToCol);
            const colKey = groupingStack[i]; const colLabel = state.headers.find(h=>h.key===colKey)?.label || colKey;
            const colCrumb = document.createElement('span'); colCrumb.className='breadcrumb-crumb breadcrumb-col'; colCrumb.textContent=colLabel; crumbsRow.appendChild(colCrumb);
            if (i < groupKeysStack.length) {
                const arrowToVal = document.createElement('span'); arrowToVal.className='breadcrumb-arrow'; crumbsRow.appendChild(arrowToVal);
                const valCrumb = document.createElement('span'); valCrumb.className='breadcrumb-crumb breadcrumb-val'; valCrumb.textContent=groupKeysStack[i]; crumbsRow.appendChild(valCrumb);
            }
        }
        const tierToggle = document.createElement('label'); tierToggle.className='tier-filter-toggle'; tierToggle.style.marginLeft='auto';
        const hiddenGroupsLabel = document.createElement('span'); hiddenGroupsLabel.textContent='Hidden Groups:'; hiddenGroupsLabel.style.marginLeft='16px';
        const hiddenGroupsDisplay = document.createElement('div'); hiddenGroupsDisplay.id='hidden-groups-display';
        let profileKey = (state.selectedProfileKey || (App.CurrentProfile && App.CurrentProfile.key)) || 'default';
        Filtering.updateHiddenGroupsList(profileKey, hiddenGroupsDisplay, state);
        const b2bButton = document.createElement('button'); b2bButton.type='button'; b2bButton.className='b2b-search-button'; b2bButton.textContent='Back-to-Back Search'; b2bButton.style.cssText='margin-left:12px; background:#0d3b66; color:#fff; border:none; padding:4px 10px; font-size:11px; border-radius:4px; cursor:pointer;';
        b2bButton.addEventListener('click', () => { try { if (App && App.Modal && typeof App.Modal.showBackToBackModal === 'function') App.Modal.showBackToBackModal(); } catch(e){} });
        tierToggle.appendChild(b2bButton); tierToggle.appendChild(hiddenGroupsLabel); tierToggle.appendChild(hiddenGroupsDisplay); crumbsRow.appendChild(tierToggle);
        // Post-build tab highlight correction: ensure active tab matches logical current profile
        try {
            const intended = (App.CurrentProfile && App.CurrentProfile.key) || state.selectedProfileKey;
            if (intended) this._applyActiveTabHighlight(intended);
        } catch(e){/* ignore */}
    }
};

// Stable Profile ID initialization: mirror ProfileIdManager map if available
try {
    if (typeof ProfileIdManager !== 'undefined' && ProfileIdManager) {
        ProfileIdManager.init();
        if (!window.App) window.App = {};
        if (!App.ProfileIdMap) App.ProfileIdMap = { ...ProfileIdManager.map };
    }
} catch(e){ /* ignore init errors */ }

function mergeProfiles(profileA, profileB) {
    if (!profileA && !profileB) return null; if (!profileA) return profileB; if (!profileB) return profileA;
    const celebrityOrder = ["Interior","Ocean View","Veranda","Concierge"]; const defaultOrder=["Interior","Ocean View","Balcony","Junior Suite"];
    const deepCopy = JSON.parse(JSON.stringify(profileA)); const offersA = deepCopy.data?.offers || []; const offersB = profileB.data?.offers || [];
    const sailingMapB = new Map();
    offersB.forEach(offerB => { const codeB = offerB.campaignCode || ''; const offerCodeB = offerB.campaignOffer?.offerCode || ''; const categoryB = offerB.category || ''; const guestsB = offerB.guests || ''; const brandB = offerB.brand || offerB.campaignOffer?.brand || ''; (offerB.campaignOffer?.sailings||[]).forEach(sailingB => { const key = codeB + '|' + (sailingB.shipName||'') + '|' + (sailingB.sailDate||'') + '|' + String(sailingB.isGOBO); sailingMapB.set(key, { offerB, offerCodeB, categoryB, brandB, guestsB, sailingB }); }); });
    offersA.forEach((offerA, offerIdx)=>{
        const codeA = offerA.campaignCode || ''; const offerCodeA = offerA.campaignOffer?.offerCode || ''; const brandA = offerA.brand || offerA.campaignOffer?.brand || ''; const sailingsA = offerA.campaignOffer?.sailings || []; const offerNameA = (offerA.campaignOffer?.name||'').toLowerCase();
        offerA.campaignOffer.sailings = sailingsA.filter(sailingA => {
            const key = codeA + '|' + (sailingA.shipName||'') + '|' + (sailingA.sailDate||'') + '|' + String(sailingA.isGOBO); const matchObj = sailingMapB.get(key); if (!matchObj) return false;
            const offerNameB = (matchObj.offerB?.campaignOffer?.name||'').toLowerCase(); if (offerNameA.includes('two room offer') || offerNameB.includes('two room offer')) return false;
            const isGOBOA = sailingA.isGOBO === true; const isGOBOB = matchObj.sailingB.isGOBO === true; const roomTypeA = sailingA.roomType || ''; const roomTypeB = matchObj.sailingB.roomType || '';
            if (isGOBOA || isGOBOB) { sailingA.isGOBO=false; offerA.guests='2 guests'; let isCelebrity=false; if ((brandA && brandA.toLowerCase().includes('celebrity')) || (matchObj.brandB && matchObj.brandB.toLowerCase().includes('celebrity'))) isCelebrity=true; else if ((offerCodeA && offerCodeA.toLowerCase().includes('celebrity')) || (matchObj.offerCodeB && matchObj.offerCodeB.toLowerCase().includes('celebrity'))) isCelebrity=true; const categoryOrder = isCelebrity ? celebrityOrder : defaultOrder; const idxA=categoryOrder.indexOf(roomTypeA); const idxB=categoryOrder.indexOf(roomTypeB); let lowestIdx=Math.min(idxA,idxB); let lowestRoomType=categoryOrder[lowestIdx >=0 ? lowestIdx : 0]; sailingA.roomType=lowestRoomType; offerA.category=lowestRoomType; }
            else { let isCelebrity=false; if ((brandA && brandA.toLowerCase().includes('celebrity')) || (matchObj.brandB && matchObj.brandB.toLowerCase().includes('celebrity'))) isCelebrity=true; else if ((offerCodeA && offerCodeA.toLowerCase().includes('celebrity')) || (matchObj.offerCodeB && matchObj.offerCodeB.toLowerCase().includes('celebrity'))) isCelebrity=true; const categoryOrder = isCelebrity ? celebrityOrder : defaultOrder; if (offerCodeA !== matchObj.offerCodeB) offerA.campaignOffer.offerCode = offerCodeA + ' / ' + matchObj.offerCodeB; const canUpgrade = !isGOBOA && !isGOBOB; const idxA=categoryOrder.indexOf(roomTypeA); const idxB=categoryOrder.indexOf(roomTypeB); let highestIdx=Math.max(idxA,idxB); let upgradedRoomType = categoryOrder[highestIdx]; if (canUpgrade) { if (highestIdx >=0 && highestIdx < categoryOrder.length -1) upgradedRoomType = categoryOrder[highestIdx+1]; } sailingA.roomType=upgradedRoomType; offerA.category=upgradedRoomType; offerA.guests='2 guests'; }
            return true;
        });
    });
    deepCopy.data.offers = offersA.filter(o=>o.campaignOffer?.sailings?.length>0);
    deepCopy.merged=true; deepCopy.mergedFrom=[profileA.data?.email, profileB.data?.email].filter(Boolean); deepCopy.savedAt=Date.now();
    return deepCopy;
}

function preserveSelectedProfileKey(state, prevState) {
    let selectedProfileKey = state.selectedProfileKey || (prevState && prevState.selectedProfileKey);
    if (!selectedProfileKey) {
        const activeTab = document.querySelector('.profile-tab.active');
        if (activeTab) selectedProfileKey = activeTab.getAttribute('data-storage-key') || activeTab.getAttribute('data-key');
    }
    return { ...state, selectedProfileKey: selectedProfileKey || null };
}
function getLinkedAccounts() { try { const raw = (typeof goboStorageGet === 'function' ? goboStorageGet('goboLinkedAccounts') : localStorage.getItem('goboLinkedAccounts')); return raw ? JSON.parse(raw) : []; } catch(e){ return []; } }
function setLinkedAccounts(arr) { try { if (typeof goboStorageSet === 'function') goboStorageSet('goboLinkedAccounts', JSON.stringify(arr)); else localStorage.setItem('goboLinkedAccounts', JSON.stringify(arr)); } catch(e){} }
function formatTimeAgo(savedAt) { const now=Date.now(); const diffMs = now - savedAt; const minute=60000, hour=60*minute, day=24*hour, week=7*day, month=30*day; if (diffMs < minute) return 'just now'; if (diffMs < hour) return `${Math.floor(diffMs/minute)} minute${Math.floor(diffMs/minute)===1?'':'s'} ago`; if (diffMs < day) return `${Math.floor(diffMs/hour)} hour${Math.floor(diffMs/hour)===1?'':'s'} ago`; if (diffMs < week) return `${Math.floor(diffMs/day)} day${Math.floor(diffMs/day)===1?'':'s'} ago`; if (diffMs < month) return `${Math.floor(diffMs/week)} week${Math.floor(diffMs/week)===1?'':'s'} ago`; return `${Math.floor(diffMs/month)} month${Math.floor(diffMs/month)===1?'':'s'} ago`; }
function updateCombinedOffersCache() { const linkedAccounts = getLinkedAccounts(); if (!linkedAccounts || linkedAccounts.length < 2) return; const profiles = linkedAccounts.map(acc=>{ const raw = (typeof goboStorageGet === 'function' ? goboStorageGet(acc.key) : localStorage.getItem(acc.key)); return raw ? JSON.parse(raw) : null; }).filter(Boolean); if (profiles.length <2) return; const merged = mergeProfiles(profiles[0], profiles[1]); if (typeof goboStorageSet === 'function') goboStorageSet('goob-combined', JSON.stringify(merged)); else localStorage.setItem('goob-combined', JSON.stringify(merged)); if (App.ProfileCache && App.ProfileCache['goob-combined-linked']) delete App.ProfileCache['goob-combined-linked']; }
function getAssetUrl(path) { if (typeof browser !== 'undefined' && browser.runtime?.getURL) return browser.runtime.getURL(path); if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) return chrome.runtime.getURL(path); return path; }

// Listen for storage shim updates and refresh Combined Offers UI when relevant
try {
    if (typeof document !== 'undefined') {
        let __goboCombinedDebounce = null;
        document.addEventListener('goboStorageUpdated', (ev) => {
            try {
                const key = ev?.detail?.key;
                if (!key) return;
                if (key === 'goboLinkedAccounts' || key === 'goob-combined') {
                    // Debounce rapid updates
                    if (__goboCombinedDebounce) clearTimeout(__goboCombinedDebounce);
                    __goboCombinedDebounce = setTimeout(() => {
                        try {
                            if (App && App.ProfileCache && App.ProfileCache['goob-combined-linked']) {
                                delete App.ProfileCache['goob-combined-linked'];
                                console.log('[DEBUG] App.ProfileCache["goob-combined-linked"] deleted due to goboStorageUpdated');
                            }
                            if (App && App.TableRenderer) {
                                App.TableRenderer.updateBreadcrumb(App.TableRenderer.lastState?.groupingStack || [], App.TableRenderer.lastState?.groupKeysStack || []);
                            }
                            // If Combined Offers is currently active, reload it immediately from storage so the view updates
                            try {
                                if (App && App.CurrentProfile && App.CurrentProfile.key === 'goob-combined-linked' && typeof App.TableRenderer.loadProfile === 'function') {
                                    const raw = (typeof goboStorageGet === 'function' ? goboStorageGet('goob-combined') : localStorage.getItem('goob-combined'));
                                    if (raw) {
                                        try {
                                            const payload = JSON.parse(raw);
                                            if (payload && payload.data) {
                                                console.log('[DEBUG] Reloading Combined Offers profile in response to storage update');
                                                App.TableRenderer.loadProfile('goob-combined-linked', payload);
                                            }
                                        } catch(e) { /* ignore malformed */ }
                                    }
                                }
                            } catch(e) { /* ignore */ }
                        } catch(e) { /* ignore */ }
                    }, 20);
                }
            } catch(e) { /* ignore */ }
        });
    }
} catch(e) { /* ignore */ }
