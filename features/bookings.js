// Booked sailings + purchased addons. Page fetch to aws-prd.api.rccl.com fails;
// every call goes through the gobo-rccl background channel.
const BOOKINGS_HOST = 'https://aws-prd.api.rccl.com';
const CATALOG_QUERY = `query WebProductsByCategory($category: String!, $passengerId: String, $shipCode: ShipCodeScalar!, $sailDate: LocalDateScalar!, $reservationId: String, $pageSize: Long, $currentPage: Long, $currencyCode: String!) {
  products(category: $category, guestTypes: [ADULT], passengerId: $passengerId, shipCode: $shipCode, sailDate: $sailDate, reservationId: $reservationId, pageSize: $pageSize, currentPage: $currentPage, currencyIso: $currencyCode) {
    ... on CommerceProductResultSuccess {
      commerceProducts { id title media { source { path } } price { currency promotionalPrice formattedPromotionalPrice formattedBasePrice formattedDailyPrice formattedPromoDailyPrice salesUnit { code name } } }
      pageInfo { hasNextPage }
    }
  }
}`;
const TYPE_LABEL = { I: 'Interior', O: 'Ocean View', B: 'Balcony', D: 'Suite' };
const DETAIL_CAP = 40; // ponytail: 40 orders/room, raise if a real sailing exceeds it

function normDate(raw) {
    const s = String(raw == null ? '' : raw).trim();
    const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) return compact[1] + '-' + compact[2] + '-' + compact[3];
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return iso ? iso[1] : s;
}

function compactDate(raw) {
    return normDate(raw).replace(/-/g, '');
}

function finiteNum(v) {
    if (v == null || v === '') return NaN;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
}

function absentAmount(n) {
    return !Number.isFinite(n) || Math.round(n * 100) === -99999;
}

