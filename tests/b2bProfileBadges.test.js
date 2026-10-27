/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

function load() {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'backToBackTool.js'), 'utf8');
    new Function(src)();
    return window.BackToBackTool;
}

describe('combined profile badges in the builder', () => {
    test('shows source badges only on the combined tab', () => {
        const tool = load();
        const meta = { entry: { sailing: { __profileSources: [{ id: 1, email: 'a@x.com' }, { id: 2, key: 'gobo-R-b' }] } } };
        tool._context = { state: { selectedProfileKey: 'gobo-R-a' } };
        expect(tool._profileBadges(meta)).toBeNull();
        tool._context = { state: { selectedProfileKey: 'goob-combined-linked' } };
        const row = tool._profileBadges(meta);
        expect([...row.querySelectorAll('.profile-id-badge')].map(b => b.textContent)).toEqual(['1', '2']);
        expect(row.querySelector('.profile-id-badge-1').title).toBe('a@x.com');
        expect(row.querySelector('.profile-id-badge-2').title).toBe('gobo-R-b');
    });
});
