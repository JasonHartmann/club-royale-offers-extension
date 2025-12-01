// Breadcrumbs / Tabs / Hidden Groups rendering module (Advanced Search extracted to advancedSearch.js)
// Responsible for rebuilding the breadcrumb container (tabs row + crumbs row + auxiliary panels).

const Breadcrumbs = {
    updateBreadcrumb(groupingStack, groupKeysStack) {
        // Guard against infinite recursion triggered by ID map writes
        if (window.__breadcrumbRendering) return; // simple reentrancy guard
        window.__breadcrumbRendering = true;
        try {
            console.debug('[DEBUG][breadcrumbs] updateBreadcrumb ENTRY', {groupingStack, groupKeysStack});
            // Skip reacting to internal ID map persistence events to break loop
            if (window.__lastStorageEventKey && /goboProfileId(Map|FreeIds|Next)_v1/.test(window.__lastStorageEventKey)) {
                // If the ProfileIdManager itself initiated the persist, allow the breadcrumb refresh
                if (typeof window.__profileIdPersistInProgress === 'undefined' || !window.__profileIdPersistInProgress) {
                    console.debug('[breadcrumbs] Skipping breadcrumb refresh for ID map key', window.__lastStorageEventKey);
                    window.__breadcrumbRendering = false;
                    return;
                }
            }
            if (typeof GoboStore !== 'undefined' && GoboStore && !GoboStore.ready) {
                console.debug('[breadcrumbs] GoboStore not ready; deferring breadcrumb render until goboStorageReady');
                const retry = () => {
                    try {
                        Breadcrumbs.updateBreadcrumb(groupingStack, groupKeysStack);
                    } catch (e) {/* ignore */
                    }
                };
                document.addEventListener('goboStorageReady', retry, {once: true});
                return;
            }
            const state = App.TableRenderer.lastState;
            if (!state) return;
            const container = document.querySelector('.breadcrumb-container');
            if (!container) return;
            container.innerHTML = '';
            const tabsRow = document.createElement('div');
            tabsRow.className = 'breadcrumb-tabs-row';
            tabsRow.style.cssText = 'display:block; margin-bottom:8px; overflow:hidden;';
            const crumbsRow = document.createElement('div');
            crumbsRow.className = 'breadcrumb-crumb-row';
            crumbsRow.style.cssText = 'display:flex; align-items:center; gap:8px; flex-wrap:wrap;';
            container.appendChild(tabsRow);
            container.appendChild(crumbsRow);

            // Build tabs (unchanged)
            try {
                const profiles = [];
                try {
                    if (window.Favorites && Favorites.ensureProfileExists) Favorites.ensureProfileExists();
                } catch (e) {/* ignore */
                }
                let profileKeys = [];
                try {
                    if (typeof GoboStore !== 'undefined' && GoboStore && typeof GoboStore.getAllProfileKeys === 'function') profileKeys = GoboStore.getAllProfileKeys();
                    else {
                        for (let i = 0; i < localStorage.length; i++) {
                            const k = localStorage.key(i);
                            if (k && k.startsWith('gobo-')) profileKeys.push(k);
                        }
                    }
                } catch (e) {/* ignore */ }
                profileKeys = Array.from(new Set(profileKeys));
                const brandedPattern = /^gobo-[A-Za-z]-/;
                // Migrate legacy unbranded keys (gobo-<username>) to branded keys (gobo-<brand>-<username>)
                const migrated = new Set();
                const outputKeys = [];
                for (let i = 0; i < profileKeys.length; i++) {
                    const k = profileKeys[i];
                    if (!k) continue;
                    if (k === 'goob-favorites' || k === 'goob-combined-linked') {
                        outputKeys.push(k);
                        continue;
                    }
                    if (brandedPattern.test(k)) {
                        outputKeys.push(k);
                        continue;
                    }
                    // Legacy unbranded key starting with gobo-
                    if (k.startsWith('gobo-')) {
                        try {
                            const username = k.replace(/^gobo-/, '');
                            // Try to read existing payload to preserve brand if present
                            let raw = null;
                            try { raw = (typeof goboStorageGet === 'function') ? goboStorageGet(k) : localStorage.getItem(k); } catch(e) { raw = null; }
                            let payload = null;
                            try { payload = raw ? JSON.parse(raw) : null; } catch(e) { payload = null; }
                            const detectedBrand = (payload && payload.brand) ? payload.brand : ((typeof App !== 'undefined' && App.Utils && typeof App.Utils.detectBrand === 'function') ? App.Utils.detectBrand() : 'R');
                            const brandedKey = `gobo-${detectedBrand}-${username}`;
                            // If branded key does not already exist, migrate the legacy data
                            if (!profileKeys.includes(brandedKey) && !migrated.has(brandedKey)) {
                                try {
                                    const newPayload = payload ? { ...payload, brand: detectedBrand } : null;
                                    if (newPayload) {
                                        if (typeof goboStorageSet === 'function') goboStorageSet(brandedKey, JSON.stringify(newPayload)); else localStorage.setItem(brandedKey, JSON.stringify(newPayload));
                                    } else {
                                        // If no payload, just attempt to copy raw string
                                        const rawStr = raw || (typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null);
                                        if (rawStr) {
                                            if (typeof goboStorageSet === 'function') goboStorageSet(brandedKey, rawStr); else localStorage.setItem(brandedKey, rawStr);
                                        }
                                    }
                                    // Remove legacy key to avoid duplicates
                                    try { if (typeof goboStorageRemove === 'function') goboStorageRemove(k); else localStorage.removeItem(k); } catch(e) {}
                                    // Preserve Profile ID mapping when present: move legacy ID to branded key
                                    try {
                                        if (typeof ProfileIdManager !== 'undefined' && ProfileIdManager) {
                                            try {
                                                var legacyId = ProfileIdManager.getId(k);
                                                if (legacyId != null) {
                                                    try { ProfileIdManager.transferId(k, brandedKey); } catch(eTrans) { /* ignore */ }
                                                    try { App.ProfileIdMap = { ...ProfileIdManager.map }; } catch(eMap) { /* ignore */ }
                                                }
                                            } catch(eId) { /* ignore id migration errors */ }
                                        }
                                    } catch(e) { /* ignore */ }
                                    migrated.add(brandedKey);
                                    outputKeys.push(brandedKey);
                                    continue;
                                } catch (mErr) {
                                    // If migration fails, fall back to ignoring legacy key
                                }
                            } else {
                                // Branded key already exists elsewhere; drop legacy
                                try { if (typeof goboStorageRemove === 'function') goboStorageRemove(k); else localStorage.removeItem(k); } catch(e) {}
                                continue;
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                }
                profileKeys = outputKeys;
                try {
                    if (typeof ProfileIdManager !== 'undefined' && ProfileIdManager) {
                        // Re-hydrate the ID map from storage to ensure UI badges reflect persisted IDs
                        try { if (typeof ProfileIdManager._hydrate === 'function') ProfileIdManager._hydrate(); } catch(e) { /* ignore */ }
                        const goboKeys = profileKeys.filter((k, i, arr) => /^gobo-[A-Za-z]-/.test(k) && arr.indexOf(k) === i);
                        if (goboKeys.length) {
                            console.debug('[breadcrumbs] assignMissingIds called for', goboKeys);
                            ProfileIdManager.assignMissingIds(goboKeys);
                            console.debug('[breadcrumbs] assignMissingIds completed for', goboKeys, 'map snapshot:', ProfileIdManager.map);
                        }
                        App.ProfileIdMap = { ...ProfileIdManager.map };
                    }
                } catch (e) { /* ignore */ }
                // Include favorites profile if stored
                try {
                    const favRaw = (typeof goboStorageGet === 'function' ? goboStorageGet('goob-favorites') : localStorage.getItem('goob-favorites'));
                    if (favRaw && !profileKeys.includes('goob-favorites')) profileKeys.push('goob-favorites');
                } catch(e){ /* ignore favorites detection errors */ }
                profileKeys.forEach(k => {
                    try {
                        const rawStored = (typeof goboStorageGet === 'function' ? goboStorageGet(k) : localStorage.getItem(k));
                        const payload = rawStored ? JSON.parse(rawStored) : null;
                        if (payload && payload.data && payload.savedAt) {
                            // ID assignment is handled in batch earlier to avoid reentrancy; do not assign here.
                            let label;
                            let brand = null;
                            if (k === 'goob-favorites') {
                                label = 'Favorites';
                            } else {
                                // Hide branded prefix in label: gobo-R-username -> username
                                const userKey = k.replace(/^gobo-[A-Za-z]-/, '').replace(/^gobo-/, '');
                                // Convert underscores back to '@' like previous logic (best-effort email reconstruction)
                                label = userKey.replace(/_/g, '@');
                                const m = k.match(/^gobo-([A-Za-z])-?/);
                                if (m) brand = m[1];
                            }
                            profiles.push({
                                key: k,
                                label,
                                brand,
                                savedAt: k === 'goob-favorites' ? null : payload.savedAt
                            });
                        }
                    } catch (e) {/* ignore */ }
                });
                if (profiles.length) {
                            try {
                                if (typeof ProfileIdManager !== 'undefined' && ProfileIdManager) {
                                    console.debug('[breadcrumbs] assignMissingIds called for profiles', profiles.map(p=>p.key));
                                    ProfileIdManager.assignMissingIds(profiles.filter(p => /^gobo-[A-Za-z]-/.test(p.key)).map(p => p.key));
                                    console.debug('[breadcrumbs] assignMissingIds completed for profiles');
                                    App.ProfileIdMap = {...ProfileIdManager.map};
                                }
                            } catch (e) {/* ignore */
                            }
                    let currentKey = null;
                    try {
                        const raw = localStorage.getItem('persist:session');
                        if (raw) {
                            const parsed = JSON.parse(raw);
                            const user = parsed.user ? JSON.parse(parsed.user) : null;
                            if (user) {
                                const rawKey = String(user.username || user.userName || user.email || user.name || user.accountId || '');
                                const usernameKey = rawKey.replace(/[^a-zA-Z0-9-_.]/g, '_');
                                // Prefer branded key if present: gobo-<brand>-<username>
                                const brand = (typeof App !== 'undefined' && App.Utils && typeof App.Utils.detectBrand === 'function') ? App.Utils.detectBrand() : 'R';
                                const brandedCandidate = `gobo-${brand}-${usernameKey}`;
                                if (profileKeys.includes(brandedCandidate)) currentKey = brandedCandidate;
                                else {
                                    const legacyCandidate = `gobo-${usernameKey}`;
                                    if (profileKeys.includes(legacyCandidate)) currentKey = legacyCandidate;
                                }
                            }
                        }
                    } catch (e) {/* ignore */}
                    profiles.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
                    let favoritesEntry = null;
                    const favIdx = profiles.findIndex(p => p.key === 'goob-favorites');
                    if (favIdx !== -1) favoritesEntry = profiles.splice(favIdx, 1)[0];
                    if (currentKey) {
                        const idx = profiles.findIndex(p => p.key === currentKey);
                        if (idx > 0) profiles.unshift(profiles.splice(idx, 1)[0]);
                    }
                    try {
                        const linked = getLinkedAccounts();
                        profiles.push({
                            key: 'goob-combined-linked',
                            label: 'Combined Offers',
                            isCombined: true,
                            linkedEmails: linked.map(acc => acc.email)
                        });
                    } catch (e) {/* ignore */
                    }
                    if (favoritesEntry) profiles.push(favoritesEntry);
                    const tabs = document.createElement('div');
                    tabs.className = 'profile-tabs';
                    const tabsScroll = document.createElement('div');
                    tabsScroll.className = 'profile-tabs-scroll';
                    // Do not force overflow via inline styles; allow CSS and the outer .table-scroll-container to control scrolling
                    tabsScroll.style.cssText = 'overflow-x:visible; width:100%; -webkit-overflow-scrolling:touch;';
                    tabs.style.cssText = 'display:inline-flex; flex-direction:row; gap:8px; flex-wrap:nowrap;';
                    let activeKey = (App.CurrentProfile && App.CurrentProfile.key) ? App.CurrentProfile.key : state.selectedProfileKey;
                    if (TableRenderer._initialOpenPending && !TableRenderer.hasSelectedDefaultTab && profiles.length) {
                        activeKey = profiles[0].key;
                        state.selectedProfileKey = activeKey;
                        TableRenderer.hasSelectedDefaultTab = true;
                        TableRenderer._initialOpenPending = false;
                    }
                    const profileKeysArr = profiles.map(p => p.key);
                    if (!profileKeysArr.includes(activeKey)) activeKey = profileKeysArr.includes(state.selectedProfileKey) ? state.selectedProfileKey : (profileKeysArr[0] || null);
                    state.selectedProfileKey = activeKey;
                    TableRenderer.TabKeyMap = {};
                    profiles.forEach((p, idx) => {
                        const storageKey = p.key;
                        if (!TableRenderer.TabKeyMap[storageKey]) TableRenderer.TabKeyMap[storageKey] = {count: 0}; else TableRenderer.TabKeyMap[storageKey].count++;
                        const domKey = TableRenderer.TabKeyMap[storageKey].count === 0 ? storageKey : `${storageKey}#${TableRenderer.TabKeyMap[storageKey].count}`;
                        const btn = document.createElement('button');
                        btn.className = 'profile-tab';
                        btn.setAttribute('data-key', domKey);
                        btn.setAttribute('data-storage-key', storageKey);
                        let loyaltyId = null;
                        let brand = p.brand || null;
                        try {
                            const storedRaw = (typeof goboStorageGet === 'function' ? goboStorageGet(storageKey) : localStorage.getItem(storageKey));
                            if (storedRaw) {
                                const storedPayload = JSON.parse(storedRaw);
                                loyaltyId = storedPayload?.data?.loyaltyId || null;
                            }
                        } catch (e) {/* ignore */
                        }
                        let labelDiv = document.createElement('div');
                        labelDiv.className = 'profile-tab-label';
                        labelDiv.textContent = p.label || storageKey;
                        if (storageKey === 'goob-favorites') {
                            labelDiv.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;line-height:1.05;">' +
                                '<span style="font-weight:600;">Favorites</span>' +
                                '<span aria-hidden="true" style="color:#f5c518;font-size:27px;margin-top:2px;">\u2605</span>' +
                                '</div>';
                        } else if (storageKey === 'goob-combined-linked') {
                            const wrapper = document.createElement('div');
                            wrapper.style.display = 'flex';
                            wrapper.style.alignItems = 'center';
                            let badgeText = 'C';
                            let badgeClass = 'profile-id-badge-combined';
                            try {
                                const linked = getLinkedAccounts();
                                if (linked.length >= 2) {
                                    // Ensure ProfileIdMap has IDs for normalized keys
                                    const ids = linked.slice(0, 2).map(acc => {
                                        const k = acc.key;
                                        return (App.ProfileIdMap && App.ProfileIdMap[k]) || (ProfileIdManager && ProfileIdManager.map && ProfileIdManager.map[k]) || '?';
                                    });
                                    // If any missing IDs, attempt to ensure
                                    if (ids.some(id => id === '?')) {
                                        try { if (typeof ProfileIdManager !== 'undefined' && ProfileIdManager) { ProfileIdManager.assignMissingIds(linked.slice(0,2).map(acc=>acc.key)); App.ProfileIdMap = { ...ProfileIdManager.map }; } } catch(eEns) { /* ignore */ }
                                        for (let i=0;i<ids.length;i++) if (ids[i] === '?') ids[i] = (App.ProfileIdMap && App.ProfileIdMap[linked[i].key]) || '?';
                                    }
                                    badgeText = `${ids[0]}+${ids[1]}`;
                                    const sum = (Number(ids[0])||0) + (Number(ids[1])||0);
                                    if (!isNaN(sum) && sum>0) badgeClass += ` profile-id-badge-combined-${sum}`;
                                }
                            } catch (e) { /* ignore */ }
                            const badge = document.createElement('span');
                            badge.className = badgeClass;
                            badge.textContent = badgeText;
                            badge.style.marginRight = '6px';
                            wrapper.appendChild(badge);
                            wrapper.appendChild(labelDiv);
                            labelDiv = wrapper;
                        }
                        try {
                            if (/^gobo-/.test(storageKey)) {
                                const pid = App.ProfileIdMap ? App.ProfileIdMap[storageKey] : null;
                                const wrapper = document.createElement('div');
                                wrapper.style.display = 'flex';
                                wrapper.style.alignItems = 'center';
                                if (pid) {
                                    const badge = document.createElement('span');
                                    badge.className = `profile-id-badge profile-id-badge-${pid}`;
                                    badge.textContent = pid;
                                    badge.style.marginRight = '6px';
                                    wrapper.appendChild(badge);
                                }
                                // Add brand badge (R or C) if brand present
                                if (brand) {
                                    const b = String(brand || '').toUpperCase();
                                    const brandBadge = document.createElement('span');
                                    brandBadge.className = `profile-brand-badge profile-brand-badge--${b === 'R' ? 'royal' : (b === 'C' ? 'celebrity' : b.toLowerCase())}`;
                                    brandBadge.style.marginRight = '6px';
                                    brandBadge.title = `Brand: ${b}`;
                                    try {
                                        if (b === 'R') {
                                            const img = document.createElement('img');
                                            img.src = getAssetUrl('images/royal-16.png');
                                            img.width = 16;
                                            img.height = 16;
                                            img.alt = 'Royal';
                                            brandBadge.appendChild(img);
                                        } else if (b === 'C') {
                                            // Celebrity: bold sans-serif X on white background
                                            const xSpan = document.createElement('span');
                                            xSpan.className = 'celebrity-x';
                                            xSpan.textContent = 'X';
                                            brandBadge.appendChild(xSpan);
                                            brandBadge.setAttribute('aria-label', 'Celebrity');
                                        } else {
                                            brandBadge.textContent = b;
                                        }
                                    } catch (err) {
                                        brandBadge.textContent = b;
                                    }
                                    wrapper.appendChild(brandBadge);
                                }
                                wrapper.appendChild(labelDiv);
                                labelDiv = wrapper;
                            }
                        } catch (e) {/* ignore */ }
                        const loyaltyDiv = document.createElement('div');
                        loyaltyDiv.className = 'profile-tab-loyalty';
                        loyaltyDiv.textContent = loyaltyId ? `${loyaltyId}` : '';
                        let refreshedDiv = null;
                        if (p.savedAt) {
                            refreshedDiv = document.createElement('div');
                            refreshedDiv.className = 'profile-tab-refreshed';
                            refreshedDiv.textContent = `Last Refreshed: ${formatTimeAgo(p.savedAt)}`;
                            try {
                                btn.title = new Date(p.savedAt).toLocaleString();
                            } catch (e) {
                            }
                        }
                        const labelContainer = document.createElement('div');
                        labelContainer.className = 'profile-tab-label-container';
                        labelContainer.appendChild(labelDiv);
                        labelContainer.appendChild(loyaltyDiv);
                        if (refreshedDiv) labelContainer.appendChild(refreshedDiv);
                        btn.innerHTML = '';
                        btn.appendChild(labelContainer);
                        if (!p.isCombined && storageKey !== 'goob-favorites') {
                            const iconContainer = document.createElement('div');
                            iconContainer.style.display = 'flex';
                            iconContainer.style.flexDirection = 'column';
                            iconContainer.style.alignItems = 'center';
                            iconContainer.style.gap = '2px';
                            iconContainer.style.marginLeft = '4px';
                            const linkIcon = document.createElement('span');
                            const isLinked = getLinkedAccounts().some(acc => acc.key === storageKey);
                            linkIcon.innerHTML = isLinked ? `<img src="${getAssetUrl('images/link.png')}" width="16" height="16" alt="Linked" style="vertical-align:middle;" />` : `<img src="${getAssetUrl('images/link_off.png')}" width="16" height="16" alt="Unlinked" style="vertical-align:middle;" />`;
                            linkIcon.style.cursor = 'pointer';
                            linkIcon.title = isLinked ? 'Unlink account' : 'Link account';
                            linkIcon.style.marginBottom = '2px';
                            linkIcon.addEventListener('click', (e) => {
                                e.stopPropagation();
                                const linkKey = storageKey;
                                let updated = getLinkedAccounts().slice();
                                const seen = new Set();
                                updated = updated.filter(acc => { if (!acc || !acc.key) return false; if (seen.has(acc.key)) return false; seen.add(acc.key); return true; });
                                const currentlyLinked = updated.some(acc => acc.key === linkKey);
                                if (currentlyLinked) {
                                    updated = updated.filter(acc => acc.key !== linkKey);
                                    if (updated.length < 2) {
                                        try {
                                            if (typeof goboStorageRemove === 'function') goboStorageRemove('goob-combined'); else localStorage.removeItem('goob-combined');
                                            if (App.ProfileCache && App.ProfileCache['goob-combined-linked']) delete App.ProfileCache['goob-combined-linked'];
                                        } catch (err) { /* ignore */ }
                                    }
                                } else {
                                    if (updated.length >= 2) return; // already have two linked
                                    let email = p.label;
                                    try {
                                        const payload = JSON.parse((typeof goboStorageGet === 'function' ? goboStorageGet(storageKey) : localStorage.getItem(storageKey)));
                                        if (payload?.data?.email) email = payload.data.email;
                                    } catch (e2) {
                                    }
                                    updated.push({key: storageKey, email});
                                    if (updated.length === 2) {
                                        try {
                                            const raw1 = (typeof goboStorageGet === 'function' ? goboStorageGet(updated[0].key) : localStorage.getItem(updated[0].key));
                                            const raw2 = (typeof goboStorageGet === 'function' ? goboStorageGet(updated[1].key) : localStorage.getItem(updated[1].key));
                                            const profile1 = raw1 ? JSON.parse(raw1) : null;
                                            const profile2 = raw2 ? JSON.parse(raw2) : null;
                                            const merged = mergeProfiles(profile1, profile2);
                                            if (typeof goboStorageSet === 'function') goboStorageSet('goob-combined', JSON.stringify(merged)); else localStorage.setItem('goob-combined', JSON.stringify(merged));
                                        } catch (e3) {
                                        }
                                    }
                                }
                                setLinkedAccounts(updated);
                                try {
                                    if (typeof updateCombinedOffersCache === 'function') updateCombinedOffersCache();
                                    if (App.ProfileCache && App.ProfileCache['goob-combined-linked']) delete App.ProfileCache['goob-combined-linked'];
                                } catch (e4) {
                                }
                                Breadcrumbs.updateBreadcrumb(App.TableRenderer.lastState.groupingStack, App.TableRenderer.lastState.groupKeysStack);
                                setTimeout(() => btn.click(), 0);
                            });
                            iconContainer.appendChild(linkIcon);
                            const trashIcon = document.createElement('span');
                            trashIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 2V1.5C6 1.22 6.22 1 6.5 1H9.5C9.78 1 10 1.22 10 1.5V2M2 4H14M12.5 4V13.5C12.5 13.78 12.28 14 12 14H4C3.72 14 3.5 13.78 3.5 13.5V4M5.5 7V11M8 7V11M10.5 7V11" stroke="#888" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                            trashIcon.style.cursor = 'pointer';
                            trashIcon.style.marginTop = '4px';
                            trashIcon.title = 'Delete profile';
                            trashIcon.addEventListener('click', (e) => {
                                e.stopPropagation();
                                if (!confirm('Are you sure you want to delete this saved profile? This action cannot be undone.')) return;
                                try {
                                    let linked = getLinkedAccounts();
                                    if (linked.some(acc => acc.key === storageKey)) {
                                        linked = linked.filter(acc => acc.key !== storageKey);
                                        setLinkedAccounts(linked);
                                        if (linked.length < 2) {
                                            try {
                                                if (typeof goboStorageRemove === 'function') goboStorageRemove('goob-combined'); else localStorage.removeItem('goob-combined');
                                                if (App.ProfileCache && App.ProfileCache['goob-combined-linked']) delete App.ProfileCache['goob-combined-linked'];
                                            } catch (err) {
                                            }
                                        }
                                    }
                                    if (typeof goboStorageRemove === 'function') goboStorageRemove(storageKey); else localStorage.removeItem(storageKey);
                                    try {
                                        if (typeof ProfileIdManager !== 'undefined' && ProfileIdManager && /^gobo-/.test(storageKey)) {
                                            ProfileIdManager.removeKeys([storageKey]);
                                            App.ProfileIdMap = {...ProfileIdManager.map};
                                        }
                                    } catch (reId) {
                                    }
                                    if (storageKey === 'goob-combined-linked' && App.ProfileCache && App.ProfileCache['goob-combined-linked']) delete App.ProfileCache['goob-combined-linked'];
                                    const wasActive = btn.classList.contains('active');
                                    btn.remove();
                                    if (App.ProfileCache) delete App.ProfileCache[storageKey];
                                    Breadcrumbs.updateBreadcrumb(App.TableRenderer.lastState.groupingStack, App.TableRenderer.lastState.groupKeysStack);
                                    if (wasActive) setTimeout(() => {
                                        const newTabs = document.querySelectorAll('.profile-tab');
                                        if (newTabs.length) newTabs[0].click();
                                    }, 0);
                                } catch (err2) {
                                    App.ErrorHandler.showError('Failed to delete profile.');
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
                            let lines;
                            if (p.linkedEmails && p.linkedEmails.length) {
                                lines = p.linkedEmails.slice(0, 2);
                                while (lines.length < 2) lines.push('&nbsp;');
                            } else {
                                lines = ['&nbsp;', '&nbsp;'];
                            }
                            emailsDiv.innerHTML = lines.map(e => `<div>${e}</div>`).join('');
                            labelContainer.appendChild(emailsDiv);
                        }
                        if (storageKey === activeKey) {
                            btn.classList.add('active');
                            btn.setAttribute('aria-pressed', 'true');
                        } else {
                            btn.setAttribute('aria-pressed', 'false');
                        }
                        btn.addEventListener('click', () => {
                            const clickedStorageKey = btn.getAttribute('data-storage-key') || storageKey;
                            try {
                                if (App.TableRenderer.lastState) App.TableRenderer.lastState.selectedProfileKey = clickedStorageKey;
                            } catch (e) {
                            }
                            state.selectedProfileKey = clickedStorageKey;
                            const warnIfStale = (payload) => {
                                try {
                                    const savedAt = Number(payload?.savedAt || payload?.data?.savedAt || 0);
                                    if (!savedAt) return false;
                                    const ageMs = Date.now() - savedAt;
                                    const fortyEightHrs = 48 * 60 * 60 * 1000;
                                    if (ageMs > fortyEightHrs) {
                                        if (App.ErrorHandler && typeof App.ErrorHandler.showWarning === 'function') {
                                            App.ErrorHandler.showWarning('This profile appears out-of-date. Please logout and refresh the account before loading.');
                                        }
                                        return true;
                                    }
                                } catch (e) { /* ignore */ }
                                return false;
                            };

                            if (typeof Spinner !== 'undefined' && Spinner.showSpinner) {
                                Spinner.showSpinner();
                                setTimeout(() => {
                                    if (clickedStorageKey === 'goob-combined-linked') {
                                        try {
                                            const raw = (typeof goboStorageGet === 'function' ? goboStorageGet('goob-combined') : localStorage.getItem('goob-combined'));
                                            if (!raw) {
                                              App.ErrorHandler.showError('Link two accounts to view combined offers.');
                                              Spinner.hideSpinner();
                                              return;
                                            }
                                            const payload = JSON.parse(raw);
                                                                                        if (payload?.data) {
                                                                                            try { warnIfStale(payload); } catch(e) {}
                                                                                            App.TableRenderer.loadProfile('goob-combined-linked', payload);
                                                                                            Spinner.hideSpinner();
                                                                                        } else {
                                              App.ErrorHandler.showError('Combined Offers data is malformed.');
                                              Spinner.hideSpinner();
                                            }
                                        } catch (err) {
                                            App.ErrorHandler.showError('Failed to load Combined Offers.');
                                            Spinner.hideSpinner();
                                        }
                                    } else if (clickedStorageKey === 'goob-favorites') {
                                        try {
                                            const raw = (typeof goboStorageGet === 'function' ? goboStorageGet('goob-favorites') : localStorage.getItem('goob-favorites'));
                                            const payload = raw ? JSON.parse(raw) : {
                                                data: {offers: []},
                                                savedAt: Date.now()
                                            };
                                            try { warnIfStale(payload); } catch(e) {}
                                            App.TableRenderer.loadProfile('goob-favorites', payload);
                                        } catch (err) {
                                            App.ErrorHandler.showError('Failed to load Favorites profile.');
                                        }
                                        Spinner.hideSpinner();
                                    } else {
                                        try {
                                            const raw = (typeof goboStorageGet === 'function' ? goboStorageGet(clickedStorageKey) : localStorage.getItem(clickedStorageKey));
                                            if (!raw) {
                                              App.ErrorHandler.showError('Selected profile is no longer available.');
                                              Spinner.hideSpinner();
                                              return;
                                            }
                                            let payload = JSON.parse(raw);
                                            if (!payload || typeof payload !== 'object') payload = {
                                                data: {offers: []},
                                                savedAt: Date.now()
                                            };
                                            if (!payload.data || typeof payload.data !== 'object') payload.data = {offers: []};
                                            if (!Array.isArray(payload.data.offers)) payload.data.offers = [];
                                            const cached = App.ProfileCache && App.ProfileCache[clickedStorageKey];
                                            try {
                                              const dataSavedAt = Number(payload.savedAt || payload.data?.savedAt || 0);
                                              const domCachedAt = cached && cached.scrollContainer ? Number(cached.scrollContainer._cachedAt || 0) : 0;
                                              if (dataSavedAt > domCachedAt) {
                                                try {
                                                  if (App.ProfileCache && App.ProfileCache[clickedStorageKey]) delete App.ProfileCache[clickedStorageKey];
                                                } catch (e) {
                                                }
                                              }
                                            } catch (e) {
                                            }
                                                                                        if (payload?.data) {
                                                                                            try { warnIfStale(payload); } catch(e) {}
                                                                                            App.TableRenderer.loadProfile(clickedStorageKey, payload);
                                                                                            Spinner.hideSpinner();
                                                                                        } else {
                                                                                            App.ErrorHandler.showError('Profile data malformed.');
                                                                                            Spinner.hideSpinner();
                                                                                        }
                                        } catch (err) {
                                            App.ErrorHandler.showError('Failed to load profile.');
                                            Spinner.hideSpinner();
                                        }
                                    }
                                }, 0);
                            } else {
                                try {
                                    const raw = (typeof goboStorageGet === 'function' ? goboStorageGet(clickedStorageKey) : localStorage.getItem(clickedStorageKey));
                                    if (!raw) {
                                      App.ErrorHandler.showError('Selected profile is no longer available.');
                                      return;
                                    }
                                    let payload = JSON.parse(raw);
                                    if (!payload || typeof payload !== 'object') payload = {
                                        data: {offers: []},
                                        savedAt: Date.now()
                                    };
                                    if (!payload.data || typeof payload.data !== 'object') payload.data = {offers: []};
                                    if (!Array.isArray(payload.data.offers)) payload.data.offers = [];
                                                                        if (payload?.data) {
                                                                            try { warnIfStale(payload); } catch(e) {}
                                                                            App.TableRenderer.loadProfile(clickedStorageKey, payload);
                                                                        } else App.ErrorHandler.showError('Saved profile data is malformed.');
                                } catch (err) {
                                    App.ErrorHandler.showError('Failed to load saved profile.');
                                }
                            }
                        });
                        tabs.appendChild(btn);
                    });
                    tabsScroll.appendChild(tabs);
                    tabsRow.appendChild(tabsScroll);
                }
            } catch (e) {
                console.warn('[breadcrumbs] Failed to render profile tabs', e);
            }

            // All Offers crumb
            const all = document.createElement('span');
            all.className = 'breadcrumb-link';
            all.textContent = 'All Offers';
            all.addEventListener('click', () => {
                state.viewMode = 'table';
                state.groupingStack = [];
                state.groupKeysStack = [];
                state.groupSortStates = {};
                state.openGroups = new Set();
                if (state.baseSortColumn) {
                    state.currentSortColumn = state.baseSortColumn;
                    state.currentSortOrder = state.baseSortOrder;
                } else {
                    state.currentSortColumn = 'offerDate';
                    state.currentSortOrder = 'desc';
                }
                state.currentGroupColumn = null;
                if (typeof Spinner !== 'undefined' && Spinner.showSpinner) {
                    Spinner.showSpinner();
                    setTimeout(() => {
                        try {
                            App.TableRenderer.updateView(state);
                        } finally {
                            try {
                                Spinner.hideSpinner && Spinner.hideSpinner();
                            } catch (e) {
                            }
                        }
                    }, 0);
                } else {
                    App.TableRenderer.updateView(state);
                }
            });
            crumbsRow.appendChild(all);

            container.classList.toggle('accordion-view', groupingStack.length > 0);
            for (let i = 0; i < groupingStack.length; i++) {
                const arrowToCol = document.createElement('span');
                arrowToCol.className = 'breadcrumb-arrow';
                crumbsRow.appendChild(arrowToCol);
                const colKey = groupingStack[i];
                const colLabel = state.headers.find(h => h.key === colKey)?.label || colKey;
                const colCrumb = document.createElement('span');
                colCrumb.className = 'breadcrumb-crumb breadcrumb-col';
                colCrumb.textContent = colLabel;
                crumbsRow.appendChild(colCrumb);
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

            // Hidden Groups + Advanced Search cluster
            const hiddenGroupsPanel = document.createElement('div');
            hiddenGroupsPanel.className = 'tier-filter-toggle';
            hiddenGroupsPanel.style.marginLeft = 'auto';
            // Advanced Search toggle (delegated)
            try {
                AdvancedSearch.ensureState(state);
                const advButton = AdvancedSearch.buildToggleButton(state);
                hiddenGroupsPanel.appendChild(advButton);
            } catch (e) {
                console.warn('[breadcrumbs] AdvancedSearch buildToggleButton failed', e);
            }

            // Add Settings gear button (moves controls into a centralized modal)
            let settingsBtn = null;
            try {
                if (typeof Settings !== 'undefined' && Settings.buildGearButton) {
                    settingsBtn = Settings.buildGearButton();
                    settingsBtn.style.marginLeft = '8px';
                }
            } catch(e) { /* ignore */ }

            const hiddenGroupsLabel = document.createElement('span');
            hiddenGroupsLabel.textContent = 'Hidden Groups:';
            hiddenGroupsLabel.style.marginLeft = '16px';
            const hiddenGroupsDisplay = document.createElement('div');
            hiddenGroupsDisplay.id = 'hidden-groups-display';
            try {
                const profileKey = (state.selectedProfileKey || (App.CurrentProfile && App.CurrentProfile.key)) || 'default';
                Filtering.updateHiddenGroupsList(profileKey, hiddenGroupsDisplay, state);
            } catch (e) {
            }
            hiddenGroupsPanel.appendChild(hiddenGroupsLabel);
            hiddenGroupsPanel.appendChild(hiddenGroupsDisplay);
            if (settingsBtn) {
                try { settingsBtn.style.marginLeft = '8px'; } catch(e) {}
                hiddenGroupsPanel.appendChild(settingsBtn);
            }
            crumbsRow.appendChild(hiddenGroupsPanel);

            // What's New button
            try {
                if (!document.getElementById('gobo-whatsnew-btn')) {
                    const wnBtn = document.createElement('button');
                    wnBtn.id = 'gobo-whatsnew-btn';
                    wnBtn.type = 'button';
                    wnBtn.textContent = "What's New";
                    wnBtn.addEventListener('click', () => {
                        try {
                            if (window.WhatsNew) WhatsNew.start(true);
                        } catch (e) {
                        }
                    });
                    // Try to place into the footer; if footer isn't present yet, retry a few times
                    const tryPlace = () => {
                        try {
                            const footer = document.querySelector('.table-footer-container');
                            if (footer && !footer.contains(wnBtn)) {
                                footer.appendChild(wnBtn);
                                return true;
                            }
                        } catch (e) {}
                        return false;
                    };
                    if (!tryPlace()) {
                        let attempts = 0;
                        const retry = setInterval(() => {
                            attempts++;
                            if (tryPlace() || attempts >= 6) {
                                clearInterval(retry);
                                // Final fallback: place into crumbsRow only if footer never became available
                                try {
                                    const footerNow = document.querySelector('.table-footer-container');
                                    if (!footerNow) crumbsRow.appendChild(wnBtn);
                                } catch (e) {
                                    try { crumbsRow.appendChild(wnBtn); } catch (e2) {}
                                }
                            }
                        }, 200);
                    }
                }
            } catch (e) {
            }

            // Advanced Search panel scaffold (delegated)
            try {
                AdvancedSearch.scaffoldPanel(state, container);
            } catch (e) {
                console.warn('[breadcrumbs] AdvancedSearch scaffoldPanel failed', e);
            }
            try {
                if (state.advancedSearch && state.advancedSearch.enabled) AdvancedSearch.restorePredicates(state);
            } catch (e) {
            }

            try {
                const intended = (App.CurrentProfile && App.CurrentProfile.key) || state.selectedProfileKey;
                if (intended) TableRenderer._applyActiveTabHighlight(intended);
            } catch (e) {
            }
            try {
                if (window.WhatsNew) WhatsNew.maybeAutoStart();
            } catch (e) {
            }
        } finally {
            window.__breadcrumbRendering = false;
        }
    }
};

// Listen for storage events key tracking
try {
    if (typeof document !== 'undefined') {
        document.addEventListener('goboStorageUpdated', (ev) => {
            try { window.__lastStorageEventKey = ev?.detail?.key || null; } catch(e){}
        });
    }
} catch(e){ /* ignore */ }
