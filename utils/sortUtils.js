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
             }
            if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }
};