(function() {
    console.log('Club Royale GOBO Indicator extension loaded on:', window.location.href);

    // Wait for DOM to be ready
    function waitForDom(maxAttempts = 10, attempt = 1) {
        if (document.head && document.body) {
            console.log('DOM is ready');
            injectStylesheet();
            addButton();
            observeDomChanges();
        } else if (attempt <= maxAttempts) {
            console.log(`DOM not ready, retrying (${attempt}/${maxAttempts})`);
            setTimeout(() => waitForDom(maxAttempts, attempt + 1), 500);
        } else {
            console.error('Failed to load DOM after max attempts');
            showError('Failed to initialize extension. Please reload the page.');
        }
    }

    // Observe DOM changes to re-add button after login
    function observeDomChanges() {
        const observer = new MutationObserver((mutations) => {
            if (!document.getElementById('gobo-offers-button')) {
                console.log('Button missing, re-adding button');
                addButton();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        console.log('DOM observer started for button re-injection');
    }

    // Inject Tailwind CSS and custom styles
    function injectStylesheet() {
        try {
            const tailwindLink = document.createElement('link');
            tailwindLink.href = 'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css';
            tailwindLink.rel = 'stylesheet';
            document.head.appendChild(tailwindLink);
            console.log('Tailwind CSS injected');

            // Inject custom scrollbar and spinner styles
            const style = document.createElement('style');
            style.textContent = `
                #gobo-offers-table::-webkit-scrollbar {
                    width: 12px;
                }
                #gobo-offers-table::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 10px;
                }
                #gobo-offers-table::-webkit-scrollbar-thumb {
                    background: #888;
                    border-radius: 10px;
                }
                #gobo-offers-table::-webkit-scrollbar-thumb:hover {
                    background: #555;
                }
                #gobo-loading-spinner {
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #3498db;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
            console.log('Custom styles injected');
        } catch (error) {
            console.error('Failed to inject styles:', error.message);
            showError('Failed to load styles. Table may appear unstyled.');
        }
    }

    // Add button to banner with retry
    function addButton(maxAttempts = 10, attempt = 1) {
        try {
            const existingButton = document.getElementById('gobo-offers-button');
            if (existingButton) existingButton.remove();
            const button = document.createElement('button');
            button.id = 'gobo-offers-button';
            button.className = 'bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-700 ml-2';
            button.textContent = 'Show Casino Offers';
            button.addEventListener('click', () => {
                console.log('Show Casino Offers button clicked');
                fetchOffers();
            });

            const banner = document.querySelector('div[class*="flex"][class*="items-center"][class*="justify-between"]');
            if (!banner && attempt <= maxAttempts) {
                console.log(`Banner div not found, retrying (${attempt}/${maxAttempts})`);
                setTimeout(() => addButton(maxAttempts, attempt + 1), 500);
                return;
            }
            if (!banner) {
                console.error('Banner div not found after max attempts, falling back to fixed position');
                button.className = 'fixed top-4 right-4 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-lg hover:bg-blue-700 z-[2147483647]';
                document.body.appendChild(button);
            } else {
                console.log('Banner div found:', banner.outerHTML.substring(0, 200) + '...');
                const bannerChildren = banner.querySelectorAll('button, a');
                bannerChildren.forEach((child, index) => {
                    console.log(`Banner child ${index}:`, child.outerHTML.substring(0, 200) + '...');
                });
                const signOutButton = Array.from(bannerChildren).find(child =>
                    child.textContent.toLowerCase().includes('sign out') ||
                    child.getAttribute('aria-label')?.toLowerCase().includes('sign out')
                );
                if (signOutButton) {
                    signOutButton.insertAdjacentElement('afterend', button);
                    console.log('Button added after Sign Out button');
                } else {
                    banner.appendChild(button);
                    console.log('Button added to banner div');
                }
            }
            console.log('Button added to DOM');
        } catch (error) {
            console.error('Failed to add button:', error.message);
            showError('Failed to add button. Please reload the page.');
        }
    }

    // Show loading spinner
    function showLoadingSpinner() {
        try {
            const existingSpinner = document.getElementById('gobo-loading-spinner-container');
            if (existingSpinner) existingSpinner.remove();
            const spinnerContainer = document.createElement('div');
            spinnerContainer.id = 'gobo-loading-spinner-container';
            spinnerContainer.className = 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-[2147483646]';
            spinnerContainer.innerHTML = `
                <div id="gobo-loading-spinner"></div>
            `;
            document.body.appendChild(spinnerContainer);
            console.log('Loading spinner displayed');
        } catch (error) {
            console.error('Failed to show loading spinner:', error.message);
        }
    }

    // Hide loading spinner
    function hideLoadingSpinner() {
        try {
            const spinnerContainer = document.getElementById('gobo-loading-spinner-container');
            if (spinnerContainer) {
                spinnerContainer.remove();
                console.log('Loading spinner hidden');
            }
        } catch (error) {
            console.error('Failed to hide loading spinner:', error.message);
        }
    }

    // Fetch offers
    async function fetchOffers(retryCount = 3) {
        console.log('Fetching casino offers');
        let authToken;
        try {
            const sessionData = localStorage.getItem('persist:session');
            if (!sessionData) {
                console.error('No session data found in localStorage');
                showError('Failed to load offers: No session data. Please log in again.');
                return;
            }
            const parsedData = JSON.parse(sessionData);
            authToken = parsedData.token ? JSON.parse(parsedData.token) : null;
            const tokenExpiration = parsedData.tokenExpiration ? parseInt(parsedData.tokenExpiration) * 1000 : null;
            if (!authToken || !tokenExpiration) {
                console.error('Invalid session data: token or expiration missing');
                showError('Failed to load offers: Invalid session data. Please log in again.');
                return;
            }
            const currentTime = Date.now();
            if (tokenExpiration < currentTime) {
                console.error('Token expired:', new Date(tokenExpiration).toISOString());
                localStorage.removeItem('persist:session');
                showError('Session expired. Please log in again.');
                closeModalIfOpen();
                return;
            }
        } catch (error) {
            console.error('Failed to parse session data:', error.message);
            showError('Failed to load session data. Please log in again.');
            return;
        }

        try {
            showLoadingSpinner();
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
                showError('Session expired. Please log in again.');
                closeModalIfOpen();
                hideLoadingSpinner();
                return;
            }
            if (response.status === 503 && retryCount > 0) {
                console.log(`503 error, retrying (${retryCount} attempts left)`);
                setTimeout(() => fetchOffers(retryCount - 1), 2000);
                return;
            }
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
            }
            const data = await response.json();
            console.log('API response:', JSON.stringify(data, null, 2));
            displayTable(data);
        } catch (error) {
            console.error('Fetch failed:', error.message);
            if (retryCount > 0) {
                console.log(`Retrying fetch (${retryCount} attempts left)`);
                setTimeout(() => fetchOffers(retryCount - 1), 2000);
            } else {
                showError(`Failed to load casino offers: ${error.message}. Please try again later.`);
                closeModalIfOpen();
            }
        } finally {
            hideLoadingSpinner();
        }
    }

    // Close modal if open
    function closeModalIfOpen() {
        const container = document.getElementById('gobo-offers-table');
        const backdrop = document.getElementById('gobo-backdrop');
        if (container && backdrop) {
            console.log('Closing open modal due to error');
            container.remove();
            backdrop.remove();
            document.body.style.overflow = '';
            // Note: overlappingElements restoration skipped as it's error case
            document.removeEventListener('keydown', handleEscapeKey);
        }
    }

    // Display error message
    function showError(message) {
        try {
            const existingError = document.getElementById('gobo-error');
            if (existingError) existingError.remove();
            const errorDiv = document.createElement('div');
            errorDiv.id = 'gobo-error';
            errorDiv.className = 'fixed top-16 right-4 bg-red-600 text-white font-semibold py-2 px-4 rounded-lg shadow-lg z-[2147483647]';
            errorDiv.textContent = message;
            document.body.appendChild(errorDiv);
            setTimeout(() => errorDiv.remove(), 10000);
        } catch (error) {
            console.error('Failed to show error:', error.message);
        }
    }

    // Display table with backdrop
    function displayTable(data) {
        try {
            const existingTable = document.getElementById('gobo-offers-table');
            if (existingTable) existingTable.remove();
            const existingBackdrop = document.getElementById('gobo-backdrop');
            if (existingBackdrop) existingBackdrop.remove();

            // Prevent background scrolling
            document.body.style.overflow = 'hidden';

            // Add backdrop
            const backdrop = document.createElement('div');
            backdrop.id = 'gobo-backdrop';
            backdrop.className = 'fixed inset-0 bg-black bg-opacity-70 z-[2147483646]';
            backdrop.style.cssText = 'pointer-events: auto !important;';
            document.body.appendChild(backdrop);

            // Create modal container
            const container = document.createElement('div');
            container.id = 'gobo-offers-table';
            container.className = 'fixed inset-0 m-auto max-w-[90vw] max-h-[90vh] bg-white p-6 rounded-lg shadow-xl overflow-y-auto z-[2147483647]';
            container.style.cssText = 'width: 90vw; overflow-y: auto !important;';
            container.addEventListener('scroll', () => {
                console.log('Table scrolled, scrollTop:', container.scrollTop);
            });

            const table = document.createElement('table');
            table.className = 'w-full border-collapse table-auto';

            // Log and hide potential overlapping elements
            const overlappingElements = [];
            document.querySelectorAll('[style*="position: fixed"], [style*="position: absolute"], [style*="z-index"], .fixed, .absolute, iframe:not(#gobo-offers-table):not(#gobo-backdrop), .sign-modal-overlay, .email-capture, .bg-purple-overlay, .heading1, [class*="relative"][class*="overflow-hidden"][class*="flex-col"]').forEach(el => {
                const computedStyle = window.getComputedStyle(el);
                if ((parseInt(computedStyle.zIndex) > 0 || computedStyle.position === 'fixed' || computedStyle.position === 'absolute' || el.classList.contains('sign-modal-overlay') || el.classList.contains('email-capture') || el.classList.contains('bg-purple-overlay') || el.classList.contains('heading1') || el.classList.contains('relative')) && el.id !== 'gobo-offers-table' && el.id !== 'gobo-backdrop') {
                    console.log('Hiding potential overlapping element:', el.outerHTML.substring(0, 200) + '...', 'z-index:', computedStyle.zIndex);
                    el.dataset.originalDisplay = el.style.display;
                    el.style.display = 'none';
                    overlappingElements.push(el);
                }
            });

            // Table header
            const thead = document.createElement('thead');
            thead.className = 'sticky top-0 bg-white z-[10]';
            thead.innerHTML = `
                <tr class="bg-gray-100">
                    <th class="border p-2 text-left font-semibold">Offer Code</th>
                    <th class="border p-2 text-left font-semibold">Offer Name</th>
                    <th class="border p-2 text-left font-semibold">Ship</th>
                    <th class="border p-2 text-left font-semibold">Sail Date</th>
                    <th class="border p-2 text-left font-semibold">Departure Port</th>
                    <th class="border p-2 text-left font-semibold">Itinerary</th>
                    <th class="border p-2 text-left font-semibold">GOBO</th>
                </tr>
            `;

            // Table body
            const tbody = document.createElement('tbody');
            if (!data.offers || data.offers.length === 0) {
                const row = document.createElement('tr');
                row.innerHTML = `<td colspan="7" class="border p-2 text-center">No offers available</td>`;
                tbody.appendChild(row);
            } else {
                data.offers.forEach(offer => {
                    if (offer.campaignOffer && offer.campaignOffer.sailings) {
                        offer.campaignOffer.sailings.forEach(sailing => {
                            const row = document.createElement('tr');
                            row.className = 'hover:bg-gray-50';
                            row.innerHTML = `
                                <td class="border p-2">${offer.campaignOffer?.offerCode || '-'}</td>
                                <td class="border p-2">${offer.campaignOffer.name || '-'}</td>
                                <td class="border p-2">${sailing.shipName || '-'}</td>
                                <td class="border p-2">${new Date(sailing.sailDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })}</td>
                                <td class="border p-2">${sailing.departurePort?.name || '-'}</td>
                                <td class="border p-2">${sailing.itineraryDescription || sailing.sailingType?.name || '-'}</td>
                                <td class="border p-2">
                                    <span class="${sailing.isGOBO ? 'bg-green-500 text-white' : 'bg-gray-300 text-black'} inline-block px-2 py-1 rounded text-sm">
                                        ${sailing.isGOBO ? 'Yes' : 'No'}
                                    </span>
                                </td>
                            `;
                            tbody.appendChild(row);
                        });
                    }
                });
            }

            table.appendChild(thead);
            table.appendChild(tbody);
            container.appendChild(table);

            // Close function
            function closeModal() {
                container.remove();
                backdrop.remove();
                document.body.style.overflow = '';
                overlappingElements.forEach(el => {
                    el.style.display = el.dataset.originalDisplay || '';
                    delete el.dataset.originalDisplay;
                });
                document.removeEventListener('keydown', handleEscapeKey);
            }

            // Close button
            const closeButton = document.createElement('button');
            closeButton.className = 'absolute top-2 right-2 bg-red-600 text-white font-semibold py-1 px-2 rounded hover:bg-red-700 z-[2147483647]';
            closeButton.textContent = 'Close';
            closeButton.addEventListener('click', closeModal);
            container.appendChild(closeButton);

            // Backdrop click to close
            backdrop.addEventListener('click', closeModal);

            // Escape key to close
            function handleEscapeKey(event) {
                if (event.key === 'Escape') {
                    console.log('Escape key pressed, closing modal');
                    closeModal();
                }
            }
            document.addEventListener('keydown', handleEscapeKey);

            document.body.appendChild(container);
            console.log('Table displayed');
        } catch (error) {
            console.error('Failed to display table:', error.message);
            showError('Failed to display table. Please try again.');
            document.body.style.overflow = '';
            const existingBackdrop = document.getElementById('gobo-backdrop');
            if (existingBackdrop) existingBackdrop.remove();
        }
    }

    // Initialize
    waitForDom();
})();