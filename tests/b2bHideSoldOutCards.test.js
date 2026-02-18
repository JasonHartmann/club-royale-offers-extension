/**
 * B2B Hide Sold-Out Cards Test
 *
 * Verifies that "Next Connections" cards are hidden when all 4 price categories
 * (interior, oceanView, balcony, suite) are sold out. Chain cards should always
 * be shown regardless of pricing.
 */
const fs = require('fs');
const path = require('path');

const b2bSrc = fs.readFileSync(path.join(__dirname, '../features/backToBackTool.js'), 'utf8');

describe('B2B Next Connections card hiding for all-sold-out', () => {
    test('_renderOptions contains skip logic for all-sold-out cards', () => {
        // Verify the source code contains the skip logic in _renderOptions
        expect(b2bSrc).toMatch(/this\._getPricingData\s*\(opt\.meta/);
        expect(b2bSrc).toMatch(/pricingData\.valuesRaw/);
        expect(b2bSrc).toMatch(/const\s+isSoldOut\s*=\s*\(v\)/);
        expect(b2bSrc).toMatch(/isSoldOut\(raw\.interior\)/);
        expect(b2bSrc).toMatch(/isSoldOut\(raw\.oceanViewUpgrade\)/);
        expect(b2bSrc).toMatch(/isSoldOut\(raw\.balconyUpgrade\)/);
        expect(b2bSrc).toMatch(/isSoldOut\(raw\.suiteUpgrade\)/);
    });

    test('skip logic returns early when all prices sold out', () => {
        // Verify that the code has the pattern: if all sold out, return
        // The condition spans multiple lines, so use [\s\S] to match across lines
        expect(b2bSrc).toMatch(/if\s*\(isSoldOut[\s\S]*?&&[\s\S]*?isSoldOut[\s\S]*?&&[\s\S]*?isSoldOut[\s\S]*?&&[\s\S]*?isSoldOut[\s\S]*?\)\s*\{[\s\S]*?return/);
    });

    test('skip logic is wrapped in try-catch for resilience', () => {
        // Find the _renderOptions function and verify try-catch around pricing check
        const renderOptionsMatch = b2bSrc.match(/_renderOptions\s*\(\s*\)\s*\{[\s\S]*?options\.forEach\s*\(\s*opt\s*=>\s*\{[\s\S]{0,500}/);
        expect(renderOptionsMatch).toBeTruthy();
        const block = renderOptionsMatch[0];
        expect(block).toMatch(/try\s*\{/);
    });

    test('_renderChain does not skip cards based on pricing', () => {
        // Extract the _renderChain method body
        const renderChainMatch = b2bSrc.match(/_renderChain\s*\(\s*\)\s*\{[\s\S]*?\n\s{8}\},/);
        expect(renderChainMatch).toBeTruthy();
        const chainBlock = renderChainMatch[0];
        // Should NOT contain isSoldOut skip logic
        expect(chainBlock).not.toMatch(/const\s+isSoldOut\s*=/);
        expect(chainBlock).not.toMatch(/isSoldOut\(raw\./);
    });
});
