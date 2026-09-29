(function() {
    'use strict';

    const OFFER_PDF_CSS = `* { box-sizing: border-box; }
html { --flyer-ink: #c99600; --flyer-paper: #e7e2d6; --flyer-bar: rgba(231,226,214,0.92); background: var(--flyer-paper); }
html.gobo-flyer-cel { --flyer-ink: #004275; --flyer-paper: #eaf0f4; --flyer-bar: rgba(234,240,244,0.92); }
body.gobo-flyer-root { margin: 0; color: #1f2937; min-height: 100vh; font-family: Barlow, 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.gobo-flyer-exit { position: sticky; top: 0; z-index: 20; padding: 8px 16px; background: var(--flyer-bar); backdrop-filter: blur(8px); }
.gobo-flyer-back { min-height: 44px; min-width: 44px; padding: 8px 16px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; color: #0f172a; font-size: 14px; font-family: inherit; cursor: pointer; }
.gobo-flyer-sheet { max-width: 1360px; margin: 0 auto; padding: 8px 8px 24px; container-type: inline-size; container-name: flyer; }
.gobo-flyer-tri { display: flex; flex-direction: column; background: #fff; box-shadow: 0 12px 32px rgba(15,23,42,0.14); }
.gobo-flyer-gold { background: var(--flyer-ink); color: #fff; text-align: center; padding: 26px 22px 16px; display: flex; flex-direction: column; align-items: center; gap: 13px; }
.gobo-flyer-kicker { font-size: 11px; font-weight: 700; letter-spacing: 1.6px; line-height: 1.35; }
.gobo-flyer-suits { letter-spacing: 2px; font-weight: 500; font-size: 12px; }
.gobo-flyer-h1 { margin: 2px 0 0; font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif; font-size: 34px; font-weight: 700; line-height: 0.98; letter-spacing: 0.2px; text-transform: uppercase; }
.gobo-flyer-h1-sub { display: block; margin-top: 7px; font-size: 0.58em; font-weight: 500; letter-spacing: 0.4px; line-height: 1.15; }
.gobo-flyer-perk { width: min(100%, 292px); margin-top: 4px; }
.gobo-flyer-perk-label { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase; margin: 0 8px -11px; position: relative; z-index: 1; }
.gobo-flyer-perk-label span { background: var(--flyer-ink); padding: 0 8px; }
.gobo-flyer-perk-label::before, .gobo-flyer-perk-label::after { content: ''; flex: 1; height: 1.5px; background: #fff; }
.gobo-flyer-perk-box { border: 1.5px solid #fff; padding: 16px 12px 10px; display: flex; flex-direction: column; gap: 8px; }
.gobo-flyer-perk-item { display: flex; align-items: center; justify-content: center; gap: 10px; text-align: left; }
.gobo-flyer-umbrella { flex: 0 0 auto; }
.gobo-flyer-perk-name { font-size: 13px; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase; line-height: 1.2; }
.gobo-flyer-perk-note { margin-top: 3px; font-size: 11px; font-weight: 500; font-style: italic; letter-spacing: 0; text-transform: none; line-height: 1.25; }
.gobo-flyer-taxes { font-size: 11px; font-weight: 700; letter-spacing: 0.55px; line-height: 1.35; max-width: 280px; }
.gobo-flyer-redeem { background: #fff; color: var(--flyer-ink); font-size: 13px; font-weight: 800; letter-spacing: 0.6px; padding: 8px 18px; text-transform: uppercase; }
.gobo-flyer-call { margin-top: auto; padding-top: 18px; font-size: 13px; font-weight: 700; letter-spacing: 0.55px; line-height: 1.35; }
.gobo-flyer-phone { margin: 6px 0 2px; font-size: 28px; font-weight: 800; letter-spacing: 0.3px; }
.gobo-flyer-or { margin: 6px 0; font-size: 13px; font-weight: 600; letter-spacing: 1px; }
.gobo-flyer-codeblock { width: min(100%, 292px); margin-top: 6px; }
.gobo-flyer-codelabel { font-size: 13px; font-weight: 800; letter-spacing: 0.7px; margin-bottom: 8px; }
.gobo-flyer-code { background: #fff; color: var(--flyer-ink); font-size: 28px; font-weight: 800; letter-spacing: 1px; padding: 7px 12px; }
.gobo-flyer-upgrade { background: #f65b37; color: #fff; font-size: 10px; font-weight: 800; letter-spacing: 0.35px; line-height: 1.25; padding: 7px 10px; background-image: repeating-linear-gradient(135deg, rgba(255,255,255,0.13) 0 8px, rgba(255,255,255,0.04) 8px 16px); }
.gobo-flyer-wordmark { margin-top: 10px; font-family: 'Libre Bodoni', 'Bodoni MT', Didot, Georgia, serif; font-weight: 600; font-size: 38px; line-height: 0.9; text-transform: uppercase; color: #fff; }
.gobo-flyer-wm-top { display: block; letter-spacing: 0.16em; border-bottom: 1.5px solid rgba(255,255,255,0.9); padding: 0 10px 5px; }
.gobo-flyer-wm-bot { display: block; margin-top: 5px; font-size: 0.62em; letter-spacing: 0.34em; font-weight: 500; }
.gobo-flyer-sm { font-family: Barlow, 'Helvetica Neue', sans-serif; font-size: 0.28em; font-weight: 700; letter-spacing: 0; vertical-align: super; margin-left: 1px; }
.gobo-flyer-main { background: #fff; padding: 10px 12px 14px; min-width: 0; }
.gobo-flyer-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.gobo-flyer-table th { position: sticky; top: 60px; z-index: 2; background: #fff; text-align: center; padding: 4px 6px 8px; font-size: 11px; font-weight: 600; letter-spacing: 1.4px; text-transform: uppercase; color: #8b9096; }
.gobo-flyer-table td { padding: 6px 8px; vertical-align: middle; background: #fff; }
.gobo-flyer-star, .gobo-flyer-star-h { width: 26px; text-align: center; padding-left: 0; padding-right: 0; }
.gobo-flyer-room td { background: #6d6e70; color: #fff; text-align: center; font-family: 'Barlow Condensed', Barlow, sans-serif; font-weight: 700; letter-spacing: 1.6px; font-size: 15px; padding: 4px 8px; }
.gobo-flyer-room[data-room="Interior"] td { background: #2a8a87; }
.gobo-flyer-room[data-room="Ocean View"] td { background: #3e6d84; }
.gobo-flyer-room[data-room="Suite"] td { background: #3c4a62; }
.gobo-flyer-root tr.gobo-flyer-band td { background: #f3f3f3; }
.gobo-flyer-table td.gobo-flyer-ship { font-weight: 700; font-style: italic; color: #1f2937; line-height: 1.2; vertical-align: top; width: 34%; }
.gobo-flyer-ship sup { font-style: normal; font-size: 0.62em; }
.gobo-flyer-from { display: block; font-style: normal; font-weight: 400; color: #6b7280; font-size: 11px; margin-top: 1px; }
.gobo-flyer-itin { color: #1f2937; line-height: 1.25; }
.gobo-flyer-dates { color: #374151; line-height: 1.35; text-align: right; font-variant-numeric: tabular-nums; width: 34%; vertical-align: top; }
.gobo-flyer-dates div { line-height: 1.35; }
.gobo-flyer-yearline { display: grid; grid-template-columns: auto 1fr; column-gap: 0.35em; text-align: left; }
.gobo-flyer-year { font-weight: 700; }
.gobo-flyer-pd { display: inline-block; color: #d0127a; font-weight: 700; font-style: normal; font-size: 15px; line-height: 1; }
.gobo-flyer-pd::before { content: '\\2731'; }
.gobo-flyer-legend { margin-top: 8px; font-size: 11px; color: #4b5563; line-height: 1.4; }
.gobo-flyer-legend-line { margin-top: 2px; }
.gobo-flyer-legend .gobo-flyer-pd { font-size: 13px; margin-right: 4px; }
.gobo-flyer-gty { margin-top: 14px; font-size: 12px; color: #374151; line-height: 1.4; }
.gobo-flyer-gty h3 { margin: 0 0 4px; font-size: 11px; letter-spacing: 0.6px; text-transform: uppercase; }
.gobo-flyer-gty p { margin: 0; }
.gobo-flyer-hero { position: relative; display: flex; min-height: 520px; overflow: hidden; background: #0e2a32; }
.gobo-flyer-hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 28%; }
.gobo-flyer-hero-cards { position: relative; z-index: 1; flex: 1 1 auto; display: flex; flex-direction: column; justify-content: space-between; align-items: center; width: 100%; padding: 18px 14px 22px; gap: 16px; }
.gobo-flyer-hero:not(.has-cards) .gobo-flyer-hero-cards { display: none; }
.gobo-flyer-hero:not(.has-cards):not(:has(img)) { display: none; }
.gobo-flyer-coco, .gobo-flyer-hideaway { width: min(88%, 280px); color: #fff; text-align: center; padding: 14px 14px 12px; box-shadow: 0 8px 18px rgba(0,0,0,0.18); }
.gobo-flyer-coco { background: #f0a63f; }
.gobo-flyer-coco-kicker { font-size: 11px; font-weight: 700; letter-spacing: 2.4px; text-transform: uppercase; }
.gobo-flyer-coco-logo { font-family: Pacifico, Allura, 'Segoe Script', cursive; font-size: 42px; line-height: 0.85; margin: 2px 0 2px; font-weight: 400; }
.gobo-flyer-cay { font-family: Barlow, 'Helvetica Neue', sans-serif; font-weight: 700; font-size: 34px; letter-spacing: -0.5px; margin-left: 1px; }

.gobo-flyer-hideaway-title { font-family: Allura, 'Segoe Script', cursive; font-size: 48px; line-height: 0.9; }
.gobo-flyer-legal { margin: 8px 2px 0; font-size: 9px; line-height: 1.35; color: #6b7280; }
@container flyer (min-width: 900px) {
  .gobo-flyer-tri { flex-direction: row; align-items: flex-start; }
  .gobo-flyer-gold, .gobo-flyer-hero { position: sticky; top: 60px; height: calc(100vh - 76px); overflow: auto; }
  .gobo-flyer-gold { flex: 0 0 27%; }
  .gobo-flyer-main { flex: 1 1 auto; }
  .gobo-flyer-hero { flex: 0 0 30%; min-height: 0; }
}
@media (min-width: 900px) {
  .gobo-flyer-tri { flex-direction: row; align-items: flex-start; }
  .gobo-flyer-gold, .gobo-flyer-hero { position: sticky; top: 60px; height: calc(100vh - 76px); overflow: auto; }
  .gobo-flyer-gold { flex: 0 0 27%; }
  .gobo-flyer-main { flex: 1 1 auto; }
  .gobo-flyer-hero { flex: 0 0 30%; min-height: 0; }
}
@page { size: landscape; margin: 0.3in; }
@media print {
  .gobo-flyer-exit { display: none !important; }
  html, body.gobo-flyer-root { background: #fff; }
  .gobo-flyer-sheet { max-width: none; padding: 0; }
  .gobo-flyer-tri { flex-direction: row !important; align-items: stretch !important; box-shadow: none; }
  .gobo-flyer-gold, .gobo-flyer-hero { position: static !important; height: auto !important; overflow: visible !important; }
  .gobo-flyer-hero { min-height: 640px; }
  .gobo-flyer-gold, .gobo-flyer-hero, .gobo-flyer-room td, .gobo-flyer-coco, .gobo-flyer-hideaway, .gobo-flyer-upgrade, .gobo-flyer-redeem, tr.gobo-flyer-band td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

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

        _isFirefox() {
            try { return /Firefox\//.test(navigator.userAgent || ''); } catch (e) { return false; }
        },

        _openViaBackground(html) {
            const rt = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : (typeof chrome !== 'undefined' ? chrome.runtime : null);
            if (!rt || typeof rt.sendMessage !== 'function') return Promise.reject(new Error('no runtime'));
            try {
                const ret = rt.sendMessage({ channel: 'gobo-flyer', html });
                if (ret && typeof ret.then === 'function') return ret;
            } catch (e) {
                return Promise.reject(e);
            }
            return new Promise((resolve, reject) => {
                try {
                    rt.sendMessage({ channel: 'gobo-flyer', html }, (resp) => {
                        const err = rt.lastError;
                        if (err) reject(new Error(err.message));
                        else resolve(resp);
                    });
                } catch (e) { reject(e); }
            });
        },

        _blobToData(blobUrl) {
            return fetch(blobUrl).then(r => r.blob()).then(blob => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
            }));
        },

        // Firefox content scripts cannot document.write into about:blank (the tab stays blank).
        // The event-page background opens a blob URL, which does not inherit the site CSP.
        _openFirefox(offerCode, state) {
            const pairs = this._pairsForCode(offerCode, state);
            const fail = (text) => {
                const html = '<!doctype html><title>Offer flyer</title><p style="font-family:sans-serif;padding:24px">' + text + '</p>';
                this._openViaBackground(html).catch(() => {});
                try { ErrorHandler.showError(text); } catch (e) {}
            };
            if (!pairs.length) { fail('No sailings found for this offer.'); return; }
            const offer = pairs[0].offer;
            let dark = false;
            try { dark = !!App.SettingsStore.getDarkMode(); } catch (e) {}
            const heroUrl = this.heroFileUrl(offer);
            const celebrity = this._isCelebrity(state);
            const finish = (heroSrc) => {
                const html = this.buildHtml(offer, pairs, { dark, heroSrc: heroSrc || '', celebrity });
                this._openViaBackground(html).catch(() => {
                    try {
                        const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
                        if (!window.open(url, '_blank')) throw new Error('blocked');
                    } catch (e) {
                        try { ErrorHandler.showError('Could not open the offer flyer.'); } catch (err) {}
                    }
                });
            };
            if (!heroUrl) { finish(''); return; }
            this.heroSrc(heroUrl).then(src => {
                if (src && String(src).startsWith('blob:')) return this._blobToData(src);
                return src || '';
            }).then(finish).catch(() => finish(''));
        },

        open(offerCode, state) {
            if (this._isFirefox()) { this._openFirefox(offerCode, state); return; }
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
            const heroUrl = this.heroFileUrl(offer);
            const html = this.buildHtml(offer, pairs, { dark, heroUrl, celebrity: this._isCelebrity(state) });
            try {
                win.document.open();
                win.document.write(html);
                win.document.close();
                if (!win.document.title) win.document.title = `${offerCode} \u2014 ${offer.campaignOffer.name}`;
            } catch(e) {}
            if (heroUrl) {
                this.heroSrc(heroUrl).then(src => {
                    try {
                        const imgs = win.document.querySelectorAll('.gobo-flyer-hero-img');
                        imgs.forEach(img => {
                            if (!src) return;
                            img.addEventListener('error', () => { try { img.remove(); } catch(err) {} });
                            img.src = src;
                            img.hidden = false;
                        });
                    } catch(e) {}
                }).catch(() => {});
            }
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
                    if (!ship.itineraries.has(itinKey)) ship.itineraries.set(itinKey, { nights, itinerary, dates: new Set(), perfectDay: false });
                    const itin = ship.itineraries.get(itinKey);
                    if (sailing.sailDate) itin.dates.add(String(sailing.sailDate).trim().slice(0, 10));
                    if (this.visitsPerfectDay(sailing)) itin.perfectDay = true;
                }
                const shipList = Array.from(ships.values()).map(s => ({
                    ship: s.ship,
                    port: s.port,
                    itineraries: Array.from(s.itineraries.values()).map(i => ({
                        nights: i.nights,
                        itinerary: i.itinerary,
                        dates: Array.from(i.dates).sort(),
                        perfectDay: !!i.perfectDay,
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

        _esc(value) {
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        },

        _textHitsPerfectDay(text) {
            return /perfect\s*day|coco\s*cay|cococay/i.test(String(text || ''));
        },

        // A sailing "goes there" when its own title says so, or the cached
        // itinerary lists Perfect Day / CocoCay as a port. Marketing for that
        // island is omitted otherwise.
        visitsPerfectDay(sailing) {
            if (!sailing) return false;
            const fields = [
                sailing.itineraryName,
                sailing.itineraryDescription,
                sailing.sailingType && sailing.sailingType.name,
            ];
            if (fields.some(text => this._textHitsPerfectDay(text))) return true;
            try {
                if (typeof ItineraryCache === 'undefined' || !ItineraryCache || typeof ItineraryCache.getByShipDate !== 'function') return false;
                const date = sailing.sailDate ? String(sailing.sailDate).trim().slice(0, 10) : '';
                const entry = ItineraryCache.getByShipDate(sailing.shipCode, date);
                if (!entry) return false;
                if (this._textHitsPerfectDay(entry.portSequence) || this._textHitsPerfectDay(entry.itineraryDescription) || this._textHitsPerfectDay(entry.destinationName) || this._textHitsPerfectDay(entry.itineraryName)) return true;
                const days = Array.isArray(entry.days) ? entry.days : [];
                for (const day of days) {
                    const ports = Array.isArray(day && day.ports) ? day.ports : [];
                    for (const stop of ports) {
                        const port = (stop && (stop.port || stop)) || {};
                        if (this._textHitsPerfectDay(port.name || port.portName)) return true;
                        const code = String(port.code || port.portCode || '').toUpperCase();
                        if (code === 'CCO' || code === 'PCC') return true;
                    }
                }
            } catch(e) {}
            return false;
        },

        _isCelebrity(state) {
            const key = state && state.selectedProfileKey;
            const m = key && String(key).match(/^gobo-([A-Za-z])-/);
            if (m) return m[1].toUpperCase() === 'C';
            try {
                return !!(typeof Utils !== 'undefined' && Utils && typeof Utils.isCelebrity === 'function' && Utils.isCelebrity());
            } catch(e) {
                return false;
            }
        },

        _kickerText(offer) {
            let label = String((offer && offer.campaignOffer && offer.campaignOffer.name) || 'Offer').trim() || 'Offer';
            if (!/offer$/i.test(label)) label += ' Offer';
            return 'YOUR ' + label.toUpperCase();
        },

        _headline(offer) {
            const co = (offer && offer.campaignOffer) || {};
            return String(co.description || co.name || '').trim();
        },
        _headlineHtml(offer) {
            const text = this._headline(offer);
            const plus = text.match(/^([\s\S]+?)\s*\+\s*([\s\S]+)$/);
            if (!plus) return this._esc(text);
            return `${this._esc(plus[1])}<span class="gobo-flyer-h1-sub">+ ${this._esc(plus[2])}</span>`;
        },

        flyerPerks(offer, pairs, hasPerfectDay) {
            const names = [];
            const seen = new Set();
            const add = (name) => {
                const n = String(name || '').trim();
                if (!n || n === '-') return;
                const key = n.toLowerCase();
                if (seen.has(key)) return;
                if (/hideaway\s*beach/i.test(n) && !hasPerfectDay) return;
                seen.add(key);
                names.push(n);
            };
            const codes = offer && offer.campaignOffer && offer.campaignOffer.perkCodes;
            if (Array.isArray(codes)) {
                codes.forEach(p => add(typeof p === 'string' ? p : (p && (p.perkName || p.perkCode))));
            }
            (pairs || []).forEach(pair => {
                const sailing = pair && pair.sailing;
                if (!sailing) return;
                const bonus = sailing.nextCruiseBonusPerkCode || sailing.nextCruiseBonus;
                if (bonus) add(typeof bonus === 'string' ? bonus : (bonus.perkName || bonus.perkCode));
                if (Array.isArray(sailing.perks)) {
                    sailing.perks.forEach(p => add(typeof p === 'string' ? p : (p && (p.perkName || p.perkCode))));
                }
            });
            return names;
        },

        _datesHeader(pairs) {
            const years = new Set();
            (pairs || []).forEach(pair => {
                const raw = pair && pair.sailing && pair.sailing.sailDate;
                const year = raw ? String(raw).trim().slice(0, 4) : '';
                if (/^\d{4}$/.test(year)) years.add(year);
            });
            if (years.size === 1) {
                const year = [...years][0];
                return { label: year + ' DATES', year };
            }
            return { label: 'DATES', year: '' };
        },

        _dateCellHtml(dates, headerYear) {
            const list = Array.isArray(dates) ? dates : [];
            const lines = this.formatDateGroups(list);
            const spansYears = lines.length > 1;
            return lines.map(line => {
                const keepYear = spansYears || !headerYear;
                if (!keepYear) return `<div>${this._esc(String(line).replace(/^\d{4}:\s*/, ''))}</div>`;
                const parts = String(line).match(/^(\d{4}:)\s*(.*)$/);
                const year = parts ? parts[1] : line;
                const rest = parts ? parts[2] : '';
                return `<div class="gobo-flyer-yearline"><span class="gobo-flyer-year">${this._esc(year)}</span> ${this._esc(rest)}</div>`;
            }).join('');
        },

        _itinLabel(itin) {
            let dest = String((itin && itin.itinerary) || '').trim().replace(/\s+cruises?$/i, '').trim();
            if (dest && dest === dest.toUpperCase() && /[A-Z]/.test(dest)) {
                dest = dest.toLowerCase().replace(/(^|[^a-z])([a-z])/g, (m, lead, ch) => lead + ch.toUpperCase());
            }
            dest = dest.replace(/\bCococay\b/g, 'CocoCay').replace(/\bCoco Cay\b/gi, 'CocoCay');
            const nights = itin && itin.nights;
            if (nights !== undefined && nights !== null && String(nights) !== '' && String(nights) !== '-') {
                return `${nights} Night ${dest}`.trim();
            }
            return dest;
        },

        _shipHtml(name) {
            return this._esc(name || '').replace(/of the Seas(?:®|&reg;)?/gi, 'of the Seas<sup>®</sup>');
        },

        _perkHtml(perks) {
            if (!perks || perks.length === 0) return '';
            const icon = '<svg class="gobo-flyer-umbrella" viewBox="0 0 48 40" width="42" height="36" aria-hidden="true"><path fill="none" stroke="#fff" stroke-width="1.6" d="M6 20c0-10 8-18 18-18s18 8 18 18H6z"/><path fill="none" stroke="#fff" stroke-width="1.6" d="M24 20v8a4 4 0 0 1-8 0M14 20c2 3 5 3 7 0M24 20c2 3 5 3 7 0M33 20c2 3 5 3 7 0"/><path fill="none" stroke="#fff" stroke-width="1.6" d="M34 26h8v3h-5l-1 6"/></svg>';
            const items = perks.map(name => {
                const hideaway = /hideaway\s*beach/i.test(name);
                const note = hideaway ? '<div class="gobo-flyer-perk-note">*When selecting a Perfect Day at CocoCay sailing</div>' : '';
                return `<div class="gobo-flyer-perk-item">${hideaway ? icon : ''}<div><div class="gobo-flyer-perk-name">${this._esc(name)}</div>${note}</div></div>`;
            }).join('');
            const label = perks.length > 1 ? 'Plus VIP perks' : 'Plus a VIP perk';
            return `<div class="gobo-flyer-perk"><div class="gobo-flyer-perk-label"><span>${label}</span></div><div class="gobo-flyer-perk-box">${items}</div></div>`;
        },

        _callHtml(celebrity) {
            if (celebrity) {
                return `<div class="gobo-flyer-call"><div>CALL YOUR BLUE CHIP CLUB<br>REPRESENTATIVE</div><div class="gobo-flyer-or">- OR -</div><div>CONTACT YOUR TRAVEL ADVISOR</div></div>`;
            }
            return `<div class="gobo-flyer-call"><div>CALL YOUR CASINO ROYALE<br>REPRESENTATIVE AT</div><div class="gobo-flyer-phone">1-888-561-2234</div><div class="gobo-flyer-or">- OR -</div><div>CONTACT YOUR TRAVEL ADVISOR OR<br>INDEPENDENT CASINO REPRESENTATIVE</div></div>`;
        },

        _wordmarkHtml(celebrity) {
            if (celebrity) return '<div class="gobo-flyer-wordmark"><span class="gobo-flyer-wm-top">Blue Chip</span><span class="gobo-flyer-wm-bot">Club</span></div>';
            return '<div class="gobo-flyer-wordmark"><span class="gobo-flyer-wm-top">Casino<span class="gobo-flyer-sm">SM</span></span><span class="gobo-flyer-wm-bot">Royale</span></div>';
        },

        _heroCardsHtml() {
            return `<div class="gobo-flyer-hero-cards">
    <div class="gobo-flyer-coco">
        <div class="gobo-flyer-coco-kicker">Perfect Day at</div>
        <div class="gobo-flyer-coco-logo">Coco<span class="gobo-flyer-cay">Cay</span></div>
        <p>Voted Best Private Island by <em>Travel Weekly</em> readers for five years running.</p>
    </div>
    <div class="gobo-flyer-hideaway">
        <div class="gobo-flyer-hideaway-title">Hideaway Beach</div>
        <p>Dance the day away in our adults-only paradise at Perfect Day at CocoCay.</p>
    </div>
</div>`;
        },

        _sailingTableHtml(sections, dateHeader, headerYear) {
            let shipBand = 0;
            const body = sections.map(sec => {
                const roomRow = `<tr class="gobo-flyer-room" data-room="${this._esc(sec.room)}"><td colspan="4">${this._esc(sec.title)}</td></tr>`;
                const ships = sec.ships.map(ship => {
                    shipBand += 1;
                    const band = shipBand % 2 === 0 ? 'gobo-flyer-band' : '';
                    const span = ship.itineraries.length || 1;
                    return ship.itineraries.map((itin, idx) => {
                        const shipCell = idx === 0
                            ? `<td class="gobo-flyer-ship" rowspan="${span}">${this._shipHtml(ship.ship)}${ship.port ? `<span class="gobo-flyer-from">from ${this._esc(ship.port)}</span>` : ''}</td>`
                            : '';
                        const star = itin.perfectDay
                            ? '<span class="gobo-flyer-pd" title="Visits Perfect Day at CocoCay"></span>'
                            : '';
                        return `<tr class="${band}">${shipCell}<td class="gobo-flyer-star">${star}</td><td class="gobo-flyer-itin">${this._esc(this._itinLabel(itin))}</td><td class="gobo-flyer-dates">${this._dateCellHtml(itin.dates, headerYear)}</td></tr>`;
                    }).join('');
                }).join('');
                return roomRow + ships;
            }).join('');
            const anyPerfectDay = sections.some(sec => sec.ships.some(ship => ship.itineraries.some(itin => itin.perfectDay)));
            const legend = `<div class="gobo-flyer-legend">${anyPerfectDay ? '<div class="gobo-flyer-legend-line"><span class="gobo-flyer-pd" aria-hidden="true"></span> Visits our award-winning private island Perfect Day at CocoCay</div>' : ''}<div class="gobo-flyer-legend-line">New slot machines are featured on all our ships</div></div>`;
            return `<table class="gobo-flyer-table"><thead><tr><th>Ship</th><th class="gobo-flyer-star-h"><span class="gobo-flyer-sr"> </span></th><th>Itinerary</th><th>${this._esc(dateHeader)}</th></tr></thead><tbody>${body}</tbody></table>${legend}`;
        },

        buildHtml(offer, pairs, opts = {}) {
            const dark = !!opts.dark;
            const heroUrl = opts.heroUrl || '';
            const heroSrc = opts.heroSrc || '';
            const offerCode = offer.campaignOffer?.offerCode || '';
            const name = offer.campaignOffer?.name || '';
            const reserveByDate = offer.campaignOffer?.reserveByDate;
            const sections = this.groupByCategory(pairs);
            const dateHeader = this._datesHeader(pairs);
            const hasPerfectDay = (pairs || []).some(pair => pair && this.visitsPerfectDay(pair.sailing));
            const taxes = this.taxesRange(pairs);
            const perks = this.flyerPerks(offer, pairs, hasPerfectDay);
            const anyGTY = sections.some(s => s.isGTY);
            const redeem = reserveByDate ? this._formatRedeemBy(reserveByDate) : '';
            const celebrity = opts.celebrity != null ? !!opts.celebrity : this._isCelebrity();
            const who = celebrity ? 'Blue Chip Club representative' : 'Casino Royale representative';
            const legal = `Itinerary details can vary by sailing date.${redeem ? ` Book by ${redeem}.` : ''} Taxes and fees are per person. Contact your ${who} with questions about this offer.`;
            const heroImg = (heroUrl || heroSrc)
                ? `<img class="gobo-flyer-hero-img" alt=""${heroUrl ? ' data-hero="1"' : ''}${heroSrc ? ` src="${this._esc(heroSrc)}"` : ''}>`
                : '';

            return `<!doctype html>
<html class="${[dark ? 'gobo-dark' : '', celebrity ? 'gobo-flyer-cel' : ''].filter(Boolean).join(' ')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${this._esc(offerCode)} \u2014 ${this._esc(name)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Allura&amp;family=Barlow:ital,wght@0,400;0,600;0,700;1,600;1,700&amp;family=Barlow+Condensed:wght@600;700&amp;family=Libre+Bodoni:wght@500;600&amp;family=Pacifico&amp;display=swap">
<style>${OFFER_PDF_CSS}</style>
</head>
<body class="gobo-flyer-root">
<div class="gobo-flyer-exit">
    <button type="button" class="gobo-flyer-back" aria-label="Close flyer and return to offers" onclick="window.close()">\u2190 Back to offers</button>
</div>
<div class="gobo-flyer-sheet">
    <div class="gobo-flyer-tri">
        <section class="gobo-flyer-gold" aria-label="Offer">
            <div class="gobo-flyer-kicker"><span class="gobo-flyer-suits" aria-hidden="true">\u2663 \u25c6</span> ${this._esc(this._kickerText(offer))} <span class="gobo-flyer-suits" aria-hidden="true">\u2665 \u2660</span></div>
            <h1 class="gobo-flyer-h1">${this._headlineHtml(offer)}</h1>
            ${this._perkHtml(perks)}
            ${taxes ? `<div class="gobo-flyer-taxes">${this._esc(taxes)}</div>` : ''}
            ${redeem ? `<div class="gobo-flyer-redeem">REDEEM BY ${this._esc(redeem)}</div>` : ''}
            ${this._callHtml(celebrity)}
            <div class="gobo-flyer-codeblock">
                <div class="gobo-flyer-codelabel">YOUR UNIQUE OFFER CODE</div>
                <div class="gobo-flyer-code">${this._esc(offerCode)}</div>
                <div class="gobo-flyer-upgrade">ASK ABOUT YOUR UPGRADE OPTIONS WHEN YOU BOOK</div>
            </div>
            ${this._wordmarkHtml(celebrity)}
        </section>
        <section class="gobo-flyer-main" aria-label="Sailings">
            ${this._sailingTableHtml(sections, dateHeader.label, dateHeader.year)}
            ${anyGTY ? `<div class="gobo-flyer-gty"><h3>What is a guarantee stateroom?</h3><p>For these sailings, you choose the ship and date and let us choose your stateroom later on. You're guaranteed to receive this stateroom category \u2014 or you might even get an upgrade.</p></div>` : ''}
        </section>
        <aside class="gobo-flyer-hero${hasPerfectDay ? ' has-cards' : ''}" aria-label="Offer photo">
            ${heroImg}
            ${hasPerfectDay ? this._heroCardsHtml() : ''}
        </aside>
    </div>
    <p class="gobo-flyer-legal">${this._esc(legal)}</p>
</div>
</body>
</html>`;
        },
    };

    window.OfferPdf = OfferPdf;
    try { module.exports = OfferPdf; } catch(e) {}
})();
