const fs = require('fs');
const path = require('path');

function collectJsFiles(dir, results = []) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const it of items) {
        if (it.name === 'node_modules' || it.name.startsWith('.')) continue;
        const full = path.join(dir, it.name);
        if (it.isDirectory()) collectJsFiles(full, results);
        else if (it.isFile() && full.endsWith('.js')) results.push(full);
    }
    return results;
}

describe('Workspace JS syntax', () => {
    test('all feature and util JS files parse without SyntaxError', () => {
        const base = path.resolve(__dirname, '..');
        const candidates = [];
        ['features', 'utils'].forEach(sub => {
            const dir = path.join(base, sub);
            if (fs.existsSync(dir)) candidates.push(...collectJsFiles(dir));
        });
        // also include top-level files commonly loaded in the extension
        ['app.js', 'modal.js', 'tableBuilder.js', 'tableRenderer.js', 'backToBackTool.js'].forEach(f => {
            const p = path.join(base, f);
            if (fs.existsSync(p)) candidates.push(p);
        });

        const errors = [];
        candidates.forEach(file => {
            const src = fs.readFileSync(file, 'utf8');
            try {
                // Use Function constructor to parse without executing in Node's module scope
                new Function(src);
            } catch (err) {
                errors.push({ file, message: err && err.message ? err.message : String(err) });
            }
        });
        if (errors.length) {
            const msg = errors.map(e => `${e.file}: ${e.message}`).join('\n');
            throw new Error('Syntax errors found:\n' + msg);
        }
    }, 10000);
});
