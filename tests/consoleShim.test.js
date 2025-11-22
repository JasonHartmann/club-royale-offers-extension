describe('consoleShim', () => {
    let origWindow;
    beforeAll(() => {
        // Ensure a window object exists for the shim to read GOBO_DEBUG_ENABLED
        origWindow = global.window;
        global.window = global.window || {};
        // Install a collector as the current console.debug so the shim captures it as _orig.debug
        recordedCalls = [];
        origConsoleDebug = console.debug;
        console.debug = (...args) => { recordedCalls.push(args); };
        // Load the shim once (it will bind _orig.debug to our collector)
        require('../utils/consoleShim.js');
    });
    afterAll(() => {
        // restore global.window and original console.debug
        global.window = origWindow;
        console.debug = origConsoleDebug;
    });

    function captureStdout(fn){
        const writes = [];
        const origWrite = process.stdout.write;
        process.stdout.write = (chunk, encoding, cb) => { writes.push(String(chunk)); if (typeof cb === 'function') cb(); };
        try { fn(); } finally { process.stdout.write = origWrite; }
        return writes.join('');
    }

    test('does not mutate original object when redacting', () => {
        // enable debug so console.debug emits
        global.window.GOBO_DEBUG_ENABLED = true;
        const obj = { token: 'secret-123', name: 'bob', nested: { password: 'p123' } };
        // call shimmed console.debug which should call our collector with redacted clone
        console.debug('log', obj);
        // original object should be unchanged
        expect(obj.token).toBe('secret-123');
        expect(obj.nested.password).toBe('p123');
        // recordedCalls should have captured the redacted clone
        expect(recordedCalls.length).toBeGreaterThan(0);
        const recorded = recordedCalls[recordedCalls.length - 1];
        // first argument should be 'log'
        expect(recorded[0]).toBe('log');
        const recordedObj = recorded[1];
        expect(recordedObj.token).toBe('<REDACTED>');
        // shim redacts only top-level sensitive keys; nested.password remains copied
        expect(recordedObj.nested.password).toBe('p123');
    });

    test('console.debug is no-op when GOBO_DEBUG_ENABLED is false', () => {
        global.window.GOBO_DEBUG_ENABLED = false;
        const out = captureStdout(() => {
            console.debug('should not appear');
        });
        expect(out).toBe('');
    });
});
