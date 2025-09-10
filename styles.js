const Styles = {
    injectStylesheet() {
        try {
            const tailwindLink = document.createElement('link');
            tailwindLink.href = 'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css';
            tailwindLink.rel = 'stylesheet';
            document.head.appendChild(tailwindLink);
            console.log('Tailwind CSS injected');

            const style = document.createElement('style');
            style.textContent = `
                #gobo-offers-table { max-width: 90vw; max-height: 90vh; background-color: #fff; border-radius: 0.5rem; box-shadow: 0 10px 15px rgba(0,0,0,0.1); display:flex; flex-direction:column; }
                .table-scroll-container { flex:1 1 auto; overflow-y:auto; overflow-x:auto; max-height:calc(90vh - 60px); padding:8px; }
                .table-scroll-container::-webkit-scrollbar { width:12px; }
                .table-scroll-container::-webkit-scrollbar-track { background:#f1f1f1; border-radius:10px; }
                .table-scroll-container::-webkit-scrollbar-thumb { background:#888; border-radius:10px; }
                .table-scroll-container::-webkit-scrollbar-thumb:hover { background:#555; }
                .table-footer-container { flex:0 0 auto; padding:10px; background:#fff; border-top:1px solid #e5e7eb; z-index:10; display:flex; justify-content:space-between; align-items:center; }
                #gobo-loading-spinner { border:4px solid #f3f3f3; border-top:4px solid #3498db; border-radius:50%; width:40px; height:40px; animation:spin 1s linear infinite; }
                @keyframes spin { 0% {transform:rotate(0deg);} 100% {transform:rotate(360deg);} }
                .sort-asc::after { content:' ↓'; }
                .sort-desc::after { content:' ↑'; }
                .group-icon { cursor:pointer; margin-right:8px; display:inline-block; }
                .accordion-header { background:#e2e8f0; padding:8px; cursor:pointer; font-weight:bold; display:flex; justify-content:space-between; align-items:center; }
                .accordion-header[data-depth="0"] { background:#e2e8f0; }
                .accordion-header[data-depth="1"] { background:#edf1f5; }
                .accordion-header[data-depth="2"] { background:#f3f6f9; }
                .accordion-header[data-depth="3"],
                .accordion-header[data-depth="4"],
                .accordion-header[data-depth="5"] { background:#f8fafc; }
                .accordion-content { display:none; padding:8px; }
                .accordion-content.open { display:block; }
                .accordion-table th { cursor:pointer; }
                .table-header, .accordion-table-header { position:sticky; top:0; background:#fff; z-index:10; border-bottom:2px solid #e5e7eb; }
                .table-header tr, .accordion-table-header tr { background:#f3f4f6; }
                .table-auto { table-layout:auto; width:100%; border-collapse:separate; }
                .table-auto th, .table-auto td, .accordion-table th, .accordion-table td { box-sizing:border-box; font-size:0.75rem; padding:4px 6px; vertical-align:top; }

                /* Column order in data rows: 1 Code, 2 Received, 3 Expiration, 4 Name, 5 Ship, 6 Sail Date, 7 Departure Port, 8 Nights, 9 Destination, 10 Category, 11 Quality */

                /* Compact short columns (codes & dates & nights) */
                .table-auto th[data-key="offerCode"], .accordion-table th[data-key="offerCode"], .table-auto td:nth-child(1), .accordion-table td:nth-child(1),
                .table-auto th[data-key="offerDate"], .accordion-table th[data-key="offerDate"], .table-auto td:nth-child(2), .accordion-table td:nth-child(2),
                .table-auto th[data-key="expiration"], .accordion-table th[data-key="expiration"], .table-auto td:nth-child(3), .accordion-table td:nth-child(3),
                .table-auto th[data-key="sailDate"], .accordion-table th[data-key="sailDate"], .table-auto td:nth-child(6), .accordion-table td:nth-child(6) { width:90px; min-width:80px; max-width:110px; white-space:nowrap; }

                .table-auto th[data-key="nights"], .accordion-table th[data-key="nights"], .table-auto td:nth-child(8), .accordion-table td:nth-child(8) { width:90px; min-width:90px; max-width:90px; text-align:center; white-space:nowrap; }

                /* Name, Ship, Departure Port: avoid clipping common long words, truncate gracefully */
                .table-auto th[data-key="offerName"], .accordion-table th[data-key="offerName"], .table-auto td:nth-child(4), .accordion-table td:nth-child(4),
                .table-auto th[data-key="ship"], .accordion-table th[data-key="ship"], .table-auto td:nth-child(5), .accordion-table td:nth-child(5),
                .table-auto th[data-key="departurePort"], .accordion-table th[data-key="departurePort"], .table-auto td:nth-child(7), .accordion-table td:nth-child(7) { min-width:150px; width:170px; max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

                /* Destination: flexible & primary expanding column; allow wrapping for long multi-destination itineraries */
                .table-auto th[data-key="destination"], .accordion-table th[data-key="destination"], .table-auto td:nth-child(9), .accordion-table td:nth-child(9) { min-width:260px; width:100%; word-break:break-word; white-space:normal; }

                /* Category & Quality: short fixed */
                .table-auto th[data-key="category"], .accordion-table th[data-key="category"], .table-auto td:nth-child(10), .accordion-table td:nth-child(10),
                .table-auto th[data-key="quality"], .accordion-table th[data-key="quality"], .table-auto td:nth-child(11), .accordion-table td:nth-child(11) { width:110px; min-width:90px; max-width:140px; white-space:nowrap; }

                /* Zebra stripes for readability (optional minor enhancement) */
                .table-auto tbody tr:nth-child(odd) { background:#fafafa; }

                .accordion-table th, .accordion-table td { font-size:0.75rem; }
                .close-button { background:#dc2626; color:#fff; font-weight:600; padding:8px 16px; border-radius:0.5rem; cursor:pointer; }
                .close-button:hover { background:#b91c1c; }
                .buy-coffee-link { padding:0; cursor:pointer; margin-right:12px; display:flex; align-items:center; }
                .export-csv-button { background:#22c55e; color:#fff; font-weight:600; padding:8px 16px; border-radius:0.5rem; cursor:pointer; margin-right:12px; transition:background .2s; }
                .export-csv-button:hover { background:#16a34a; }
                .breadcrumb-container { display:flex; align-items:center; gap:8px; padding:8px; margin-bottom:8px; }
                .breadcrumb-link { color:#2563eb; text-decoration:underline; cursor:pointer; }
                .breadcrumb-link:hover { color:#1e40af; }
                .breadcrumb-arrow { display:none; }
                .accordion-view .breadcrumb-arrow { display:inline; }
                .breadcrumb-arrow::after { content:'→'; margin:0 8px; }
                .group-title { font-weight:600; color:#1f2937; }
                .newest-offer-row { background:#DFD !important; }
                .expiring-soon-row { background:#FDD !important; }
            `;
            document.head.appendChild(style);
            console.log('Custom styles injected');
        } catch (error) {
            console.log('Failed to inject styles:', error.message);
            App.ErrorHandler.showError('Failed to load styles. Table may appear unstyled.');
        }
    }
};