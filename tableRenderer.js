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
        App.TableRenderer.lastState = { ...cached.state, selectedProfileKey: key };
        App.CurrentProfile = {
            key,
            scrollContainer: cached.scrollContainer,
            state: { ...cached.state, selectedProfileKey: key }
        };
        console.log('[DEBUG] switchProfile: Updated lastState and CurrentProfile', App.TableRenderer.lastState, App.CurrentProfile);
        // Check if table and breadcrumb exist in DOM after swap
        const tableInDom = cached.scrollContainer.querySelector('table');
        const breadcrumbInDom = cached.scrollContainer.querySelector('.breadcrumb-container');
        console.log('[DEBUG] switchProfile: table in DOM after swap', tableInDom);
        console.log('[DEBUG] switchProfile: breadcrumb in DOM after swap', breadcrumbInDom);
        // If table or breadcrumb is missing, force re-render
        if (!tableInDom || !breadcrumbInDom) {
            console.warn('[DEBUG] Table or breadcrumb missing after swap, forcing updateView');
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
                currentSortColumn: 'offerDate', // Default sort by Received
                currentSortOrder: 'desc', // Descending (newest first)
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
            tb.classList.toggle('active', tb.getAttribute('data-key') === key);
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
                    }
                }
            } catch (e) { /* ignore */ }

            // Ignore goboActiveProfile for initial modal launch
            selectedProfileKey = currentKey;

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
                currentSortColumn: 'offerDate', // Default sort by Received
                currentSortOrder: 'desc', // Descending (newest first)
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
        // Always preserve selectedProfileKey, even in recursive calls
        state = preserveSelectedProfileKey(state, App.TableRenderer.lastState);
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
            if (validDepth < state.groupKeysStack.length) {
                state.groupKeysStack = state.groupKeysStack.slice(0, validDepth);
                // Accordion reset: ensure selectedProfileKey is still valid
                const profileTabs = Array.from(document.querySelectorAll('.profile-tab'));
                const validKeys = profileTabs.map(tab => tab.getAttribute('data-key'));
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
                // Move current user's tab to the front if present
                if (currentKey) {
                    const idx = profiles.findIndex(p => p.key === currentKey);
                    if (idx > 0) profiles.unshift(profiles.splice(idx, 1)[0]);
                }
                const tabs = document.createElement('div');
                tabs.className = 'profile-tabs';
                // Always use App.CurrentProfile.key as activeKey after a profile switch
                let activeKey = App.CurrentProfile && App.CurrentProfile.key ? App.CurrentProfile.key : state.selectedProfileKey;
                const profileKeys = profiles.map(p => p.key);
                if (!profileKeys.includes(activeKey)) {
                    activeKey = profileKeys.includes(state.selectedProfileKey) ? state.selectedProfileKey : (profileKeys[0] || null);
                }
                state.selectedProfileKey = activeKey;

                let linkedAccounts = getLinkedAccounts();
                // Add Combined Linked Offers tab as the last tab if two or more accounts are linked
                profiles.push({
                    key: 'gobo-combined-linked',
                    label: 'Linked Offers',
                    isCombined: true,
                    linkedEmails: linkedAccounts.map(acc => acc.email)
                });

                profiles.forEach(p => {
                    const btn = document.createElement('button');
                    btn.className = 'profile-tab';
                    btn.setAttribute('data-key', p.key);
                    // Fix: define loyaltyId for each profile
                    let loyaltyId = null;
                    try {
                        const payload = JSON.parse(localStorage.getItem(p.key));
                        if (payload && payload.data) {
                            loyaltyId = payload.data.loyaltyId || null;
                        }
                    } catch (e) { /* ignore */ }
                    const labelDiv = document.createElement('div');
                    labelDiv.className = 'profile-tab-label';
                    labelDiv.textContent = p.label || p.key;
                    const loyaltyDiv = document.createElement('div');
                    loyaltyDiv.className = 'profile-tab-loyalty';
                    loyaltyDiv.textContent = loyaltyId ? `Loyalty ID: ${loyaltyId}` : '';

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
                    if (!p.isCombined) {
                        const iconContainer = document.createElement('div');
                        iconContainer.style.display = 'flex';
                        iconContainer.style.flexDirection = 'column';
                        iconContainer.style.alignItems = 'center';
                        iconContainer.style.gap = '2px';
                        iconContainer.style.marginLeft = '4px'; // 4px gap between label and icons
                        // Link/unlink icon
                        const linkIcon = document.createElement('span');
                        const isLinked = getLinkedAccounts().some(acc => acc.key === p.key);
                        linkIcon.innerHTML = isLinked
                            ? '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M4.5 8a3.5 3.5 0 013.5-3.5h1a3.5 3.5 0 110 7h-1" stroke="#2a7" stroke-width="1.5" fill="none"/><path d="M11.5 8a3.5 3.5 0 00-3.5-3.5h-1a3.5 3.5 0 100 7h1" stroke="#2a7" stroke-width="1.5" fill="none"/></svg>'
                            : '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M4.5 8a3.5 3.5 0 013.5-3.5h1a3.5 3.5 0 110 7h-1" stroke="#888" stroke-width="1.5" fill="none"/><path d="M11.5 8a3.5 3.5 0 00-3.5-3.5h-1a3.5 3.5 0 100 7h1" stroke="#888" stroke-width="1.5" fill="none"/></svg>';
                        linkIcon.style.cursor = 'pointer';
                        linkIcon.title = isLinked ? 'Unlink account' : 'Link account';
                        linkIcon.style.marginBottom = '2px';
                        linkIcon.addEventListener('click', (e) => {
                            e.stopPropagation();
                            let updated = getLinkedAccounts();
                            if (isLinked) {
                                updated = updated.filter(acc => acc.key !== p.key);
                            } else {
                                let email = p.label;
                                try {
                                    const payload = JSON.parse(localStorage.getItem(p.key));
                                    if (payload && payload.data && payload.data.email) email = payload.data.email;
                                } catch (e) { /* ignore */ }
                                updated.push({ key: p.key, email });
                            }
                            setLinkedAccounts(updated);
                            App.TableRenderer.updateBreadcrumb(App.TableRenderer.lastState.groupingStack, App.TableRenderer.lastState.groupKeysStack);
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
                                    localStorage.removeItem(p.key);
                                    btn.remove();
                                    if (App.ProfileCache) delete App.ProfileCache[p.key];
                                    const remainingTabs = tabs.querySelectorAll('.profile-tab');
                                    if (btn.classList.contains('active') && remainingTabs.length > 0) {
                                        remainingTabs[0].click();
                                    }
                                } catch (err) {
                                    App.ErrorHandler.showError('Failed to delete profile.');
                                }
                            }
                        });
                        iconContainer.appendChild(trashIcon);
                        btn.appendChild(iconContainer);
                    }
                    // For combined tab, show linked emails below label
                    if (p.isCombined) {
                        const emailsDiv = document.createElement('div');
                        emailsDiv.className = 'profile-tab-linked-emails';
                        emailsDiv.style.fontSize = '11px';
                        emailsDiv.style.marginTop = '2px';
                        emailsDiv.style.color = '#2a7';
                        emailsDiv.style.textAlign = 'left';
                        let lines = [];
                        if (p.linkedEmails && p.linkedEmails.length > 0) {
                            lines = p.linkedEmails.slice(0, 2);
                            while (lines.length < 2) lines.push('&nbsp;');
                        } else {
                            lines = ['&nbsp;', '&nbsp;'];
                        }
                        emailsDiv.innerHTML = lines.map(email => `<div>${email}</div>`).join('');
                        labelContainer.appendChild(emailsDiv);
                    }
                    // Set active class only for the current user's tab (or first tab if only one)
                    if (p.key === activeKey) {
                        btn.classList.add('active');
                        btn.setAttribute('aria-pressed', 'true');
                    } else {
                        btn.setAttribute('aria-pressed', 'false');
                    }
                    btn.addEventListener('click', () => {
                        state.selectedProfileKey = p.key;
                        tabs.querySelectorAll('.profile-tab').forEach(tb => {
                            tb.classList.remove('active');
                            tb.setAttribute('aria-pressed', 'false');
                            const label = tb.querySelector('div');
                            if (label) label.style.fontWeight = 'normal';
                        });
                        btn.classList.add('active');
                        btn.setAttribute('aria-pressed', 'true');
                        const label = btn.querySelector('div');
                        if (label) label.style.fontWeight = 'bold';
                        try {
                            const raw = localStorage.getItem(p.key);
                            if (!raw) { App.ErrorHandler.showError('Selected profile is no longer available.'); return; }
                            const payload = JSON.parse(raw);
                            if (payload && payload.data) {
                                console.log('[DEBUG] Calling LoadProfile');
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
            // Restore previous base sort if available
            if (state.baseSortColumn) {
                state.currentSortColumn = state.baseSortColumn;
                state.currentSortOrder = state.baseSortOrder;
            } else {
                state.currentSortColumn = 'offerDate';
                state.currentSortOrder = 'desc';
            }
            state.currentGroupColumn = null;
            App.TableRenderer.updateView(state);
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
            // Preserve selectedProfileKey before updateView
            const selectedKey = state.selectedProfileKey;
            try { localStorage.setItem('goboHideTier', String(state.hideTierSailings)); } catch (e) { /* ignore */ }
            App.TableRenderer.updateView({ ...state, selectedProfileKey: selectedKey });
        });
        tierToggle.appendChild(tierCheckbox);
        tierToggle.appendChild(tierText);
        // Place the tier toggle at the end of the crumbs row
        crumbsRow.appendChild(tierToggle);
    }
};

// Helper to always preserve selectedProfileKey
function preserveSelectedProfileKey(state, prevState) {
    let selectedProfileKey = state.selectedProfileKey || (prevState && prevState.selectedProfileKey);
    if (!selectedProfileKey) {
        // Try to get from DOM
        const activeTab = document.querySelector('.profile-tab.active');
        if (activeTab) selectedProfileKey = activeTab.getAttribute('data-key');
    }
    return {
        ...state,
        selectedProfileKey: selectedProfileKey || null
    };
}

// Helper to get/set linked accounts
function getLinkedAccounts() {
    try {
        const raw = localStorage.getItem('goboLinkedAccounts');
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
}
function setLinkedAccounts(arr) {
    try { localStorage.setItem('goboLinkedAccounts', JSON.stringify(arr)); } catch (e) { /* ignore */ }
}

function formatTimeAgo(savedAt) {
    const now = Date.now();
    const diffMs = now - savedAt;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    if (diffMs < minute) return 'just now';
    if (diffMs < hour) return `${Math.floor(diffMs / minute)} minute${Math.floor(diffMs / minute) === 1 ? '' : 's'} ago`;
    if (diffMs < day) return `${Math.floor(diffMs / hour)} hour${Math.floor(diffMs / hour) === 1 ? '' : 's'} ago`;
    if (diffMs < week) return `${Math.floor(diffMs / day)} day${Math.floor(diffMs / day) === 1 ? '' : 's'} ago`;
    if (diffMs < month) return `${Math.floor(diffMs / week)} week${Math.floor(diffMs / week) === 1 ? '' : 's'} ago`;
    return `${Math.floor(diffMs / month)} month${Math.floor(diffMs / month) === 1 ? '' : 's'} ago`;
}