function parseMoney(s) {
    if (s == null || s === '') return NaN;
    const n = Number(String(s).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : NaN;
}

function money(n) {
    return Number.isFinite(Number(n)) ? '$' + Number(n).toFixed(2) : '';
}

function authHeaders(authToken, accountId, cfg, kind) {
    const raw = authToken && authToken.toString ? authToken.toString() : '';
    const accessToken = raw.startsWith('Bearer ') ? raw.slice(7) : raw;
    const headers = {
        'access-token': accessToken,
        'account-id': accountId == null ? '' : String(accountId),
        appkey: cfg.appkey,
        accept: 'application/json',
        'content-type': 'application/json'
    };
    if (kind === 'commerce') {
        headers['req-app-id'] = cfg.commerceAppId;
        headers.channel = 'web';
    } else {
        headers['req-app-id'] = cfg.bookingsAppId;
    }
    return headers;
}

function q(params) {
    return Object.keys(params).map(k => k + '=' + encodeURIComponent(params[k] == null ? '' : params[k])).join('&');
}

function brandConfig(brand) {
    const code = brand === 'C' ? 'C' : 'R';
    const celebrity = code === 'C';
    const cfg = {
        segment: celebrity ? 'celebrity' : 'royal',
        code: code,
        label: celebrity ? 'Celebrity' : 'Royal',
        appkey: celebrity ? 'qpRMO6lj4smwkT1sWlSdIj7b8QF5rG8Q' : 'hyNNqIPHHzaLzVpcICPdAdbFV8yvTsAm',
        bookingsAppId: celebrity ? 'Celebrity.Web.CustomerJourney' : 'Royal.Web.CustomerJourney',
        commerceAppId: celebrity ? 'Celebrity.Web.PlanMyCruise' : 'Royal.Web.PlanMyCruise',
        host: BOOKINGS_HOST
    };
    cfg.catalogUrl = cfg.host + '/en/' + cfg.segment + '/web/graphql';
    cfg.bookingsUrl = function (accountId) {
        return cfg.host + '/v1/profileBookings/enriched/' + encodeURIComponent(accountId) + '?brand=' + cfg.code + '&includeCheckin=true';
    };
    cfg.voyagesUrl = function (ids, segment) {
        const encoded = String(ids).split(',').map(function (id) { return encodeURIComponent(id); }).join(',');
        return cfg.host + '/en/' + (segment || cfg.segment) + '/web/v3/ships/voyages/' + encoded + '/enriched';
    };
    cfg.orderListUrl = function (shipCode, passengerId, reservationId, sailingId) {
        return cfg.host + '/en/' + cfg.segment + '/web/commerce-api/calendar/v1/' + encodeURIComponent(shipCode) + '/orderHistory?' + q({
            passengerId: passengerId, reservationId: reservationId, sailingId: sailingId, currencyIso: 'USD'
        });
    };
    cfg.orderDetailUrl = function (shipCode, orderCode, passengerId, reservationId, sailingId) {
        return cfg.host + '/en/' + cfg.segment + '/web/commerce-api/calendar/v1/' + encodeURIComponent(shipCode) + '/orderHistory/' + encodeURIComponent(orderCode) + '?' + q({
            passengerId: passengerId, reservationId: reservationId, sailingId: sailingId, currencyIso: 'USD', fields: 'ORDER_ENTRY'
        });
    };
    cfg.obcUrl = function (bookingId, passengerId, sailingId) {
        return cfg.host + '/en/' + cfg.segment + '/web/commerce-api/cart/v1/obc/reservations/' + encodeURIComponent(bookingId) + '?' + q({
            passengerId: passengerId, sailingId: sailingId, currencyIso: 'USD'
        });
    };
    cfg.headers = function (authToken, accountId, kind) {
        return authHeaders(authToken, accountId, cfg, kind);
    };
    return cfg;
}

function categoryOf(item) {
    const summary = item && item.productSummary;
    const cat = (summary && summary.productTypeCategory) || (item && item.productTypeCategory);
    const id = cat && cat.id;
    if (!id) return '';
    return String(id).replace(/^pt_/i, '').toLowerCase();
}

function promoOf(item, guest) {
    const g = guest && guest.promoDescription && guest.promoDescription.displayName;
    const i = item && item.promoDescription && item.promoDescription.displayName;
    return g || i || null;
}

function guestOf(guest, item) {
    const price = (guest && guest.priceDetails) || {};
    return {
        first: (guest && guest.firstName) || '',
        status: (guest && guest.orderStatus) || (item && item.status) || '',
        base: finiteNum(price.basePrice),
        paid: finiteNum(price.total),
        refund: finiteNum(price.refund),
        promo: promoOf(item, guest)
    };
}

function flattenOrder(order, source) {
    const items = (order && (order.orderHistoryDetailItems || order.items)) || [];
    return (Array.isArray(items) ? items : []).map(item => ({
        orderCode: (order && (order.orderCode || order.code)) || '',
        orderDate: (order && order.orderDate) || null,
        orderStatus: (order && (order.status || order.orderStatus)) || '',
        source: source || 'mine',
        productId: item && item.productSummary && item.productSummary.id,
        title: (item && item.productSummary && item.productSummary.title) || (item && (item.title || item.name)) || '',
        category: categoryOf(item),
        itemStatus: (item && item.status) || '',
        promo: promoOf(item, null),
        guests: ((item && item.guests) || []).map(g => guestOf(g, item)).map(g => ({
            first: g.first,
            status: g.status,
            base: Number.isFinite(g.base) ? g.base : null,
            paid: Number.isFinite(g.paid) ? g.paid : null,
            refund: Number.isFinite(g.refund) ? g.refund : null,
            promo: g.promo
        })),
        current: null,
        cheaperNow: false,
        repurchasedCheaper: null
    }));
}

function linePaid(addon) {
    let sum = 0;
    let any = false;
    (addon && addon.guests || []).forEach(g => {
        if ((g.status || addon.itemStatus) === 'BOOKED' && Number.isFinite(g.paid)) {
            sum += g.paid;
            any = true;
        }
    });
    return any ? Math.round(sum * 100) / 100 : null;
}

function guestLines(addon) {
    return (addon && addon.guests || []).map(g => {
        const status = g.status || addon.itemStatus;
        if (status === 'CANCELLED') return 'Refunded ' + money(g.refund);
        if (status === 'BOOKED') {
            const parts = [];
            if (Number.isFinite(g.base) && Number.isFinite(g.paid) && g.base > g.paid) parts.push(money(g.base));
            if (Number.isFinite(g.paid)) parts.push(money(g.paid));
            if (g.promo || addon.promo) parts.push(g.promo || addon.promo);
            return parts.join(' ');
        }
        return status || '';
    });
}

function bookedGuestPaid(addon) {
    const g = (addon.guests || []).find(x => (x.status || addon.itemStatus) === 'BOOKED');
    return g && Number.isFinite(g.paid) ? g.paid : NaN;
}

function cancelledGuestRefund(addon) {
    const g = (addon.guests || []).find(x => (x.status || addon.itemStatus) === 'CANCELLED');
    return g && Number.isFinite(g.refund) ? g.refund : NaN;
}

function datesComparable(bookedDate, cancelledDate) {
    const b = bookedDate ? normDate(bookedDate) : '';
    const c = cancelledDate ? normDate(cancelledDate) : '';
    if (!b || !c) return true;
    return b >= c;
}

function markRepurchases(addons) {
    const byId = new Map();
    (addons || []).forEach(a => {
        if (!a || !a.productId || a.detailError) return;
        if (!byId.has(a.productId)) byId.set(a.productId, []);
        byId.get(a.productId).push(a);
    });
    byId.forEach(list => {
        const cancelled = list.filter(a => a.itemStatus === 'CANCELLED');
        list.filter(a => a.itemStatus === 'BOOKED').forEach(b => {
            const now = bookedGuestPaid(b);
            if (!Number.isFinite(now)) return;
            for (let i = 0; i < cancelled.length; i++) {
                const c = cancelled[i];
                if (!datesComparable(b.orderDate, c.orderDate)) continue;
                const was = cancelledGuestRefund(c);
                if (Number.isFinite(was) && now < was) {
                    b.repurchasedCheaper = { was: was, now: now };
                    break;
                }
            }
        });
    });
    return addons;
}

function catalogPrice(price) {
    const arr = Array.isArray(price) ? price : (price ? [price] : []);
    if (!arr.length) return null;
    const usd = arr.find(p => p && String(p.currency || p.currencyIso || '').toUpperCase() === 'USD') || arr[0];
    if (!usd) return null;
    const promo = finiteNum(usd.promotionalPrice);
    const base = parseMoney(usd.formattedBasePrice);
    const amount = Number.isFinite(promo) ? promo : base;
    const label = usd.formattedPromotionalPrice || usd.formattedBasePrice || (Number.isFinite(amount) ? money(amount) : '');
    const unit = String((usd.salesUnit && usd.salesUnit.code) || '').toLowerCase();
    const period = unit === 'perday' ? 'day' : (unit === 'pernight' ? 'night' : '');
    const daily = !!period || (usd.promotionalPrice == null && !!usd.formattedDailyPrice && usd.formattedDailyPrice === usd.formattedBasePrice);
    const suffix = period || (daily ? 'day' : '');
    return {
        amount: Number.isFinite(amount) ? amount : null,
        label: suffix && label ? label + '/' + suffix : label,
        daily: !!daily,
        period: period || (daily ? 'day' : ''),
        comparable: !daily && (unit === 'perseat' || Number.isFinite(promo))
    };
}

function cheaperThanPaid(addon, current, nights) {
    if (!current || !addon || addon.itemStatus !== 'BOOKED' || !Number.isFinite(current.amount)) return false;
    const paid = bookedGuestPaid(addon);
    if (!Number.isFinite(paid)) return false;
    if (current.daily || current.period) {
        const n = Number(nights);
        if (!Number.isFinite(n) || n <= 0) return false;
        return Math.round(current.amount * n * 100) / 100 + 0.009 < paid;
    }
    if (current.comparable === false) return false;
    return current.amount + 0.009 < paid;
}

function productImage(product) {
    const media = product && product.media;
    if (!Array.isArray(media)) return '';
    for (let i = 0; i < media.length; i++) {
        const path = media[i] && media[i].source && media[i].source.path;
        if (!path || /\.(m3u8|mp4|webm)(\?|$)/i.test(path)) continue;
        return absDam(path, 240);
    }
    return '';
}

function applyCatalogPrice(addon, product, nights) {
    if (!addon) return addon;
    const parsed = catalogPrice(product && product.price);
    addon.current = parsed ? { amount: parsed.amount, label: parsed.label, daily: parsed.daily, period: parsed.period || '' } : null;
    addon.cheaperNow = cheaperThanPaid(addon, addon.current, nights);
    const image = productImage(product);
    if (image) addon.image = image;
    return addon;
}

function priceView(addon, nights) {
    const cur = addon && addon.current;
    if (!cur || !cur.label) return { label: '', cheaper: false };
    const paid = bookedGuestPaid(addon);
    const n = Number(nights);
    if (!cur.daily && !cur.period && Number.isFinite(n) && n > 0 && Number.isFinite(cur.amount) && Number.isFinite(paid) && Math.abs(Math.round(cur.amount * n * 100) / 100 - paid) < 0.02) {
        return { label: String(cur.label).replace(/\/(day|night)$/i, '') + '/night', cheaper: false };
    }
    return { label: cur.label, cheaper: cheaperThanPaid(addon, cur, nights) };
}
function ratePeriod(addon, nights) {
    const view = priceView(addon, nights);
    const fromLabel = String(view.label || '').match(/\/(night|day)$/i);
    if (fromLabel) return fromLabel[1].toLowerCase();
    const cur = addon && addon.current;
    if (cur && (cur.period === 'night' || cur.period === 'day')) return cur.period;
    if (cur && cur.daily) return 'day';
    return '';
}

function guestRateLabel(paid, nights, period) {
    const n = Number(nights);
    if (!period || !Number.isFinite(paid) || !Number.isFinite(n) || n <= 0) return '';
    return '(' + money(Math.round((paid / n) * 100) / 100) + '/' + period + ')';
}


function mapOrderHistory(status, body) {
    try {
        if (status === 401 || status === 403 || status !== 200) return { detailError: true, addons: [] };
        const json = typeof body === 'string' ? JSON.parse(body) : body;
        const p = (json && (json.payload || json)) || {};
        return {
            detailError: false,
            mine: Array.isArray(p.myOrders) ? p.myOrders : [],
            other: Array.isArray(p.ordersOthersHaveBookedForMe) ? p.ordersOthersHaveBookedForMe : []
        };
    } catch (e) {
        return { detailError: true, addons: [] };
    }
}

function keepObc(amount) {
    const n = finiteNum(amount);
    if (absentAmount(n)) return undefined;
    return n;
}

function sailingKey(shipCode, sailDate) {
    return String(shipCode || '') + '|' + normDate(sailDate);
}

function errorAddon(order, source) {
    return {
        orderCode: (order && (order.orderCode || order.code)) || '',
        orderDate: (order && order.orderDate) || null,
        orderStatus: (order && (order.status || order.orderStatus)) || '',
        source: source || 'mine',
        status: (order && (order.status || order.orderStatus)) || '',
        items: [],
        productId: null,
        title: '',
        category: '',
        itemStatus: '',
        promo: null,
        guests: [],
        current: null,
        cheaperNow: false,
        repurchasedCheaper: null,
        detailError: true
    };
}

function listProfileKeys() {
    const keys = [];
    const add = (k) => {
        if (k && /^gobo-[RC]-/.test(k) && keys.indexOf(k) < 0) keys.push(k);
    };
    try {
        if (typeof GoboStore !== 'undefined' && GoboStore && typeof GoboStore.listKeys === 'function') {
            GoboStore.listKeys('gobo-R-').forEach(add);
            GoboStore.listKeys('gobo-C-').forEach(add);
        }
    } catch (e) {}
    try {
        if (typeof localStorage !== 'undefined' && localStorage) {
            for (let i = 0; i < localStorage.length; i++) add(localStorage.key(i));
        }
    } catch (e) {}
    return keys;
}

function readRaw(key) {
    try {
        if (typeof goboStorageGet === 'function') return goboStorageGet(key);
        if (typeof localStorage !== 'undefined' && localStorage) return localStorage.getItem(key);
    } catch (e) {}
    return null;
}

function addSailingKey(set, brand, sailing) {
    if (!sailing) return;
    if (sailing.key && String(sailing.key).indexOf('|') !== -1) {
        const parts = String(sailing.key).split('|');
        const ship = parts[0];
        const date = normDate(parts[1]);
        if (ship && date) set.add(brand + '|' + ship + '|' + date);
        return;
    }
    const ship = sailing.shipCode || '';
    const date = normDate(sailing.sailDate);
    if (ship && date) set.add(brand + '|' + ship + '|' + date);
}

function runtimeApi() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) return chrome.runtime;
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) return browser.runtime;
    return null;
}

