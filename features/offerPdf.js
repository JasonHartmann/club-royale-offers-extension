(function() {
    'use strict';

    const OFFER_PDF_CSS = `* { box-sizing: border-box; }
html { background: #f8fafc; }
html.gobo-dark { background: #0f172a; }
body { margin: 0; font-family: 'Trebuchet MS', 'Segoe UI', Verdana, sans-serif; color: #0f172a; min-height: 100vh; position: relative; }
html.gobo-dark body { color: #e2e8f0; }
.gobo-flyer-aurora { position: fixed; inset: -20%; z-index: -1; pointer-events: none; filter: blur(40px); background: radial-gradient(60% 50% at 20% 30%, rgba(201,162,39,0.18), transparent 70%), radial-gradient(50% 40% at 80% 20%, rgba(56,189,248,0.14), transparent 70%), radial-gradient(60% 50% at 60% 80%, rgba(99,102,241,0.12), transparent 70%); animation: gobo-aurora 22s ease-in-out infinite alternate; }
html.gobo-dark .gobo-flyer-aurora { background: radial-gradient(60% 50% at 20% 30%, rgba(250,204,21,0.16), transparent 70%), radial-gradient(50% 40% at 80% 20%, rgba(56,189,248,0.12), transparent 70%), radial-gradient(60% 50% at 60% 80%, rgba(129,140,248,0.18), transparent 70%); }
@keyframes gobo-aurora { from { transform: translate3d(-2%,-1%,0) scale(1); } to { transform: translate3d(2%,2%,0) scale(1.06); } }
@media (prefers-reduced-motion: reduce) { .gobo-flyer-aurora { animation: none; } }
.gobo-flyer-exit { position: sticky; top: 0; z-index: 10; padding: 10px 16px; background: rgba(248,250,252,0.86); backdrop-filter: blur(8px); }
html.gobo-dark .gobo-flyer-exit { background: rgba(15,23,42,0.86); }
.gobo-flyer-back { min-height: 44px; min-width: 44px; padding: 8px 16px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; color: #0f172a; font-size: 14px; cursor: pointer; }
html.gobo-dark .gobo-flyer-back { background: #1e293b; color: #e2e8f0; border-color: #334155; }
.gobo-flyer-sheet { max-width: 8.5in; margin: 0 auto; padding: 16px; }
.gobo-flyer-gold-band { background: #c9a227; color: #fff; border-radius: 8px; padding: 20px 24px; text-align: center; }
.gobo-flyer-kicker { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #7a5b12; font-weight: 700; }
.gobo-flyer-h1 { margin: 12px 0 8px; font-size: 22px; line-height: 1.3; color: #fff; text-transform: uppercase; }
.gobo-flyer-taxes { font-size: 13px; font-weight: 600; color: #7a5b12; }
.gobo-flyer-redeem { margin-top: 10px; font-size: 14px; font-weight: 700; color: #7a5b12; }
.gobo-flyer-body-title { margin: 24px 0 12px; font-size: 20px; text-align: center; color: #d97706; text-transform: uppercase; }
html.gobo-dark .gobo-flyer-body-title { color: #fbbf24; }
.gobo-flyer-section { margin-bottom: 20px; }
.gobo-flyer-section-header { background: #4b5563; color: #fff; padding: 8px 12px; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; border-radius: 6px 6px 0 0; }
html.gobo-dark .gobo-flyer-section-header { background: #334155; }
.gobo-flyer-section-header[data-room="Suite"] { background: #6d28d9; }
.gobo-flyer-section-header[data-room="Balcony"] { background: #1d4ed8; }
.gobo-flyer-section-header[data-room="Ocean View"] { background: #4b5563; }
.gobo-flyer-section-header[data-room="Interior"] { background: #4d7c5f; }
html.gobo-dark .gobo-flyer-section-header[data-room="Suite"] { background: #7c3aed; }
html.gobo-dark .gobo-flyer-section-header[data-room="Balcony"] { background: #2563eb; }
html.gobo-dark .gobo-flyer-section-header[data-room="Ocean View"] { background: #475569; }
html.gobo-dark .gobo-flyer-section-header[data-room="Interior"] { background: #5f8a6f; }
.gobo-flyer-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.gobo-flyer-table th { text-align: left; padding: 8px 12px; border-bottom: 2px solid #e2e8f0; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #64748b; }
html.gobo-dark .gobo-flyer-table th { border-bottom-color: #334155; color: #94a3b8; }
.gobo-flyer-table td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
html.gobo-dark .gobo-flyer-table td { border-bottom-color: #1e293b; }
.gobo-flyer-ship { font-weight: 700; font-style: italic; }
.gobo-flyer-from { display: block; font-weight: 400; color: #64748b; font-size: 12px; }
html.gobo-dark .gobo-flyer-from { color: #94a3b8; }
.gobo-flyer-dates div { white-space: nowrap; }
.gobo-flyer-gty-footer { margin-top: 24px; padding: 16px; background: #f1f5f9; border-radius: 8px; font-size: 13px; }
html.gobo-dark .gobo-flyer-gty-footer { background: #1e293b; }
.gobo-flyer-gty-footer h3 { margin: 0 0 8px; font-size: 14px; text-transform: uppercase; }
@page { size: letter; margin: 0.5in; }
@media print { .gobo-flyer-exit, .gobo-flyer-aurora { display: none !important; } body { background: #fff; } }`;

    const _heroCache = new Map();

    const OfferPdf = {
        heroFileUrl(offer) {
            const imgs = offer && offer.campaignOffer && offer.campaignOffer.offerImages || [];
            const hero = imgs.find(i => i && i.category === 'HERO_REGULAR_CARD' && i.fileUrl) || imgs.find(i => i && i.fileUrl);
            return hero ? hero.fileUrl : '';
        },

        heroSrc(fileUrl) {
            if (!fileUrl) return Promise.resolve('');
            if (_heroCache.has(fileUrl)) return _heroCache.get(fileUrl);
            const p = (async () => {
                try {
                    const resp = await fetch(fileUrl, {
                        headers: { 'access-token': this._accessToken() },
                        credentials: 'include',
                    });
                    if (!resp.ok) throw new Error('HTTP ' + resp.status);
                    const blob = await resp.blob();
                    return URL.createObjectURL(blob);
                } catch(e) {
                    return fileUrl;
                }
            })();
            _heroCache.set(fileUrl, p);
            return p;
        },

        _accessToken() {
            try {
                const raw = App.Utils.getCookie('accessToken') || '';
                return raw.startsWith('Bearer ') ? raw.slice(7) : raw;
            } catch(e) {
                return '';
            }
        },

        open(offerCode, state) {
            const win = window.open('about:blank', '_blank');
            if (!win) {
                try { ErrorHandler.showError('Pop-up blocked. Allow pop-ups for this site to open the flyer.'); } catch(e) {}
                return;
            }
            try {
                win.document.open();
                win.document.write('<!doctype html><title>Offer flyer</title><p style="font-family:sans-serif;padding:24px">Building flyer\u2026</p>');
                win.document.close();
            } catch(e) {}

            const pairs = this._pairsForCode(offerCode, state);
            if (pairs.length === 0) {
                try {
                    win.document.open();
                    win.document.write('<!doctype html><title>Offer flyer</title><p style="font-family:sans-serif;padding:24px">No sailings found for this offer.</p>');
                    win.document.close();
                } catch(e) {}
                try { ErrorHandler.showError('No sailings found for this offer.'); } catch(e) {}
                return;
            }

            const offer = pairs[0].offer;
            let dark = false;
            try { dark = !!App.SettingsStore.getDarkMode(); } catch(e) {}
            const html = this.buildHtml(offer, pairs, { dark });
            try {
                win.document.open();
                win.document.write(html);
                win.document.close();
                if (!win.document.title) win.document.title = `${offerCode} \u2014 ${offer.campaignOffer.name}`;
            } catch(e) {}
            try { win.opener = null; } catch(e) {}
        },

        _pairsForCode(offerCode, state) {
            const source = (state && (state.fullOriginalOffers || state.sortedOffers)) || [];
            const seen = new Set();
            const pairs = [];
            for (const pair of source) {
                if (!pair || !pair.offer) continue;
                if (pair.offer.campaignOffer?.offerCode !== offerCode) continue;
                const sid = pair.sailing && pair.sailing.id;
                if (sid != null) {
                    if (seen.has(sid)) continue;
                    seen.add(sid);
                }
                pairs.push(pair);
            }
            return pairs;
        },

        groupByCategory(pairs) {
            const roomKey = (sailing) => (sailing.roomTypeList && sailing.roomTypeList[0] && sailing.roomTypeList[0].name) || sailing.roomType || 'Stateroom';
            const ORDER = ['Suite', 'Balcony', 'Ocean View', 'Interior'];
            const sections = new Map();
            for (const pair of pairs) {
                const sailing = pair.sailing;
                const room = roomKey(sailing);
                if (!sections.has(room)) sections.set(room, []);
                sections.get(room).push(pair);
            }
            const orderedRooms = [];
            for (const room of ORDER) {
                if (sections.has(room)) { orderedRooms.push(room); }
            }
            const otherRooms = Array.from(sections.keys()).filter(r => !ORDER.includes(r)).sort((a, b) => a.localeCompare(b));
            orderedRooms.push(...otherRooms);

            const result = [];
            for (const room of orderedRooms) {
                const sectionPairs = sections.get(room) || [];
                if (sectionPairs.length === 0) continue;
                const isGTY = sectionPairs.some(p => p.sailing && p.sailing.isGTY);
                const title = `${room.toUpperCase()} ${isGTY ? 'GUARANTEE ' : ''}STATEROOM`;
                const ships = new Map();
                for (const pair of sectionPairs) {
                    const sailing = pair.sailing;
                    const port = (sailing.departurePort && sailing.departurePort.name) || '';
                    const nights = sailing.totalNights;
                    let itinerary = '';
                    try {
                        const parsed = Utils.parseItinerary(sailing.itineraryDescription || (sailing.sailingType && sailing.sailingType.name));
                        itinerary = parsed.destination || '';
                    } catch(e) {}
                    const shipKey = `${sailing.shipName}|${port}`;
                    if (!ships.has(shipKey)) ships.set(shipKey, { ship: sailing.shipName, port, itineraries: new Map() });
                    const ship = ships.get(shipKey);
                    const itinKey = `${nights}|${itinerary}`;
                    if (!ship.itineraries.has(itinKey)) ship.itineraries.set(itinKey, { nights, itinerary, dates: new Set() });
                    const itin = ship.itineraries.get(itinKey);
                    if (sailing.sailDate) itin.dates.add(String(sailing.sailDate).trim().slice(0, 10));
                }
                const shipList = Array.from(ships.values()).map(s => ({
                    ship: s.ship,
                    port: s.port,
                    itineraries: Array.from(s.itineraries.values()).map(i => ({
                        nights: i.nights,
                        itinerary: i.itinerary,
                        dates: Array.from(i.dates).sort(),
                    })),
                }));
                result.push({ room, title, isGTY, ships: shipList });
            }
            return result;
        },

        formatDateGroups(dates) {
            const byYear = new Map();
            for (const d of dates) {
                const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
                if (!m) continue;
                const year = m[1];
                const month = parseInt(m[2], 10);
                const day = parseInt(m[3], 10);
                if (!byYear.has(year)) byYear.set(year, []);
                byYear.get(year).push(`${month}/${day}`);
            }
            const years = Array.from(byYear.keys()).sort();
            return years.map(year => {
                const items = byYear.get(year).sort((a, b) => {
                    const [am, ad] = a.split('/').map(Number);
                    const [bm, bd] = b.split('/').map(Number);
                    return (am - bm) || (ad - bd);
                });
                return `${year}: ${items.join(', ')}`;
            });
        },

        kicker(pairs) {
            const classCounts = {};
            let known = 0;
            for (const pair of pairs) {
                const shipName = pair.sailing && pair.sailing.shipName;
                if (!shipName) continue;
                let cls;
                try { cls = Utils.getShipClass(shipName); } catch(e) { cls = null; }
                if (!cls || cls === '-') continue;
                known++;
                classCounts[cls] = (classCounts[cls] || 0) + 1;
            }
            if (known > 0) {
                let best = null, bestCount = 0;
                for (const [cls, count] of Object.entries(classCounts)) {
                    if (count > bestCount) { bestCount = count; best = cls; }
                }
                if (best && bestCount > known * 0.5) {
                    return `YOUR AWARD-WINNING ${best} CLASS OFFER`;
                }
            }
            const offerType = pairs[0] && pairs[0].offer && pairs[0].offer.campaignOffer && pairs[0].offer.campaignOffer.offerType;
            const name = (offerType && offerType.name) || 'STATEROOM';
            return `YOUR AWARD-WINNING ${name.toUpperCase()} OFFER`;
        },

        taxesRange(pairs) {
            const values = [];
            for (const pair of pairs) {
                const sailing = pair.sailing;
                if (!sailing || !sailing.shipCode || !sailing.sailDate) continue;
                let entry;
                try { entry = ItineraryCache.getByShipDate(sailing.shipCode, String(sailing.sailDate).trim().slice(0, 10)); } catch(e) { entry = null; }
                if (entry && typeof entry.taxesAndFees === 'number' && isFinite(entry.taxesAndFees)) {
                    values.push(entry.taxesAndFees);
                }
            }
            if (values.length === 0) return null;
            const min = Math.min(...values);
            const max = Math.max(...values);
            if (min === max) {
                return `JUST PAY TAXES & FEES OF $${Math.round(min)} PER PERSON`;
            }
            return `JUST PAY TAXES & FEES BETWEEN $${Math.round(min)} \u2013 $${Math.round(max)} PER PERSON`;
        },

        _formatRedeemBy(reserveByDate) {
            try {
                const d = new Date(reserveByDate);
                if (isNaN(d.getTime())) return '';
                const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                const m = d.getUTCMonth();
                const day = d.getUTCDate();
                const year = d.getUTCFullYear();
                return `${months[m]} ${day}, ${year}`;
            } catch(e) {
                return '';
            }
        },

        buildHtml(offer, pairs, opts = {}) {
            const dark = !!opts.dark;
            const offerCode = offer.campaignOffer?.offerCode || '';
            const name = offer.campaignOffer?.name || '';
            const description = (offer.campaignOffer?.description || '').toUpperCase();
            const reserveByDate = offer.campaignOffer?.reserveByDate;
            const campaignName = (offer.campaign && offer.campaign.name) || name;

            const sections = this.groupByCategory(pairs);
            const kicker = this.kicker(pairs);
            const taxes = this.taxesRange(pairs);
            const anyGTY = sections.some(s => s.isGTY);

            let html = `<!doctype html>
<html class="${dark ? 'gobo-dark' : ''}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${offerCode} \u2014 ${name}</title>
<style>${OFFER_PDF_CSS}</style>
</head>
<body>
<div class="gobo-flyer-aurora" aria-hidden="true"></div>
<div class="gobo-flyer-exit">
    <button type="button" class="gobo-flyer-back" aria-label="Close flyer and return to offers" onclick="window.close()">\u2190 Back to offers</button>
</div>
<div class="gobo-flyer-sheet">
    <div class="gobo-flyer-gold-band">
        <div class="gobo-flyer-kicker">\u25c6 ${kicker} \u25c6</div>
        <h1 class="gobo-flyer-h1">${description}</h1>
        ${taxes ? `<div class="gobo-flyer-taxes">${taxes}</div>` : ''}
        ${reserveByDate ? `<div class="gobo-flyer-redeem">REDEEM BY ${this._formatRedeemBy(reserveByDate)}</div>` : ''}
    </div>
    <div class="gobo-flyer-body">
        <h2 class="gobo-flyer-body-title">${campaignName.toUpperCase()}</h2>
        ${sections.map(sec => this._sectionHtml(sec)).join('')}
        ${anyGTY ? `
        <div class="gobo-flyer-gty-footer">
            <h3>WHAT IS A GUARANTEE STATEROOM?</h3>
            <p>For these sailings, you choose the ship and date and let us choose your stateroom later on. You're guaranteed to receive this stateroom category \u2014 or you might even get an upgrade.</p>
        </div>` : ''}
    </div>
</div>
</body>
</html>`;
            return html;
        },

        _sectionHtml(sec) {
            const shipBlocks = sec.ships.map(s => {
                const n = s.itineraries.length;
                const rows = s.itineraries.map((i, idx) => {
                    const dateGroups = this.formatDateGroups(i.dates);
                    const shipCell = idx === 0
                        ? `<td class="gobo-flyer-ship" rowspan="${n}">${s.ship}${s.port ? `<span class="gobo-flyer-from">from ${s.port}</span>` : ''}</td>`
                        : '';
                    return `<tr>
    ${shipCell}
    <td class="gobo-flyer-itin">${i.nights} Night ${i.itinerary}</td>
    <td class="gobo-flyer-dates">${dateGroups.map(d => `<div>${d}</div>`).join('')}</td>
</tr>`;
                }).join('');
                return rows;
            }).join('');
            return `<div class="gobo-flyer-section">
    <div class="gobo-flyer-section-header" data-room="${sec.room}">${sec.title}</div>
    <table class="gobo-flyer-table">
        <thead>
            <tr><th>SHIP</th><th>ITINERARY</th><th>DATES</th></tr>
        </thead>
        <tbody>${shipBlocks}</tbody>
    </table>
</div>`;
        },
    };

    window.OfferPdf = OfferPdf;
    try { module.exports = OfferPdf; } catch(e) {}
})();
