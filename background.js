console.log('Background script loaded at:', new Date().toISOString());

try {
    console.log('Checking chrome API availability:', {
        webRequest: !!chrome.webRequest,
        storage: !!chrome.storage,
        runtime: !!chrome.runtime
    });
    if (!chrome.webRequest) throw new Error('chrome.webRequest is undefined');
    console.log('Registering webRequest listeners');
    chrome.webRequest.onBeforeSendHeaders.addListener(
        function(details) {
            console.log('Network request detected:', {
                url: details.url,
                method: details.method,
                type: details.type,
                initiator: details.initiator,
                headers: details.requestHeaders
            });
            if (details.url.includes('casino-offers/v1')) {
                console.log('Casino offers API request detected:', details);
                const authHeader = details.requestHeaders.find(header => header.name.toLowerCase() === 'authorization');
                if (authHeader) {
                    let token = authHeader.value;
                    if (token.startsWith('Bearer Bearer ')) {
                        token = token.replace('Bearer Bearer ', 'Bearer ');
                        console.log('Fixed malformed authorization header:', token);
                    } else {
                        console.log('Authorization header found:', token);
                    }
                    chrome.storage.local.set({ authToken: token }, () => {
                        console.log('Authorization token stored in chrome.storage');
                    });
                } else {
                    console.log('No authorization header found in request');
                }
            }
            return { requestHeaders: details.requestHeaders };
        },
        { urls: ["https://www.royalcaribbean.com/*"] },
        ['requestHeaders', 'extraHeaders']
    );

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('Message received in background:', message);
        sendResponse({ received: true });
    });

    console.log('Background script initialized');
} catch (error) {
    console.error('Background script error:', error.message, error.stack);
}