const fs = require('fs');
const path = require('path');

describe('ErrorHandler', () => {
    let ErrorHandler;
    let mockBody;
    let createdElements;

    beforeEach(() => {
        createdElements = [];
        mockBody = {
            style: { overflow: 'hidden' },
            appendChild: jest.fn(),
            removeChild: jest.fn(),
        };

        function createElement(tag) {
            const el = {
                _tag: tag,
                id: '',
                className: '',
                textContent: '',
                style: { backgroundColor: '', color: '' },
                remove: jest.fn(),
                appendChild: jest.fn(),
            };
            createdElements.push(el);
            return el;
        }

        global.document = {
            body: mockBody,
            createElement: jest.fn(createElement),
            getElementById: jest.fn(() => null),
            removeEventListener: jest.fn(),
        };

        global.App = {
            TableRenderer: {
                handleEscapeKey: jest.fn(),
            },
        };
        global.console = {
            ...console,
            debug: jest.fn(),
        };
        global.setTimeout = jest.fn();

        const src = fs.readFileSync(path.resolve(__dirname, '..', 'utils', 'errorHandler.js'), 'utf8');
        const fn = new Function(src + '\nreturn ErrorHandler;');
        ErrorHandler = fn();
    });

    afterEach(() => {
        delete global.App;
    });

    describe('showError', () => {
        test('creates error div and appends to body', () => {
            ErrorHandler.showError('Something went wrong');
            expect(global.document.createElement).toHaveBeenCalledWith('div');
            expect(mockBody.appendChild).toHaveBeenCalled();
            const appended = mockBody.appendChild.mock.calls[0][0];
            expect(appended.id).toBe('gobo-error');
            expect(appended.textContent).toBe('Something went wrong');
        });

        test('removes existing error element before showing new one', () => {
            const existingError = { remove: jest.fn() };
            global.document.getElementById = jest.fn((id) => {
                if (id === 'gobo-error') return existingError;
                return null;
            });
            ErrorHandler.showError('New error');
            expect(existingError.remove).toHaveBeenCalled();
        });

        test('sets auto-dismiss timeout', () => {
            ErrorHandler.showError('Temp error');
            expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 4000);
        });

        test('does not throw when document operations fail', () => {
            global.document.createElement = jest.fn(() => { throw new Error('DOM broken'); });
            expect(() => ErrorHandler.showError('fail')).not.toThrow();
        });
    });

    describe('showWarning', () => {
        test('creates warning div with orange background', () => {
            ErrorHandler.showWarning('Be careful');
            expect(mockBody.appendChild).toHaveBeenCalled();
            const appended = mockBody.appendChild.mock.calls[0][0];
            expect(appended.id).toBe('gobo-warning');
            expect(appended.textContent).toBe('Be careful');
            expect(appended.style.backgroundColor).toBe('#f97316');
        });

        test('removes existing warning before showing new one', () => {
            const existingWarn = { remove: jest.fn() };
            global.document.getElementById = jest.fn((id) => {
                if (id === 'gobo-warning') return existingWarn;
                return null;
            });
            ErrorHandler.showWarning('New warning');
            expect(existingWarn.remove).toHaveBeenCalled();
        });

        test('sets auto-dismiss timeout of 4s', () => {
            ErrorHandler.showWarning('Temp warning');
            expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 4000);
        });

        test('does not throw when document operations fail', () => {
            global.document.createElement = jest.fn(() => { throw new Error('DOM broken'); });
            expect(() => ErrorHandler.showWarning('fail')).not.toThrow();
        });
    });

    describe('closeModalIfOpen', () => {
        test('removes container and backdrop when both present', () => {
            const container = { remove: jest.fn() };
            const backdrop = { remove: jest.fn() };
            global.document.getElementById = jest.fn((id) => {
                if (id === 'gobo-offers-table') return container;
                if (id === 'gobo-backdrop') return backdrop;
                return null;
            });

            ErrorHandler.closeModalIfOpen();

            expect(container.remove).toHaveBeenCalled();
            expect(backdrop.remove).toHaveBeenCalled();
            expect(mockBody.style.overflow).toBe('');
        });

        test('restores body overflow when closing modal', () => {
            const container = { remove: jest.fn() };
            const backdrop = { remove: jest.fn() };
            global.document.getElementById = jest.fn((id) => {
                if (id === 'gobo-offers-table') return container;
                if (id === 'gobo-backdrop') return backdrop;
                return null;
            });
            mockBody.style.overflow = 'hidden';

            ErrorHandler.closeModalIfOpen();

            expect(mockBody.style.overflow).toBe('');
        });

        test('removes escape key listener', () => {
            const container = { remove: jest.fn() };
            const backdrop = { remove: jest.fn() };
            global.document.getElementById = jest.fn((id) => {
                if (id === 'gobo-offers-table') return container;
                if (id === 'gobo-backdrop') return backdrop;
                return null;
            });

            ErrorHandler.closeModalIfOpen();

            expect(global.document.removeEventListener).toHaveBeenCalledWith('keydown', App.TableRenderer.handleEscapeKey);
        });

        test('does nothing when no modal is open', () => {
            global.document.getElementById = jest.fn(() => null);
            ErrorHandler.closeModalIfOpen();
            expect(mockBody.style.overflow).toBe('hidden');
        });

        test('does nothing when only container is present (no backdrop)', () => {
            const container = { remove: jest.fn() };
            global.document.getElementById = jest.fn((id) => {
                if (id === 'gobo-offers-table') return container;
                return null;
            });
            ErrorHandler.closeModalIfOpen();
            expect(container.remove).not.toHaveBeenCalled();
        });
    });
});
