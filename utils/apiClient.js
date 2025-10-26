const ApiClient = {
    // New helper to compare sailings between original batch offer and refreshed offer
    logSailingDifferences(originalOffer, refreshedOffer) {
        try {
            const getSailingsArray = (offer) => (offer && offer.campaignOffer && Array.isArray(offer.campaignOffer.sailings)) ? offer.campaignOffer.sailings : [];
            const offerCode = (originalOffer?.campaignOffer?.offerCode || refreshedOffer?.campaignOffer?.offerCode || 'UNKNOWN').toString();
            // Deep clone sailings so we can safely run light normalization without mutating inputs
            const cloneSailings = (arr) => arr.map(s => ({ ...s }));
            let origSailings = cloneSailings(getSailingsArray(originalOffer));
            let refSailings = cloneSailings(getSailingsArray(refreshedOffer));

            // Helper to derive ship code
            const ship = (s) => (s.shipCode || s.ship?.shipCode || s.ship?.code || '').toString().toUpperCase();
            // Key builder (ship + sailDate)
            const sailingKey = (s) => {
                const sc = ship(s);
                const sd = (s.sailDate || '').toString();
                if (!sc || !sd) return null; // insufficient identity info
                return sc + '|' + sd;
            };
            // Filter out obviously placeholder / unusable sailings (null itineraryCode & missing ship/date)
            const isPlaceholder = (s) => s && (s.itineraryCode == null) && !ship(s) && !s.sailDate;
            origSailings = origSailings.filter(s => !isPlaceholder(s));
            refSailings = refSailings.filter(s => !isPlaceholder(s));

            // Build maps for quick lookup
            const toMap = (list) => {
                const m = new Map();
                list.forEach(s => {
                    const k = sailingKey(s);
                    if (k) m.set(k, s);
                });
                return m;
            };
            const origMap = toMap(origSailings);
            const refMap = toMap(refSailings);

            // Differences: in refetch but not original (missing in original batch)
            refMap.forEach((s, k) => {
                if (!origMap.has(k)) {
                    console.debug(`[apiClient] Sailing present only after refetch (was missing in original) offer ${offerCode}: ship=${ship(s)} sailDate=${s.sailDate || 'n/a'} itineraryCode=${s.itineraryCode || 'n/a'} desc="${(s.itineraryDescription || s.sailingType?.name || '').toString().trim().slice(0,120)}"`);
                }
            });
            // Differences: in original but not refetch (refetch missing it)
            origMap.forEach((s, k) => {
                if (!refMap.has(k)) {
                    console.debug(`[apiClient] Sailing missing in refetch (was in original) offer ${offerCode}: ship=${ship(s)} sailDate=${s.sailDate || 'n/a'} itineraryCode=${s.itineraryCode || 'n/a'} desc="${(s.itineraryDescription || s.sailingType?.name || '').toString().trim().slice(0,120)}"`);
                }
            });
        } catch (e) {
            console.warn('[apiClient] logSailingDifferences failed', e);
        }
    },
    async fetchOffers(retryCount = 3) {
        console.debug('[apiClient] fetchOffers called, retryCount:', retryCount);
        let authToken, accountId, loyaltyId, user;
        try {
            console.debug('[apiClient] Parsing session data from localStorage');
            const sessionData = localStorage.getItem('persist:session');
            if (!sessionData) {
                console.debug('[apiClient] No session data found');
                App.ErrorHandler.showError('Failed to load offers: No session data. Please log in again.');
                return;
            }
            const parsedData = JSON.parse(sessionData);
            authToken = parsedData.token ? JSON.parse(parsedData.token) : null;
            const tokenExpiration = parsedData.tokenExpiration ? parseInt(parsedData.tokenExpiration) * 1000 : null;
            user = parsedData.user ? JSON.parse(parsedData.user) : null;
            accountId = user && user.accountId ? user.accountId : null;
            loyaltyId = user && user.cruiseLoyaltyId ? user.cruiseLoyaltyId : null;
            if (!authToken || !tokenExpiration || !accountId) {
                console.debug('[apiClient] Invalid session data');
                App.ErrorHandler.showError('Failed to load offers: Invalid session data. Please log in again.');
                return;
            }
            const currentTime = Date.now();
            if (tokenExpiration < currentTime) {
                console.debug('[apiClient] Token expired:', new Date(tokenExpiration).toISOString());
                localStorage.removeItem('persist:session');
                App.ErrorHandler.showError('Session expired. Please log in again.');
                App.ErrorHandler.closeModalIfOpen();
                return;
            }
            console.debug('[apiClient] Session data parsed successfully');
        } catch (error) {
            console.debug('[apiClient] Failed to parse session data:', error.message);
            App.ErrorHandler.showError('Failed to load session data. Please log in again.');
            return;
        }

        try {
            App.Spinner.showSpinner();
            console.debug('[apiClient] Spinner shown');
            const headers = {
                'accept': 'application/json',
                'accept-language': 'en-US,en;q=0.9',
                'account-id': accountId,
                'authorization': authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`,
                'content-type': 'application/json',
            };
            console.debug('[apiClient] Request headers built:', headers);
            // Centralized brand detection
            const host = (location && location.hostname) ? location.hostname : '';
            const brandCode = (typeof App !== 'undefined' && App.Utils && typeof App.Utils.detectBrand === 'function') ? App.Utils.detectBrand() : (host.includes('celebritycruises.com') ? 'C' : 'R');
            const relativePath = '/api/casino/casino-offers/v1';
            const onSupportedDomain = host.includes('royalcaribbean.com') || host.includes('celebritycruises.com');
            const defaultDomain = brandCode === 'C' ? 'https://www.celebritycruises.com' : 'https://www.royalcaribbean.com';
            const endpoint = onSupportedDomain ? relativePath : `${defaultDomain}${relativePath}`;
            console.debug('[apiClient] Endpoint resolved:', endpoint, 'brand:', brandCode);
            const baseRequestBody = {
                cruiseLoyaltyId: loyaltyId,
                offerCode: '',
                brand: brandCode,
                // returnExcludedSailings: true
            };
            // Helper to remove excluded sailings from an offer in-place
            const removeExcludedFromOffer = (offer) => {
                const co = offer?.campaignOffer;
                if (!co || !Array.isArray(co.sailings) || !Array.isArray(co.excludedSailings) || co.excludedSailings.length === 0) return;
                const before = co.sailings.length;
                try {
                    const filtered = co.sailings.filter(s => {
                        const sShipCode = (s.shipCode || s.ship?.shipCode || s.ship?.code || '').toString().toUpperCase();
                        return !co.excludedSailings.some(ex => {
                            const exShipCode = (ex.shipCode || ex.ship?.shipCode || ex.ship?.code || '').toString().toUpperCase();
                            return !!(exShipCode && ex.sailDate && sShipCode && s.sailDate && exShipCode === sShipCode && ex.sailDate === s.sailDate);
                        });
                    });
                    // Reassign via new object to avoid Firefox Xray expando issues
                    offer.campaignOffer = { ...co, sailings: filtered };
                } catch(e) { /* ignore filtering errors */ }
                const after = offer?.campaignOffer?.sailings?.length || 0;
                if (before !== after) console.debug(`[apiClient] Pruned ${before - after} excluded sailing(s) from offer ${co.offerCode}`);
            };
            // Helper to enforce night limit for *TIER* offers (remove sailings > 7 nights)
            const enforceTierNightLimit = (offer) => {
                const co = offer?.campaignOffer;
                if (!co || !co.offerCode || !Array.isArray(co.sailings) || co.sailings.length === 0) return;
                const code = co.offerCode.toString().toUpperCase();
                if (!code.includes('TIER')) return; // only apply to *TIER* offers
                const before = co.sailings.length;
                try {
                    const filtered = co.sailings.filter(s => {
                        const text = (s.itineraryDescription || s.sailingType?.name || '').trim();
                        if (!text) return true; // keep if we cannot parse
                        const m = text.match(/^\t*(\d+)\s+(?:N(?:IGHT|T)?S?)\b/i);
                        if (!m) return true; // keep if nights not parseable
                        const nights = parseInt(m[1], 10);
                        if (isNaN(nights)) return true;
                        return nights <= 7; // drop if >7
                    });
                    offer.campaignOffer = { ...co, sailings: filtered };
                } catch(e) { /* ignore */ }
                const after = offer?.campaignOffer?.sailings?.length || 0;
                if (before !== after) console.debug(`[apiClient] Trimmed ${before - after} long (>7) night sailing(s) from TIER offer ${code}`);
            };
            console.debug('[apiClient] Sending fetch request to offers API');
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                credentials: 'omit',
                body: JSON.stringify(baseRequestBody)
            });
            console.debug('[apiClient] Network request completed, status:', response.status);
            if (response.status === 403) {
                console.debug('[apiClient] 403 error detected, session expired');
                localStorage.removeItem('persist:session');
                App.ErrorHandler.showError('Session expired. Please log in again.');
                App.ErrorHandler.closeModalIfOpen();
                App.Spinner.hideSpinner();
                return;
            }
            if (response.status === 503 && retryCount > 0) {
                console.debug(`[apiClient] 503 error, retrying (${retryCount} attempts left)`);
                setTimeout(() => this.fetchOffers(retryCount - 1), 2000);
                return;
            }
            if (!response.ok) {
                const errorText = await response.text();
                console.debug('[apiClient] Non-OK response, throwing error:', errorText);
                throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
            }
            // Deep clone JSON to strip potential Xray wrappers (Firefox) so we can safely add/replace properties
            const rawData = await response.json();
            let data;
            try { data = JSON.parse(JSON.stringify(rawData)); } catch(e) { data = rawData; }
            console.debug('[apiClient] API response received:', data);
            // Remove excluded sailings and enforce night limit for TIER offers
            if (data && Array.isArray(data.offers)) {
                console.debug('[apiClient] Processing offers array, length:', data.offers.length);
                data.offers = data.offers.map(o => ({ ...o })); // shallow clone each offer root
                data.offers.forEach(o => {
                    removeExcludedFromOffer(o);
                    enforceTierNightLimit(o);
                });
                console.debug('[apiClient] Offers array processed');
            }
            // Identify offers that returned with empty sailings but have an offerCode we can refetch
            const offersToRefetch = (data && Array.isArray(data.offers)) ? data.offers
                .filter(o => o?.campaignOffer?.offerCode && Array.isArray(o.campaignOffer.sailings) && (o.campaignOffer.sailings.length === 0 || o.campaignOffer.sailings[0].itineraryCode === null) )
                .map(o => o.campaignOffer.offerCode.trim()) : [];

            // Snapshot original offers (post initial pruning) for diff logging
            const originalOfferSnapshots = {};
            if (offersToRefetch.length) {
                offersToRefetch.forEach(code => {
                    const snap = data.offers.find(o => o?.campaignOffer?.offerCode === code);
                    if (snap) {
                        try { originalOfferSnapshots[code] = JSON.parse(JSON.stringify(snap)); } catch(e) { originalOfferSnapshots[code] = snap; }
                    }
                });
            }

            if (offersToRefetch.length) {
                console.debug(`[apiClient] Refetching ${offersToRefetch.length} offers with empty sailings`, offersToRefetch);
                // Deduplicate just in case
                const uniqueCodes = Array.from(new Set(offersToRefetch));
                const refetchPromises = uniqueCodes.map(code => {
                    const body = { ...baseRequestBody, offerCode: code };
                    return fetch(endpoint, {
                        method: 'POST',
                        headers,
                        credentials: 'omit',
                        body: JSON.stringify(body)
                    })
                        .then(r => {
                            if (!r.ok) throw new Error(`Refetch ${code} failed: ${r.status}`);
                            return r.json();
                        })
                        .then(refetchData => {
                            // Deep clone refetch data for same Firefox safety
                            try { refetchData = JSON.parse(JSON.stringify(refetchData)); } catch(e) { /* ignore */ }
                            return ({ code, refetchData });
                        })
                        .catch(err => {
                            console.warn('[apiClient] Offer refetch failed', code, err.message);
                            return { code, refetchData: null };
                        });
                });

                console.debug('[apiClient] Awaiting Promise.all for refetches');
                const refetchResults = await Promise.all(refetchPromises);
                console.debug('[apiClient] Refetches completed');
                // Merge sailings into original data (create new objects instead of mutating in-place to appease Xray wrappers)
                try {
                    refetchResults.forEach(({ code, refetchData }) => {
                        if (!refetchData || !Array.isArray(refetchData.offers)) return;
                        const refreshedOffer = refetchData.offers.find(o => o?.campaignOffer?.offerCode === code);
                        if (!refreshedOffer) return;
                        const originalIdx = data.offers.findIndex(o => o?.campaignOffer?.offerCode === code);
                        if (originalIdx === -1) return;
                        const original = data.offers[originalIdx];
                        const refreshedSailings = refreshedOffer?.campaignOffer?.sailings;
                        // Always log differences even if refreshedSailings is empty/undefined
                        try { this.logSailingDifferences(originalOfferSnapshots[code], refreshedOffer); } catch(dErr) { console.warn('[apiClient] logSailingDifferences invocation failed', dErr); }

                        if (Array.isArray(refreshedSailings)) {
                            // Build a superset (union) of original + refreshed sailings (keyed by shipCode + sailDate)
                            const origCO = original.campaignOffer || {};
                            const originalSailings = Array.isArray(origCO.sailings) ? origCO.sailings : [];
                            const superset = originalSailings.map(s => ({ ...s }));
                            const keyFor = (s) => {
                                const shipCode = (s.shipCode || s.ship?.shipCode || s.ship?.code || '').toString().toUpperCase();
                                const sailDate = (s.sailDate || '').toString();
                                return (shipCode && sailDate) ? `${shipCode}|${sailDate}` : null;
                            };
                            const indexByKey = new Map();
                            superset.forEach((s, i) => {
                                const k = keyFor(s); if (k) indexByKey.set(k, i);
                            });
                            let added = 0, replaced = 0;
                            refreshedSailings.forEach(rs => {
                                const clone = { ...rs };
                                const k = keyFor(clone);
                                if (k && indexByKey.has(k)) {
                                    // Replace existing with refreshed (prefer fresher itinerary details)
                                    const idx = indexByKey.get(k);
                                    superset[idx] = clone;
                                    replaced++;
                                } else {
                                    superset.push(clone);
                                    if (k) indexByKey.set(k, superset.length - 1);
                                    added++;
                                }
                            });
                            const newCO = {
                                ...origCO,
                                sailings: superset,
                                excludedSailings: Array.isArray(refreshedOffer.campaignOffer?.excludedSailings) ? refreshedOffer.campaignOffer.excludedSailings.map(s => ({ ...s })) : origCO.excludedSailings
                            };
                            data.offers[originalIdx] = { ...original, campaignOffer: newCO };
                            // Post-merge pruning / limits (may drop some superset entries if excluded or >7 nights for TIER)
                            removeExcludedFromOffer(data.offers[originalIdx]);
                            enforceTierNightLimit(data.offers[originalIdx]);
                            console.debug(`[apiClient] Unioned sailings for offer ${code}: original=${originalSailings.length} refetched=${refreshedSailings.length} added=${added} replaced=${replaced} final=${data.offers[originalIdx].campaignOffer.sailings.length}`);
                        }
                    });
                    console.debug('[apiClient] Refetched offers merged');
                } catch(mergeErr) {
                    console.warn('[apiClient] Merge phase error (continuing with partial data):', mergeErr);
                }
            }

            // normalize data (trim, adjust capitalization, etc.) AFTER potential merges so added sailings are normalized too
            console.debug('[apiClient] Normalizing offers data');
            const normalizedData = App.Utils.normalizeOffers(data);
            // attach savedAt so downstream UI can compare against DOM cache timestamps
            try { if (normalizedData && typeof normalizedData === 'object') normalizedData.savedAt = Date.now(); } catch(e){}
            console.debug('[apiClient] Offers data normalized');
            // Persist normalized data so it can be accessed across logins by key: gobo-<username>
            try {
                console.debug('[apiClient] Persisting normalized offers to localStorage');
                const rawKey = (user && (user.username || user.userName || user.email || user.name || user.accountId)) ? String(user.username || user.userName || user.email || user.name || user.accountId) : 'unknown';
                const usernameKey = rawKey.replace(/[^a-zA-Z0-9-_.]/g, '_');
                const storageKey = `gobo-${usernameKey}`;
                const payload = { savedAt: Date.now(), data: normalizedData };
                if (typeof goboStorageSet === 'function') goboStorageSet(storageKey, JSON.stringify(payload)); else localStorage.setItem(storageKey, JSON.stringify(payload));
                console.debug(`[apiClient] Saved normalized offers to storage key: ${storageKey}`);

                // If this account is part of linked accounts, update combined offers and clear cache
                if (typeof updateCombinedOffersCache === 'function') {
                    updateCombinedOffersCache();
                    console.debug('[apiClient] updateCombinedOffersCache called after account data update');
                }
            } catch (e) {
                console.warn('[apiClient] Failed to persist normalized offers to localStorage', e);
            }
            console.debug('[apiClient] Rendering offers table');
            App.TableRenderer.displayTable(normalizedData);
            console.debug('[apiClient] Offers table rendered');
        } catch (error) {
            console.debug('[apiClient] Fetch failed:', error.message);
            if (/cross-origin object/i.test(error.message)) {
                console.debug('[apiClient] Detected Firefox XrayWrapper mutation issue. Will not retry mutation-specific error this cycle.');
            } else if (retryCount > 0) {
                console.debug(`[apiClient] Retrying fetch (${retryCount} attempts left)`);
                setTimeout(() => this.fetchOffers(retryCount - 1), 2000);
            } else {
                App.ErrorHandler.showError(`Failed to load offers: ${error.message}. Please try again later.`);
                App.ErrorHandler.closeModalIfOpen();
            }
        } finally {
            console.debug('[apiClient] Hiding spinner');
            App.Spinner.hideSpinner();
            // Additional detailed logs after spinner is hidden
            try {
                const table = document.querySelector('table');
                const rowCount = table ? table.rows.length : 0;
                const visibleElements = Array.from(document.body.querySelectorAll('*')).filter(el => el.offsetParent !== null).length;
                console.debug('[apiClient] Post-spinner: Table row count:', rowCount);
                console.debug('[apiClient] Post-spinner: Visible DOM elements:', visibleElements);
                if (window.performance && window.performance.memory) {
                    console.debug('[apiClient] Post-spinner: JS Heap Size:', window.performance.memory.usedJSHeapSize, '/', window.performance.memory.totalJSHeapSize);
                }
                if (typeof App !== 'undefined' && App.TableRenderer && App.TableRenderer.lastState) {
                    console.debug('[apiClient] Post-spinner: TableRenderer.lastState:', App.TableRenderer.lastState);
                }
            } catch (e) {
                console.warn('[apiClient] Post-spinner: Error during extra logging', e);
            }
        }
    }
};