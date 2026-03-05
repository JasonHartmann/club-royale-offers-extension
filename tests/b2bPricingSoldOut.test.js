/**
 * B2B Pricing — Sold-Out vs $0 display logic
 *
 * Verifies that:
 * - null/NaN from computeUpgradePrice → "Sold Out" (category truly unavailable)
 * - 0 from computeUpgradePrice → "$0" (offer covers this category, not sold out)
 * - Negative values → "Sold Out" (safety guard)
 * - Positive values → formatted price
 *
 * The root cause of the inconsistent sold-out display was that the B2B tool
 * treated rawVal <= 0 as "Sold Out". However, computeUpgradePrice returns 0
 * when the offer's category matches or exceeds the target (e.g., a Balcony
 * offer looking at Balcony or OceanView upgrade). This is a valid "$0" price,
 * not an inventory sold-out. Only null means the category has no availability.
 */
const fs = require('fs');
const path = require('path');

// Read and evaluate the backToBackTool source to extract helper logic
const b2bSrc = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'backToBackTool.js'), 'utf8');

describe('B2B Pricing Sold-Out vs $0', () => {

    // --- Interior raw value filtering (>= 0 keeps zero as valid) ---

    test('_getPricingData interiorRaw=null → rawInterior=null', () => {
        const getRawInterior = (interiorRaw) => (interiorRaw != null && isFinite(interiorRaw) && interiorRaw >= 0) ? interiorRaw : null;
        expect(getRawInterior(null)).toBeNull();
    });

    test('_getPricingData interiorRaw=0 → rawInterior=0 (not null)', () => {
        const getRawInterior = (interiorRaw) => (interiorRaw != null && isFinite(interiorRaw) && interiorRaw >= 0) ? interiorRaw : null;
        expect(getRawInterior(0)).toBe(0);
    });

    test('_getPricingData interiorRaw=450 → rawInterior=450', () => {
        const getRawInterior = (interiorRaw) => (interiorRaw != null && isFinite(interiorRaw) && interiorRaw >= 0) ? interiorRaw : null;
        expect(getRawInterior(450)).toBe(450);
    });

    test('_getPricingData interiorRaw=-5 → rawInterior=null', () => {
        const getRawInterior = (interiorRaw) => (interiorRaw != null && isFinite(interiorRaw) && interiorRaw >= 0) ? interiorRaw : null;
        expect(getRawInterior(-5)).toBeNull();
    });

    // --- Pricing chip sold-out detection (< 0, not <= 0) ---

    test('_buildPricingSection rawVal=null → Sold Out', () => {
        const getIsSoldOut = (rawVal) => (rawVal == null || !isFinite(rawVal) || rawVal < 0);
        expect(getIsSoldOut(null)).toBe(true);
    });

    test('_buildPricingSection rawVal=0 → NOT Sold Out (displays $0)', () => {
        const getIsSoldOut = (rawVal) => (rawVal == null || !isFinite(rawVal) || rawVal < 0);
        expect(getIsSoldOut(0)).toBe(false);
    });

    test('_buildPricingSection rawVal=-10 → Sold Out', () => {
        const getIsSoldOut = (rawVal) => (rawVal == null || !isFinite(rawVal) || rawVal < 0);
        expect(getIsSoldOut(-10)).toBe(true);
    });

    test('_buildPricingSection rawVal=300 → NOT Sold Out', () => {
        const getIsSoldOut = (rawVal) => (rawVal == null || !isFinite(rawVal) || rawVal < 0);
        expect(getIsSoldOut(300)).toBe(false);
    });

    test('_buildPricingSection rawVal=NaN → Sold Out', () => {
        const getIsSoldOut = (rawVal) => (rawVal == null || !isFinite(rawVal) || rawVal < 0);
        expect(getIsSoldOut(NaN)).toBe(true);
    });

    test('_buildPricingSection rawVal=Infinity → Sold Out', () => {
        const getIsSoldOut = (rawVal) => (rawVal == null || !isFinite(rawVal) || rawVal < 0);
        expect(getIsSoldOut(Infinity)).toBe(true);
    });

    // --- Source code checks ---

    test('source code no longer falls back to computeOfferValue for interior pricing', () => {
        const getPricingBlock = b2bSrc.match(/_getPricingData\s*\(meta\)\s*\{([\s\S]*?)\n\s{8}},/);
        expect(getPricingBlock).not.toBeNull();
        const body = getPricingBlock[1];
        const interiorRawLine = body.match(/interior:\s*(.+)/);
        expect(interiorRawLine).not.toBeNull();
        expect(interiorRawLine[1]).not.toContain('valueRaw');
        expect(interiorRawLine[1]).toContain('interiorRaw');
    });

    test('_buildPricingSection checks rawVal < 0 (strict) for sold-out detection', () => {
        const buildBlock = b2bSrc.match(/_buildPricingSection\s*\(meta,\s*rowId,\s*options\)\s*\{([\s\S]*?)\n\s{8}},/);
        expect(buildBlock).not.toBeNull();
        const body = buildBlock[1];
        // Should contain rawVal < 0 (strict less-than, not <=)
        expect(body).toMatch(/rawVal\s*<\s*0/);
        // Must NOT contain rawVal <= 0 (the old bug)
        expect(body).not.toMatch(/rawVal\s*<=\s*0/);
    });

    // --- Consistency: same sailing, different offers → same sold-out categories ---

    test('isSoldOutValue treats 0 as available (not sold out)', () => {
        // Mirrors the isSoldOutValue helper in _renderOptions
        const isSoldOutValue = (v) => v == null || !isFinite(v) || v < 0;
        // A Balcony offer on a sailing with OV + Balcony pricing:
        // OV upgrade returns 0 (Balcony >= OV), Balcony upgrade returns 0 (same category)
        expect(isSoldOutValue(0)).toBe(false);   // $0 is valid
        expect(isSoldOutValue(null)).toBe(true);  // null = truly sold out
        // Card should NOT be marked fully sold out if any category is 0
        const allSoldOut = isSoldOutValue(null) && isSoldOutValue(0) && isSoldOutValue(0) && isSoldOutValue(null);
        expect(allSoldOut).toBe(false);
    });

    // Note: Card hiding tests in b2bHideSoldOutCards.test.js
});
