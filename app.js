(function() {
    console.debug('Club Royale GOBO Indicator extension loaded on:', window.location.href);

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
        Breadcrumbs,
        Utils,
        OfferCodeLookup,
        Filtering,
        Favorites: window.Favorites,
        ProfileCache: [],
        init() {
            this.DOMUtils.waitForDom();
        }
    };

    // Start the application
    App.init();
})();