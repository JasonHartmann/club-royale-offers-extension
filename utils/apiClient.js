const ApiClient = {
    async fetchGuestAccount(accountId, authToken) {
        try {
            const url = `https://aws-prd.api.rccl.com/en/royal/web/v3/guestAccounts/${encodeURIComponent(accountId)}`;
            const rawAuth = authToken && authToken.toString ? authToken.toString() : '';
            const accessToken = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7) : rawAuth;
            const resp = await fetch(url, {
                method: 'GET',
                headers: {
                    'accept': 'application/json',
                    'content-type': 'application/json',
                    'access-token': accessToken,
                    'account-id': accountId,
                    'appkey': 'hyNNqIPHHzaLzVpcICPdAdbFV8yvTsAm',
                    'vds-id': accountId,
                },
            });
            if (!resp.ok) {
                console.debug(`[apiClient] fetchGuestAccount failed: ${resp.status}`);
                return null;
            }
            const data = await resp.json();
            const payload = data?.payload || {};
            const email = payload.contactInformation?.email || null;
            const resolvedAccountId = payload.accountId || null;
            console.debug(`[apiClient] fetchGuestAccount resolved accountId=${resolvedAccountId}, email=${!!email}`);
            return { accountId: resolvedAccountId, email };
        } catch (e) {
            console.debug('[apiClient] fetchGuestAccount error:', e.message);
            return null;
        }
    },
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
            const ship = (s) => (s.shipCode || '').toString().toUpperCase();
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
                    // console.debug(`[apiClient] Sailing present only after refetch (was missing in original) offer ${offerCode}: ship=${ship(s)} sailDate=${s.sailDate || 'n/a'} itineraryCode=${s.itineraryCode || 'n/a'} desc="${(s.itineraryDescription || s.sailingType?.name || '').toString().trim().slice(0,120)}"`);
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
            console.debug('[apiClient] Resolving auth token from cookies');
            authToken = App.Utils.getCookie('accessToken');
            accountId = App.Utils.getCookie('VDS_ID');
            loyaltyId = App.Utils.getCookie('loyalty_ID');
            console.debug('[apiClient] Cookie accessToken present:', !!authToken, authToken ? '(length=' + authToken.length + ')' : '');
            if (!authToken) {
                console.debug('[apiClient] No access token found');
                App.ErrorHandler.showError('Failed to load offers: No session data. Please log in again.');
                return;
            }
            if (!accountId) {
                console.debug('[apiClient] Could not resolve accountId');
                App.ErrorHandler.showError('Failed to load offers: Could not identify account. Please log in again.');
                return;
            }
            console.debug('[apiClient] authToken:', !!authToken, 'accountId:', accountId, 'loyaltyId:', loyaltyId);
        } catch (error) {
            console.debug('[apiClient] Failed to resolve session data:', error.message);
            App.ErrorHandler.showError('Failed to load session data. Please log in again.');
            return;
        }

        user = {};
        if (accountId && authToken) {
            try {
                const guestAccount = await this.fetchGuestAccount(accountId, authToken);
                if (!guestAccount || !guestAccount.email) {
                    console.warn('[apiClient] Guest account fetch returned no email');
                    App.ErrorHandler.showError('Failed to load user profile. Please reload the page and try again.');
                    return;
                }
                App.CurrentUserEmail = guestAccount.email;
                user.email = guestAccount.email;
                console.debug('[apiClient] Fetched guest email:', guestAccount.email);
                if (guestAccount.accountId) {
                    user.accountId = guestAccount.accountId;
                }
            } catch (e) {
                console.warn('[apiClient] Guest account fetch failed:', e.message);
                App.ErrorHandler.showError('Failed to load user profile. Please reload the page and try again.');
                return;
            }
        }

        try {
            App.Spinner.showSpinner();
            console.debug('[apiClient] Spinner shown');
            const rawAuth = authToken && authToken.toString ? authToken.toString() : '';
            const networkAuth = rawAuth ? (rawAuth.startsWith('Bearer ') ? rawAuth : `Bearer ${rawAuth}`) : '';
            const headers = {
                'accept': 'application/json',
                'accept-language': 'en-US,en;q=0.9',
                'x-account-id': accountId,
                'x-loyalty-id': loyaltyId || '',
                'authorization': networkAuth,
                'content-type': 'application/json',
                'cache-control': 'no-cache',
                'pragma': 'no-cache',
            };
            console.debug('[apiClient] Request headers built (authorization redacted)');
            // Centralized brand detection
            const host = (location && location.hostname) ? location.hostname : '';
            const brandCode = App.Utils.detectBrand();
            const relativePath = '/api/casino/v2/offers/merged';
            const onSupportedDomain = host.includes('royalcaribbean.com') || host.includes('celebritycruises.com') || host.includes('comproyale.com');
            const isSimDomain = host.includes('comproyale.com');
            const defaultDomain = brandCode === 'C' ? 'https://www.celebritycruises.com' : 'https://www.royalcaribbean.com';
            const endpoint = onSupportedDomain ? relativePath : `${defaultDomain}${relativePath}`;
            console.debug('[apiClient] Endpoint resolved:', endpoint, 'brand:', brandCode);
            // Extract approvedAgencyIds and digitalRedemption from session featureFlags
            let approvedAgencyIds = [];
            let digitalRedemption = true;
            try {
                const ff = user && user.featureFlags ? user.featureFlags : null;
                if (ff) {
                    if (Array.isArray(ff['approved-agency-ids'])) approvedAgencyIds = ff['approved-agency-ids'];
                    if (typeof ff['digital-redemption'] === 'boolean') digitalRedemption = ff['digital-redemption'];
                }
            } catch (e) { /* ignore */ }
            console.debug('[apiClient] approvedAgencyIds:', approvedAgencyIds, 'digitalRedemption:', digitalRedemption);
            const baseRequestBody = {
                sortBy: 'offer.reserveByDate',
                sortDirection: 'asc',
                limit: 100,
                approvedAgencyIds: approvedAgencyIds,
                page: 1,
                digitalRedemption: digitalRedemption,
                offerCode: '',
            };
            // Helper to remove excluded sailings from an offer in-place
            const removeExcludedFromOffer = (offer) => {
                const co = offer?.campaignOffer;
                if (!co || !Array.isArray(co.sailings) || !Array.isArray(co.excludedSailings) || co.excludedSailings.length === 0) return;
                const before = co.sailings.length;
                try {
                    const filtered = co.sailings.filter(s => {
                        const sShipCode = (s.shipCode || '').toString().toUpperCase();
                        return !co.excludedSailings.some(ex => {
                            const exShipCode = (ex.shipCode || '').toString().toUpperCase();
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
                        const m = text.match(/^\t*(\d+)\s+N(?:IGHT|T)?S?\b/i);
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
            // Sim-domain helper: serve canned JSON from static files instead of real API
            const simFetch = isSimDomain ? async (body) => {
                const hasCode = body.offerCode && body.offerCode.trim();
                const path = hasCode ? '/canned/v1-one-campaign.json' : '/canned/v1-all-campaigns.json';
                const r = await fetch(path);
                if (!r.ok) throw new Error(`Sim fetch failed: ${r.status}`);
                const json = await r.json();
                if (hasCode && json.offers) json.offers = json.offers.filter(o => o?.campaignOffer?.offerCode === body.offerCode.trim());
                return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
            } : null;
            console.debug('[apiClient] Sending fetch request to offers API');
            const response = simFetch ? await simFetch(baseRequestBody) : await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                credentials: 'include',
                body: JSON.stringify(baseRequestBody)
            });
            console.debug('[apiClient] Network request completed, status:', response.status);
            if (response.status === 403) {
                console.debug('[apiClient] 403 error detected, session expired');
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
                const status = response.status;
                console.debug('[apiClient] Non-OK response:', status, errorText);
                App.ErrorHandler.showError(`Failed to load offers: HTTP ${status}. Please try again later.`);
                App.ErrorHandler.closeModalIfOpen();
                return;
            }
            // Deep clone JSON to strip potential Xray wrappers (Firefox) so we can safely add/replace properties
            const rawData = await response.json();
            let data;
            try { data = JSON.parse(JSON.stringify(rawData)); } catch(e) { data = rawData; }
            // Avoid logging full API payloads in debug to prevent sensitive data exposure
            console.debug('[apiClient] API response received: offers=', Array.isArray(data && data.offers) ? data.offers.length : 0);
            // Remove excluded sailings and enforce night limit for TIER offers
            if (data && Array.isArray(data.offers)) {
                console.debug('[apiClient] Processing offers array, length:', data.offers.length);
                data.offers = data.offers.map(o => ({ ...o })); // shallow clone each offer root
                data.offers.forEach(o => {
                    removeExcludedFromOffer(o);
                    //enforceTierNightLimit(o);
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
                    return (simFetch ? simFetch(body) : fetch(endpoint, {
                        method: 'POST',
                        headers,
                        credentials: 'omit',
                        body: JSON.stringify(body)
                    }))
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
                                const shipCode = (s.shipCode || '').toString().toUpperCase();
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
                            //enforceTierNightLimit(data.offers[originalIdx]);
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
            // Persist normalized data so it can be accessed across logins by key: gobo-<brand>-<username>
            try {
                console.debug('[apiClient] Persisting normalized offers to storage (brand aware)');
                const rawKey = (App.CurrentUserEmail) ? String(App.CurrentUserEmail) : (user && (user.email || user.username || user.userName || user.name)) ? String(user.email || user.username || user.userName || user.name) : 'unknown-user';
                const usernameKey = rawKey.replace(/[^a-zA-Z0-9-_.]/g, '_');
                // brandCode already resolved earlier
                const brandCode = App.Utils.detectBrand();
                const legacyKey = `gobo-${usernameKey}`; // backward-compatible
                const brandedKey = `gobo-${brandCode}-${usernameKey}`;
                const payload = { savedAt: Date.now(), data: normalizedData, brand: brandCode, email: App.CurrentUserEmail || user.email };
                // Write branded key
                if (typeof goboStorageSet === 'function') goboStorageSet(brandedKey, JSON.stringify(payload)); else localStorage.setItem(brandedKey, JSON.stringify(payload));
                // If legacy key exists already, leave it untouched; else optionally seed it for a transition (commented out for now)
                try {
                    const legacyExisting = (typeof goboStorageGet === 'function') ? goboStorageGet(legacyKey) : localStorage.getItem(legacyKey);
                    if (!legacyExisting) {
                        // Optional: seed legacy for older versions still expecting it
                        const legacyPayload = { savedAt: payload.savedAt, data: normalizedData, brand: brandCode, legacySeed: true };
                        if (typeof goboStorageSet === 'function') goboStorageSet(legacyKey, JSON.stringify(legacyPayload)); else localStorage.setItem(legacyKey, JSON.stringify(legacyPayload));
                        console.debug('[apiClient] Seeded legacy profile key', legacyKey);
                    }
                } catch(seedErr){ /* ignore seed errors */ }
                console.debug(`[apiClient] Saved normalized offers to branded key: ${brandedKey}`);
                // If this account is part of linked accounts, update combined offers and clear cache
                if (typeof updateCombinedOffersCache === 'function') {
                    updateCombinedOffersCache();
                    console.debug('[apiClient] updateCombinedOffersCache called after account data update');
                }
            } catch (e) {
                console.warn('[apiClient] Failed to persist normalized offers (brand aware)', e);
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
                console.debug('[apiClient] Post-spinner: TableRenderer.lastState:', App.TableRenderer.lastState);
            } catch (e) {
                console.warn('[apiClient] Post-spinner: Error during extra logging', e);
            }
        }
    }
};