async function pool(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    async function worker() {
        for (;;) {
            const i = next++;
            if (i >= items.length) return;
            out[i] = await fn(items[i], i);
        }
    }
    const n = Math.min(limit, items.length);
    const jobs = [];
    for (let i = 0; i < n; i++) jobs.push(worker());
    await Promise.all(jobs);
    return out;
}

function sailingInfoOf(json) {
    const p = json && (json.payload || json);
    const info = p && p.sailingInfo;
    return Array.isArray(info) && info.length ? info : null;
}

function indexVoyages(info) {
    const map = new Map();
    (info || []).forEach(s => {
        const ship = s.shipCode || (s.ship && (s.ship.code || s.ship.shipCode)) || '';
        const date = normDate(s.sailDate || s.sailingDate || s.startDate || '');
        if (ship && date) map.set(ship + '|' + date, s);
        if (s.sailingId) map.set(String(s.sailingId), s);
    });
    return map;
}

function nightsBetween(start, end) {
    const a = Date.parse(normDate(start) + 'T00:00:00Z');
    const b = Date.parse(normDate(end) + 'T00:00:00Z');
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const n = Math.round((b - a) / 86400000);
    return n >= 0 ? n : null;
}

function roomFrom(b) {
    const passengers = Array.isArray(b.passengers) ? b.passengers : [];
    const passengerId = (passengers[0] && passengers[0].passengerId) || b.grantorPassengerId || '';
    const type = b.stateroomType || '';
    return {
        bookingId: b.bookingId || b.reservationId || '',
        masterBookingId: b.masterBookingId || null,
        room: b.stateroomNumber || '',
        deck: b.deckNumber == null ? '' : b.deckNumber,
        typeLabel: TYPE_LABEL[String(type).toUpperCase()] || type,
        paidInFull: !!b.paidInFull,
        guestNames: passengers.map(p => p && p.firstName).filter(Boolean),
        passengerId: passengerId,
        truncated: false,
        detailError: false,
        addons: []
    };
}

function productsOf(json) {
    const data = (json && json.data) || (json && json.payload && json.payload.data) || (json && json.payload) || {};
    const products = data.products;
    if (!products || !Array.isArray(products.commerceProducts)) return null;
    return products;
}

