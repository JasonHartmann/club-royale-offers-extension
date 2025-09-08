const Utils = {
    createOfferRow({ offer, sailing }, isNewest = false, isExpiringSoon = false) {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        if (isNewest) row.classList.add('newest-offer-row');
        if (isExpiringSoon) row.classList.add('expiring-soon-row');
        let qualityText = sailing.isGOBO ? '1 Guest' : '2 Guests';
        if (sailing.isDOLLARSOFF && sailing.DOLLARSOFF_AMT > 0) {
            qualityText += ` + $${sailing.DOLLARSOFF_AMT} off`;
        }
        if (sailing.isFREEPLAY && sailing.FREEPLAY_AMT > 0) {
            qualityText += ` + $${sailing.FREEPLAY_AMT} freeplay`;
        }
        let room = sailing.roomType;
        if (sailing.isGTY) {
            room = room ? room + ' GTY' : 'GTY';
        }
        const itinerary = sailing.itineraryDescription || sailing.sailingType?.name || '-';
        const { nights, destination } = App.Utils.parseItinerary(itinerary);
        row.innerHTML = `
            <td class="border p-2">${offer.campaignOffer?.offerCode || '-'}</td>
            <td class="border p-2">${App.Utils.formatDate(offer.campaignOffer?.startDate)}</td>
            <td class="border p-2">${App.Utils.formatDate(offer.campaignOffer?.reserveByDate)}</td>
            <td class="border p-2">${offer.campaignOffer.name || '-'}</td>
            <td class="border p-2">${sailing.shipName || '-'}</td>
            <td class="border p-2">${App.Utils.formatDate(sailing.sailDate)}</td>
            <td class="border p-2">${sailing.departurePort?.name || '-'}</td>
            <td class="border p-2">${nights}</td>
            <td class="border p-2">${destination}</td>
            <td class="border p-2">${room || '-'}</td>
            <td class="border p-2">${qualityText}</td>
        `;
        return row;
    },
    // Helper to format date string as MM/DD/YY without timezone shift
    formatDate(dateStr) {
        if (!dateStr) return '-';
        // Handles YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
        const [year, month, day] = dateStr.split('T')[0].split('-');
        return `${month}/${day}/${year.slice(-2)}`;
    },
    // Helper to extract nights and destination from itinerary string
    parseItinerary(itinerary) {
        if (!itinerary) return { nights: '-', destination: '-' };
        const match = itinerary.match(/^\s*(\d+)\s+NIGHT\s+(.*)$/i);
        if (match) {
            return { nights: match[1], destination: match[2] };
        }
        return { nights: '-', destination: itinerary };
    },
    // Helper to convert a string to title case (each word capitalized)
    toTitleCase(str) {
        return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    },
    // Helper to title-case only words longer than two characters
    toPortTitleCase(str) {
        if (!str) return str;
        return str.split(/(\W+)/).map(word => {
            if (/^[A-Za-z]{3,}$/.test(word)) {
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            return word;
        }).join('');
    },
    // Normalize fetched offers data: trim and standardize capitalization
    normalizeOffers(data) {
        if (data && Array.isArray(data.offers)) {
            data.offers.forEach((offerObj) => {
                const co = offerObj.campaignOffer;
                if (co) {
                    if (typeof co.offerCode === 'string') co.offerCode = co.offerCode.trim().toUpperCase();
                    if (typeof co.name === 'string') co.name = Utils.toTitleCase(co.name.trim());
                    if (Array.isArray(co.sailings)) {
                        co.sailings.forEach((sailing) => {
                            if (typeof sailing.shipName === 'string') sailing.shipName = Utils.toTitleCase(sailing.shipName.trim());
                            if (sailing.departurePort?.name) sailing.departurePort.name = Utils.toPortTitleCase(sailing.departurePort.name.trim());
                            if (typeof sailing.itineraryDescription === 'string') sailing.itineraryDescription = Utils.toTitleCase(sailing.itineraryDescription.trim());
                            if (sailing.sailingType?.name) sailing.sailingType.name = Utils.toTitleCase(sailing.sailingType.name.trim());
                        });
                    }
                }
            });
        }
        return data;
    }
};