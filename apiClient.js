const ApiClient = {
    async fetchOffers(retryCount = 3) {
        console.log('Fetching casino offers');
        let authToken, accountId, loyaltyId;
        try {
            const sessionData = localStorage.getItem('persist:session');
            if (!sessionData) {
                console.error('No session data found in localStorage');
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
                console.error('Invalid session data: token, expiration, or account ID missing');
                App.ErrorHandler.showError('Failed to load offers: Invalid session data. Please log in again.');
                return;
            }
            const currentTime = Date.now();
            if (tokenExpiration < currentTime) {
                console.error('Token expired:', new Date(tokenExpiration).toISOString());
                localStorage.removeItem('persist:session');
                App.ErrorHandler.showError('Session expired. Please log in again.');
                App.ErrorHandler.closeModalIfOpen();
                return;
            }
        } catch (error) {
            console.error('Failed to parse session data:', error.message);
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
                'origin': 'https://www.royalcaribbean.com',
                'referer': 'https://www.royalcaribbean.com/club-royale/offers/',
            };
            console.log('Request headers:', headers);
            const response = await fetch('https://www.royalcaribbean.com/api/casino/casino-offers/v1', {
                method: 'POST',
                headers: headers,
                credentials: 'omit',
                body: JSON.stringify({
                    cruiseLoyaltyId: loyaltyId,
                    offerCode: '',
                    brand: 'R'
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
            App.TableRenderer.displayTable(data);
        } catch (error) {
            console.error('Fetch failed:', error.message);
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