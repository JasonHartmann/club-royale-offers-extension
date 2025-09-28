const TableRenderer = {
    // Track if the default tab has been selected for the current popup display
    hasSelectedDefaultTab: false,
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
            const isActive = tb.getAttribute('data-key') === key;
            tb.classList.toggle('active', isActive);
            tb.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            if (isActive) {
                console.log('[DEBUG] .profile-tab.active set in loadProfile for key:', key, tb);
            }
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
                        selectedProfileKey = currentKey;
                    }
                }
            } catch (e) { /* ignore */ }

            // // Only select the default tab if it hasn't been done yet for this popup display
            // if (!this.hasSelectedDefaultTab) {
            //     // Ignore goboActiveProfile for initial modal launch
            //     selectedProfileKey = currentKey;
            //     this.hasSelectedDefaultTab = true;
            // }

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
                let activeKey = state.selectedProfileKey; //App.CurrentProfile && App.CurrentProfile.key ? App.CurrentProfile.key : state.selectedProfileKey;
                console.debug('[DEBUG] ActiveKey before validation: ', activeKey);
                console.debug('CurrentProfile.key: ', App.CurrentProfile ? App.CurrentProfile.key : null);
                console.debug('selectedProfileKey: ', state.selectedProfileKey);

                // After profiles array is built and before profileKeys is used
                let linkedAccounts = getLinkedAccounts();

                profiles.push({
                    key: 'goob-combined-linked',
                    label: 'Combine Offers',
                    isCombined: true,
                    linkedEmails: linkedAccounts.map(acc => acc.email)
                });

                const profileKeys = profiles.map(p => p.key);
                // Update activeKey logic to handle Combine Offers tab
                if (!profileKeys.includes(activeKey)) {
                    if (state.selectedProfileKey === 'goob-combined-linked') {
                        activeKey = 'goob-combined-linked';
                    } else {
                        activeKey = profileKeys.includes(state.selectedProfileKey) ? state.selectedProfileKey : (profileKeys[0] || null);
                    }
                }
                state.selectedProfileKey = activeKey;
                console.debug('*** Updated selectedProfileKey: ', state.selectedProfileKey);

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
                            ? `<img src="${getAssetUrl('images/link.png')}" width="16" height="16" alt="Linked" style="vertical-align:middle;" />`
                            : `<img src="${getAssetUrl('images/link_off.png')}" width="16" height="16" alt="Unlinked" style="vertical-align:middle;" />`;
                        linkIcon.style.cursor = 'pointer';
                        linkIcon.title = isLinked ? 'Unlink account' : 'Link account';
                        linkIcon.style.marginBottom = '2px';
                        linkIcon.addEventListener('click', (e) => {
                            e.stopPropagation();
                            let updated = getLinkedAccounts();
                            if (isLinked) {
                                updated = updated.filter(acc => acc.key !== p.key);
                                // Remove goob-combined if less than 2 linked accounts
                                if (updated.length < 2) {
                                    try {
                                        localStorage.removeItem('goob-combined');
                                        if (App.ProfileCache && App.ProfileCache['goob-combined-linked']) {
                                            delete App.ProfileCache['goob-combined-linked'];
                                            console.log('[DEBUG] App.ProfileCache["goob-combined-linked"] deleted after goob-combined removal');
                                        }
                                    } catch (err) { /* ignore */ }
                                    console.debug('[LinkedAccounts] goob-combined removed from localStorage due to unlink');
                                }
                            } else {
                                if (updated.length >= 2) return; // Prevent linking a third account
                                let email = p.label;
                                try {
                                    const payload = JSON.parse(localStorage.getItem(p.key));
                                    if (payload && payload.data && payload.data.email) email = payload.data.email;
                                } catch (e) { /* ignore */ }
                                updated.push({ key: p.key, email });
                                // If this is the second linked account, merge both profiles and save to 'goob-combined'
                                if (updated.length === 2) {
                                    try {
                                        const raw1 = localStorage.getItem(updated[0].key);
                                        const raw2 = localStorage.getItem(updated[1].key);
                                        const profile1 = raw1 ? JSON.parse(raw1) : null;
                                        const profile2 = raw2 ? JSON.parse(raw2) : null;
                                        const merged = mergeProfiles(profile1, profile2);
                                        localStorage.setItem('goob-combined', JSON.stringify(merged));
                                    } catch (e) { /* ignore */ }
                                }
                            }
                            setLinkedAccounts(updated);
                            App.TableRenderer.updateBreadcrumb(App.TableRenderer.lastState.groupingStack, App.TableRenderer.lastState.groupKeysStack);
                            // Activate this tab after linking/unlinking
                            btn.click();
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
                                    if (linkedAccounts.some(acc => acc.key === p.key)) {
                                        linkedAccounts = linkedAccounts.filter(acc => acc.key !== p.key);
                                        setLinkedAccounts(linkedAccounts);
                                        // Remove combined offers if less than 2 linked accounts
                                        if (linkedAccounts.length < 2) {
                                            try {
                                                localStorage.removeItem('goob-combined');
                                                if (App.ProfileCache && App.ProfileCache['goob-combined-linked']) {
                                                    delete App.ProfileCache['goob-combined-linked'];
                                                    console.log('[DEBUG] App.ProfileCache["goob-combined-linked"] deleted after combined removal');
                                                }
                                            } catch (err) { /* ignore */ }
                                            console.debug('[LinkedAccounts] goob-combined removed from localStorage due to unlink on delete');
                                        }
                                    }
                                    localStorage.removeItem(p.key);
                                    if (p.key === 'goob-combined-linked' && App.ProfileCache && App.ProfileCache['goob-combined-linked']) {
                                        delete App.ProfileCache['goob-combined-linked'];
                                        console.log('[DEBUG] App.ProfileCache["goob-combined-linked"] deleted after trash removal');
                                    }
                                    const wasActive = btn.classList.contains('active');
                                    btn.remove();
                                    if (App.ProfileCache) delete App.ProfileCache[p.key];
                                    // Re-render tabs to remove Linked Offers tab if needed
                                    App.TableRenderer.updateBreadcrumb(App.TableRenderer.lastState.groupingStack, App.TableRenderer.lastState.groupKeysStack);
                                    // After re-render, activate the first tab if the deleted tab was active
                                    if (wasActive) {
                                        setTimeout(() => {
                                            const newTabs = document.querySelectorAll('.profile-tab');
                                            if (newTabs.length > 0) {
                                                newTabs[0].click();
                                            }
                                        }, 0);
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
                        console.log('[DEBUG] .profile-tab.active set in tab click for activeKey:', p.key, btn);
                        btn.setAttribute('aria-pressed', 'true');
                    } else {
                        btn.setAttribute('aria-pressed', 'false');
                    }
                    btn.addEventListener('click', () => {
                        // Show spinner for 500ms when switching tabs
                        if (typeof Spinner !== 'undefined' && Spinner.showSpinner) {
                            Spinner.showSpinner();
                            setTimeout(() => {
                                if (p.key === 'goob-combined-linked') {
                                    try {
                                        const raw = localStorage.getItem('goob-combined');
                                        if (!raw) {
                                            App.ErrorHandler.showError('Link two accounts with the chain link icon in each tab to view combined offers.');
                                            return;
                                        }
                                        const payload = JSON.parse(raw);
                                        if (payload && payload.data) {
                                            App.TableRenderer.loadProfile('goob-combined-linked', payload);
                                        } else {
                                            App.ErrorHandler.showError('Combine Offers data is malformed.');
                                        }
                                    } catch (err) {
                                        App.ErrorHandler.showError('Failed to load Combine Offers.');
                                    }
                                } else {
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
                                }
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
                                if (Spinner.hideSpinner) {
                                    setTimeout(() => Spinner.hideSpinner(), 500);
                                }
                            }, 0);
                        } else {
                            // Fallback: no spinner, just process immediately
                            if (p.key === 'goob-combined-linked') {
                                // Load the merged profile from localStorage
                                try {
                                    const raw = localStorage.getItem('goob-combined');
                                    if (!raw) {
                                        App.ErrorHandler.showError('Link two accounts with the chain link icon in each tab to view combined offers.');
                                        return;
                                    }
                                    const payload = JSON.parse(raw);
                                    if (payload && payload.data) {
                                        App.TableRenderer.loadProfile('goob-combined-linked', payload);
                                    } else {
                                        App.ErrorHandler.showError('Combine Offers data is malformed.');
                                    }
                                } catch (err) {
                                    App.ErrorHandler.showError('Failed to load Combine Offers.');
                                }
                            } else {
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
                            }
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

/**
 * Merges two profile objects, combining their offers and preserving key fields.
 * @param {object} profileA - First profile object
 * @param {object} profileB - Second profile object
 * @returns {object} Merged profile object
 */
function mergeProfiles(profileA, profileB) {
    console.debug('[mergeProfiles] ENTRY', { profileA, profileB });
    if (!profileA && !profileB) {
        console.debug('[mergeProfiles] Both profiles are null/undefined');
        return null;
    }
    if (!profileA) {
        console.debug('[mergeProfiles] profileA is null/undefined, returning profileB');
        return profileB;
    }
    if (!profileB) {
        console.debug('[mergeProfiles] profileB is null/undefined, returning profileA');
        return profileA;
    }
    // Category upgrade orders
    const celebrityOrder = ["Interior", "Oceanview", "Veranda", "Concierge"];
    const defaultOrder = ["Interior", "Oceanview", "Balcony", "Junior Suite"];
    // Deep copy profileA
    const deepCopy = JSON.parse(JSON.stringify(profileA));
    const offersA = deepCopy.data?.offers || [];
    const offersB = profileB.data?.offers || [];
    console.debug('[mergeProfiles] offersA count:', offersA.length);
    console.debug('[mergeProfiles] offersB count:', offersB.length);
    // Build a map of sailing keys to offerB for fast lookup
    const sailingMapB = new Map();
    offersB.forEach(offerB => {
        const codeB = offerB.campaignCode || '';
        const offerCodeB = offerB.campaignOffer?.offerCode || '';
        const categoryB = offerB.category || '';
        const qualityB = offerB.quality || '';
        const brandB = offerB.brand || offerB.campaignOffer?.brand || '';
        const sailingsB = offerB.campaignOffer?.sailings || [];
        sailingsB.forEach(sailingB => {
            const key = codeB + '|' + (sailingB.shipName || '') + '|' + (sailingB.sailDate || '') + '|' + String(sailingB.isGOBO);
            sailingMapB.set(key, { offerB, offerCodeB, categoryB, brandB, qualityB, sailingB });
        });
    });
    console.debug('[mergeProfiles] sailingMapB size:', sailingMapB.size);
    // Filter sailings in profileA to only those that match in profileB
    offersA.forEach((offerA, offerIdx) => {
        const codeA = offerA.campaignCode || '';
        const offerCodeA = offerA.campaignOffer?.offerCode || '';
        const brandA = offerA.brand || offerA.campaignOffer?.brand || '';
        const sailingsA = offerA.campaignOffer?.sailings || [];
        const beforeCount = sailingsA.length;
        // Remove non-matching sailings and combine offerCodes/upgrade category if needed
        offerA.campaignOffer.sailings = sailingsA.filter(sailingA => {
            const key = codeA + '|' + (sailingA.shipName || '') + '|' + (sailingA.sailDate || '') + '|' + String(sailingA.isGOBO);
            const matchObj = sailingMapB.get(key);
            if (!matchObj) {
                console.debug(`[mergeProfiles] OfferA[${offerIdx}] sailing removed`, { key, sailingA });
                return false;
            }
            const isGOBOA = sailingA.isGOBO === true;
            const isGOBOB = matchObj.sailingB.isGOBO === true;
            const roomTypeA = sailingA.roomType || '';
            const roomTypeB = matchObj.sailingB.roomType || '';
            // If either sailing has isGOBO=true, set merged isGOBO=false and Quality='2 guests'
            if (isGOBOA || isGOBOB) {
                sailingA.isGOBO = false;
                offerA.quality = "2 guests";
                // Set category to the lowest of the two roomTypes
                let isCelebrity = false;
                if ((brandA && brandA.toLowerCase().includes('celebrity')) || (matchObj.brandB && matchObj.brandB.toLowerCase().includes('celebrity'))) {
                    isCelebrity = true;
                } else if ((offerCodeA && offerCodeA.toLowerCase().includes('celebrity')) || (matchObj.offerCodeB && matchObj.offerCodeB.toLowerCase().includes('celebrity'))) {
                    isCelebrity = true;
                }
                const categoryOrder = isCelebrity ? celebrityOrder : defaultOrder;
                const idxA = categoryOrder.indexOf(roomTypeA);
                const idxB = categoryOrder.indexOf(roomTypeB);
                let lowestIdx = Math.min(idxA, idxB);
                let lowestRoomType = categoryOrder[lowestIdx >= 0 ? lowestIdx : 0];
                sailingA.roomType = lowestRoomType;
                offerA.category = lowestRoomType;
                console.debug(`[mergeProfiles] OfferA[${offerIdx}] isGOBO=true, roomType set to lowest`, { key, lowestRoomType, idxA, idxB, roomTypeA, roomTypeB });
            } else {
                // Determine brand for category upgrade
                let isCelebrity = false;
                if ((brandA && brandA.toLowerCase().includes('celebrity')) || (matchObj.brandB && matchObj.brandB.toLowerCase().includes('celebrity'))) {
                    isCelebrity = true;
                } else if ((offerCodeA && offerCodeA.toLowerCase().includes('celebrity')) || (matchObj.offerCodeB && matchObj.offerCodeB.toLowerCase().includes('celebrity'))) {
                    isCelebrity = true;
                }
                const categoryOrder = isCelebrity ? celebrityOrder : defaultOrder;
                if (isCelebrity) {
                    console.debug(`[mergeProfiles] OfferA[${offerIdx}] using Celebrity category order`, { key });
                } else {
                    console.debug(`[mergeProfiles] OfferA[${offerIdx}] using Default category order`, { key });
                }
                // If offerCodes differ, combine them
                if (offerCodeA !== matchObj.offerCodeB) {
                    const combinedCode = offerCodeA + ' / ' + matchObj.offerCodeB;
                    offerA.campaignOffer.offerCode = combinedCode;
                    console.debug(`[mergeProfiles] OfferA[${offerIdx}] offerCode combined`, { key, combinedCode, offerCodeA, offerCodeB: matchObj.offerCodeB });
                }
                // Only upgrade category if both sailings are isGOBO=false
                const canUpgrade = !isGOBOA && !isGOBOB;
                const idxA = categoryOrder.indexOf(roomTypeA);
                const idxB = categoryOrder.indexOf(roomTypeB);
                let highestIdx = Math.max(idxA, idxB);
                let upgradedRoomType = categoryOrder[highestIdx];
                console.debug(`[mergeProfiles] OfferA[${offerIdx}] canUpgrade check`, {
                    key,
                    isGOBOA,
                    isGOBOB,
                    canUpgrade,
                    idxA,
                    idxB,
                    highestIdx,
                    categoryOrder,
                    roomTypeA,
                    roomTypeB
                });
                if (canUpgrade) {
                    if (highestIdx >= 0 && highestIdx < categoryOrder.length - 1) {
                        upgradedRoomType = categoryOrder[highestIdx + 1];
                        console.debug(`[mergeProfiles] OfferA[${offerIdx}] roomType upgraded`, { key, from: categoryOrder[highestIdx], to: upgradedRoomType });
                    } else if (highestIdx === categoryOrder.length - 1) {
                        console.debug(`[mergeProfiles] OfferA[${offerIdx}] roomType is already highest ('${categoryOrder[highestIdx]}'), no upgrade`, { key, roomType: upgradedRoomType });
                    } else {
                        console.debug(`[mergeProfiles] OfferA[${offerIdx}] canUpgrade=true but upgrade skipped: invalid highestIdx`, { key, idxA, idxB, highestIdx, categoryOrder, roomTypeA, roomTypeB });
                    }
                } else {
                    if (highestIdx >= 0) {
                        console.debug(`[mergeProfiles] OfferA[${offerIdx}] roomType upgrade skipped (isGOBO conditions not met)`, { key, roomType: upgradedRoomType, isGOBOA, isGOBOB });
                    }
                }
                sailingA.roomType = upgradedRoomType;
                offerA.category = upgradedRoomType;
                // Always set quality to '2 guests' for merged sailings
                offerA.quality = "2 guests";
            }
            return true;
        });
        const afterCount = offerA.campaignOffer.sailings.length;
        if (beforeCount !== afterCount) {
            console.debug(`[mergeProfiles] OfferA[${offerIdx}] sailings filtered`, { beforeCount, afterCount });
        }
    });
    // Remove offers with no sailings
    const beforeOffersCount = offersA.length;
    deepCopy.data.offers = offersA.filter((offerA, offerIdx) => {
        const keep = offerA.campaignOffer?.sailings?.length > 0;
        if (!keep) {
            console.debug(`[mergeProfiles] OfferA[${offerIdx}] removed (no matching sailings)`, offerA);
        }
        return keep;
    });
    const afterOffersCount = deepCopy.data.offers.length;
    if (beforeOffersCount !== afterOffersCount) {
        console.debug('[mergeProfiles] Offers filtered', { beforeOffersCount, afterOffersCount });
    }
    // Mark as merged and add metadata
    deepCopy.merged = true;
    deepCopy.mergedFrom = [profileA.data?.email, profileB.data?.email].filter(Boolean);
    deepCopy.savedAt = Date.now();
    console.debug('[mergeProfiles] EXIT', { mergedProfile: deepCopy });
    return deepCopy;
}

// Helper to always preserve selectedProfileKey
function preserveSelectedProfileKey(state, prevState) {
    console.log('[DEBUG] preserveSelectedProfileKey ENTRY', { state, prevState });
    let selectedProfileKey = state.selectedProfileKey || (prevState && prevState.selectedProfileKey);
    // Explicitly handle the special 'Combine Offers' tab
    if (selectedProfileKey === 'goob-combined-linked') {
        console.log('[DEBUG] preserveSelectedProfileKey: returning Combine Offers tab', selectedProfileKey);
        return {
            ...state,
            selectedProfileKey: 'goob-combined-linked'
        };
    }
    // Try to get from DOM
    const activeTab = document.querySelector('.profile-tab.active');
    if (activeTab) {
        const key = activeTab.getAttribute('data-key');
        if (key === 'goob-combined-linked') {
            console.log('[DEBUG] preserveSelectedProfileKey: DOM active tab is Combine Offers', key);
            return {
                ...state,
                selectedProfileKey: 'goob-combined-linked'
            };
        }
        selectedProfileKey = key;
    }
    console.log('[DEBUG] preserveSelectedProfileKey: returning', selectedProfileKey || null);
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

function updateCombinedOffersCache() {
    // Get all linked accounts
    const linkedAccounts = getLinkedAccounts();
    if (!linkedAccounts || linkedAccounts.length < 2) return;
    // Fetch latest data for each linked account from localStorage
    const profiles = linkedAccounts.map(acc => {
        const raw = localStorage.getItem(acc.key);
        return raw ? JSON.parse(raw) : null;
    }).filter(Boolean);
    if (profiles.length < 2) return;
    // Merge profiles
    const merged = mergeProfiles(profiles[0], profiles[1]);
    // Save to localStorage
    localStorage.setItem('goob-combined', JSON.stringify(merged));
    // Delete cached DOM
    if (App.ProfileCache && App.ProfileCache['goob-combined-linked']) {
        delete App.ProfileCache['goob-combined-linked'];
        console.log('[DEBUG] App.ProfileCache["goob-combined-linked"] deleted after combined offers regeneration');
    }
    console.log('[DEBUG] Combined offers data regenerated and cache cleared');
}

// Helper to get extension asset URL
function getAssetUrl(path) {
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getURL) {
        return browser.runtime.getURL(path);
    } else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        return chrome.runtime.getURL(path);
    }
    return path;
}