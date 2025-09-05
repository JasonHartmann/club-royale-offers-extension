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
            `;
            document.head.appendChild(style);
            console.log('Custom styles injected');
        } catch (error) {
            console.error('Failed to inject styles:', error.message);
            App.ErrorHandler.showError('Failed to load styles. Table may appear unstyled.');
        }
    }
};