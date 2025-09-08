# Club Royale Casino Offers Viewer

This Chrome extension enhances the Royal Caribbean Club Royale Offers page by adding a "Show Casino Offers" button. When clicked, it presents your casino offers in a sortable, groupable table and accordion view, making it easy to analyze and compare your offers.

## Features

- **Show Casino Offers Button**: Adds a button to the Club Royale Offers page for quick access.
- **Sortable Table**: Click any column header to sort offers by that column (ascending/descending/original order).
- **Groupable Table**: Group offers by any column (e.g., ship, destination, nights, etc.) for easier analysis.
- **Accordion View**: Drill down into groups with nested accordions for detailed exploration.
- **Visual Highlights**:
  - **Green Row**: The single newest offer (by offer date) is highlighted in green.
  - **Pink Row**: The offer expiring soonest (within the next 3 days) is highlighted in pink.
- **Legend**: A legend at the bottom explains the color coding.
- **Export to CSV**: Download your offers as a CSV file for offline analysis.
- **Responsive UI**: Table columns are sized for readability, with the "nights" column compact.

## Installation

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable "Developer mode" (top right).
4. Click "Load unpacked" and select the folder containing this extension.
5. Visit [Royal Caribbean Club Royale Offers](https://www.royalcaribbean.com/club-royale/offers) and use the new button.

## Usage

- Click the **Show Casino Offers** button on the Club Royale Offers page.
- Use the table to sort and group offers as needed.
- Click column headers to sort; click the folder icon to group by that column.
- Use the accordion view to drill down into groups.
- Refer to the legend at the bottom for color meanings.
- Click **Export to CSV** to download your offers.

## Development

- All source code is in plain JavaScript and CSS, loaded as content scripts.
- Main files:
  - `buttonManager.js`: Injects the main button.
  - `tableBuilder.js`, `accordionBuilder.js`: Render the table and accordion views.
  - `styles.js`: Injects all custom styles.
  - `modal.js`: Handles the modal dialog and footer legend.
  - `utils.js`: Utility functions for formatting and normalization.
  - `sortUtils.js`: Sorting logic for all columns.
  - `tableRenderer.js`: Orchestrates rendering and state management.

## Customization

- To adjust which columns are shown or their order, edit the `headers` array in `tableRenderer.js`.
- To change highlight colors, edit the `.newest-offer-row` and `.expiring-soon-row` classes in `styles.js`.
- To change the grouping or sorting logic, see `accordionBuilder.js` and `sortUtils.js`.

## License

© 2025 Percex Technologies, LLC. All rights reserved.

---

**Not affiliated with Royal Caribbean International. For personal use only.**

