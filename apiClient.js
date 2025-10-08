const ApiClient = {
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
                returnExcludedSailings: true
            };
            // Helper to remove excluded sailings from an offer in-place
            const removeExcludedFromOffer = (offer) => {
                const co = offer?.campaignOffer;
                if (!co || !Array.isArray(co.sailings) || !Array.isArray(co.excludedSailings) || co.excludedSailings.length === 0) return;
                const before = co.sailings.length;
                co.sailings = co.sailings.filter(s => {
                    const sShipCode = (s.shipCode || s.ship?.shipCode || s.ship?.code || '').toString().toUpperCase();
                    return !co.excludedSailings.some(ex => {
                        const exShipCode = (ex.shipCode || ex.ship?.shipCode || ex.ship?.code || '').toString().toUpperCase();
                        // Primary (best) match: BOTH shipCode and sailDate match
                        return !!(exShipCode && ex.sailDate && sShipCode && s.sailDate && exShipCode === sShipCode && ex.sailDate === s.sailDate);
                    });
                });
                const after = co.sailings.length;
                if (before !== after) console.debug(`[apiClient] Pruned ${before - after} excluded sailing(s) from offer ${co.offerCode}`);
            };
            // Helper to enforce night limit for *TIER* offers (remove sailings > 7 nights)
            const enforceTierNightLimit = (offer) => {
                const co = offer?.campaignOffer;
                if (!co || !co.offerCode || !Array.isArray(co.sailings) || co.sailings.length === 0) return;
                const code = co.offerCode.toString().toUpperCase();
                if (!code.includes('TIER')) return; // only apply to *TIER* offers
                const before = co.sailings.length;
                co.sailings = co.sailings.filter(s => {
                    const text = (s.itineraryDescription || s.sailingType?.name || '').trim();
                    if (!text) return true; // keep if we cannot parse
                    const m = text.match(/^	*(\d+)\s+(?:N(?:IGHT|T)?S?)\b/i);
                    if (!m) return true; // keep if nights not parseable
                    const nights = parseInt(m[1], 10);
                    if (isNaN(nights)) return true;
                    return nights <= 7; // drop if >7
                });
                const after = co.sailings.length;
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
            const data = await response.json();
            console.debug('[apiClient] API response received:', data);
            // Remove excluded sailings and enforce night limit for TIER offers
            if (data && Array.isArray(data.offers)) {
                console.debug('[apiClient] Processing offers array, length:', data.offers.length);
                data.offers.forEach(o => {
                    removeExcludedFromOffer(o);
                    enforceTierNightLimit(o);
                });
                console.debug('[apiClient] Offers array processed');
            }
            // Identify offers that returned with empty sailings but have an offerCode we can refetch
            const offersToRefetch = (data && Array.isArray(data.offers)) ? data.offers
                .filter(o => o?.campaignOffer?.offerCode && Array.isArray(o.campaignOffer.sailings) && o.campaignOffer.sailings.length === 0)
                .map(o => o.campaignOffer.offerCode.trim()) : [];

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
                        .then(refetchData => ({ code, refetchData }))
                        .catch(err => {
                            console.warn('[apiClient] Offer refetch failed', code, err.message);
                            return { code, refetchData: null };
                        });
                });

                console.debug('[apiClient] Awaiting Promise.all for refetches');
                const refetchResults = await Promise.all(refetchPromises);
                console.debug('[apiClient] Refetches completed');
                // Merge sailings into original data
                refetchResults.forEach(({ code, refetchData }) => {
                    if (!refetchData || !Array.isArray(refetchData.offers)) return;
                    const refreshedOffer = refetchData.offers.find(o => o?.campaignOffer?.offerCode === code);
                    if (!refreshedOffer) return;
                    const refreshedSailings = refreshedOffer?.campaignOffer?.sailings;
                    if (Array.isArray(refreshedSailings) && refreshedSailings.length) {
                        const original = data.offers.find(o => o?.campaignOffer?.offerCode === code);
                        if (original?.campaignOffer) {
                            original.campaignOffer.sailings = refreshedSailings;
                            // Replace excludedSailings too (if present) then prune again
                            if (Array.isArray(refreshedOffer.campaignOffer.excludedSailings)) {
                                original.campaignOffer.excludedSailings = refreshedOffer.campaignOffer.excludedSailings;
                            }
                            removeExcludedFromOffer(original);
                            enforceTierNightLimit(original);
                            console.debug(`[apiClient] Merged ${original.campaignOffer.sailings.length} sailings for offer ${code}`);
                        }
                    }
                });
                console.debug('[apiClient] Refetched offers merged');
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
            if (retryCount > 0) {
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