const SortUtils = {
    sortOffers(offers, sortColumn, sortOrder) {
        if (sortOrder === 'original') {
            return offers;
        }
        return offers.sort((a, b) => {
            let aValue, bValue;
            switch (sortColumn) {
                case 'destination': {
                    const aItin = a.sailing.itineraryDescription || a.sailing.sailingType?.name || '';
                    const bItin = b.sailing.itineraryDescription || b.sailing.sailingType?.name || '';
                    aValue = App.Utils.parseItinerary(aItin).destination || '';
                    bValue = App.Utils.parseItinerary(bItin).destination || '';
                    break;
                }
                case 'nights': {
                    const aItin = a.sailing.itineraryDescription || a.sailing.sailingType?.name || '';
                    const bItin = b.sailing.itineraryDescription || b.sailing.sailingType?.name || '';
                    aValue = parseInt(App.Utils.parseItinerary(aItin).nights) || 0;
                    bValue = parseInt(App.Utils.parseItinerary(bItin).nights) || 0;
                    break;
                }
                case 'offerCode':
                    aValue = a.offer.campaignOffer?.offerCode || '';
                    bValue = b.offer.campaignOffer?.offerCode || '';
                    break;
                case 'offerDate':
                    aValue = new Date(a.offer.campaignOffer?.startDate).getTime() || 0;
                    bValue = new Date(b.offer.campaignOffer?.startDate).getTime() || 0;
                    break;
                case 'expiration':
                    aValue = new Date(a.offer.campaignOffer?.reserveByDate).getTime() || 0;
                    bValue = new Date(b.offer.campaignOffer?.reserveByDate).getTime() || 0;
                    break;
                case 'offerName':
                    aValue = a.offer.campaignOffer?.name || '';
                    bValue = b.offer.campaignOffer?.name || '';
                    break;
                case 'ship':
                    aValue = a.sailing.shipName || '';
                    bValue = b.sailing.shipName || '';
                    break;
                case 'sailDate':
                    aValue = new Date(a.sailing.sailDate).getTime() || 0;
                    bValue = new Date(b.sailing.sailDate).getTime() || 0;
                    break;
                case 'departurePort':
                    aValue = a.sailing.departurePort?.name || '';
                    bValue = b.sailing.departurePort?.name || '';
                    break;
                case 'itinerary':
                    aValue = a.sailing.itineraryDescription || a.sailing.sailingType?.name || '';
                    bValue = b.sailing.itineraryDescription || b.sailing.sailingType?.name || '';
                    break;
                case 'category':
                    let aRoom = a.sailing.roomType;
                    if (a.sailing.isGTY) {
                        aRoom = aRoom ? aRoom + ' GTY' : 'GTY';
                    }
                    let bRoom = b.sailing.roomType;
                    if (b.sailing.isGTY) {
                        bRoom = bRoom ? bRoom + ' GTY' : 'GTY';
                    }
                    aValue = aRoom || '';
                    bValue = bRoom || '';
                    break;
                case 'guests':
                    aValue = a.sailing.isGOBO ? '1 Guest' : '2 Guests';
                    if (a.sailing.isDOLLARSOFF && a.sailing.DOLLARSOFF_AMT > 0) {
                        aValue += ` + $${a.sailing.DOLLARSOFF_AMT} off`;
                    }
                    if (a.sailing.isFREEPLAY && a.sailing.FREEPLAY_AMT > 0) {
                        aValue += ` + $${a.sailing.FREEPLAY_AMT} freeplay`;
                    }
                    bValue = b.sailing.isGOBO ?  '1 Guest' : '2 Guests';
                    if (b.sailing.isDOLLARSOFF && b.sailing.DOLLARSOFF_AMT > 0) {
                        bValue += ` + $${b.sailing.DOLLARSOFF_AMT} off`;
                    }
                    if (b.sailing.isFREEPLAY && b.sailing.FREEPLAY_AMT > 0) {
                        bValue += ` + $${b.sailing.FREEPLAY_AMT} freeplay`;
                    }
                    break;
                case 'perks':
                    aValue = App.Utils.computePerks(a.offer, a.sailing) || '';
                    bValue = App.Utils.computePerks(b.offer, b.sailing) || '';
                    break;
                case 'shipClass':
                    aValue = App.Utils.getShipClass(a.sailing.shipName) || '';
                    bValue = App.Utils.getShipClass(b.sailing.shipName) || '';
                    break;
                case 'tradeInValue': {
                    const aRaw = a.offer.campaignOffer?.tradeInValue;
                    const bRaw = b.offer.campaignOffer?.tradeInValue;
                    function parseTrade(v) {
                        if (v === null || v === undefined) return NaN;
                        if (typeof v === 'number') return v;
                        const cleaned = String(v).replace(/[^0-9.\-]/g, '');
                        if (cleaned === '') return NaN;
                        const p = parseFloat(cleaned);
                        return isNaN(p) ? NaN : p;
                    }
                    const aNum = parseTrade(aRaw);
                    const bNum = parseTrade(bRaw);
                    if (!isNaN(aNum) && !isNaN(bNum)) {
                        aValue = aNum;
                        bValue = bNum;
                    } else {
                        aValue = String(aRaw || '').toLowerCase();
                        bValue = String(bRaw || '').toLowerCase();
                    }
                    break;
                }
                case 'offerValue': {
                    try {
                        const aNum = (App && App.Utils && App.Utils.computeOfferValue) ? App.Utils.computeOfferValue(a.offer, a.sailing) : (Utils.computeOfferValue ? Utils.computeOfferValue(a.offer, a.sailing) : null);
                        const bNum = (App && App.Utils && App.Utils.computeOfferValue) ? App.Utils.computeOfferValue(b.offer, b.sailing) : (Utils.computeOfferValue ? Utils.computeOfferValue(b.offer, b.sailing) : null);
                        if (isFinite(aNum) && isFinite(bNum)) { aValue = aNum; bValue = bNum; }
                        else { aValue = isFinite(aNum)?aNum: -Infinity; bValue = isFinite(bNum)?bNum: -Infinity; }
                    } catch(e){ aValue = -Infinity; bValue = -Infinity; }
                    break;
                }
                case 'interior': {
                    const includeTF = (App && App.Utils && typeof App.Utils.getIncludeTaxesAndFeesPreference === 'function') ? App.Utils.getIncludeTaxesAndFeesPreference(App && App.TableRenderer ? App.TableRenderer.lastState : null) : true;
                    try {
                        const aNum = (App && App.Utils && typeof App.Utils.computeInteriorYouPayPrice === 'function')
                            ? App.Utils.computeInteriorYouPayPrice(a.offer, a.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null })
                            : null;
                        const bNum = (App && App.Utils && typeof App.Utils.computeInteriorYouPayPrice === 'function')
                            ? App.Utils.computeInteriorYouPayPrice(b.offer, b.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null })
                            : null;
                        const aMissing = (aNum === null || aNum === undefined || !isFinite(aNum));
                        const bMissing = (bNum === null || bNum === undefined || !isFinite(bNum));
                        if (aMissing && !bMissing) return 1;
                        if (!aMissing && bMissing) return -1;
                        if (aMissing && bMissing) { aValue = 0; bValue = 0; break; }
                        aValue = aNum;
                        bValue = bNum;
                    } catch(e){ aValue = -Infinity; bValue = -Infinity; }
                    break;
                }
                case 'suiteUpgrade': {
                    const includeTF = (App && App.Utils && typeof App.Utils.getIncludeTaxesAndFeesPreference === 'function') ? App.Utils.getIncludeTaxesAndFeesPreference(App && App.TableRenderer ? App.TableRenderer.lastState : null) : true;
                    try {
                        const aNum = (App && App.Utils && typeof App.Utils.computeUpgradePriceForColumn === 'function')
                            ? App.Utils.computeUpgradePriceForColumn('suiteUpgrade', a.offer, a.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null })
                            : (App && App.Utils && typeof App.Utils.computeSuiteUpgradePrice === 'function') ? App.Utils.computeSuiteUpgradePrice(a.offer, a.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null }) : (App && App.PricingUtils && typeof App.PricingUtils.computeSuiteUpgradePrice === 'function' ? App.PricingUtils.computeSuiteUpgradePrice(a.offer, a.sailing, { includeTaxes: includeTF }) : null);
                        const bNum = (App && App.Utils && typeof App.Utils.computeUpgradePriceForColumn === 'function')
                            ? App.Utils.computeUpgradePriceForColumn('suiteUpgrade', b.offer, b.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null })
                            : (App && App.Utils && typeof App.Utils.computeSuiteUpgradePrice === 'function') ? App.Utils.computeSuiteUpgradePrice(b.offer, b.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null }) : (App && App.PricingUtils && typeof App.PricingUtils.computeSuiteUpgradePrice === 'function' ? App.PricingUtils.computeSuiteUpgradePrice(b.offer, b.sailing, { includeTaxes: includeTF }) : null);
                        const aMissing = (aNum === null || aNum === undefined || !isFinite(aNum));
                        const bMissing = (bNum === null || bNum === undefined || !isFinite(bNum));
                        if (aMissing && !bMissing) return 1; // always push missing ('-') to bottom
                        if (!aMissing && bMissing) return -1;
                        if (aMissing && bMissing) { aValue = 0; bValue = 0; break; }
                        aValue = aNum;
                        bValue = bNum;
                    } catch(e){ aValue = -Infinity; bValue = -Infinity; }
                    break;
                }
                case 'balconyUpgrade': {
                    const includeTF = (App && App.Utils && typeof App.Utils.getIncludeTaxesAndFeesPreference === 'function') ? App.Utils.getIncludeTaxesAndFeesPreference(App && App.TableRenderer ? App.TableRenderer.lastState : null) : true;
                    try {
                        const aNum = (App && App.Utils && typeof App.Utils.computeUpgradePriceForColumn === 'function')
                            ? App.Utils.computeUpgradePriceForColumn('balconyUpgrade', a.offer, a.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null })
                            : (App && App.Utils && typeof App.Utils.computeBalconyUpgradePrice === 'function') ? App.Utils.computeBalconyUpgradePrice(a.offer, a.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null }) : (App && App.PricingUtils && typeof App.PricingUtils.computeBalconyUpgradePrice === 'function' ? App.PricingUtils.computeBalconyUpgradePrice(a.offer, a.sailing, { includeTaxes: includeTF }) : null);
                        const bNum = (App && App.Utils && typeof App.Utils.computeUpgradePriceForColumn === 'function')
                            ? App.Utils.computeUpgradePriceForColumn('balconyUpgrade', b.offer, b.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null })
                            : (App && App.Utils && typeof App.Utils.computeBalconyUpgradePrice === 'function') ? App.Utils.computeBalconyUpgradePrice(b.offer, b.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null }) : (App && App.PricingUtils && typeof App.PricingUtils.computeBalconyUpgradePrice === 'function' ? App.PricingUtils.computeBalconyUpgradePrice(b.offer, b.sailing, { includeTaxes: includeTF }) : null);
                        const aMissing = (aNum === null || aNum === undefined || !isFinite(aNum));
                        const bMissing = (bNum === null || bNum === undefined || !isFinite(bNum));
                        if (aMissing && !bMissing) return 1;
                        if (!aMissing && bMissing) return -1;
                        if (aMissing && bMissing) { aValue = 0; bValue = 0; break; }
                        aValue = aNum;
                        bValue = bNum;
                    } catch(e){ aValue = -Infinity; bValue = -Infinity; }
                    break;
                }
                case 'oceanViewUpgrade': {
                    const includeTF = (App && App.Utils && typeof App.Utils.getIncludeTaxesAndFeesPreference === 'function') ? App.Utils.getIncludeTaxesAndFeesPreference(App && App.TableRenderer ? App.TableRenderer.lastState : null) : true;
                    try {
                        const aNum = (App && App.Utils && typeof App.Utils.computeUpgradePriceForColumn === 'function')
                            ? App.Utils.computeUpgradePriceForColumn('oceanViewUpgrade', a.offer, a.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null })
                            : (App && App.Utils && typeof App.Utils.computeOceanViewUpgradePrice === 'function') ? App.Utils.computeOceanViewUpgradePrice(a.offer, a.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null }) : (App && App.PricingUtils && typeof App.PricingUtils.computeOceanViewUpgradePrice === 'function' ? App.PricingUtils.computeOceanViewUpgradePrice(a.offer, a.sailing, { includeTaxes: includeTF }) : null);
                        const bNum = (App && App.Utils && typeof App.Utils.computeUpgradePriceForColumn === 'function')
                            ? App.Utils.computeUpgradePriceForColumn('oceanViewUpgrade', b.offer, b.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null })
                            : (App && App.Utils && typeof App.Utils.computeOceanViewUpgradePrice === 'function') ? App.Utils.computeOceanViewUpgradePrice(b.offer, b.sailing, { includeTaxes: includeTF, state: App && App.TableRenderer ? App.TableRenderer.lastState : null }) : (App && App.PricingUtils && typeof App.PricingUtils.computeOceanViewUpgradePrice === 'function' ? App.PricingUtils.computeOceanViewUpgradePrice(b.offer, b.sailing, { includeTaxes: includeTF }) : null);
                        const aMissing = (aNum === null || aNum === undefined || !isFinite(aNum));
                        const bMissing = (bNum === null || bNum === undefined || !isFinite(bNum));
                        if (aMissing && !bMissing) return 1;
                        if (!aMissing && bMissing) return -1;
                        if (aMissing && bMissing) { aValue = 0; bValue = 0; break; }
                        aValue = aNum;
                        bValue = bNum;
                    } catch(e){ aValue = -Infinity; bValue = -Infinity; }
                    break;
                }
                case 'b2bDepth': {
                    // Prefer chain ID strings when present (favorites), otherwise numeric depth
                    const viewingFavorites = (typeof App !== 'undefined' && App.CurrentProfile && App.CurrentProfile.key === 'goob-favorites');
                    if (viewingFavorites) {
                        const aChain = a.sailing && a.sailing.__b2bChainId ? String(a.sailing.__b2bChainId) : null;
                        const bChain = b.sailing && b.sailing.__b2bChainId ? String(b.sailing.__b2bChainId) : null;
                        if (aChain || bChain) {
                            aValue = aChain ? `0_${aChain.toLowerCase()}` : `1_${String((a.sailing && typeof a.sailing.__b2bDepth === 'number') ? a.sailing.__b2bDepth : 1)}`;
                            bValue = bChain ? `0_${bChain.toLowerCase()}` : `1_${String((b.sailing && typeof b.sailing.__b2bDepth === 'number') ? b.sailing.__b2bDepth : 1)}`;
                        } else {
                            const aNum = (a.sailing && typeof a.sailing.__b2bDepth === 'number') ? a.sailing.__b2bDepth : 1;
                            const bNum = (b.sailing && typeof b.sailing.__b2bDepth === 'number') ? b.sailing.__b2bDepth : 1;
                            aValue = aNum;
                            bValue = bNum;
                        }
                    } else {
                        const aNum = (a.sailing && typeof a.sailing.__b2bDepth === 'number') ? a.sailing.__b2bDepth : 1;
                        const bNum = (b.sailing && typeof b.sailing.__b2bDepth === 'number') ? b.sailing.__b2bDepth : 1;
                        aValue = aNum;
                        bValue = bNum;
                    }
                    break;
                }
             }
            if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
            // Primary values are equal. If the active sort column is not 'sailDate',
            // use sailDate (ascending) as a stable secondary key so rows are grouped
            // by the selected column and then ordered by sail date.
            if (sortColumn !== 'sailDate') {
                const aSail = a && a.sailing && a.sailing.sailDate ? new Date(a.sailing.sailDate).getTime() : 0;
                const bSail = b && b.sailing && b.sailing.sailDate ? new Date(b.sailing.sailDate).getTime() : 0;
                if (aSail < bSail) return -1;
                if (aSail > bSail) return 1;
            }
            return 0;
        });
    }
};