const TableRenderer = {
    // Track if the default tab has been selected for the current popup display
    hasSelectedDefaultTab: false,
    // One-time flag to force selecting the first (current profile) tab only on initial modal open
    _initialOpenPending: false,
    // Token used to validate most recent profile switch/render/render cycle
    currentSwitchToken: null,
    // Map of DOM tab keys to underlying storage keys (handles duplicate storage key collisions)
    TabKeyMap: {},
    // Centralized tab highlight helper (called only when token matches)
    caching: false,
    _b2bDepthPending: false,
    _b2bDepthPromise: null,
    _resolveB2BDepthPromise: null,
    _b2bDepthInFlightCount: 0,
    SIDE_BY_SIDE_PREF_KEY: 'goboB2BIncludeSideBySide_v1',
    _sideBySidePreferenceCache: null,
    _b2bSpinnerSessionId: null,
    isB2BDepthPending() {
        return !!this._b2bDepthPending;
    },
    hasComputedB2BDepths(state) {
        if (!state || !Array.isArray(state.sortedOffers) || !state.sortedOffers.length) return true;
        return state.sortedOffers.every((row) => {
            if (!row || !row.sailing) return true;
            return typeof row.sailing.__b2bDepth === 'number';
        });
    },
    waitForB2BDepths() {
        return this._b2bDepthPromise || Promise.resolve();
    },
    getSideBySidePreference() {
        if (typeof this._sideBySidePreferenceCache === 'boolean') return this._sideBySidePreferenceCache;
        let pref = true;
        try {
            const key = this.SIDE_BY_SIDE_PREF_KEY;
            const raw = (typeof goboStorageGet === 'function') ? goboStorageGet(key) : localStorage.getItem(key);
            if (raw !== null && raw !== undefined) pref = raw === 'true';
        } catch (e) {
            console.warn('[TableRenderer] Unable to read side-by-side preference; defaulting to enabled', e);
        }
        this._sideBySidePreferenceCache = pref;
        return pref;
    },
    setSideBySidePreference(value) {
        const boolVal = !!value;
        this._sideBySidePreferenceCache = boolVal;
        try {
            const key = this.SIDE_BY_SIDE_PREF_KEY;
            if (typeof goboStorageSet === 'function') goboStorageSet(key, String(boolVal));
            else localStorage.setItem(key, String(boolVal));
        } catch (e) {
            console.warn('[TableRenderer] Unable to persist side-by-side preference', e);
        }
        this.refreshB2BDepths({ showSpinner: true });
    },
    refreshB2BDepths(options) {
        const opts = options || {};
        const state = this.lastState;
        if (!state) return;
        const shouldResortAfterDepths = state.viewMode === 'table' && state.currentSortColumn === 'b2bDepth';
        const showSpinner = !!opts.showSpinner;
        let spinnerSessionId = null;
        let spinnerListener = null;
        let spinnerTimeout = null;
        const hideSpinner = () => {
            if (!spinnerSessionId) return;
            if (this._b2bSpinnerSessionId !== spinnerSessionId) return;
            this._b2bSpinnerSessionId = null;
            if (spinnerTimeout) {
                clearTimeout(spinnerTimeout);
                spinnerTimeout = null;
            }
            if (spinnerListener) {
                try { document.removeEventListener('tableRenderComplete', spinnerListener); } catch (ignore) {}
                spinnerListener = null;
            }
            try { if (typeof Spinner !== 'undefined' && typeof Spinner.hideSpinner === 'function') Spinner.hideSpinner(); } catch(e){ /* ignore */ }
            spinnerSessionId = null;
        };
        if (showSpinner && typeof Spinner !== 'undefined' && typeof Spinner.showSpinner === 'function') {
            try {
                Spinner.showSpinner();
                spinnerSessionId = Date.now().toString(36) + Math.random().toString(36).slice(2);
                this._b2bSpinnerSessionId = spinnerSessionId;
                spinnerListener = () => { hideSpinner(); };
                try { document.addEventListener('tableRenderComplete', spinnerListener, { once: true }); } catch (evtErr) { console.debug('[TableRenderer] Unable to attach tableRenderComplete listener', evtErr); }
                spinnerTimeout = setTimeout(() => { hideSpinner(); }, 1600);
            } catch (spinnerErr) {
                console.debug('[TableRenderer] Spinner.showSpinner failed for B2B toggle', spinnerErr);
                spinnerSessionId = null;
            }
        }
        const resetDepths = (rows) => {
            if (!Array.isArray(rows)) return;
            rows.forEach((row) => {
                if (row && row.sailing && typeof row.sailing.__b2bDepth === 'number') delete row.sailing.__b2bDepth;
            });
        };
        resetDepths(state.sortedOffers);
        resetDepths(state.originalOffers);
        resetDepths(state.fullOriginalOffers);
        if (state._globalSortedCache) state._globalSortedCache = {};
        const runRecalc = () => {
            let waitPromise = Promise.resolve();
            try {
                state._switchToken = this.currentSwitchToken || state._switchToken;
                this.updateView(state);
                waitPromise = this.waitForB2BDepths();
            } catch (err) {
                console.warn('[TableRenderer] Failed to refresh B2B depths after preference change', err);
                waitPromise = Promise.resolve();
            }
            waitPromise.finally(() => {
                hideSpinner();
            });
            if (shouldResortAfterDepths) {
                waitPromise.then(() => {
                    const latest = this.lastState;
                    if (!latest) return;
                    if (latest.viewMode !== 'table' || latest.currentSortColumn !== 'b2bDepth') return;
                    if (latest._globalSortedCache) latest._globalSortedCache = {};
                    latest._switchToken = this.currentSwitchToken || latest._switchToken;
                    try {
                        this.updateView(latest);
                    } catch (resortErr) {
                        console.warn('[TableRenderer] Unable to reapply B2B sort after recompute', resortErr);
                    }
                }).catch((waitErr) => {
                    console.warn('[TableRenderer] waitForB2BDepths failed during preference refresh', waitErr);
                });
            }
        };
        if (showSpinner) setTimeout(runRecalc, 0); else runRecalc();
    },
    _startB2BDepthComputation() {
        this._b2bDepthInFlightCount += 1;
        if (!this._b2bDepthPending) {
            this._b2bDepthPending = true;
            this._b2bDepthPromise = new Promise((resolve) => {
                this._resolveB2BDepthPromise = resolve;
            });
        }
        let finished = false;
        return () => {
            if (finished) return;
            finished = true;
            this._b2bDepthInFlightCount = Math.max(0, this._b2bDepthInFlightCount - 1);
            if (this._b2bDepthInFlightCount === 0) {
                this._b2bDepthPending = false;
                if (this._resolveB2BDepthPromise) {
                    try { this._resolveB2BDepthPromise(); } catch(e) { /* ignore */ }
                }
                this._b2bDepthPromise = null;
                this._resolveB2BDepthPromise = null;
            }
        };
    },
    _computeB2BDepths(rows, options) {
        if (!Array.isArray(rows) || !rows.length) return null;
        if (!window.B2BUtils || typeof B2BUtils.computeB2BDepth !== 'function') return null;
        const defaultAllow = (typeof this.getSideBySidePreference === 'function') ? this.getSideBySidePreference() : true;
        const opts = Object.assign({ allowSideBySide: defaultAllow }, options || {});
        const finish = this._startB2BDepthComputation();
        try {
            const depthsMap = B2BUtils.computeB2BDepth(rows, opts);
            rows.forEach((row, idx) => {
                if (!row || !row.sailing) return;
                const depth = depthsMap.get(idx) || 1;
                row.sailing.__b2bDepth = depth;
            });
            return depthsMap;
        } catch (err) {
            console.warn('[TableRenderer] B2B depth computation failed', err);
            return null;
        } finally {
            try { finish(); } catch(e) { /* ignore */ }
        }
    },
    _ensureRowsHaveB2BDepth(rows, options) {
        if (!Array.isArray(rows) || !rows.length) return null;
        const needsDepth = rows.some(row => row && row.sailing && typeof row.sailing.__b2bDepth !== 'number');
        if (!needsDepth) return null;
        return this._computeB2BDepths(rows, options);
    },
    _normalizeB2BDepthValue(depth) {
        const num = Number(depth);
        return Number.isFinite(num) && num > 0 ? num : 1;
    },
    getB2BDepthBadgeMarkup(depth) {
        const normalized = this._normalizeB2BDepthValue(depth);
        return `<span class="b2b-chevrons" aria-hidden="true"><span class="b2b-chevrons-value">${normalized}</span></span>`;
    },
    updateB2BDepthCell(cell, depth) {
        if (!cell) return;
        const normalized = this._normalizeB2BDepthValue(depth);
        if (typeof cell.innerHTML === 'string') {
            cell.innerHTML = this.getB2BDepthBadgeMarkup(normalized);
        } else {
            cell.textContent = String(normalized);
        }
        try {
            cell.dataset.depth = String(normalized);
        } catch (e) { /* ignore dataset assignment errors */ }
        cell.setAttribute('aria-label', `Back-to-back depth ${normalized}`);
    },
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
        console.debug('[tableRenderer] switchProfile ENTRY', { key, switchToken });
        const cached = App.ProfileCache[key];
        const activeDomTab = document.querySelector('.profile-tab.active');
        const activeDomKey = activeDomTab && (activeDomTab.getAttribute('data-storage-key') || activeDomTab.getAttribute('data-key'));
        if (!cached) {
            console.debug('[tableRenderer] switchProfile: No cached profile', { key });
            return;
        }
        // Compute timestamps early so we can decide if the existing DOM is stale compared to incoming payload
        const dataSavedAt = (payload && payload.savedAt) || cached.state?.savedAt || 0;
        const domCachedAt = cached.scrollContainer?._cachedAt || 0;
        const isStale = !cached.scrollContainer || dataSavedAt > domCachedAt;
        console.debug('[tableRenderer] switchProfile timestamp check', { key, dataSavedAt, domCachedAt, isStale });

        const alreadyLogical = App.CurrentProfile && App.CurrentProfile.key === key;
        const highlightMatches = activeDomKey === key;
        // Only no-op if BOTH logical and highlight already correct AND the DOM is NOT stale
        if (alreadyLogical && highlightMatches && !isStale) {
            console.debug('[tableRenderer] switchProfile: already active & highlight matches & DOM not stale, no-op', { key });
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
        console.debug('[tableRenderer] switchProfile: currentScroll', currentScroll);
        if (currentScroll && App.CurrentProfile && App.CurrentProfile.key) {
            if (!currentScroll._cachedAt) currentScroll._cachedAt = Date.now();
            App.ProfileCache[App.CurrentProfile.key] = {
                scrollContainer: currentScroll,
                state: App.TableRenderer.lastState
            };
            console.debug('[tableRenderer] switchProfile: Cached current profile', App.CurrentProfile.key);
        }
        // Always rebuild to ensure fresh rows
        console.debug('[tableRenderer] switchProfile: rebuilding (forced)');
        cached.state._switchToken = switchToken;
        this.rebuildProfileView(key, cached.state, payload, switchToken);
        console.debug('[tableRenderer] switchProfile EXIT (forced rebuild)');
    },
    async recacheItineraries(payload) {
        if (this.caching === false) {
            try {
                this.caching = true;
                const keySet = new Set();
                console.debug('[ItineraryCache] recacheItineraries begin');
                const offers = payload && payload.data && Array.isArray(payload.data.offers) ? payload.data.offers : [];
                offers.forEach(o => {
                    const sailings = o?.campaignOffer?.sailings;
                    if (!Array.isArray(sailings)) return;
                    sailings.forEach(s => {
                        try {
                            const sd = s?.sailDate ? String(s.sailDate).trim().slice(0,10) : '';
                            const sc = s?.shipCode ? String(s.shipCode).trim() : '';
                            if (sc && sd) keySet.add(`SD_${sc}_${sd}`);
                        } catch(inner){ /* ignore single sailing errors */ }
                    });
                });
                if (keySet.size) {
                    console.debug('[ItineraryCache] hydrating ship/date keys', { count: keySet.size });
                    // Resolve canonical cache object once
                    const IC = (typeof window !== 'undefined' && window.App && window.App.ItineraryCache) ? window.App.ItineraryCache : ((typeof window !== 'undefined' && window.ItineraryCache) ? window.ItineraryCache : (typeof ItineraryCache !== 'undefined' ? ItineraryCache : undefined));
                    const hydrateTarget = IC || ItineraryCache;
                    if (hydrateTarget && typeof hydrateTarget.hydrateIfNeeded === 'function') {
                        await hydrateTarget.hydrateIfNeeded(Array.from(keySet));
                    }
                    // Compute derived pricing only once after hydration
                    try { if (hydrateTarget && typeof hydrateTarget.computeAllDerivedPricing === 'function') hydrateTarget.computeAllDerivedPricing(); } catch(e) { console.warn('[ItineraryCache] computeAllDerivedPricing error', e); }
                    if (hydrateTarget && typeof hydrateTarget.all === 'function') return hydrateTarget.all();
                }
                const IC2 = (typeof window !== 'undefined' && window.App && window.App.ItineraryCache) ? window.App.ItineraryCache : ((typeof window !== 'undefined' && window.ItineraryCache) ? window.ItineraryCache : (typeof ItineraryCache !== 'undefined' ? ItineraryCache : undefined));
                if (IC2 && typeof IC2.computeAllDerivedPricing === 'function') { try { IC2.computeAllDerivedPricing(); } catch(e){} }
                if (IC2 && typeof IC2.all === 'function') return IC2.all();
            } catch (e) {
                console.warn('[ItineraryCache] recacheItineraries error', e);
            } finally {
                this.caching = false;
            }
        }
    },
    loadProfile(key, payload) {
        // Ensure stable ID for this key immediately WITHOUT allocating a new one if preserved
        try {
            if (typeof ProfileIdManager !== 'undefined' && ProfileIdManager) {
                const alreadyId = ProfileIdManager.map[key];
                if (alreadyId == null) ProfileIdManager.ensureIds([key]);
                App.ProfileIdMap = { ...ProfileIdManager.map };
            }
        } catch(e){ /* ignore */ }
        const switchToken = Date.now() + '_' + Math.random().toString(36).slice(2);
        this.currentSwitchToken = switchToken;
        if (!App.ProfileIdMap) App.ProfileIdMap = {};
        try {
            if (typeof ProfileIdManager !== 'undefined' && ProfileIdManager) {
                ProfileIdManager.ensureIds([key]);
                App.ProfileIdMap = { ...ProfileIdManager.map };
            }
        } catch(e) { /* ignore */ }
        console.debug('[DEBUG] loadProfile ENTRY', { key, payload, typeofKey: typeof key, typeofPayload: typeof payload, switchToken });
        console.debug('[DEBUG] App.ProfileCache:', App.ProfileCache);
        console.debug('[DEBUG] App.CurrentProfile:', App.CurrentProfile);
        if (App.ProfileCache[key]) {
            const hasDomContainer = !!document.querySelector('.table-scroll-container');
            if (hasDomContainer) {
                console.debug('[DEBUG] Profile found in cache with existing DOM, switching profile', key);
                // Ensure cached state carries token
                if (App.ProfileCache[key].state) App.ProfileCache[key].state._switchToken = switchToken;
                this.switchProfile(key, payload);
                // Ensure itinerary hydration happens after the DOM has been reactivated/switch applied.
                try {
                    this.recacheItineraries(payload).then(r => {
                        try {
                            if (typeof requestAnimationFrame === 'function') {
                                requestAnimationFrame(() => requestAnimationFrame(() => { try { this.updateItineraries(r); } catch(e){} }));
                            } else {
                                setTimeout(() => { try { this.updateItineraries(r); } catch(e){} }, 50);
                            }
                        } catch(e) { /* ignore */ }
                    }).catch(()=>{});
                } catch(e) { /* ignore */ }
                console.debug('[DEBUG] loadProfile EXIT after switchProfile', { key });
            } else {
                console.debug('[DEBUG] Profile found in cache but no active DOM; rebuilding from cached state', key);
                const cachedState = App.ProfileCache[key].state || {};
                // Ensure token set
                cachedState._switchToken = switchToken;
                try {
                    this.rebuildProfileView(key, cachedState, payload, switchToken);
                    // After rebuilding the DOM from cached state, hydrate itineraries and apply links.
                    try {
                        this.recacheItineraries(payload).then(r => {
                            try {
                                if (typeof requestAnimationFrame === 'function') {
                                    requestAnimationFrame(() => requestAnimationFrame(() => { try { this.updateItineraries(r); } catch(e){} }));
                                } else {
                                    setTimeout(() => { try { this.updateItineraries(r); } catch(e){} }, 50);
                                }
                            } catch(e) { /* ignore */ }
                        }).catch(()=>{});
                    } catch(e) { /* ignore */ }
                    console.debug('[DEBUG] loadProfile EXIT after rebuildProfileView (from cache)', { key });
                } catch(rebErr) {
                    console.error('[DEBUG] rebuild from cache failed, falling back to full build', rebErr);
                    // Fallback to fresh build path below
                }
            }
            return;
        }
        console.debug('[DEBUG] Building new profile for key', key);
        let preparedData;
        try {
            preparedData = this.prepareOfferData(payload.data);
            // Defer itinerary hydration until after the table DOM has been rendered to avoid
            // a race where updateItineraries cannot find destination TDs by ID.
            // We'll trigger hydration after updateView so links are created only when rows exist.
            // (hydration invocation moved to post-render locations below)
            console.debug('[DEBUG] prepareOfferData result:', preparedData);
        } catch (e) {
            console.error('[DEBUG] Error in prepareOfferData', e, payload);
            preparedData = {};
        }
        // Build new profile content
        const state = {
            headers: [
                { key: 'favorite', label: '\u2605' },
                { key: 'b2bDepth', label: 'B2B' },
                { key: 'offerCode', label: 'Code' },
                { key: 'offerDate', label: 'Rcvd' },
                { key: 'expiration', label: 'Expires' },
                { key: 'tradeInValue', label: 'Trade' },
                { key: 'offerValue', label: 'Value' },
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
            advancedSearch: { enabled:false, predicates: [] },
            ...preparedData
        };
        // Load persisted preference for Hide TIER
        try {
            const savedPref = (typeof goboStorageGet === 'function' ? goboStorageGet('goboHideTier') : localStorage.getItem('goboHideTier'));
            console.debug('[DEBUG] gobo storage goboHideTier:', savedPref);
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
            Spinner.showSpinner();
            setTimeout(() => {
                try {
                    this.updateView(state);
                } finally {
                    try { Spinner.hideSpinner(); } catch(e) { /* ignore */ }
                }
            }, 0);
        };
        state.thead = App.TableBuilder.createTableHeader(state);
        state.table = App.TableBuilder.createMainTable();
        state.tbody = document.createElement('tbody');
        console.debug('[DEBUG] New profile state built', state);
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
        console.debug('[DEBUG] currentScroll:', currentScroll);
        if (currentScroll && App.CurrentProfile && App.CurrentProfile.key) {
            App.ProfileCache[App.CurrentProfile.key] = {
                scrollContainer: currentScroll,
                state: App.TableRenderer.lastState
            };
            console.debug('[DEBUG] Cached current profile', App.CurrentProfile.key);
        }
        // Replace scrollContainer
        if (currentScroll) {
            currentScroll.replaceWith(scrollContainer);
            console.debug('[DEBUG] Replaced scrollContainer in DOM');
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
        console.debug('[DEBUG] Cached new profile', key);
        console.debug('[DEBUG] Updated App.TableRenderer.lastState and App.CurrentProfile', App.TableRenderer.lastState, App.CurrentProfile);
        // Render the view
        console.debug('[DEBUG] Calling updateView with state');
        this.updateView(state);
        // After rendering the table, hydrate itineraries and apply links. Use requestAnimationFrame
        // to ensure the browser has painted the newly inserted rows so document.getElementById() can find them.
        try {
            this.recacheItineraries(payload).then(r => {
                try {
                    if (typeof requestAnimationFrame === 'function') {
                        requestAnimationFrame(() => requestAnimationFrame(() => { try { this.updateItineraries(r); } catch(e){} }));
                    } else {
                        // Fallback to a short timeout
                        setTimeout(() => { try { this.updateItineraries(r); } catch(e){} }, 50);
                    }
                } catch(e) { /* ignore scheduling errors */ }
            }).catch(() => {/* ignore hydration errors */});
        } catch(e) { /* ignore */ }
        // Final highlight guard
        if (this.currentSwitchToken === switchToken) this._applyActiveTabHighlight(key);
        console.debug('[DEBUG] loadProfile EXIT after updateView', { key });
    },
    prepareOfferData(data) {
        let originalOffers = [];
        let sortedOffers = [];
        if (data && data.offers && data.offers.length > 0) {
            try {
                if (window && window.console && window.console.debug) {
                    const totalSailings = data.offers.reduce((acc,o)=>acc + (o.campaignOffer && Array.isArray(o.campaignOffer.sailings) ? o.campaignOffer.sailings.length : 0), 0);
                    console.debug('[tableRenderer] prepareOfferData incoming payload', { offers: data.offers.length, sailings: totalSailings });
                }
            } catch(e){}
        }
        if (data && data.offers && data.offers.length > 0) {
            data.offers.forEach(offer => {
                if (offer.campaignOffer && offer.campaignOffer.sailings) {
                    offer.campaignOffer.sailings.forEach(sailing => {
                        originalOffers.push({ offer, sailing });
                    });
                }
            });
            sortedOffers = [...originalOffers];
            try {
                if (window && window.console && window.console.debug) {
                    console.debug('[tableRenderer] prepareOfferData produced originalOffers', { count: originalOffers.length, last: originalOffers[originalOffers.length-1] });
                }
            } catch(e){}
        }
        return { originalOffers, sortedOffers };
    },
    async displayTable(data, selectedProfileKey, overlappingElements) {
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
                // Attach a savedAt timestamp so cached DOM age can be compared against fresh data
                this.loadProfile(selectedProfileKey, { data, savedAt: Date.now() });
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
                    { key: 'favorite', label: (selectedProfileKey === 'goob-favorites' ? 'ID' : '\u2605') },
                    { key: 'b2bDepth', label: 'B2B' },
                    { key: 'offerCode', label: 'Code' },
                    { key: 'offerDate', label: 'Rcvd' },
                    { key: 'expiration', label: 'Expires' },
                    { key: 'tradeInValue', label: 'Trade' },
                    { key: 'offerValue', label: 'Value' },
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
                advancedSearch: { enabled:false, predicates: [] },
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
                // Show spinner immediately, then allow browser to repaint before heavy work
                if (typeof Spinner !== 'undefined' && Spinner.showSpinner) {
                    Spinner.showSpinner();
                    setTimeout(() => {
                        try {
                            this.updateView(state);
                        } finally {
                            try { Spinner.hideSpinner && Spinner.hideSpinner(); } catch(e) { /* ignore */ }
                        }
                    }, 0);
                } else {
                    this.updateView(state);
                }
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
            // Include savedAt to mark this payload as fresh compared to any cached DOM
            this.loadProfile(state.selectedProfileKey, { data, savedAt: Date.now() });
        } catch (error) {
            console.error('Failed to display table:', error.message);
            App.ErrorHandler.showError('Failed to display table. Please try again.');
            document.body.style.overflow = '';
            const existingBackdrop = document.getElementById('gobo-backdrop');
            if (existingBackdrop) existingBackdrop.remove();
        }
    },
    rebuildProfileView(key, existingState, payload, switchToken) {
        console.debug('[tableRenderer] rebuildProfileView ENTRY', { key, hasExistingState: !!existingState, payloadProvided: !!payload, switchToken });
        const baseState = existingState || {};
        // Ensure headers include favorite column AND newly added offerValue after tradeInValue
        try {
            if (!baseState.headers) baseState.headers = [];
            const hasFav = baseState.headers.some(h => h.key === 'favorite');
            if (!hasFav) {
                baseState.headers = [ { key: 'favorite', label: '\u2605' }, ...baseState.headers ];
            }
            const hasOfferValue = baseState.headers.some(h => h.key === 'offerValue');
            if (!hasOfferValue) {
                const tradeIdx = baseState.headers.findIndex(h => h.key === 'tradeInValue');
                if (tradeIdx !== -1) baseState.headers.splice(tradeIdx + 1, 0, { key: 'offerValue', label: 'Value' });
                else {
                    // Fallback: append near offerName if tradeInValue missing (legacy state)
                    const offerNameIdx = baseState.headers.findIndex(h => h.key === 'offerName');

                    if (offerNameIdx !== -1) baseState.headers.splice(offerNameIdx, 0, { key: 'offerValue', label: 'Value' });
                    else baseState.headers.push({ key: 'offerValue', label: 'Value' });
                }
            }
        } catch(e) { /* ignore header repair errors */ }
        const state = { ...baseState, selectedProfileKey: key, _switchToken: switchToken || baseState._switchToken, profileId: App.ProfileIdMap ? App.ProfileIdMap[key] : null };
        if (!state.advancedSearch) state.advancedSearch = { enabled:false, predicates: [] };
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
            // Show spinner immediately, then allow browser to repaint before heavy work
            if (typeof Spinner !== 'undefined' && Spinner.showSpinner) {
                Spinner.showSpinner();
                setTimeout(() => {
                    try {
                        this.updateView(state);
                    } finally {
                        try { Spinner.hideSpinner && Spinner.hideSpinner(); } catch(e) { /* ignore */ }
                    }
                }, 0);
            } else {
                this.updateView(state);
            }
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
        console.debug('[DEBUG][tableRenderer] updateView ENTRY', state);
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
        const filteredSet = new Set(Array.isArray(filtered) ? filtered : []);
        const allowRowForDepth = (row) => {
            if (!row) return false;
            if (filteredSet.size && !filteredSet.has(row)) return false;
            if (window.Filtering) {
                try {
                    if (typeof Filtering.wasRowHidden === 'function') return !Filtering.wasRowHidden(row, state);
                    if (typeof Filtering.isRowHidden === 'function') return !Filtering.isRowHidden(row, state);
                } catch (e) {
                    return filteredSet.has(row);
                }
            }
            return true;
        };
        const { table, accordionContainer, currentSortOrder, currentSortColumn, viewMode, groupSortStates, thead, tbody, headers } = state;
        const allowSideBySidePref = (typeof this.getSideBySidePreference === 'function') ? this.getSideBySidePreference() : true;
        if (window.BackToBackTool && typeof BackToBackTool.registerEnvironment === 'function') {
            try {
                // Exclude hidden groups from B2B context — hidden groups should not be visible to B2B
                const baseRows = Array.isArray(state.fullOriginalOffers) && state.fullOriginalOffers.length ? state.fullOriginalOffers : state.sortedOffers || [];
                const rowIsHidden = (row) => {
                    try {
                        if (!window.Filtering) return false;
                        if (typeof Filtering.wasRowHidden === 'function') return Filtering.wasRowHidden(row, state);
                        if (typeof Filtering.isRowHidden === 'function') return Filtering.isRowHidden(row, state);
                    } catch (predErr) { return false; }
                    return false;
                };
                const contextRows = Array.isArray(baseRows) ? baseRows.filter(r => !rowIsHidden(r)) : baseRows;
                try {
                    if (typeof window !== 'undefined' && window.GOBO_DEBUG_ENABLED) {
                        try {
                            const sampleCode = (r) => (r && r.offer && r.offer.campaignOffer && r.offer.campaignOffer.offerCode) ? String(r.offer.campaignOffer.offerCode).trim().toUpperCase() : '';
                            const baseHas25 = Array.isArray(baseRows) && baseRows.some(r => sampleCode(r) === '25TIER3');
                            const ctxHas25 = Array.isArray(contextRows) && contextRows.some(r => sampleCode(r) === '25TIER3');
                            console.debug('[B2B][REG] registerEnvironment rows:', { baseRows: baseRows.length, contextRows: contextRows.length, baseHas25, ctxHas25, hiddenGroups: (Filtering && typeof Filtering.loadHiddenGroups === 'function') ? Filtering.loadHiddenGroups() : null });
                        } catch(innerDbg) { /* ignore debug errors */ }
                    }
                } catch(e) { /* ignore */ }
                BackToBackTool.registerEnvironment({
                    rows: contextRows,
                    allowSideBySide: allowSideBySidePref,
                    stateKey: state.selectedProfileKey || null,
                    _state: state
                });
            } catch (contextErr) {
                console.debug('[tableRenderer] Unable to register BackToBackTool context', contextErr);
            }
        }
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
        if (currentSortColumn === 'b2bDepth') {
            try {
                this._ensureRowsHaveB2BDepth(filtered, { allowSideBySide: allowSideBySidePref, filterPredicate: allowRowForDepth });
            } catch (depthErr) {
                console.warn('[tableRenderer] Unable to prime B2B depths prior to sorting', depthErr);
            }
        }
        // Optimized sorting: reuse a master sorted list for the full set, then filter it to maintain order.
    const sortKey = currentSortColumn + '|' + currentSortOrder;
        if (currentSortOrder !== 'original') {
            try {
                if (!state._globalSortedCache) state._globalSortedCache = {};
                const fullLen = state.fullOriginalOffers.length;
                const masterCacheKey = sortKey + '|' + fullLen;
                if (!state._globalSortedCache[masterCacheKey]) {
                    // Compute and cache master sorted list only once per profile length + sort key.
                    state._globalSortedCache[masterCacheKey] = App.SortUtils.sortOffers([...state.fullOriginalOffers], currentSortColumn, currentSortOrder);
                }
                const membership = new Set(filtered);
                state.sortedOffers = state._globalSortedCache[masterCacheKey].filter(w => membership.has(w));
            } catch(e) {
                // Fallback to original behavior if cache path fails
                state.sortedOffers = App.SortUtils.sortOffers(filtered, currentSortColumn, currentSortOrder);
            }
        } else {
            state.sortedOffers = [...filtered];
        }
        if (viewMode === 'table') {
            App.TableBuilder.renderTable(tbody, state, globalMaxOfferDate);
            try {
                this._ensureRowsHaveB2BDepth(state.sortedOffers, {
                    allowSideBySide: allowSideBySidePref,
                    filterPredicate: allowRowForDepth
                });
                const rows = tbody.querySelectorAll('tr');
                rows.forEach((tr, idx) => {
                    const pair = state.sortedOffers[idx];
                    if (!pair) return;
                    const depth = (pair.sailing && typeof pair.sailing.__b2bDepth === 'number') ? pair.sailing.__b2bDepth : 1;
                    const cell = tr.querySelector('.b2b-depth-cell');
                    if (!cell) return;
                    if (typeof this.updateB2BDepthCell === 'function') this.updateB2BDepthCell(cell, depth);
                    else cell.textContent = String(depth);
                    try {
                        if (window.BackToBackTool && typeof BackToBackTool.attachToCell === 'function') {
                            BackToBackTool.attachToCell(cell, pair);
                        }
                    } catch (attachErr) {
                        console.debug('[tableRenderer] Unable to attach BackToBackTool trigger', attachErr);
                    }
                });
                console.debug('[B2B] Depth computation complete', { rows: rows.length });
            } catch(e) { /* ignore B2B calculation errors so table still renders */ }
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
            // Ensure B2B depths exist before rendering accordion (first time grouping or direct switch)
            try {
                this._ensureRowsHaveB2BDepth(state.sortedOffers, { allowSideBySide: allowSideBySidePref, filterPredicate: allowRowForDepth });
            } catch(e){ /* ignore depth precompute errors */ }
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
        // Replace internal call with external module
        if (!state._skipBreadcrumb) {
            Breadcrumbs.updateBreadcrumb(state.groupingStack, state.groupKeysStack);
        } else {
            try { delete state._skipBreadcrumb; } catch(e){}
        }
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
        console.debug('[DEBUG][tableRenderer] updateView EXIT');
    },
    // Removed updateBreadcrumb; logic moved to features/breadcrumbs.js
    updateItineraries(hydrated) {
        // hydrated is expected to be the full itinerary map returned from recacheItineraries (a snapshot of ItineraryCache.all()).
        // Fallback: if an array or falsy value is provided, re-fetch the current map.
        try {
            let map = {};
            if (hydrated && !Array.isArray(hydrated) && typeof hydrated === 'object') {
                map = hydrated;
            } else if (typeof ItineraryCache !== 'undefined' && ItineraryCache && typeof ItineraryCache.all === 'function') {
                map = ItineraryCache.all();
            }
            Object.entries(map).forEach(([key, value]) => {
                try {
                    const el = document.getElementById(key);
                    if (!el) return;
                    const existingLink = el.querySelector && el.querySelector('a.gobo-itinerary-link');
                    if (existingLink) {
                        existingLink.classList.add('gobo-itinerary-link');
                        return; // already processed
                    }
                    const currentText = (el.textContent || '').trim() || value.itineraryDescription || key;
                    el.innerHTML = '';
                    const a = document.createElement('a');
                    a.href = '#';
                    a.className = 'gobo-itinerary-link';
                    a.dataset.itineraryKey = key;
                    a.textContent = currentText;
                    a.addEventListener('click', (ev) => {
                        ev.preventDefault();
                        try { if (ItineraryCache && typeof ItineraryCache.showModal === 'function') ItineraryCache.showModal(key, a); } catch(e) { /* ignore */ }
                    });
                    el.appendChild(a);
                } catch(inner) { /* ignore single element errors */ }
            });
        } catch(e) { /* ignore overall errors */ }
    }
};
// Backward-compatible shim so existing callers (other modules) still work
if (typeof TableRenderer.updateBreadcrumb !== 'function') {
    TableRenderer.updateBreadcrumb = function(groupingStack, groupKeysStack) {
        try { Breadcrumbs.updateBreadcrumb(groupingStack, groupKeysStack); } catch(e) { console.warn('[shim] Breadcrumbs.updateBreadcrumb failed', e); }
    };
}
