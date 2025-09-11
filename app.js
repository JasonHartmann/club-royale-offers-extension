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
        Utils,
        OfferCodeLookup, // added
        OfferNamePdfLinker, // new module for Name->PDF links
        init() {
            this.DOMUtils.waitForDom();
        }
    };

    // Start the application
    App.init();
})();