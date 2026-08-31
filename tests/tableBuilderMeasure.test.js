/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

// Verifies the batched _measureAllRowHeights rewrite:
//   - every row is created exactly once,
//   - no measurement rows are left behind in tbody (spacers only),
//   - positions is a cumulative sum with positions[0] = 0,
//   - rows that fail to create fall back to ROW_HEIGHT_ESTIMATE,
//   - a throwing createOfferRow degrades to null (caller bails cleanly).
describe('tableBuilder batched row measurement', () => {
    let TableBuilder;
    let createOfferRow;

    function makeRow(tag) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>' + (tag || 'row') + '</td>';
        return tr;
    }

    beforeEach(() => {
        document.body.innerHTML = '';
        createOfferRow = jest.fn(() => makeRow());
        global.App = { Utils: { createOfferRow } };

        const src = fs.readFileSync(path.resolve(__dirname, '..', 'tableBuilder.js'), 'utf8');
        TableBuilder = new Function(src + '\nreturn TableBuilder;')();
    });

    afterEach(() => {
        delete global.App;
    });

    function makeState(n) {
        const sortedOffers = [];
        for (let i = 0; i < n; i++) {
            sortedOffers.push({ offer: { campaignOffer: {} }, sailing: {} });
        }
        return { sortedOffers };
    }

    function makeTbodyWithSpacers() {
        const tbody = document.createElement('tbody');
        const top = document.createElement('tr');
        top.className = 'gobo-vs-spacer-top';
        const bottom = document.createElement('tr');
        bottom.className = 'gobo-vs-spacer-bottom';
        tbody.appendChild(top);
        tbody.appendChild(bottom);
        document.body.appendChild(tbody);
        return tbody;
    }

    test('creates every row, leaves tbody clean, builds cumulative positions', () => {
        const n = 5;
        const tbody = makeTbodyWithSpacers();
        const before = new Set(Array.from(tbody.children));

        const measured = TableBuilder._measureAllRowHeights(tbody, makeState(n), null, null);

        expect(measured).not.toBeNull();
        expect(createOfferRow).toHaveBeenCalledTimes(n);
        // No leftover measurement rows: tbody children are exactly the original spacers.
        expect(Array.from(tbody.children)).toEqual(Array.from(before));
        // positions: cumulative, starts at 0, totalHeight matches last position.
        expect(measured.positions[0]).toBe(0);
        for (let i = 0; i < n; i++) {
            expect(measured.positions[i + 1]).toBe(measured.positions[i] + measured.heights[i]);
        }
        expect(measured.totalHeight).toBe(measured.positions[n]);
    });

    test('null rows fall back to ROW_HEIGHT_ESTIMATE', () => {
        const tbody = makeTbodyWithSpacers();
        createOfferRow.mockImplementation(() => null);

        const measured = TableBuilder._measureAllRowHeights(tbody, makeState(3), null, null);

        expect(measured).not.toBeNull();
        expect(measured.heights).toEqual([
            TableBuilder.ROW_HEIGHT_ESTIMATE,
            TableBuilder.ROW_HEIGHT_ESTIMATE,
            TableBuilder.ROW_HEIGHT_ESTIMATE,
        ]);
        expect(measured.totalHeight).toBe(3 * TableBuilder.ROW_HEIGHT_ESTIMATE);
        expect(tbody.children.length).toBe(2);
    });

    test('throwing createOfferRow degrades to null', () => {
        const tbody = makeTbodyWithSpacers();
        createOfferRow.mockImplementation((data, isNewest, isExpiringSoon, idx) => {
            if (idx === 2) throw new Error('boom');
            return makeRow();
        });

        const measured = TableBuilder._measureAllRowHeights(tbody, makeState(5), null, null);

        expect(measured).toBeNull();
    });
});
