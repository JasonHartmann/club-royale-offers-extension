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
            // Fallback: extract accountId from JWT sub claim when VDS_ID cookie is unavailable
            if (!accountId && authToken) {
                try {
                    const parts = authToken.split('.');
                    if (parts.length === 3) {
                        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                        if (payload.sub) {
                            accountId = payload.sub;
                            console.debug('[apiClient] accountId extracted from JWT sub:', accountId);
                        }
                    }
                } catch (e) {
                    console.debug('[apiClient] Failed to extract accountId from JWT:', e.message);
                }
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
            const partnerRelativePath = '/api/casino/v1/partners/player';
            const listRelativePath = '/api/casino/v2/offers/list';
            const detailsRelativePath = '/api/casino/v2/offers/details';
            const onSupportedDomain = host.includes('royalcaribbean.com') || host.includes('celebritycruises.com') || host.includes('comproyale.com');
            const isSimDomain = host.includes('comproyale.com');
            const defaultDomain = brandCode === 'C' ? 'https://www.celebritycruises.com' : 'https://www.royalcaribbean.com';
            console.debug('[apiClient] Brand resolved:', brandCode, 'onSupportedDomain:', onSupportedDomain);
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
            let data;

            if (isSimDomain && simFetch) {
                console.debug('[apiClient] Sim domain detected, using simFetch');
                const response = await simFetch(baseRequestBody);
                if (response.status === 403) {
                    console.debug('[apiClient] 403 error detected, session expired');
                    App.ErrorHandler.showError('Session expired. Please log in again.');
                    App.ErrorHandler.closeModalIfOpen();
                    App.Spinner.hideSpinner();
                    return;
                }
                if (!response.ok) {
                    throw new Error(`Sim fetch failed: ${response.status}`);
                }
                const rawData = await response.json();
                try { data = JSON.parse(JSON.stringify(rawData)); } catch(e) { data = rawData; }
            } else {
                console.debug('[apiClient] Starting new 3-step offer fetch flow');

                // 1. Get Partnership IDs
                const partnerEndpoint = onSupportedDomain ? partnerRelativePath : `${defaultDomain}${partnerRelativePath}`;
                console.debug('[apiClient] Fetching partnership IDs:', partnerEndpoint);
                const partnerResp = await fetch(partnerEndpoint, { method: 'GET', headers, credentials: 'include' });

                if (partnerResp.status === 403) {
                    console.debug('[apiClient] 403 error on partners, session expired');
                    App.ErrorHandler.showError('Session expired. Please log in again.');
                    App.Spinner.hideSpinner();
                    return;
                }

                const partnershipIds = [];
                if (partnerResp.ok) {
                    try {
                        const partnerData = await partnerResp.json();
                        // Response shape: { message, data: [ { id, partnerId, partnerName, ... } ] }
                        const partners = Array.isArray(partnerData) ? partnerData : (Array.isArray(partnerData?.data) ? partnerData.data : []);
                        partners.forEach(p => {
                            const id = p.partnershipId || p.id || p;
                            if (id && typeof id === 'string') partnershipIds.push(id);
                        });
                    } catch(e) { console.warn('[apiClient] Failed to parse partnership IDs', e); }
                } else {
                    console.warn('[apiClient] Partnership IDs fetch failed with status:', partnerResp.status);
                }
                console.debug('[apiClient] Partnership IDs retrieved:', partnershipIds);

                // 2. Get Offers List
                const listParams = new URLSearchParams();
                if (partnershipIds.length) {
                    listParams.append('partnershipIds', partnershipIds.join(','));
                }
                if (baseRequestBody.sortBy) listParams.append('sortBy', baseRequestBody.sortBy);
                if (baseRequestBody.sortDirection) listParams.append('sortDirection', baseRequestBody.sortDirection);
                if (baseRequestBody.limit) listParams.append('limit', baseRequestBody.limit);
                if (baseRequestBody.page) listParams.append('page', baseRequestBody.page);
                if (baseRequestBody.digitalRedemption !== undefined) listParams.append('digitalRedemption', baseRequestBody.digitalRedemption);
                if (baseRequestBody.approvedAgencyIds && baseRequestBody.approvedAgencyIds.length) {
                    listParams.append('approvedAgencyIds', baseRequestBody.approvedAgencyIds.join(','));
                }

                const listEndpoint = (onSupportedDomain ? listRelativePath : `${defaultDomain}${listRelativePath}`) + '?' + listParams.toString();
                console.debug('[apiClient] Fetching offers list:', listEndpoint);
                const listResp = await fetch(listEndpoint, { method: 'GET', headers, credentials: 'include' });

                if (listResp.status === 403) {
                    App.ErrorHandler.showError('Session expired. Please log in again.');
                    App.Spinner.hideSpinner();
                    return;
                }
                if (listResp.status === 503 && retryCount > 0) {
                    console.debug(`[apiClient] 503 error on list, retrying (${retryCount} attempts left)`);
                    setTimeout(() => this.fetchOffers(retryCount - 1), 2000);
                    return;
                }
                if (!listResp.ok) {
                    const errorText = await listResp.text();
                    throw new Error(`Failed to load offers list: HTTP ${listResp.status}. ${errorText.slice(0, 100)}`);
                }

                // Some RCCL responses arrive as base64-encoded octet-stream; detect and decode
                let listData;
                const listCt = (listResp.headers.get('content-type') || '').toLowerCase();
                if (listCt.includes('application/json')) {
                    listData = await listResp.json();
                } else {
                    const rawListText = await listResp.text();
                    try {
                        listData = JSON.parse(rawListText);
                    } catch (_) {
                        try { listData = JSON.parse(atob(rawListText)); } catch (e2) {
                            throw new Error('Could not parse offers list response as JSON or base64');
                        }
                    }
                }
                const initialOffers = (listData && Array.isArray(listData.offers)) ? listData.offers : (Array.isArray(listData) ? listData : []);
                console.debug('[apiClient] Offers list retrieved, count:', initialOffers.length);

                // 3. Fetch details for each offer in parallel
                console.debug('[apiClient] Fetching details for all offers');
                let detailsEnvelope = null; // capture top-level envelope (loyaltyId, firstName, etc.)
                const detailedOffers = await Promise.all(initialOffers.map(async (offer) => {
                    try {
                        const co = offer.campaignOffer || offer;
                        const offerCode = (co.offerCode || '').toString().trim();
                        const playerOfferId = (offer.playerOfferId || '').toString().trim();

                        if (!offerCode || !playerOfferId) return offer;

                        const detailsParams = new URLSearchParams();
                        detailsParams.append('offerCode', offerCode);
                        detailsParams.append('playerOfferId', playerOfferId);
                        detailsParams.append('limit', '999');
                        detailsParams.append('page', '1');
                        detailsParams.append('sortBy', baseRequestBody.sortBy);
                        detailsParams.append('sortDirection', baseRequestBody.sortDirection);
                        const detailsEndpoint = (onSupportedDomain ? detailsRelativePath : `${defaultDomain}${detailsRelativePath}`) +
                            '?' + detailsParams.toString();

                        const dResp = await fetch(detailsEndpoint, { method: 'GET', headers, credentials: 'include' });
                        if (!dResp.ok) return offer;

                        // Some RCCL responses arrive as base64-encoded octet-stream; detect and decode
                        let detailsData;
                        const detailsCt = (dResp.headers.get('content-type') || '').toLowerCase();
                        if (detailsCt.includes('application/json')) {
                            detailsData = await dResp.json();
                        } else {
                            const rawText = await dResp.text();
                            try {
                                detailsData = JSON.parse(rawText);
                            } catch (_) {
                                try { detailsData = JSON.parse(atob(rawText)); } catch (e2) {
                                    console.warn('[apiClient] Could not parse details response as JSON or base64:', e2);
                                    return offer;
                                }
                            }
                        }
                        if (detailsData && detailsData.error) {
                            console.warn('[apiClient] Details endpoint returned error for', offerCode, detailsData.message || detailsData.code);
                            return offer;
                        }

                        // Capture envelope fields (loyaltyId, firstName, etc.) from the first successful details response
                        if (!detailsEnvelope && detailsData && typeof detailsData === 'object' && !Array.isArray(detailsData)) {
                            detailsEnvelope = {};
                            if (detailsData.loyaltyId) detailsEnvelope.loyaltyId = detailsData.loyaltyId;
                            if (detailsData.firstName) detailsEnvelope.firstName = detailsData.firstName;
                            if (detailsData.lastName) detailsEnvelope.lastName = detailsData.lastName;
                            if (detailsData.email) detailsEnvelope.email = detailsData.email;
                        }

                        // The details endpoint returns a full envelope:
                        // { firstName, lastName, offers: [{ campaignOffer: { sailings, ... }, ... }], totalOffers, ... }
                        // Extract the matching offer's campaignOffer from the envelope.
                        let detailCampaignOffer = null;
                        if (Array.isArray(detailsData.offers) && detailsData.offers.length > 0) {
                            // Find by offerCode match; fall back to first entry
                            const match = detailsData.offers.find(o =>
                                (o.campaignOffer?.offerCode || '').toString().trim() === offerCode
                            ) || detailsData.offers[0];
                            detailCampaignOffer = match.campaignOffer || match;
                        } else if (detailsData.campaignOffer) {
                            // Flat shape: details response IS the offer object
                            detailCampaignOffer = detailsData.campaignOffer;
                        } else if (detailsData.sailings || detailsData.offerCode) {
                            // Direct campaignOffer-level payload
                            detailCampaignOffer = detailsData;
                        }

                        if (!detailCampaignOffer) {
                            console.warn('[apiClient] Could not extract campaignOffer from details for', offerCode);
                            return offer;
                        }

                        // Deep clone to avoid mutation issues (Firefox Xray)
                        const mergedOffer = JSON.parse(JSON.stringify(offer));
                        if (mergedOffer.campaignOffer) {
                            mergedOffer.campaignOffer = { ...mergedOffer.campaignOffer, ...detailCampaignOffer };
                        } else {
                            mergedOffer.campaignOffer = detailCampaignOffer;
                        }
                        return mergedOffer;
                    } catch (e) {
                        console.warn('[apiClient] Error fetching details for an offer:', e);
                        return offer;
                    }
                }));

                // Build envelope fields from details response, list response, or cookie fallback
                const envelopeFields = {};
                // Prefer details envelope (has loyaltyId in the real API response)
                if (detailsEnvelope) Object.assign(envelopeFields, detailsEnvelope);
                // Fall back to listData envelope if it carries these fields
                if (listData && typeof listData === 'object' && !Array.isArray(listData)) {
                    if (!envelopeFields.loyaltyId && listData.loyaltyId) envelopeFields.loyaltyId = listData.loyaltyId;
                    if (!envelopeFields.firstName && listData.firstName) envelopeFields.firstName = listData.firstName;
                    if (!envelopeFields.lastName && listData.lastName) envelopeFields.lastName = listData.lastName;
                    if (!envelopeFields.email && listData.email) envelopeFields.email = listData.email;
                }
                // Last resort: use the cookie value captured earlier
                if (!envelopeFields.loyaltyId && loyaltyId) envelopeFields.loyaltyId = loyaltyId;
                data = { ...envelopeFields, offers: detailedOffers };
            }

            // Pruning / Processing
            console.debug('[apiClient] API response received: offers=', Array.isArray(data && data.offers) ? data.offers.length : 0);
            if (data && Array.isArray(data.offers)) {
                console.debug('[apiClient] Processing offers array, length:', data.offers.length);
                data.offers = data.offers.map(o => ({ ...o })); // shallow clone each offer root
                data.offers.forEach(o => {
                    removeExcludedFromOffer(o);
                });
                console.debug('[apiClient] Offers array processed');
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