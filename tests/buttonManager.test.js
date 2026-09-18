/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

function loadButtonManager() {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'buttonManager.js'), 'utf8');
    return new Function(src + '\nreturn ButtonManager;')();
}

function pageWithTier() {
    document.body.innerHTML = `
        <header id="hdr"><span>Hi, Catherine</span></header>
        <div id="hero">
            <h2 id="tier">CURRENT CLUB TIER</h2>
            <div id="overlay" class="flex items-center justify-between">
                YOUR CURRENT TIER CREDITS
                Current Tier Status Progress
            </div>
        </div>
    `;
}

describe('ButtonManager placement', () => {
    let ButtonManager;

    beforeEach(() => {
        document.body.innerHTML = '';
        global.App = {
            ApiClient: { fetchOffers: jest.fn() },
            ErrorHandler: { showError: jest.fn() },
        };
        ButtonManager = loadButtonManager();
    });

    afterEach(() => {
        delete global.App;
    });

    test('floats above CURRENT CLUB TIER without entering RCL nodes', () => {
        pageWithTier();
        ButtonManager.addButton();

        const btn = document.getElementById('gobo-offers-button');
        expect(btn).toBeTruthy();
        expect(btn.parentElement).toBe(document.body);
        expect(document.getElementById('hero').contains(btn)).toBe(false);
        expect(document.getElementById('overlay').contains(btn)).toBe(false);
        expect(document.getElementById('hdr').style.position).toBe('');
        expect(btn.dataset.goboPlaced).toBe('tier');
        expect(btn.style.position).toBe('fixed');
        expect(btn.style.visibility).toBe('visible');
    });

    test('sits 5px below the navbar', () => {
        pageWithTier();
        const zero = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {} };
        document.getElementById('hdr').getBoundingClientRect = () => ({ ...zero, bottom: 80, height: 80, width: 1200 });
        document.getElementById('tier').getBoundingClientRect = () => ({ ...zero, top: 160, left: 500, width: 200, height: 30, bottom: 190, right: 700 });

        ButtonManager.addButton();

        const btn = document.getElementById('gobo-offers-button');
        expect(btn.style.top).toBe('85px');
        expect(btn.style.left).toBe('600px');
        expect(btn.style.transform).toBe('translateX(-50%)');
        expect(btn.style.position).toBe('fixed');
    });

    test('repositions on resize', () => {
        pageWithTier();
        const zero = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {} };
        const hdr = document.getElementById('hdr');
        const tier = document.getElementById('tier');
        hdr.getBoundingClientRect = () => ({ ...zero, bottom: 80, height: 80, width: 1200 });
        tier.getBoundingClientRect = () => ({ ...zero, top: 160, left: 500, width: 200, height: 30, right: 700 });

        ButtonManager.addButton();

        hdr.getBoundingClientRect = () => ({ ...zero, bottom: 96, height: 96, width: 800 });
        tier.getBoundingClientRect = () => ({ ...zero, top: 200, left: 200, width: 200, height: 30, right: 400 });
        window.dispatchEvent(new Event('resize'));

        const btn = document.getElementById('gobo-offers-button');
        expect(btn.style.top).toBe('101px');
        expect(btn.style.left).toBe('300px');
    });

    test('ignores a tall header that wraps the hero', () => {
        document.body.innerHTML = `
            <header id="hdr">
                <span>Hi, Catherine</span>
                <h2 id="tier">CURRENT CLUB TIER</h2>
            </header>
        `;
        const zero = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {} };
        document.getElementById('hdr').getBoundingClientRect = () => ({ ...zero, top: 0, bottom: 800, height: 800, width: 1200 });
        document.getElementById('tier').getBoundingClientRect = () => ({ ...zero, top: 160, left: 500, width: 200, height: 30, bottom: 190, right: 700 });

        ButtonManager.addButton();

        expect(document.getElementById('gobo-offers-button').style.top).toBe('85px');
    });

    test('relocates a button that landed in the overlay', () => {
        document.body.innerHTML = `
            <h2>CURRENT CLUB TIER</h2>
            <div id="overlay">
                <button id="gobo-offers-button">Show All Offers</button>
            </div>
        `;

        expect(ButtonManager.isButtonCorrectlyPlaced()).toBe(false);
        ButtonManager.addButton();
        const btn = document.getElementById('gobo-offers-button');
        expect(btn.parentElement).toBe(document.body);
        expect(document.getElementById('overlay').contains(btn)).toBe(false);
        expect(document.getElementById('gobo-offers-center-container')).toBeNull();
    });

    test('is idempotent once placed on the tier heading', () => {
        pageWithTier();
        ButtonManager.addButton();
        const first = document.getElementById('gobo-offers-button');
        ButtonManager.addButton();
        expect(document.getElementById('gobo-offers-button')).toBe(first);
    });

    test('click fetches offers', () => {
        pageWithTier();
        ButtonManager.addButton();
        document.getElementById('gobo-offers-button').click();
        expect(App.ApiClient.fetchOffers).toHaveBeenCalledTimes(1);
    });

    test('removes button on sign-in page', () => {
        document.body.innerHTML = `<button id="gobo-offers-button">Show All Offers</button>`;
        window.history.pushState({}, '', '/club-royale/signin');

        ButtonManager.addButton();

        expect(document.getElementById('gobo-offers-button')).toBeNull();
        window.history.pushState({}, '', '/');
    });
});
