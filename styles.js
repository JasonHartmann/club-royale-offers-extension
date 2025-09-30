const Styles = {
    injectStylesheet() {
        try {
            const tailwindLink = document.createElement('link');
            tailwindLink.href = 'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css';
            tailwindLink.rel = 'stylesheet';
            document.head.appendChild(tailwindLink);
            console.debug('Tailwind CSS injected');

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
                /* Enhanced contrast + depth accent for accordion headers */
                .accordion-header { background:#cbd5e1; padding:8px; cursor:pointer; font-weight:bold; display:flex; justify-content:space-between; align-items:center; border-left:4px solid #64748b; transition:background .15s, filter .15s; }
                .accordion-header[data-depth="0"] { background:#cbd5e1; border-left-color:#475569; }
                .accordion-header[data-depth="1"] { background:#d8e2eb; border-left-color:#64748b; }
                .accordion-header[data-depth="2"] { background:#e6eef4; border-left-color:#7b8794; }
                .accordion-header[data-depth="3"],
                .accordion-header[data-depth="4"],
                .accordion-header[data-depth="5"] { background:#f2f7fa; border-left-color:#94a3af; }
                .accordion-header:hover { filter:brightness(0.96); }
                .accordion-content { display:none; padding:8px; }
                .accordion-content.open { display:block; }
                .accordion-table th { cursor:pointer; }
                .table-header, .accordion-table-header { position:sticky; top:0; background:#fff; z-index:10; border-bottom:2px solid #e5e7eb; }
                .table-header tr, .accordion-table-header tr { background:#f3f4f6; }
                .table-auto { table-layout:auto; width:100%; border-collapse:separate; }
                .table-auto th, .table-auto td, .accordion-table th, .accordion-table td { box-sizing:border-box; font-size:0.75rem; padding:4px 6px; vertical-align:top; }

                /* Column order in data rows: 1 Code, 2 Received, 3 Expiration, 4 Name, 5 Class, 6 Ship, 7 Sail Date, 8 Departure Port, 9 Nights, 10 Destination, 11 Category, 12 Guests, 13 Perks */

                /* Compact short columns (codes & dates & class & nights) */
                .table-auto th[data-key="offerCode"], .accordion-table th[data-key="offerCode"], .table-auto td:nth-child(1), .accordion-table td:nth-child(1) { width:120px; min-width:100px; max-width:140px; white-space:nowrap; }
                .table-auto th[data-key="offerDate"], .accordion-table th[data-key="offerDate"], .table-auto td:nth-child(2), .accordion-table td:nth-child(2),
                .table-auto th[data-key="expiration"], .accordion-table th[data-key="expiration"], .table-auto td:nth-child(3), .accordion-table td:nth-child(3),
                .table-auto th[data-key="shipClass"], .accordion-table th[data-key="shipClass"], .table-auto td:nth-child(5), .accordion-table td:nth-child(5),
                .table-auto th[data-key="sailDate"], .accordion-table th[data-key="sailDate"], .table-auto td:nth-child(7), .accordion-table td:nth-child(7) { width:90px; min-width:80px; max-width:110px; white-space:nowrap; }

                .table-auto th[data-key="nights"], .accordion-table th[data-key="nights"], .table-auto td:nth-child(9), .accordion-table td:nth-child(9) { width:90px; min-width:90px; max-width:90px; text-align:center; white-space:nowrap; }

                /* Name, Ship, Departure Port: avoid clipping common long words, truncate gracefully */
                .table-auto th[data-key="offerName"], .accordion-table th[data-key="offerName"], .table-auto td:nth-child(4), .accordion-table td:nth-child(4),
                .table-auto th[data-key="ship"], .accordion-table th[data-key="ship"], .table-auto td:nth-child(6), .accordion-table td:nth-child(6),
                .table-auto th[data-key="departurePort"], .accordion-table th[data-key="departurePort"], .table-auto td:nth-child(8), .accordion-table td:nth-child(8) { min-width:150px; width:170px; max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

                /* Destination: flexible & primary expanding column; allow wrapping for long multi-destination itineraries */
                .table-auto th[data-key="destination"], .accordion-table th[data-key="destination"], .table-auto td:nth-child(10), .accordion-table td:nth-child(10) { min-width:260px; width:100%; word-break:break-word; white-space:normal; }

                /* Category & Guests: short fixed */
                .table-auto th[data-key="category"], .accordion-table th[data-key="category"], .table-auto td:nth-child(11), .accordion-table td:nth-child(11),
                .table-auto th[data-key="guests"], .accordion-table th[data-key="guests"], .table-auto td:nth-child(12), .accordion-table td:nth-child(12) { width:110px; min-width:90px; max-width:140px; white-space:nowrap; }
                .table-auto th[data-key="perks"], .accordion-table th[data-key="perks"], .table-auto td:nth-child(13), .accordion-table td:nth-child(13) { width:140px; min-width:90px; max-width:200px; }

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
                /* Updated: tier filter now inline inside breadcrumb */
                .tier-filter-toggle { margin-left:auto; display:inline-flex; align-items:center; gap:6px; font-size:12px; background:rgba(255,255,255,0.9); padding:4px 8px; border:1px solid #e5e7eb; border-radius:6px; box-shadow:0 1px 2px rgba(0,0,0,0.08); font-weight:500; }
                .tier-filter-toggle input { cursor:pointer; }

                /* Profile tabs */
                .profile-tabs { display:flex; gap:6px; align-items:center; width:100%; overflow-x:auto; padding-right:6px; margin-right:0; }
                .profile-tabs::-webkit-scrollbar { height:8px; }
                /* Base tab look */
                .profile-tabs .profile-tab {
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    justify-content: space-between;
                    padding: 6px 10px;
                    min-width: 80px;
                    min-height: 50px;
                    line-height: 1.2;
                    appearance:none; -webkit-appearance:none; background:transparent; border:1px solid transparent; border-radius:8px 8px 0 0; font-size:13px; cursor:pointer; color:#0f172a; transition:background .12s, box-shadow .12s; margin-bottom:0; vertical-align:middle;
                }
                .profile-tabs .profile-tab {
                    background: #d1d5db; /* darker gray for inactive tabs */
                    color: #0b1220;
                    border: 1px solid #e5e7eb;
                    border-bottom-color: transparent;
                    font-weight: 500;
                    box-shadow: none;
                    position: relative;
                    z-index: 1;
                    transition: background 0.2s;
                }
                .profile-tabs .profile-tab:hover { background:#eef2ff; }
                 /* Active tab visually connected to content: white background, border, no bottom border so it appears attached */
                 .profile-tabs .profile-tab.active {
                     background:#ffffff; color:#0b1220; border:1px solid #e5e7eb; border-bottom-color:transparent; font-weight:700; box-shadow:0 8px 20px rgba(2,6,23,0.06);
                    position:relative; z-index:2;
                 }
                .profile-tabs .profile-tab:focus, .profile-tabs .profile-tab:focus-visible {
                    /* Remove blue outline on focus */
                    outline: none;
                    outline-offset: 0;
                    z-index: 3;
                }
                .profile-tab-label-container {
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: flex-start;
                }
                .profile-tab-label {
                    font-size: 14px;
                    font-weight: normal;
                }
                .profile-tab.active .profile-tab-label {
                    font-weight: bold;
                }
                .profile-tab-loyalty {
                    font-size: 12px;
                    color: #555;
                    margin-top: 2px;
                    margin-bottom: 2px;
                }
                .profile-tab-refreshed {
                    font-size: 10px;
                    color: #888;
                    margin-top: 2px;
                }
                /* Breadcrumb container stacked: tabs row above crumbs row */
                .breadcrumb-container { display:flex; flex-direction:column; align-items:flex-start; gap:0; padding:8px; margin-bottom:8px; width:100%; }
                .breadcrumb-tabs-row { width:100%; margin-bottom:0; }
                .breadcrumb-crumb-row { display:flex; align-items:center; gap:8px; width:100%; padding-top:12px; border-top:1px solid #e5e7eb; background:transparent; }
                 @media (max-width:600px) {
-                    .profile-tabs { max-width:45%; }
-                    .profile-tabs .profile-tab { padding:6px 10px; font-size:12px; }
+                    .profile-tabs { max-width:100%; }
+                    .profile-tabs .profile-tab { padding:0 8px; font-size:12px; height:32px; line-height:32px; }
                 }

                 #hidden-groups-display {
                   margin-left: 4px;
                   max-width: 350px;
                   max-height: 80px;
                   overflow-y: auto;
                   font-size: 12px;
                   color: #555;
                   white-space: pre-line;
                   padding: 2px 6px;
                   background: #f8f8f8;
                   border-radius: 4px;
                   border: 1px solid #eee;
                 }
                }
                .hidden-group-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 2px 0;
                }
                .hidden-group-label {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .hidden-group-remove {
                    color: red;
                    cursor: pointer;
                    font-weight: bold;
                    margin-left: 8px;
                }
            `;
            document.head.appendChild(style);
            console.debug('Custom styles injected');
        } catch (error) {
            console.debug('Failed to inject styles:', error.message);
            App.ErrorHandler.showError('Failed to load styles. Table may appear unstyled.');
        }
    }
};