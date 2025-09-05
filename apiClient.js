const ApiClient = {
    async fetchOffers(retryCount = 3) {
        console.log('Fetching casino offers');
        let authToken;
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
            if (!authToken || !tokenExpiration) {
                console.error('Invalid session data: token or expiration missing');
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
            App.Spinner.showLoadingSpinner();
            const headers = {
                'accept': 'application/json',
                'accept-language': 'en-US,en;q=0.9',
                'account-id': 'a043808e-e5c9-43c7-8b94-7caba445689b',
                'authorization': authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`,
                'content-type': 'application/json',
                'origin': 'https://www.royalcaribbean.com',
                'referer': 'https://www.royalcaribbean.com/club-royale/offers/',
                'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
            };
            console.log('Request headers:', headers);
            const response = await fetch('https://www.royalcaribbean.com/api/casino/casino-offers/v1', {
                method: 'POST',
                headers: headers,
                credentials: 'omit',
                body: JSON.stringify({
                    cruiseLoyaltyId: '390780962',
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
                App.Spinner.hideLoadingSpinner();
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
            console.log('API response:', JSON.stringify(data, null, 2));
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
            App.Spinner.hideLoadingSpinner();
        }
    }
};