const ApiClient = {
    async fetchOffers(retryCount = 3) {
        console.log('Fetching casino offers');
        let authToken, accountId, loyaltyId;
        try {
            const sessionData = localStorage.getItem('persist:session');
            if (!sessionData) {
                console.log('No session data found in localStorage');
                App.ErrorHandler.showError('Failed to load offers: No session data. Please log in again.');
                return;
            }
            const parsedData = JSON.parse(sessionData);
            authToken = parsedData.token ? JSON.parse(parsedData.token) : null;
            const tokenExpiration = parsedData.tokenExpiration ? parseInt(parsedData.tokenExpiration) * 1000 : null;
            let user =  parsedData.user ? JSON.parse(parsedData.user) : null;
            accountId = user && user.accountId ? user.accountId : null;
            loyaltyId = user && user.cruiseLoyaltyId ? user.cruiseLoyaltyId : null;
            if (!authToken || !tokenExpiration || !accountId) {
                console.log('Invalid session data: token, expiration, or account ID missing');
                App.ErrorHandler.showError('Failed to load offers: Invalid session data. Please log in again.');
                return;
            }
            const currentTime = Date.now();
            if (tokenExpiration < currentTime) {
                console.log('Token expired:', new Date(tokenExpiration).toISOString());
                localStorage.removeItem('persist:session');
                App.ErrorHandler.showError('Session expired. Please log in again.');
                App.ErrorHandler.closeModalIfOpen();
                return;
            }
        } catch (error) {
            console.log('Failed to parse session data:', error.message);
            App.ErrorHandler.showError('Failed to load session data. Please log in again.');
            return;
        }

        try {
            App.Spinner.showSpinner();
            const headers = {
                'accept': 'application/json',
                'accept-language': 'en-US,en;q=0.9',
                'account-id': accountId,
                'authorization': authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`,
                'content-type': 'application/json',
            };
            console.log('Request headers:', headers);
            // Centralized brand detection
            const host = (location && location.hostname) ? location.hostname : '';
            const brandCode = (typeof App !== 'undefined' && App.Utils && typeof App.Utils.detectBrand === 'function') ? App.Utils.detectBrand() : (host.includes('celebritycruises.com') ? 'C' : 'R');
            const relativePath = '/api/casino/casino-offers/v1';
            const onSupportedDomain = host.includes('royalcaribbean.com') || host.includes('celebritycruises.com');
            const defaultDomain = brandCode === 'C' ? 'https://www.celebritycruises.com' : 'https://www.royalcaribbean.com';
            const endpoint = onSupportedDomain ? relativePath : `${defaultDomain}${relativePath}`;
            console.log('Resolved endpoint:', endpoint, 'brand:', brandCode);
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                credentials: 'omit',
                body: JSON.stringify({
                    cruiseLoyaltyId: loyaltyId,
                    offerCode: '',
                    brand: brandCode
                })
            });
            console.log(`Network request status: ${response.status}`);
            if (response.status === 403) {
                console.log('403 error detected, session expired');
                localStorage.removeItem('persist:session');
                App.ErrorHandler.showError('Session expired. Please log in again.');
                App.ErrorHandler.closeModalIfOpen();
                App.Spinner.hideSpinner();
                return;
            }
            if (response.status === 503 && retryCount > 0) {
                console.log(`503 error, retrying (${retryCount} attempts left)`);
                setTimeout(() => this.fetchOffers(retryCount - 1), 2000);
                return;
            }
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
            }
            const data = await response.json();
            console.log('API response:', data);
            // normalize data (trim, adjust capitalization, etc.)
            const normalizedData = App.Utils.normalizeOffers(data);
            App.TableRenderer.displayTable(normalizedData);
            // Trigger PDF head checks for Name column links
            if (App.OfferNamePdfLinker && typeof App.OfferNamePdfLinker.queueHeadChecks === 'function') {
                try { App.OfferNamePdfLinker.queueHeadChecks(normalizedData); } catch (e) { console.warn('OfferNamePdfLinker queue failed', e); }
            }
        } catch (error) {
            console.log('Fetch failed:', error.message);
            if (retryCount > 0) {
                console.log(`Retrying fetch (${retryCount} attempts left)`);
                setTimeout(() => this.fetchOffers(retryCount - 1), 2000);
            } else {
                App.ErrorHandler.showError(`Failed to load casino offers: ${error.message}. Please try again later.`);
                App.ErrorHandler.closeModalIfOpen();
            }
        } finally {
            App.Spinner.hideSpinner();
        }
    }
};