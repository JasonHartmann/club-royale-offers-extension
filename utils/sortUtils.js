// Sort utilities.
//
// sortOffers uses a decorate-sort-undecorate (Schwartzian) transform: each row's
// sort key is computed exactly once (O(n) heavy work), then the rows are ordered
// by the precomputed keys (O(n log n) cheap comparisons). The previous
// implementation recomputed derived values (parseItinerary, computePerks, price
// calcs, Date parsing) inside the comparator, so every one of the ~n log n
// comparisons re-ran the heavy work — several seconds for a few thousand rows.
//
// The comparator semantics are preserved exactly, including the non-obvious
// cross-row cases:
//   - tradeInValue compares numerically only when BOTH rows parse as numbers,
//     otherwise as lowercased strings.
//   - b2bDepth, while viewing favorites, orders chain rows (0_<chain>) before
//     non-chain rows (1_<depth>) when either row has a chain.
//   - interior/upgrade columns push missing values to the bottom regardless of
//     direction, and a thrown price calc orders by sail date.
//   - equal primary values fall back to sail date (ascending) unless sorting by
//     sail date itself.
const SortUtils = {
    _parseTrade(v) {
        if (v === null || v === undefined) return NaN;
        if (typeof v === 'number') return v;
        const cleaned = String(v).replace(/[^0-9.\-]/g, '');
        if (cleaned === '') return NaN;
        const p = parseFloat(cleaned);
        return isNaN(p) ? NaN : p;
    },

    // Compute the sort key for a single row. `state` encodes the row's status for
    // the price columns: 0 = present, 1 = missing (pushed to bottom), 2 = threw.
    _buildKey(row, sortColumn) {
        const sail = row && row.sailing && row.sailing.sailDate ? new Date(row.sailing.sailDate).getTime() : 0;
        let state = 0;
        let v;
        switch (sortColumn) {
            case 'destination': {
                const itin = row.sailing.itineraryDescription || row.sailing.sailingType?.name || '';
                v = App.Utils.parseItinerary(itin).destination || '';
                break;
            }
            case 'nights': {
                const itin = row.sailing.itineraryDescription || row.sailing.sailingType?.name || '';
                v = parseInt(App.Utils.parseItinerary(itin).nights) || 0;
                break;
            }
            case 'offerCode':
                v = row.offer.campaignOffer?.offerCode || '';
                break;
            case 'offerDate':
                v = new Date(row.offer.campaignOffer?.startDate).getTime() || 0;
                break;
            case 'expiration':
                v = new Date(row.offer.campaignOffer?.reserveByDate).getTime() || 0;
                break;
            case 'offerName':
                v = row.offer.campaignOffer?.name || '';
                break;
            case 'ship':
                v = row.sailing.shipName || '';
                break;
            case 'sailDate':
                v = new Date(row.sailing.sailDate).getTime() || 0;
                break;
            case 'departurePort':
                v = row.sailing.departurePort?.name || '';
                break;
            case 'itinerary':
                v = row.sailing.itineraryDescription || row.sailing.sailingType?.name || '';
                break;
            case 'category': {
                let room = row.sailing.roomType;
                if (row.sailing.isGTY) room = room ? room + ' GTY' : 'GTY';
                v = room || '';
                break;
            }
            case 'guests': {
                let g = row.sailing.isGOBO ? '1 Guest' : '2 Guests';
                if (row.sailing.isDOLLARSOFF && row.sailing.DOLLARSOFF_AMT > 0) g += ` + $${row.sailing.DOLLARSOFF_AMT} off`;
                if (row.sailing.isFREEPLAY && row.sailing.FREEPLAY_AMT > 0) g += ` + $${row.sailing.FREEPLAY_AMT} freeplay`;
                v = g;
                break;
            }
            case 'perks':
                v = App.Utils.computePerks(row.offer, row.sailing) || '';
                break;
            case 'shipClass':
                v = App.Utils.getShipClass(row.sailing.shipName) || '';
                break;
            case 'tradeInValue': {
                const raw = row.offer.campaignOffer?.tradeInValue;
                const num = this._parseTrade(raw);
                v = { raw: String(raw || '').toLowerCase(), num: isNaN(num) ? null : num };
                break;
            }
            case 'offerValue': {
                try {
                    const num = (App && App.Utils && App.Utils.computeOfferValue) ? App.Utils.computeOfferValue(row.offer, row.sailing) : (Utils.computeOfferValue ? Utils.computeOfferValue(row.offer, row.sailing) : null);
                    v = isFinite(num) ? num : -Infinity;
                } catch (e) { state = 2; v = -Infinity; }
                break;
            }
            case 'interior': {
                const includeTF = (App && App.Utils && typeof App.Utils.getIncludeTaxesAndFeesPreference === 'function') ? App.Utils.getIncludeTaxesAndFeesPreference(App && App.TableRenderer ? App.TableRenderer.lastState : null) : true;
                try {
                    const num = (App && App.Utils && typeof App.Utils.computeInteriorYouPayPrice === 'function')
                        ? App.Utils.computeInteriorYouPayPrice(row.offer, row.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null })
                        : null;
                    if (num === null || num === undefined || !isFinite(num)) { state = 1; v = 0; } else { v = num; }
                } catch (e) { state = 2; v = -Infinity; }
                break;
            }
            case 'suiteUpgrade': {
                const includeTF = (App && App.Utils && typeof App.Utils.getIncludeTaxesAndFeesPreference === 'function') ? App.Utils.getIncludeTaxesAndFeesPreference(App && App.TableRenderer ? App.TableRenderer.lastState : null) : true;
                try {
                    const num = (App && App.Utils && typeof App.Utils.computeUpgradePriceForColumn === 'function')
                        ? App.Utils.computeUpgradePriceForColumn('suiteUpgrade', row.offer, row.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null })
                        : (App && App.Utils && typeof App.Utils.computeSuiteUpgradePrice === 'function') ? App.Utils.computeSuiteUpgradePrice(row.offer, row.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null }) : (App && App.PricingUtils && typeof App.PricingUtils.computeSuiteUpgradePrice === 'function' ? App.PricingUtils.computeSuiteUpgradePrice(row.offer, row.sailing, { includeTaxes: includeTF }) : null);
                    if (num === null || num === undefined || !isFinite(num)) { state = 1; v = 0; } else { v = num; }
                } catch (e) { state = 2; v = -Infinity; }
                break;
            }
            case 'balconyUpgrade': {
                const includeTF = (App && App.Utils && typeof App.Utils.getIncludeTaxesAndFeesPreference === 'function') ? App.Utils.getIncludeTaxesAndFeesPreference(App && App.TableRenderer ? App.TableRenderer.lastState : null) : true;
                try {
                    const num = (App && App.Utils && typeof App.Utils.computeUpgradePriceForColumn === 'function')
                        ? App.Utils.computeUpgradePriceForColumn('balconyUpgrade', row.offer, row.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null })
                        : (App && App.Utils && typeof App.Utils.computeBalconyUpgradePrice === 'function') ? App.Utils.computeBalconyUpgradePrice(row.offer, row.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null }) : (App && App.PricingUtils && typeof App.PricingUtils.computeBalconyUpgradePrice === 'function' ? App.PricingUtils.computeBalconyUpgradePrice(row.offer, row.sailing, { includeTaxes: includeTF }) : null);
                    if (num === null || num === undefined || !isFinite(num)) { state = 1; v = 0; } else { v = num; }
                } catch (e) { state = 2; v = -Infinity; }
                break;
            }
            case 'oceanViewUpgrade': {
                const includeTF = (App && App.Utils && typeof App.Utils.getIncludeTaxesAndFeesPreference === 'function') ? App.Utils.getIncludeTaxesAndFeesPreference(App && App.TableRenderer ? App.TableRenderer.lastState : null) : true;
                try {
                    const num = (App && App.Utils && typeof App.Utils.computeUpgradePriceForColumn === 'function')
                        ? App.Utils.computeUpgradePriceForColumn('oceanViewUpgrade', row.offer, row.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null })
                        : (App && App.Utils && typeof App.Utils.computeOceanViewUpgradePrice === 'function') ? App.Utils.computeOceanViewUpgradePrice(row.offer, row.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null }) : (App && App.PricingUtils && typeof App.PricingUtils.computeOceanViewUpgradePrice === 'function' ? App.PricingUtils.computeOceanViewUpgradePrice(row.offer, row.sailing, { includeTaxes: includeTF }) : null);
                    if (num === null || num === undefined || !isFinite(num)) { state = 1; v = 0; } else { v = num; }
                } catch (e) { state = 2; v = -Infinity; }
                break;
            }
            case 'b2bDepth': {
                const chain = row.sailing && row.sailing.__b2bChainId ? String(row.sailing.__b2bChainId) : null;
                const depth = (row.sailing && typeof row.sailing.__b2bDepth === 'number') ? row.sailing.__b2bDepth : 1;
                v = { chain, depth };
                break;
            }
        }
        return { v, sail, state };
    },

    _cmpSail(ka, kb) {
        if (ka.sail < kb.sail) return -1;
        if (ka.sail > kb.sail) return 1;
        return 0;
    },

    _compareKeys(ka, kb, dir, sortColumn) {
        // A thrown price calc orders by sail date (matches the old catch path).
        if (ka.state === 2 || kb.state === 2) return this._cmpSail(ka, kb);
        // Missing price values always sink to the bottom, regardless of direction.
        if (ka.state === 1 || kb.state === 1) {
            if (ka.state === 1 && kb.state === 1) return this._cmpSail(ka, kb);
            return ka.state === 1 ? 1 : -1;
        }
        let primary;
        if (sortColumn === 'tradeInValue') {
            // Numeric only when both rows parse as numbers; else lowercased strings.
            const aNum = ka.v.num, bNum = kb.v.num;
            if (aNum !== null && bNum !== null) {
                primary = aNum < bNum ? -1 : (aNum > bNum ? 1 : 0);
            } else {
                primary = ka.v.raw < kb.v.raw ? -1 : (ka.v.raw > kb.v.raw ? 1 : 0);
            }
        } else if (sortColumn === 'b2bDepth') {
            const viewingFavorites = (typeof App !== 'undefined' && App.CurrentProfile && App.CurrentProfile.key === 'goob-favorites');
            if (viewingFavorites && (ka.v.chain || kb.v.chain)) {
                const aStr = ka.v.chain ? `0_${ka.v.chain.toLowerCase()}` : `1_${ka.v.depth}`;
                const bStr = kb.v.chain ? `0_${kb.v.chain.toLowerCase()}` : `1_${kb.v.depth}`;
                primary = aStr < bStr ? -1 : (aStr > bStr ? 1 : 0);
            } else {
                primary = ka.v.depth < kb.v.depth ? -1 : (ka.v.depth > kb.v.depth ? 1 : 0);
            }
        } else {
            primary = ka.v < kb.v ? -1 : (ka.v > kb.v ? 1 : 0);
        }
        if (primary !== 0) return dir === 'asc' ? primary : -primary;
        // Primary values are equal: fall back to sail date (ascending) unless the
        // active column is sail date itself.
        if (sortColumn !== 'sailDate') return this._cmpSail(ka, kb);
        return 0;
    },

    sortOffers(offers, sortColumn, sortOrder) {
        if (sortOrder === 'original') {
            return offers;
        }
        const S = SortUtils;
        // Decorate: compute each row's key once.
        const decorated = offers.map((row) => ({ row, key: S._buildKey(row, sortColumn) }));
        // Sort by the precomputed keys (cheap comparisons; stable for equal keys).
        decorated.sort((x, y) => S._compareKeys(x.key, y.key, sortOrder, sortColumn));
        // Undecorate: write the sorted order back into the input array so callers
        // that rely on in-place mutation (and the test suite) keep working.
        for (let i = 0; i < offers.length; i++) offers[i] = decorated[i].row;
        return offers;
    }
};
