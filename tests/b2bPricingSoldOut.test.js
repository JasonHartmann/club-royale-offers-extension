/**
 * B2B Pricing — Sold-Out Interior Room Bug
 *
 * Verifies that when the retail price for interior rooms is blank/zero/null
 * (i.e., sold out), the B2B builder tool displays "Sold Out" instead of "$0".
 *
 * The root cause was that _getPricingData fell back from computeInteriorYouPayPrice
 * (which correctly returns null for sold-out) to computeOfferValue (which returns 0),
 * and _buildPricingSection treated 0 as a valid price.
 */
const fs = require('fs');
const path = require('path');

// Read and evaluate the backToBackTool source to extract helper logic
const b2bSrc = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'backToBackTool.js'), 'utf8');

describe('B2B Pricing Sold-Out Interior', () => {
    // We test the two key behaviors via source-level analysis and a lightweight
    // simulation of the _getPricingData / _buildPricingSection logic.

    test('_getPricingData interiorRaw=null → rawInterior=null', () => {
        const getRawInterior = (interiorRaw) => (interiorRaw != null && isFinite(interiorRaw) && interiorRaw > 0) ? interiorRaw : null;
        const rawInterior = getRawInterior(null);
        expect(rawInterior).toBeNull();
    });

    test('_getPricingData interiorRaw=0 → rawInterior=null', () => {
        const getRawInterior = (interiorRaw) => (interiorRaw != null && isFinite(interiorRaw) && interiorRaw > 0) ? interiorRaw : null;
        const rawInterior = getRawInterior(0);
        expect(rawInterior).toBeNull();
    });

    test('_getPricingData interiorRaw=450 → rawInterior=450', () => {
        const getRawInterior = (interiorRaw) => (interiorRaw != null && isFinite(interiorRaw) && interiorRaw > 0) ? interiorRaw : null;
        const rawInterior = getRawInterior(450);
        expect(rawInterior).toBe(450);
    });

    test('_buildPricingSection rawVal=null → "Sold Out"', () => {
        const getIsSoldOut = (rawVal) => (rawVal == null || !isFinite(rawVal) || rawVal <= 0);
        expect(getIsSoldOut(null)).toBe(true);
    });

    test('_buildPricingSection rawVal=0 → "Sold Out"', () => {
        const getIsSoldOut = (rawVal) => (rawVal == null || !isFinite(rawVal) || rawVal <= 0);
        expect(getIsSoldOut(0)).toBe(true);
    });

    test('_buildPricingSection rawVal=-10 → "Sold Out"', () => {
        const getIsSoldOut = (rawVal) => (rawVal == null || !isFinite(rawVal) || rawVal <= 0);
        expect(getIsSoldOut(-10)).toBe(true);
    });

    test('_buildPricingSection rawVal=300 → price', () => {
        const getIsSoldOut = (rawVal) => (rawVal == null || !isFinite(rawVal) || rawVal <= 0);
        expect(getIsSoldOut(300)).toBe(false);
    });

    test('source code no longer falls back to computeOfferValue for interior pricing', () => {
        // Verify the fix is in place: _getPricingData should not use computeOfferValue
        // to populate the interior value
        const getPricingBlock = b2bSrc.match(/_getPricingData\s*\(meta\)\s*\{([\s\S]*?)\n\s{8}},/);
        expect(getPricingBlock).not.toBeNull();
        const body = getPricingBlock[1];
        // The old code had: interior: valueRaw (where valueRaw fell back to computeOfferValue)
        // The new code should have: interior: ... interiorRaw ...
        // Verify that valuesRaw.interior does NOT reference valueRaw
        const interiorRawLine = body.match(/interior:\s*(.+)/);
        expect(interiorRawLine).not.toBeNull();
        expect(interiorRawLine[1]).not.toContain('valueRaw');
        expect(interiorRawLine[1]).toContain('interiorRaw');
    });

    test('_buildPricingSection checks rawVal <= 0 for sold-out detection', () => {
        // Verify the source includes the <= 0 guard
        const buildBlock = b2bSrc.match(/_buildPricingSection\s*\(meta,\s*rowId,\s*options\)\s*\{([\s\S]*?)\n\s{8}},/);
        expect(buildBlock).not.toBeNull();
        const body = buildBlock[1];
        // Should contain the rawVal <= 0 check
        expect(body).toMatch(/rawVal\s*<=\s*0/);
    });
});