function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
}

function fmtDate(d) {
    try {
        if (typeof Utils !== 'undefined' && Utils.formatDate) return Utils.formatDate(d);
        if (typeof App !== 'undefined' && App.Utils && App.Utils.formatDate) return App.Utils.formatDate(d);
    } catch (e) {}
    return d || '';
}
function tripDate(d) {
    const iso = normDate(d);
    if (!iso) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[Number(iso.slice(5, 7)) - 1];
    if (!month) return d || '';
    return month + ' ' + Number(iso.slice(8, 10)) + ', ' + iso.slice(0, 4);
}


function niceCase(value) {
    const text = String(value || '').trim();
    if (!text || text !== text.toUpperCase() || !/[A-Z]/.test(text)) return text;
    const small = { of: 1, the: 1, and: 1, a: 1, on: 1 };
    return text.toLowerCase().split(/\s+/).map((word, i) => (i && small[word]) ? word : (word.charAt(0).toUpperCase() + word.slice(1))).join(' ');
}

function statusLabel(status) {
    if (status === 'BOOKED') return 'Booked';
    if (status === 'CANCELLED') return 'Cancelled';
    if (!status) return '';
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function renderGuest(g, addon, nights) {
    const line = el('div', 'gobo-booking-guest');
    const status = g.status || addon.itemStatus;
    if (g.first) line.appendChild(el('span', 'gobo-booking-guest-name', niceCase(g.first)));
    if (status === 'CANCELLED') {
        line.appendChild(el('span', 'gobo-booking-refund', 'Refunded ' + money(g.refund)));
        return line;
    }
    if (status === 'BOOKED') {
        const price = el('span', 'gobo-booking-price');
        if (Number.isFinite(g.base) && Number.isFinite(g.paid) && g.base > g.paid) price.appendChild(el('s', 'gobo-booking-base', money(g.base)));
        if (Number.isFinite(g.paid)) price.appendChild(el('span', 'gobo-booking-paid', money(g.paid)));
        const rate = guestRateLabel(g.paid, nights, ratePeriod(addon, nights));
        if (rate) price.appendChild(el('span', 'gobo-booking-rate', rate));
        line.appendChild(price);
        const promo = g.promo || addon.promo;
        if (promo) line.appendChild(el('span', 'gobo-booking-promo', promo));
        return line;
    }
    if (status) line.appendChild(el('span', 'gobo-booking-note', statusLabel(status)));
    return line;
}

function absDam(path, width) {
    if (!path) return '';
    if (/^https?:/i.test(path)) return path;
    const clean = String(path).replace(/\.transform\/.*/i, '');
    return 'https://www.royalcaribbean.com/media-assets/pmc' + (clean.charAt(0) === '/' ? clean : '/' + clean) + '?w=' + (width || 1024);
}

function heroFromVoyage(v) {
    if (!v) return { url: '', caption: '' };
    const ports = (v.itinerary && v.itinerary.portInfo) || [];
    const docked = ports.find(p => p && p.portType === 'DOCKED' && p.portImageURL);
    const picked = docked || ports.find(p => p && p.portImageURL && p.portType !== 'CRUISING');
    if (picked && picked.portImageURL) return { url: absDam(picked.portImageURL), caption: picked.portName || picked.title || '' };
    const file = v.voyageImage && v.voyageImage.web && v.voyageImage.web[0] && v.voyageImage.web[0].fileReference;
    return { url: absDam(file), caption: '' };
}

function plannerUrl(brand, room, sailing) {
    if (!room || !room.bookingId || !sailing || !sailing.shipCode || !sailing.sailDate) return '';
    const host = brand === 'C' ? 'https://www.celebritycruises.com' : 'https://www.royalcaribbean.com';
    return host + '/account/cruise-planner?bookingId=' + encodeURIComponent(room.bookingId) + '&sailDate=' + compactDate(sailing.sailDate) + '&shipCode=' + encodeURIComponent(sailing.shipCode);
}

function planLink(url) {
    const a = document.createElement('a');
    a.className = 'gobo-booking-plan';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = 'Opens Plan My Cruise in a new tab';
    a.textContent = 'Plan my cruise';
    return a;
}
function orderHistoryUrl(brand, room, sailing) {
    if (!room || !room.bookingId || !sailing || !sailing.shipCode || !sailing.sailDate) return '';
    const host = brand === 'C' ? 'https://www.celebritycruises.com' : 'https://www.royalcaribbean.com';
    return host + '/account/cruise-planner/order-history?bookingId=' + encodeURIComponent(room.bookingId) + '&sailDate=' + compactDate(sailing.sailDate) + '&shipCode=' + encodeURIComponent(sailing.shipCode);
}

function cancelLink(url, orderCode) {
    const a = document.createElement('a');
    a.className = 'gobo-booking-cancel';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = 'Opens Order history for this reservation. Expand order ' + orderCode + ' to modify it.';
    a.textContent = 'Modify';
    return a;
}


function renderAddon(a, nights, cancelUrl) {
    const row = el('div', 'gobo-booking-addon' + (a.itemStatus === 'CANCELLED' ? ' is-cancelled' : ''));
    const top = el('div', 'gobo-booking-addon-top');
    const main = el('div', 'gobo-booking-addon-main');
    const head = el('div', 'gobo-booking-addon-head');
    head.appendChild(el('div', 'gobo-booking-addon-title', a.title || ('Order ' + (a.orderCode || ''))));
    if (a.itemStatus) head.appendChild(el('span', 'gobo-booking-status is-' + String(a.itemStatus).toLowerCase(), statusLabel(a.itemStatus)));
    if (cancelUrl && a.orderCode && a.itemStatus === 'BOOKED' && a.source !== 'other') head.appendChild(cancelLink(cancelUrl, a.orderCode));
    main.appendChild(head);
    if (a.orderCode) main.appendChild(el('div', 'gobo-booking-order', 'Order ' + a.orderCode));
    if (a.image) {
        const img = document.createElement('img');
        img.className = 'gobo-booking-thumb';
        img.alt = '';
        img.src = a.image;
        img.addEventListener('error', () => img.remove());
        top.appendChild(img);
    }
    top.appendChild(main);
    row.appendChild(top);
    const prices = el('div', 'gobo-booking-addon-prices');
    if (!a.detailError) {
        const compare = el('div', 'gobo-booking-compare');
        const paid = linePaid(a);
        if (paid != null) {
            const cell = el('span', 'gobo-booking-compare-cell');
            cell.appendChild(el('span', 'gobo-booking-compare-k', 'Paid'));
            cell.appendChild(el('span', 'gobo-booking-line-paid', money(paid)));
            compare.appendChild(cell);
        }
        const view = priceView(a, nights);
        if (view.label) {
            const cell = el('span', 'gobo-booking-compare-cell' + (view.cheaper ? ' is-cheaper' : ''));
            cell.appendChild(el('span', 'gobo-booking-compare-k', view.cheaper ? 'Cheaper now' : 'Now'));
            cell.appendChild(el('span', 'gobo-booking-now', view.label));
            compare.appendChild(cell);
        }
        if (compare.childNodes.length) prices.appendChild(compare);
        (a.guests || []).forEach(g => prices.appendChild(renderGuest(g, a, nights)));
        if (a.repurchasedCheaper) prices.appendChild(el('div', 'gobo-booking-repurchased', 'Repurchased cheaper (was ' + money(a.repurchasedCheaper.was) + ')'));
    } else prices.appendChild(el('div', 'gobo-booking-note', 'Details unavailable'));
    if (prices.childNodes.length) row.appendChild(prices);
    return row;
}

function renderRoom(room, sailing, brand) {
    const box = el('div', 'gobo-booking-room');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gobo-booking-room-toggle';
    btn.setAttribute('aria-expanded', 'false');
    const where = [room.typeLabel, room.room ? ('Room ' + room.room) : '', (room.deck !== '' && room.deck != null) ? ('Deck ' + room.deck) : ''].filter(Boolean);
    btn.appendChild(el('span', 'gobo-booking-room-where', where.join(' · ') || 'Reservation'));
    if (room.guestNames && room.guestNames.length) btn.appendChild(el('span', 'gobo-booking-guests', room.guestNames.map(niceCase).join(', ')));
    const meta = [];
    if (room.bookingId) meta.push('Reservation ' + room.bookingId);
    if (room.paidInFull) meta.push('Paid in full');
    if (Number.isFinite(room.obc) && room.obc > 0) meta.push('Onboard credit ' + money(room.obc));
    const count = (room.addons || []).filter(a => !a.detailError).length;
    if (count) meta.push(count + (count === 1 ? ' purchase' : ' purchases'));
    const cheaper = (room.addons || []).filter(a => priceView(a, sailing && sailing.nights).cheaper).length;
    if (meta.length) btn.appendChild(el('span', 'gobo-booking-room-meta', meta.join(' · ')));
    if (cheaper) btn.appendChild(el('span', 'gobo-booking-cheaper-note', cheaper === 1 ? '1 cheaper now' : cheaper + ' cheaper now'));
    btn.appendChild(el('span', 'gobo-booking-chev', '\u203a'));
    box.appendChild(btn);
    const body = el('div', 'gobo-booking-room-body');
    const url = plannerUrl(brand, room, sailing);
    if (url) body.appendChild(planLink(url));
    const mine = (room.addons || []).filter(a => a.source !== 'other');
    const other = (room.addons || []).filter(a => a.source === 'other');
    const history = orderHistoryUrl(brand, room, sailing);
    mine.forEach(a => body.appendChild(renderAddon(a, sailing && sailing.nights, history)));
    if (other.length) {
        body.appendChild(el('div', 'gobo-booking-other', 'Booked by someone else'));
        other.forEach(a => body.appendChild(renderAddon(a, sailing && sailing.nights)));
    }
    if (room.truncated) body.appendChild(el('div', 'gobo-booking-note', 'Some orders were not loaded.'));
    if (room.detailError && !(room.addons && room.addons.length)) body.appendChild(el('div', 'gobo-booking-note', 'Details unavailable'));
    box.appendChild(body);
    return box;
}

function renderSailing(s, brand) {
    const block = el('div', 'gobo-booking-sailing');
    const hero = el('div', 'gobo-booking-hero');
    hero.dataset.sailingKey = s.key || (s.shipCode + '|' + normDate(s.sailDate));
    if (s.hero) {
        const img = document.createElement('img');
        img.alt = '';
        img.src = s.hero;
        img.addEventListener('error', () => img.remove());
        hero.appendChild(img);
    } else hero.classList.add('is-empty');
    const copy = el('div', 'gobo-booking-hero-copy');
    copy.appendChild(el('div', 'gobo-booking-ship', niceCase(s.shipName || s.shipCode || '')));
    const start = tripDate(s.sailDate);
    const end = s.endDate ? tripDate(s.endDate) : '';
    const when = end && end !== '-' ? (start + ' – ' + end) : start;
    const bits = [];
    if (when && when !== '-') bits.push(when);
    if (s.nights != null && s.nights !== '') bits.push(s.nights + (Number(s.nights) === 1 ? ' night' : ' nights'));
    if (bits.length) copy.appendChild(el('div', 'gobo-booking-when', bits.join(' · ')));
    if (s.description) copy.appendChild(el('div', 'gobo-booking-desc', s.description));
    if (s.heroCaption) copy.appendChild(el('div', 'gobo-booking-caption', s.heroCaption));
    hero.appendChild(copy);
    block.appendChild(hero);
    const rooms = el('div', 'gobo-booking-rooms');
    (s.rooms || []).forEach(room => rooms.appendChild(renderRoom(room, s, brand)));
    block.appendChild(rooms);
    return block;
}
async function attachHeroes(storageKey, payload) {
    const sailings = payload && payload.bookings && payload.bookings.sailings;
    if (!sailings || !sailings.some(s => !s.hero && s.shipCode && s.sailDate)) return;
    const cookies = (typeof App !== 'undefined' && App.Utils && App.Utils.getCookie) ? App.Utils : null;
    const token = cookies ? cookies.getCookie('accessToken') : '';
    const accountId = cookies ? cookies.getCookie('VDS_ID') : '';
    if (!token || !accountId) return;
    const brand = payload.brand || (String(storageKey).indexOf('gobo-C') === 0 ? 'C' : 'R');
    const cfg = brandConfig(brand);
    const ids = sailings.filter(s => !s.hero && s.shipCode && s.sailDate).map(s => s.shipCode + compactDate(s.sailDate)).filter((id, i, arr) => arr.indexOf(id) === i).join(',');
    if (!ids) return;
    const headers = cfg.headers(token, accountId, 'bookings');
    let msg = await Bookings._send(cfg.voyagesUrl(ids), 'GET', headers);
    let info = (msg && msg.status === 200) ? sailingInfoOf(msg.json) : null;
    if (!info && cfg.segment === 'celebrity') {
        msg = await Bookings._send(cfg.voyagesUrl(ids, 'royal'), 'GET', headers);
        info = (msg && msg.status === 200) ? sailingInfoOf(msg.json) : null;
    }
    const map = indexVoyages(info);
    let changed = false;
    sailings.forEach(s => {
        if (s.hero) return;
        const key = s.key || (s.shipCode + '|' + normDate(s.sailDate));
        const v = map.get(key) || map.get(s.shipCode + compactDate(s.sailDate));
        const hero = heroFromVoyage(v);
        if (!hero.url) return;
        s.hero = hero.url;
        s.heroCaption = hero.caption;
        changed = true;
        if (!document.getElementById('gobo-bookings-modal')) return;
        const node = document.querySelector('.gobo-booking-hero[data-sailing-key="' + key + '"]');
        if (!node) return;
        node.classList.remove('is-empty');
        const img = document.createElement('img');
        img.alt = '';
        img.src = hero.url;
        img.addEventListener('error', () => img.remove());
        node.insertBefore(img, node.firstChild);
        if (hero.caption && !node.querySelector('.gobo-booking-caption')) {
            const copy = node.querySelector('.gobo-booking-hero-copy');
            if (copy) copy.appendChild(el('div', 'gobo-booking-caption', hero.caption));
        }
    });
    if (!changed) return;
    try {
        const raw = JSON.stringify(payload);
        if (typeof goboStorageSet === 'function') goboStorageSet(storageKey, raw);
        else localStorage.setItem(storageKey, raw);
    } catch (e) {}
}


const Bookings = {
    brandConfig: brandConfig,
    sailingKey: sailingKey,
    heroFromVoyage: heroFromVoyage,
    plannerUrl: plannerUrl,
    orderHistoryUrl: orderHistoryUrl,
    keepObc: keepObc,
    flattenOrder: flattenOrder,
    linePaid: linePaid,
    guestLines: guestLines,
    markRepurchases: markRepurchases,
    applyCatalogPrice: applyCatalogPrice,
    mapOrderHistory: mapOrderHistory,
    _keys: null,

    async _send(url, method, headers, body) {
        const runtime = runtimeApi();
        if (!runtime) return { error: 'no-runtime' };
        let msg;
        try {
            msg = await runtime.sendMessage({ channel: 'gobo-rccl', url: url, method: method, headers: headers, body: body });
        } catch (e) {
            return { error: e && e.message ? e.message : String(e) };
        }
        if (!msg) return { error: 'empty' };
        if (msg.error) return { error: msg.error, status: msg.status, ok: false };
        const out = { ok: !!msg.ok, status: msg.status, body: msg.body };
        if (msg.ok && msg.body) {
            try { out.json = JSON.parse(msg.body); } catch (e) { out.error = 'json'; }
        }
        return out;
    },

    index() {
        if (this._keys) return this._keys;
        const set = new Set();
        listProfileKeys().forEach(key => {
            let payload = null;
            try {
                const raw = readRaw(key);
                payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
            } catch (e) { return; }
            const sailings = payload && payload.bookings && payload.bookings.sailings;
            if (!Array.isArray(sailings)) return;
            const brand = (payload.brand === 'R' || payload.brand === 'C') ? payload.brand : 'R';
            sailings.forEach(s => addSailingKey(set, brand, s));
        });
        this._keys = set;
        return set;
    },

    activeBrand() {
        let key = null;
        try {
            key = (App.CurrentProfile && App.CurrentProfile.key) || (App.TableRenderer && App.TableRenderer.lastState && App.TableRenderer.lastState.selectedProfileKey);
        } catch (e) {}
        const m = key && String(key).match(/^gobo-([RC])-/);
        if (m) return m[1];
        if (key === 'goob-favorites' || key === 'goob-combined-linked') return null;
        try {
            const d = App.Utils && App.Utils.detectBrand && App.Utils.detectBrand();
            if (d === 'R' || d === 'C') return d;
        } catch (e) {}
        return 'R';
    },

    isBooked(shipCode, sailDate, brand) {
        const set = this._keys || this.index();
        if (!set || !set.size) return false;
        const ship = String(shipCode || '');
        const date = normDate(sailDate);
        if (!ship || !date) return false;
        if (brand === 'R' || brand === 'C') return set.has(brand + '|' + ship + '|' + date);
        return set.has('R|' + ship + '|' + date) || set.has('C|' + ship + '|' + date);
    },
    syncBadges() {
        if (typeof document === 'undefined') return;
        this._keys = null;
        const brand = this.activeBrand();
        document.querySelectorAll('tr[data-ship-code][data-sail-date]').forEach(row => {
            const cell = row.querySelector('[data-col="ship"]');
            if (!cell) return;
            const on = this.isBooked(row.dataset.shipCode, row.dataset.sailDate, brand);
            const badge = cell.querySelector('.gobo-booked-badge');
            if (on && !badge) {
                const span = document.createElement('span');
                span.className = 'gobo-booked-badge';
                span.title = 'Already booked';
                span.textContent = 'Booked';
                cell.appendChild(span);
            } else if (!on && badge) badge.remove();
        });
    },
    guestRateLabel: guestRateLabel,
    hasDeal(bookings) {
        const sailings = bookings && bookings.sailings || [];
        for (let i = 0; i < sailings.length; i++) {
            const rooms = sailings[i].rooms || [];
            for (let r = 0; r < rooms.length; r++) {
                const addons = rooms[r].addons || [];
                for (let a = 0; a < addons.length; a++) {
                    if (priceView(addons[a], sailings[i].nights).cheaper) return true;
                }
            }
        }
        return false;
    },
    markLoading(key, on) {
        if (!this._loading) this._loading = new Set();
        if (on) this._loading.add(key); else this._loading.delete(key);
        this.paintCruisesBtn();
    },
    markDeal(key, on) {
        if (!this._deals) this._deals = new Set();
        if (!this._dealKnown) this._dealKnown = new Set();
        this._dealKnown.add(key);
        if (on) this._deals.add(key); else this._deals.delete(key);
        this.paintCruisesBtn();
    },
    paintCruisesBtn(btn) {
        if (typeof document === 'undefined') return;
        btn = btn || document.querySelector('.breadcrumb-tabs-row .gobo-cruises-btn');
        if (!btn) return;
        const key = btn.getAttribute('data-storage-key') || '';
        const loading = !!(key && this._loading && this._loading.has(key));
        btn.classList.toggle('is-loading', loading);
        if (loading) btn.setAttribute('aria-busy', 'true');
        else btn.removeAttribute('aria-busy');
        let deal = false;
        if (!loading && key) {
            if (this._dealKnown && this._dealKnown.has(key)) deal = !!(this._deals && this._deals.has(key));
            else deal = this._storedDeal(key);
        }
        btn.classList.toggle('is-deal', deal);
        btn.title = deal ? 'Cruises — cheaper now' : 'Cruises';
    },
    _storedDeal(key) {
        try {
            const raw = (typeof goboStorageGet === 'function') ? goboStorageGet(key) : localStorage.getItem(key);
            const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return this.hasDeal(payload && payload.bookings);
        } catch (e) { return false; }
    },



    async load(authToken, accountId, brandCode) {
        const cfg = brandConfig(brandCode);
        const bookHeaders = cfg.headers(authToken, accountId, 'bookings');
        const commerceHeaders = cfg.headers(authToken, accountId, 'commerce');
        try {
            const res = await this._send(cfg.bookingsUrl(accountId), 'GET', bookHeaders);
            if (!res || res.error || !res.ok || res.status !== 200) {
                throw new Error((res && (res.error || ('bookings ' + res.status))) || 'bookings failed');
            }
            const payload = (res.json && (res.json.payload || res.json)) || {};
            const kept = (Array.isArray(payload.profileBookings) ? payload.profileBookings : []).filter(b => b && b.bookingStatus === 'BK');
            const groups = new Map();
            kept.forEach(b => {
                const shipCode = b.shipCode || '';
                const sailDate = normDate(b.sailDate);
                const key = shipCode + '|' + sailDate;
                if (!groups.has(key)) groups.set(key, { key: key, shipCode: shipCode, sailDate: sailDate, rooms: [], raw: [] });
                const g = groups.get(key);
                g.rooms.push(roomFrom(b));
                g.raw.push(b);
            });
            const sailings = Array.from(groups.values());
            if (sailings.length) {
                const ids = sailings.map(s => s.shipCode + compactDate(s.sailDate)).filter((id, i, arr) => id && arr.indexOf(id) === i).join(',');
                let info = null;
                if (ids) {
                    const voyage = await this._send(cfg.voyagesUrl(ids), 'GET', bookHeaders);
                    info = (voyage && voyage.status === 200) ? sailingInfoOf(voyage.json) : null;
                    // Celebrity's account app reads voyage copy from the Royal path.
                    if (!info && cfg.segment === 'celebrity') {
                        const retry = await this._send(cfg.voyagesUrl(ids, 'royal'), 'GET', bookHeaders);
                        info = (retry && retry.status === 200) ? sailingInfoOf(retry.json) : null;
                    }
                }
                const voyageMap = indexVoyages(info);
                sailings.forEach(s => {
                    const v = voyageMap.get(s.key) || voyageMap.get(s.shipCode + compactDate(s.sailDate));
                    s.shipName = (v && (v.shipName || (v.ship && v.ship.name))) || s.shipCode;
                    s.endDate = v && (v.sailingEndDate || v.endDate) ? normDate(v.sailingEndDate || v.endDate) : null;
                    s.nights = s.endDate ? nightsBetween(s.sailDate, s.endDate) : null;
                    s.description = (v && v.itinerary && v.itinerary.description) || (v && v.description) || '';
                    const hero = heroFromVoyage(v);
                    if (hero.url) { s.hero = hero.url; s.heroCaption = hero.caption; }
                    delete s.raw;
                });
                for (let si = 0; si < sailings.length; si++) {
                    const s = sailings[si];
                    const sailingId = s.shipCode + compactDate(s.sailDate);
                    for (let ri = 0; ri < s.rooms.length; ri++) {
                        const room = s.rooms[ri];
                        try {
                            const listRes = await this._send(cfg.orderListUrl(s.shipCode, room.passengerId, room.bookingId, sailingId), 'GET', commerceHeaders);
                            const mapped = this.mapOrderHistory(listRes && listRes.status, listRes && listRes.ok ? listRes.json : (listRes && listRes.body));
                            if (mapped.detailError) {
                                room.detailError = true;
                                room.addons = [];
                                continue;
                            }
                            const collected = [];
                            mapped.mine.forEach(o => collected.push({ order: o, source: 'mine' }));
                            mapped.other.forEach(o => collected.push({ order: o, source: 'other' }));
                            if (collected.length > DETAIL_CAP) {
                                room.truncated = true;
                                collected.length = DETAIL_CAP;
                            }
                            const detailed = await pool(collected, 4, async (c) => {
                                try {
                                    const code = c.order && (c.order.orderCode || c.order.code);
                                    if (!code) return [errorAddon(c.order, c.source)];
                                    const detail = await this._send(cfg.orderDetailUrl(s.shipCode, code, room.passengerId, room.bookingId, sailingId), 'GET', commerceHeaders);
                                    if (!detail || !detail.ok || detail.status === 401 || detail.status === 403) return [errorAddon(c.order, c.source)];
                                    const body = (detail.json && (detail.json.payload || detail.json)) || {};
                                    const order = Object.assign({}, c.order, body, {
                                        orderCode: code,
                                        orderHistoryDetailItems: body.orderHistoryDetailItems || (body.order && body.order.orderHistoryDetailItems) || c.order.orderHistoryDetailItems
                                    });
                                    const addons = flattenOrder(order, c.source);
                                    return addons.length ? addons : [errorAddon(c.order, c.source)];
                                } catch (e) {
                                    return [errorAddon(c.order, c.source)];
                                }
                            });
                            room.addons = [];
                            detailed.forEach(list => { if (list) room.addons = room.addons.concat(list); });
                            markRepurchases(room.addons);
                            try {
                                const obcRes = await this._send(cfg.obcUrl(room.bookingId, room.passengerId, sailingId), 'GET', commerceHeaders);
                                if (obcRes && obcRes.ok && obcRes.json) {
                                    const amount = (obcRes.json.payload || obcRes.json).amount;
                                    const keptObc = keepObc(amount);
                                    if (keptObc != null) room.obc = keptObc;
                                }
                            } catch (e) {}
                        } catch (e) {
                            room.detailError = true;
                            if (!room.addons) room.addons = [];
                        }
                    }
                }
                await this._fillPrices(cfg, commerceHeaders, sailings);
            }
            return { savedAt: Date.now(), brand: cfg.code, error: null, sailings: sailings };
        } finally {
            this._keys = null;
        }
    },

    async _fillPrices(cfg, headers, sailings) {
        const groups = new Map();
        sailings.forEach(s => {
            (s.rooms || []).forEach(room => {
                (room.addons || []).forEach(addon => {
                    if (!addon || addon.detailError || !addon.productId || !addon.category || addon.itemStatus !== 'BOOKED') return;
                    const gk = [s.shipCode, s.sailDate, addon.category, room.passengerId, room.bookingId].join('|');
                    if (!groups.has(gk)) {
                        groups.set(gk, {
                            shipCode: s.shipCode,
                            sailDate: s.sailDate,
                            category: addon.category,
                            passengerId: room.passengerId,
                            reservationId: room.bookingId,
                            ids: new Set(),
                            addons: [],
                            nights: s.nights
                        });
                    }
                    const g = groups.get(gk);
                    g.ids.add(addon.productId);
                    g.addons.push(addon);
                });
            });
        });
        for (const g of groups.values()) {
            try {
                const found = new Map();
                for (let page = 0; page < 12 && found.size < g.ids.size; page++) {
                    const origin = cfg.code === 'C' ? 'https://www.celebritycruises.com' : 'https://www.royalcaribbean.com';
                    const catalogHeaders = Object.assign({}, headers, { origin: origin, referer: origin + '/' });
                    const res = await this._send(cfg.catalogUrl, 'POST', catalogHeaders, JSON.stringify({
                        query: CATALOG_QUERY,
                        variables: {
                            category: g.category,
                            passengerId: g.passengerId || null,
                            shipCode: g.shipCode,
                            sailDate: g.sailDate,
                            reservationId: g.reservationId || null,
                            pageSize: 24,
                            currentPage: page,
                            currencyCode: 'USD'
                        }
                    }));
                    if (!res || !res.ok || !res.json) break;
                    const products = productsOf(res.json);
                    if (!products) break;
                    (products.commerceProducts || []).forEach(p => {
                        if (p && g.ids.has(p.id)) found.set(p.id, p);
                    });
                    if (!products.pageInfo || products.pageInfo.hasNextPage === false) break;
                }
                g.addons.forEach(addon => {
                    if (found.has(addon.productId)) applyCatalogPrice(addon, found.get(addon.productId), g.nights);
                });
            } catch (e) {}
        }
    },

    open(storageKey) {
        if (typeof document === 'undefined') return;
        const existing = document.getElementById('gobo-bookings-modal');
        const same = existing && existing.getAttribute('data-storage-key') === storageKey;
        if (existing) {
            if (typeof existing._dismiss === 'function') existing._dismiss();
            else existing.remove();
            if (same) return;
        }
        const backdrop = document.createElement('div');
        backdrop.id = 'gobo-bookings-modal';
        backdrop._dismiss = null;
        backdrop.setAttribute('data-storage-key', storageKey);
        const dialog = document.createElement('div');
        dialog.className = 'gobo-bookings-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', 'Cruises');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'gobo-bookings-close';
        close.setAttribute('aria-label', 'Close');
        close.textContent = '\u00d7';
        const onKey = (ev) => {
            if (ev.key !== 'Escape') return;
            ev.preventDefault();
            ev.stopPropagation();
            backdrop.remove();
            document.removeEventListener('keydown', onKey, true);
        };
        const dismiss = () => {
            document.removeEventListener('keydown', onKey, true);
            backdrop.remove();
        };
        backdrop._dismiss = dismiss;
        close.addEventListener('click', dismiss);
        backdrop.addEventListener('click', (ev) => { if (ev.target === backdrop) dismiss(); });
        document.addEventListener('keydown', onKey, true);
        const head = document.createElement('div');
        head.className = 'gobo-bookings-head';
        head.appendChild(el('div', 'gobo-bookings-kicker', 'Cruises'));
        dialog.appendChild(close);
        dialog.appendChild(head);
        const body = document.createElement('div');
        body.className = 'gobo-bookings-body';
        dialog.appendChild(body);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);
        let payload = null;
        try {
            const raw = readRaw(storageKey);
            payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (e) {}
        if (payload && payload.email) head.appendChild(el('div', 'gobo-bookings-account', payload.email));
        this.renderPanel(body, payload);
        attachHeroes(storageKey, payload);
    },

    renderPanel(panel, payload) {
        panel.textContent = '';
        const bookings = payload && payload.bookings;
        if (!bookings) {
            panel.appendChild(el('p', 'gobo-booking-empty', 'Refresh this account to load cruises.'));
            return;
        }
        if (bookings.error) panel.appendChild(el('p', 'gobo-booking-error', String(bookings.error)));
        const sailings = Array.isArray(bookings.sailings) ? bookings.sailings : [];
        if (!sailings.length && !bookings.error) {
            panel.appendChild(el('p', 'gobo-booking-empty', 'No bookings on this account.'));
            return;
        }
        const brand = (payload && payload.brand) || 'R';
        sailings.forEach(s => panel.appendChild(renderSailing(s, brand)));
        const rooms = panel.querySelectorAll('.gobo-booking-room');
        if (rooms.length === 1) {
            rooms[0].classList.add('is-open');
            const only = rooms[0].querySelector('.gobo-booking-room-toggle');
            if (only) only.setAttribute('aria-expanded', 'true');
        }
        panel.querySelectorAll('.gobo-booking-room-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const room = btn.parentNode;
                const willOpen = !room.classList.contains('is-open');
                panel.querySelectorAll('.gobo-booking-room.is-open').forEach(open => {
                    open.classList.remove('is-open');
                    const toggle = open.querySelector('.gobo-booking-room-toggle');
                    if (toggle) toggle.setAttribute('aria-expanded', 'false');
                });
                if (willOpen) {
                    room.classList.add('is-open');
                    btn.setAttribute('aria-expanded', 'true');
                }
            });
        });
    }
};

try { if (typeof window !== 'undefined') window.Bookings = Bookings; } catch (e) {}
try { if (typeof globalThis !== 'undefined') globalThis.Bookings = Bookings; } catch (e) {}
