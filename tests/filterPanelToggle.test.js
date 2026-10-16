/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

function loadAdvancedSearch() {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'advancedSearch.js'), 'utf8');
    const fn = new Function('goboStorageGet', 'goboStorageSet', src + '\nreturn AdvancedSearch;');
    return fn(() => null, () => {});
}

function panelWithFilter(AdvancedSearch) {
    const panel = document.createElement('div');
    panel.id = 'advanced-search-panel';
    panel.className = 'advanced-search-panel';
    const body = document.createElement('div');
    body.className = 'adv-search-body';
    panel.appendChild(body);
    document.body.appendChild(panel);
    const state = {
        advancedSearch: {
            enabled: true,
            predicates: [{ id: 'a', complete: true, fieldKey: 'nights', operator: 'in', values: ['7'] }]
        },
        advancedSearchPanel: panel
    };
    AdvancedSearch.buildHeader(state, panel);
    return { panel, body, state };
}

describe('active filter badge', () => {
    let AdvancedSearch;

    beforeEach(() => {
        document.body.innerHTML = '';
        AdvancedSearch = loadAdvancedSearch();
    });

    test('the active count is a button that collapses and expands the filter body', () => {
        const { panel, body } = panelWithFilter(AdvancedSearch);
        const badge = panel.querySelector('.adv-badge');

        expect(badge.tagName).toBe('BUTTON');
        expect(badge.textContent).toBe('1 active');
        expect(badge.getAttribute('aria-expanded')).toBe('true');
        expect(panel.querySelector('.adv-search-clear-btn').nextElementSibling).toBe(badge);

        badge.click();
        expect(panel.classList.contains('adv-body-collapsed')).toBe(true);
        expect(badge.getAttribute('aria-expanded')).toBe('false');
        expect(badge.title).toBe('Expand filters');
        expect(panel.querySelector('.adv-search-body')).toBe(body);

        badge.click();
        expect(panel.classList.contains('adv-body-collapsed')).toBe(false);
        expect(badge.getAttribute('aria-expanded')).toBe('true');
        expect(badge.title).toBe('Collapse filters');
    });

    test('a badge refresh keeps the button and the collapsed state', () => {
        const { panel, state } = panelWithFilter(AdvancedSearch);
        panel.querySelector('.adv-badge').click();

        AdvancedSearch.updateBadge(state);

        const badge = panel.querySelector('.adv-badge');
        expect(badge.tagName).toBe('BUTTON');
        expect(badge.textContent).toBe('1 active');
        expect(badge.getAttribute('aria-expanded')).toBe('false');
        expect(panel.classList.contains('adv-body-collapsed')).toBe(true);
    });

    test('clearing the last filter removes the button and expands the body', () => {
        const { panel, state } = panelWithFilter(AdvancedSearch);
        panel.querySelector('.adv-badge').click();
        state.advancedSearch.predicates = [];

        AdvancedSearch.updateBadge(state);

        expect(panel.querySelector('.adv-badge')).toBeNull();
        expect(panel.classList.contains('adv-body-collapsed')).toBe(false);
    });

    test('scrolling the offers list collapses the open filter body and does not expand it again', () => {
        const { panel, state } = panelWithFilter(AdvancedSearch);
        const scroll = document.createElement('div');
        scroll.className = 'table-scroll-container';
        scroll.appendChild(panel);
        document.body.appendChild(scroll);

        scroll.scrollTop = 0;
        scroll.dispatchEvent(new Event('scroll'));
        expect(panel.classList.contains('adv-body-collapsed')).toBe(false);

        scroll.scrollTop = 48;
        scroll.dispatchEvent(new Event('scroll'));
        expect(panel.classList.contains('adv-body-collapsed')).toBe(true);
        expect(panel.querySelector('.adv-badge').getAttribute('aria-expanded')).toBe('false');
        expect(state).toBe(AdvancedSearch._lastState);

        scroll.scrollTop = 96;
        scroll.dispatchEvent(new Event('scroll'));
        expect(panel.classList.contains('adv-body-collapsed')).toBe(true);
    });

    test('scrolling inside the filter panel does not collapse it', () => {
        const { panel, body } = panelWithFilter(AdvancedSearch);
        body.scrollTop = 0;
        body.dispatchEvent(new Event('scroll'));
        body.scrollTop = 80;
        body.dispatchEvent(new Event('scroll'));
        expect(panel.classList.contains('adv-body-collapsed')).toBe(false);
    });

    test('a short scroll does not collapse the filter body', () => {
        const { panel } = panelWithFilter(AdvancedSearch);
        const scroll = document.createElement('div');
        scroll.className = 'table-scroll-container';
        scroll.appendChild(panel);
        document.body.appendChild(scroll);
        scroll.scrollTop = 0;
        scroll.dispatchEvent(new Event('scroll'));
        scroll.scrollTop = 4;
        scroll.dispatchEvent(new Event('scroll'));
        expect(panel.classList.contains('adv-body-collapsed')).toBe(false);
    });
});
