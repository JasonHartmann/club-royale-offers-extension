const SortUtils = {
    sortOffers(offers, sortColumn, sortOrder) {
        if (sortOrder === 'original') {
            return offers;
        }
        return offers.sort((a, b) => {
            let aValue, bValue;
            switch (sortColumn) {
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
                    aValue = a.sailing.roomType || '';
                    bValue = b.sailing.roomType || '';
                    break;
                case 'gobo':
                    aValue = a.sailing.isGOBO ? 'Yes' : 'No';
                    bValue = b.sailing.isGOBO ? 'Yes' : 'No';
                    break;
            }
            if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }
};