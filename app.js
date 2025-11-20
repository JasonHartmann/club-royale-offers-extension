(function() {
    console.debug('Club Royale GOBO Indicator extension loaded on:', window.location.href);

    // Preserve any pre-existing App (e.g., FilterUtils injected earlier) before redefining
    const _prev = window.App || {};

    // Global App object to coordinate modules (merge instead of overwrite to keep advanced-only utilities)
    window.App = {
        ..._prev,
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
        ItineraryCache,
        AdvancedItinerarySearch,
        Breadcrumbs,
        AdvancedSearch,
        AdvancedSearchAddField,
        Utils,
        OfferCodeLookup,
        Filtering,
        B2BUtils,
        Favorites,
        ProfileCache: _prev.ProfileCache || [],
        init() {
            this.DOMUtils.waitForDom();
        }
    };

    // Start the application
    App.init();
})();