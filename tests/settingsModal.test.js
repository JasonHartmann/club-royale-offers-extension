/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

function loadModal() {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'modal.js'), 'utf8');
    return new Function(src + '\nreturn Modal;')();
}

describe('Settings close keeps the offers popup state', () => {
    let Modal;
    let Settings;
    let offersHandler;

    function offersStillOpen() {
        expect(document.getElementById('gobo-offers-table')).not.toBeNull();
        expect(document.getElementById('offers-backdrop')).not.toBeNull();
        expect(Modal._container && Modal._container.id).toBe('gobo-offers-table');
        expect(Modal._backdrop && Modal._backdrop.id).toBe('offers-backdrop');
        expect(Modal._escapeHandler).toBe(offersHandler);
        expect(Modal._sessionCheckInterval).toBe(4242);
        expect(global.clearInterval).not.toHaveBeenCalledWith(4242);
        expect(document.body.style.overflow).toBe('hidden');
        expect(document.getElementById('gobo-settings-modal')).toBeNull();
    }

    beforeAll(() => {
        Settings = require('../features/settings');
    });

    beforeEach(() => {
        document.body.innerHTML = '';
        document.body.style.overflow = 'hidden';
        Modal = loadModal();
        global.Modal = Modal;
        const offersContainer = document.createElement('div');
        offersContainer.id = 'gobo-offers-table';
        const offersBackdrop = document.createElement('div');
        offersBackdrop.id = 'offers-backdrop';
        document.body.appendChild(offersContainer);
        document.body.appendChild(offersBackdrop);
        offersHandler = jest.fn((event) => {
            if (event.key === 'Escape') Modal.closeModal();
        });
        Modal._container = offersContainer;
        Modal._backdrop = offersBackdrop;
        Modal._overlappingElements = [];
        Modal._escapeHandler = offersHandler;
        Modal._sessionCheckInterval = 4242;
        document.addEventListener('keydown', offersHandler);
        global.App = {
            SettingsStore: {
                getSettings: () => ({}),
                getAutoRunB2B: () => true,
                getIncludeSideBySide: () => true,
                getB2BDrivingRangeHours: () => 0,
                getB2BLagDays: () => 0,
                getIncludeTaxesAndFeesInPriceFilters: () => true,
                getSoloBooking: () => false,
                getDarkMode: () => false,
                getDateFullFormat: () => false,
                getLayoutMode: () => 'table',
                getHiddenColumns: () => [],
            },
            TableRenderer: { lastState: { headers: [] } },
            AdvancedSearch: {},
        };
        window.App = global.App;
        jest.spyOn(global, 'clearInterval');
    });

    afterEach(() => {
        const close = document.querySelector('.b2b-visualizer-close');
        if (close) close.click();
        if (offersHandler) document.removeEventListener('keydown', offersHandler);
        document.body.innerHTML = '';
        document.body.style.overflow = '';
        jest.restoreAllMocks();
        delete global.Modal;
        delete global.App;
    });

    async function openSettings() {
        Settings.openSettingsModal();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(document.getElementById('gobo-settings-modal')).not.toBeNull();
        expect(Modal._escapeHandler).toBe(offersHandler);
        expect(Modal._container.id).toBe('gobo-offers-table');
    }

    test('the header close button does not clear offers popup state', async () => {
        await openSettings();
        document.querySelector('.b2b-visualizer-close').click();
        offersStillOpen();
    });

    test('a click on the settings overlay does not clear offers popup state', async () => {
        await openSettings();
        const overlay = document.getElementById('gobo-settings-modal');
        overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        offersStillOpen();
    });

    test('Escape closes Settings first and the offers handler still closes the popup', async () => {
        await openSettings();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(offersHandler).not.toHaveBeenCalled();
        offersStillOpen();

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(offersHandler).toHaveBeenCalled();
        expect(document.getElementById('gobo-offers-table')).toBeNull();
        expect(document.body.style.overflow).toBe('');
        expect(Modal._sessionCheckInterval).toBeNull();
        expect(global.clearInterval).toHaveBeenCalledWith(4242);
    });
});
