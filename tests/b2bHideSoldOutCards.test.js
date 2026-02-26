/**
 * B2B Sold-Out Cards Test
 *
 * Verifies that "Next Connections" cards are visually marked (grayed out) when
 * all 4 price categories (interior, oceanView, balcony, suite) are sold out.
 * Chain cards should always be shown regardless of pricing.
 */
const fs = require('fs');
const path = require('path');

const b2bSrc = fs.readFileSync(path.join(__dirname, '../features/backToBackTool.js'), 'utf8');

describe('B2B Next Connections card sold-out handling', () => {
    test('sold-out detection uses isSoldOutValue helper on all 4 categories', () => {
        // Verify the source code contains the sold-out detection logic
        expect(b2bSrc).toMatch(/this\._getPricingData\s*\(opt\.meta/);
        expect(b2bSrc).toMatch(/pricingData\.valuesRaw/);
        expect(b2bSrc).toMatch(/const\s+isSoldOutValue\s*=\s*\(v\)/);
        expect(b2bSrc).toMatch(/isSoldOutValue\(raw\.interior\)/);
        expect(b2bSrc).toMatch(/isSoldOutValue\(raw\.oceanViewUpgrade\)/);
        expect(b2bSrc).toMatch(/isSoldOutValue\(raw\.balconyUpgrade\)/);
        expect(b2bSrc).toMatch(/isSoldOutValue\(raw\.suiteUpgrade\)/);
    });

    test('sold-out flag is set on opt when all prices sold out', () => {
        // Verify that the code sets opt.isSoldOut when all categories are sold out
        expect(b2bSrc).toMatch(/opt\.isSoldOut\s*=\s*isSoldOutValue[\s\S]*?&&[\s\S]*?isSoldOutValue[\s\S]*?&&[\s\S]*?isSoldOutValue[\s\S]*?&&[\s\S]*?isSoldOutValue/);
    });

    test('sold-out detection is wrapped in try-catch for resilience', () => {
        // Find the sold-out marking block and verify try-catch
        const markBlock = b2bSrc.match(/isSoldOutValue\s*=[\s\S]{0,200}options\.forEach\s*\(\s*opt\s*=>\s*\{[\s\S]{0,300}/);
        expect(markBlock).toBeTruthy();
        const block = markBlock[0];
        expect(block).toMatch(/try\s*\{/);
    });

    test('sold-out cards get b2b-sold-out CSS class', () => {
        // Verify cards are styled with sold-out class rather than hidden
        expect(b2bSrc).toMatch(/b2b-sold-out/);
        expect(b2bSrc).toMatch(/opt\.isSoldOut\s*\?\s*'[\s]*b2b-sold-out/);
    });

    test('_renderChain does not skip cards based on pricing', () => {
        // Extract the _renderChain method body
        const renderChainMatch = b2bSrc.match(/_renderChain\s*\(\s*\)\s*\{[\s\S]*?\n\s{8}},/);
        expect(renderChainMatch).toBeTruthy();
        const chainBlock = renderChainMatch[0];
        // Should NOT contain isSoldOut skip logic
        expect(chainBlock).not.toMatch(/const\s+isSoldOutValue\s*=/);
        expect(chainBlock).not.toMatch(/isSoldOutValue\(raw\./);
    });
});
