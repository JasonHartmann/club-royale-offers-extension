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
                #gobo-offers-table {
                    max-width: 90vw;
                    max-height: 90vh;
                    background-color: #fff;
                    border-radius: 0.5rem;
                    box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1);
                    display: flex;
                    flex-direction: column;
                }
                .table-scroll-container {
                    flex: 1 1 auto;
                    overflow-y: auto;
                    max-height: calc(90vh - 60px);
                    padding: 8px;
                }
                .table-scroll-container::-webkit-scrollbar {
                    width: 12px;
                }
                .table-scroll-container::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 10px;
                }
                .table-scroll-container::-webkit-scrollbar-thumb {
                    background: #888;
                    border-radius: 10px;
                }
                .table-scroll-container::-webkit-scrollbar-thumb:hover {
                    background: #555;
                }
                .table-footer-container {
                    flex: 0 0 auto;
                    padding: 10px;
                    background-color: #fff;
                    border-top: 1px solid #e5e7eb;
                    z-index: 10;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
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
                .sort-asc::after {
                    content: ' ↓';
                    display: inline;
                }
                .sort-desc::after {
                    content: ' ↑';
                    display: inline;
                }
                .group-icon {
                    cursor: pointer;
                    margin-right: 8px;
                    display: inline-block;
                }
                .accordion-header {
                    background-color: #e2e8f0;
                    padding: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .accordion-content {
                    display: none;
                    padding: 8px;
                }
                .accordion-content.open {
                    display: block;
                }
                .accordion-table th {
                    cursor: pointer;
                }
                .table-header, .accordion-table-header {
                    position: sticky;
                    top: 0;
                    background-color: #fff;
                    z-index: 10;
                    border-bottom: 2px solid #e5e7eb;
                }
                .table-header tr, .accordion-table-header tr {
                    background-color: #f3f4f6;
                }
                .table-auto {
                    table-layout: fixed;
                    width: 100%;
                }
                .table-auto th, .table-auto td {
                    width: 10%;
                    box-sizing: border-box;
                }
                .close-button {
                    background-color: #dc2626;
                    color: white;
                    font-weight: 600;
                    padding: 8px 16px;
                    border-radius: 0.5rem;
                    cursor: pointer;
                }
                .close-button:hover {
                    background-color: #b91c1c;
                }
                .buy-coffee-link {
                    padding: 0px 0px;
                    cursor: pointer;
                    margin-right: 12px;
                    display: flex;
                    align-items: center;
                }
                .export-csv-button {
                    background-color: #22c55e;
                    color: white;
                    font-weight: 600;
                    padding: 8px 16px;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    margin-right: 12px;
                    transition: background 0.2s;
                }
                .export-csv-button:hover {
                    background-color: #16a34a;
                }
                .breadcrumb-container {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px;
                    margin-bottom: 8px;
                }
                .breadcrumb-link {
                    color: #2563eb;
                    text-decoration: underline;
                    cursor: pointer;
                }
                .breadcrumb-link:hover {
                    color: #1e40af;
                }
                .breadcrumb-arrow {
                    display: none;
                }
                .accordion-view .breadcrumb-arrow {
                    display: inline;
                }
                .breadcrumb-arrow::after {
                    content: '→';
                    margin-left: 8px;
                    margin-right: 8px;
                }
                .group-title {
                    font-weight: 600;
                    color: #1f2937;
                }
            `;
            document.head.appendChild(style);
            console.log('Custom styles injected');
        } catch (error) {
            console.error('Failed to inject styles:', error.message);
            App.ErrorHandler.showError('Failed to load styles. Table may appear unstyled.');
        }
    }
};