(function() {
    console.log('Club Royale GOBO Indicator extension loaded on:', window.location.href);

    // Global App object to coordinate modules
    window.App = {
        DOMUtils,
        Styles,
        ButtonManager,
        ErrorHandler,
        Spinner,
        ApiClient,
        Modal,
        TableBuilder,
        AccordionBuilder,
        SortUtils,
        TableRenderer,
        Utils: {
            // Helper to format date string as MM/DD/YY without timezone shift
            formatDate(dateStr) {
                if (!dateStr) return '-';
                // Handles YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
                const [year, month, day] = dateStr.split('T')[0].split('-');
                return `${month}/${day}/${year.slice(-2)}`;
            },
            // Helper to extract nights and destination from itinerary string
            parseItinerary(itinerary) {
                if (!itinerary) return { nights: '-', destination: '-' };
                const match = itinerary.match(/^\s*(\d+)\s+NIGHT\s+(.*)$/i);
                if (match) {
                    return { nights: match[1], destination: match[2] };
                }
                return { nights: '-', destination: itinerary };
            }
        },
        init() {
            this.DOMUtils.waitForDom();
        }
    };

    // Start the application
    App.init();
})();