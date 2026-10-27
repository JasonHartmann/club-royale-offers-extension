/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

describe('accordion group rows', () => {
    let AccordionBuilder;
    let createOfferRow;

    beforeEach(() => {
        document.body.innerHTML = '';
        createOfferRow = jest.fn(() => {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td class="b2b-depth-cell"></td>';
            return tr;
        });
        global.App = { Utils: { createOfferRow } };
        const src = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'accordionBuilder.js'), 'utf8');
        AccordionBuilder = new Function(src + '\nreturn AccordionBuilder;')();
    });

    afterEach(() => {
        delete global.App;
    });

    function row() {
        return { offer: { campaignOffer: { startDate: '2026-11-01' } }, sailing: { shipName: 'Allure' } };
    }

    function render(openPath) {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const state = {
            headers: [{ key: 'shipName', label: 'Ship' }],
            openGroups: new Set(openPath ? [openPath] : [])
        };
        const grouped = { Caribbean: [row(), row()], Bahamas: [row()] };
        AccordionBuilder.renderAccordion(container, grouped, {}, state, ['destination'], [], null);
        return { container, state };
    }

    test('closed groups do not build sailing rows', () => {
        const { container } = render(null);
        expect(container.querySelectorAll('.accordion-header').length).toBe(2);
        expect(createOfferRow).not.toHaveBeenCalled();
        expect(container.querySelectorAll('tbody tr').length).toBe(0);
    });

    test('opening a group builds only that group, once', () => {
        const { container } = render(null);
        const headers = [...container.querySelectorAll('.accordion-header')];
        const caribbean = headers.find(h => h.dataset.baseKey === 'Caribbean');
        caribbean.click();
        expect(createOfferRow).toHaveBeenCalledTimes(2);
        expect(caribbean.parentElement.querySelectorAll('tbody tr').length).toBe(2);
        caribbean.click();
        caribbean.click();
        expect(createOfferRow).toHaveBeenCalledTimes(2);
    });

    test('a group already on the open path is filled at render', () => {
        const { container } = render('Bahamas');
        expect(createOfferRow).toHaveBeenCalledTimes(1);
        const bahamas = [...container.querySelectorAll('.accordion-header')].find(h => h.dataset.baseKey === 'Bahamas');
        expect(bahamas.parentElement.querySelector('.accordion-content').classList.contains('open')).toBe(true);
    });

    test('opening a group shows the spinner before building rows', () => {
        const showSpinner = jest.fn();
        const hideSpinner = jest.fn();
        global.Spinner = { showSpinner, hideSpinner };
        const queued = [];
        const prevRaf = global.requestAnimationFrame;
        global.requestAnimationFrame = (cb) => { queued.push(cb); return 1; };
        jest.useFakeTimers();
        try {
            const { container } = render(null);
            const caribbean = [...container.querySelectorAll('.accordion-header')].find(h => h.dataset.baseKey === 'Caribbean');
            caribbean.click();
            expect(showSpinner).toHaveBeenCalledTimes(1);
            expect(createOfferRow).not.toHaveBeenCalled();
            expect(caribbean.parentElement.querySelector('.accordion-content').classList.contains('open')).toBe(false);
            queued.forEach(cb => cb());
            jest.runAllTimers();
            expect(createOfferRow).toHaveBeenCalledTimes(2);
            expect(hideSpinner).toHaveBeenCalledTimes(1);
            expect(caribbean.parentElement.querySelector('.accordion-content').classList.contains('open')).toBe(true);
            caribbean.click();
            expect(showSpinner).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
            global.requestAnimationFrame = prevRaf;
            delete global.Spinner;
        }
    });
});
