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
                .group-icon { cursor:pointer; margin-right:2px; display:inline-block; }
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

                /* Column order with favorites: 1 Favorite, 2 Code, 3 Rcvd, 4 Expires, 5 Name, 6 Class, 7 Ship, 8 Sail Date, 9 Departs, 10 Nights, 11 Destination, 12 Category, 13 Guests, 14 Perks */

                /* Favorite star column: extra small */
                .table-auto th[data-key="favorite"], .accordion-table th[data-key="favorite"],
                .table-auto td:nth-child(1), .accordion-table td:nth-child(1) {
                    width:32px; min-width:26px; max-width:36px; text-align:center; padding:2px 4px;
                }
                /* Code */
                .table-auto th[data-key="offerCode"], .accordion-table th[data-key="offerCode"], .table-auto td:nth-child(2), .accordion-table td:nth-child(2) { width:120px; min-width:100px; max-width:200px; white-space:nowrap; }
                /* Dates, class, sail date (compact) */
                .table-auto th[data-key="offerDate"], .accordion-table th[data-key="offerDate"], .table-auto td:nth-child(3), .accordion-table td:nth-child(3),
                .table-auto th[data-key="expiration"], .accordion-table th[data-key="expiration"], .table-auto td:nth-child(4), .accordion-table td:nth-child(4),
                .table-auto th[data-key="shipClass"], .accordion-table th[data-key="shipClass"], .table-auto td:nth-child(6), .accordion-table td:nth-child(6),
                .table-auto th[data-key="sailDate"], .accordion-table th[data-key="sailDate"], .table-auto td:nth-child(8), .accordion-table td:nth-child(8) { width:90px; min-width:70px; max-width:110px; white-space:nowrap; }
                /* Nights */
                .table-auto th[data-key="nights"], .accordion-table th[data-key="nights"], .table-auto td:nth-child(10), .accordion-table td:nth-child(10) { width:90px; min-width:70px; max-width:90px; text-align:center; white-space:nowrap; }
                /* Departs */
                .table-auto th[data-key="departurePort"], .accordion-table th[data-key="departurePort"], .table-auto td:nth-child(9), .accordion-table td:nth-child(9) { min-width:100px; width:10%; max-width:240px;  word-break:break-word; white-space:normal; }
                /* Ship */
                .table-auto th[data-key="offerName"], .accordion-table th[data-key="offerName"], .table-auto td:nth-child(5), .accordion-table td:nth-child(5),
                .table-auto th[data-key="ship"], .accordion-table th[data-key="ship"], .table-auto td:nth-child(7), .accordion-table td:nth-child(7) { min-width:100px; width:25%; word-break:break-word; white-space:normal; }
                /* Destination */
                .table-auto th[data-key="destination"], .accordion-table th[data-key="destination"], .table-auto td:nth-child(11), .accordion-table td:nth-child(11) { min-width:120px; width:40%; word-break:break-word; white-space:normal; }
                /* Category & Guests */
                .table-auto th[data-key="category"], .accordion-table th[data-key="category"], .table-auto td:nth-child(12), .accordion-table td:nth-child(12),
                .table-auto th[data-key="guests"], .accordion-table th[data-key="guests"], .table-auto td:nth-child(13), .accordion-table td:nth-child(13) { width:110px; min-width:90px; max-width:140px; white-space:nowrap; }
                /* Perks */
                .table-auto th[data-key="perks"], .accordion-table th[data-key="perks"], .table-auto td:nth-child(14), .accordion-table td:nth-child(14) { width:140px; min-width:90px; max-width:200px; }

                /* Zebra stripes */
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
                .profile-tabs .profile-tab { display:flex; flex-direction:row; align-items:center; justify-content:space-between; padding:6px 10px; min-width:80px; min-height:50px; line-height:1.2; appearance:none; -webkit-appearance:none; background:transparent; border:1px solid transparent; border-radius:8px 8px 0 0; font-size:13px; cursor:pointer; color:#0f172a; transition:background .12s, box-shadow .12s; margin-bottom:0; vertical-align:middle; }
                .profile-tabs .profile-tab { background:#d1d5db; color:#0b1220; border:1px solid #e5e7eb; border-bottom-color:transparent; font-weight:500; box-shadow:none; position:relative; z-index:1; transition:background .2s; }
                .profile-tabs .profile-tab:hover { background:#eef2ff; }
                .profile-tabs .profile-tab.active { background:#ffffff; color:#0b1220; border:1px solid #e5e7eb; border-bottom-color:transparent; font-weight:700; box-shadow:0 8px 20px rgba(2,6,23,0.06); position:relative; z-index:2; }
                .profile-tabs .profile-tab:focus, .profile-tabs .profile-tab:focus-visible { outline:none; outline-offset:0; z-index:3; }
                .profile-tab-label-container { display:flex; flex-direction:column; justify-content:center; align-items:flex-start; }
                .profile-tab-label { font-size:14px; font-weight:normal; }
                .profile-tab.active .profile-tab-label { font-weight:bold; }
                .profile-tab-loyalty { font-size:12px; color:#555; margin-top:2px; margin-bottom:2px; }
                .profile-tab-refreshed { font-size:10px; color:#888; margin-top:2px; }
                .breadcrumb-container { display:flex; flex-direction:column; align-items:flex-start; gap:0; padding:8px; margin-bottom:8px; width:100%; }
                .breadcrumb-tabs-row { width:100%; margin-bottom:0; }
                .breadcrumb-crumb-row { display:flex; align-items:center; gap:8px; width:100%; padding-top:12px; border-top:1px solid #e5e7eb; background:transparent; }
                @media (max-width:600px) { .profile-tabs { max-width:100%; } .profile-tabs .profile-tab { padding:0 8px; font-size:12px; height:32px; line-height:32px; } }
                #hidden-groups-display { margin-left:4px; max-width:350px; max-height:80px; overflow-y:auto; font-size:12px; color:#555; white-space:pre-line; padding:2px 6px; background:#f8f8f8; border-radius:4px; border:1px solid #eee; }
                }
                .hidden-group-row { display:flex; align-items:center; justify-content:space-between; padding:2px 0; }
                .hidden-group-label { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .hidden-group-remove { color:red; cursor:pointer; font-weight:bold; margin-left:8px; }
                .profile-id-badge { display:inline-flex; align-items:center; justify-content:center; background:#05880A; color:#fff; font-size:10px; font-weight:600; width:18px; height:18px; border-radius:50%; line-height:1; box-shadow:0 0 0 1px rgba(255,255,255,0.6); }
                .profile-id-badge-combined { display:inline-flex; align-items:center; justify-content:center; background:#2196f3; color:#fff; font-size:7px; font-weight:600; width:18px; height:18px; border-radius:50%; line-height:1; box-shadow:0 0 0 1px rgba(255,255,255,0.6); }
                .profile-id-badge-1 { background:#05880A !important; }
                .profile-id-badge-2 { background:#F37828 !important; }
                .profile-id-badge-3 { background:#BE28E3 !important; }
                .profile-id-badge-4 { background:#909024 !important; }
                .profile-id-badge-5 { background:#803A90 !important; }
                .profile-id-badge-6 { background:#3A907E !important; }
                .profile-id-badge-7 { background:#545A90 !important; }
                .profile-id-badge-8 { background:#90434A !important; }
                .profile-id-badge-9 { background:#797B7C !important; }
                .profile-id-badge-10 { background:#5E7C2E !important; }
                /* Combined badge variants 1-20 */
                .profile-id-badge-combined-1  { background:#1F618D !important; }
                .profile-id-badge-combined-2  { background:#117864 !important; }
                .profile-id-badge-combined-3  { background:#7D3C98 !important; }
                .profile-id-badge-combined-4  { background:#D35400 !important; }
                .profile-id-badge-combined-5  { background:#AF601A !important; }
                .profile-id-badge-combined-6  { background:#2874A6 !important; }
                .profile-id-badge-combined-7  { background:#B03A2E !important; }
                .profile-id-badge-combined-8  { background:#4A235A !important; }
                .profile-id-badge-combined-9  { background:#7B241C !important; }
                .profile-id-badge-combined-10 { background:#6E2C00 !important; }
                .profile-id-badge-combined-11 { background:#196F3D !important; }
                .profile-id-badge-combined-12 { background:#641E16 !important; }
                .profile-id-badge-combined-13 { background:#76448A !important; }
                .profile-id-badge-combined-14 { background:#1B2631 !important; }
                .profile-id-badge-combined-15 { background:#512E5F !important; }
                .profile-id-badge-combined-16 { background:#0E6655 !important; }
                .profile-id-badge-combined-17 { background:#4D5656 !important; }
                .profile-id-badge-combined-18 { background:#6B2E26 !important; }
                .profile-id-badge-combined-19 { background:#4B1170 !important; }
                .profile-id-badge-combined-20 { background:#283747 !important; }
            `;
            document.head.appendChild(style);
            console.debug('Custom styles injected');
        } catch (error) {
            console.debug('Failed to inject styles:', error.message);
            App.ErrorHandler.showError('Failed to load styles. Table may appear unstyled.');
        }
    }
};