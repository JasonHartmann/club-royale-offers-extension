/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

function load() {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'features', 'bookings.js'), 'utf8');
    new Function(src)();
    return window.Bookings;
}

describe('Bookings helpers', () => {
    let Bookings;

    beforeEach(() => {
        localStorage.clear();
        Bookings = load();
        Bookings._keys = null;
    });

    afterEach(() => {
        delete window.Bookings;
        delete global.Bookings;
    });

    test('brandConfig builds Celebrity and Royal call shapes', () => {
        const c = Bookings.brandConfig('C');
        expect(c.bookingsUrl('acct-1')).toContain('brand=C');
        expect(c.bookingsUrl('acct-1')).toContain('/v1/profileBookings/enriched/acct-1');
        expect(c.catalogUrl).toBe('https://aws-prd.api.rccl.com/en/celebrity/web/graphql');
        expect(c.appkey).toBe('qpRMO6lj4smwkT1sWlSdIj7b8QF5rG8Q');
        const bookingsHeaders = c.headers('Bearer tok', 'acct-1', 'bookings');
        expect(bookingsHeaders['req-app-id']).toBe('Celebrity.Web.CustomerJourney');
        expect(bookingsHeaders.channel).toBeUndefined();
        expect(bookingsHeaders['access-token']).toBe('tok');

        const r = Bookings.brandConfig('R');
        expect(r.bookingsUrl('acct-1')).toContain('brand=R');
        expect(r.catalogUrl).toBe('https://aws-prd.api.rccl.com/en/royal/web/graphql');
        expect(r.appkey).toBe('hyNNqIPHHzaLzVpcICPdAdbFV8yvTsAm');
        expect(Bookings.brandConfig('nope').code).toBe('R');
    });

    test('dates normalize to the same sailing key and absent OBC is dropped', () => {
        expect(Bookings.sailingKey('AL', '20270221')).toBe('AL|2027-02-21');
        expect(Bookings.sailingKey('AL', '2027-02-21')).toBe('AL|2027-02-21');
        expect(Bookings.keepObc(-999.99)).toBeUndefined();
        expect(Bookings.keepObc(40)).toBe(40);
    });

    test('order 204178895 flattens to two addon lines', () => {
        const addons = Bookings.flattenOrder({
            orderCode: '204178895',
            status: 'BOOKED',
            orderDate: '2026-01-15',
            orderHistoryDetailItems: [
                {
                    status: 'BOOKED',
                    productSummary: { id: 'ex-a', title: 'Snorkel' },
                    productTypeCategory: { id: 'pt_shoreX' },
                    guests: [{ firstName: 'Ada', orderStatus: 'BOOKED', priceDetails: { basePrice: 300, total: 241.98, refund: 0 } }]
                },
                {
                    status: 'BOOKED',
                    productSummary: { id: 'ex-b', title: 'Kayak' },
                    productTypeCategory: { id: 'pt_shoreX' },
                    guests: [{ firstName: 'Ada', orderStatus: 'BOOKED', priceDetails: { basePrice: 280, total: 221.98, refund: 0 } }]
                }
            ]
        });
        expect(addons[0].category).toBe('shorex');
        const nested = Bookings.flattenOrder({
            orderCode: 'n1',
            status: 'BOOKED',
            orderHistoryDetailItems: [{
                status: 'BOOKED',
                productSummary: { id: 'Y6Y2', title: 'Day Pass', productTypeCategory: { id: 'pt_shoreX' } },
                guests: [{ firstName: 'Ada', orderStatus: 'BOOKED', priceDetails: { total: 56.99 } }]
            }]
        });
        expect(nested[0].category).toBe('shorex');
        expect(addons).toHaveLength(2);
        expect(Bookings.linePaid(addons[0])).toBe(241.98);
        expect(Bookings.linePaid(addons[1])).toBe(221.98);
    });

    test('order 204182224 keeps booked and cancelled Casita lines', () => {
        const addons = Bookings.flattenOrder({
            orderCode: '204182224',
            status: 'AMENDED',
            orderDate: '2026-03-01',
            orderHistoryDetailItems: [
                {
                    status: 'BOOKED',
                    productSummary: { id: 'casita', title: 'Casita' },
                    guests: [{ firstName: 'Bea', orderStatus: 'BOOKED', priceDetails: { total: 74.99, refund: 0 } }]
                },
                {
                    status: 'CANCELLED',
                    productSummary: { id: 'casita', title: 'Casita' },
                    guests: [{ firstName: 'Bea', orderStatus: 'CANCELLED', priceDetails: { total: 0, refund: 74.99 } }]
                }
            ]
        });
        expect(addons).toHaveLength(2);
        expect(addons.map(a => a.title)).toEqual(['Casita', 'Casita']);
        expect(addons.map(a => a.itemStatus)).toEqual(['BOOKED', 'CANCELLED']);
        const cancelled = addons[1];
        expect(cancelled.guests[0].paid).toBe(0);
        expect(cancelled.guests[0].refund).toBe(74.99);
        expect(Bookings.guestLines(cancelled)[0]).toContain('74.99');
        expect(Bookings.guestLines(cancelled)[0]).not.toContain('0.00');
    });

    test('repurchase matches product id only', () => {
        const same = Bookings.flattenOrder({
            orderCode: 'c1',
            status: 'CANCELLED',
            orderDate: '2026-01-01',
            orderHistoryDetailItems: [{
                status: 'CANCELLED',
                productSummary: { id: 'p1', title: 'Spa' },
                guests: [{ firstName: 'Cy', orderStatus: 'CANCELLED', priceDetails: { total: 0, refund: 120 } }]
            }]
        }).concat(Bookings.flattenOrder({
            orderCode: 'b1',
            status: 'BOOKED',
            orderDate: '2026-02-01',
            orderHistoryDetailItems: [{
                status: 'BOOKED',
                productSummary: { id: 'p1', title: 'Spa' },
                guests: [{ firstName: 'Cy', orderStatus: 'BOOKED', priceDetails: { total: 90, refund: 0 } }]
            }]
        }));
        Bookings.markRepurchases(same);
        expect(same[1].repurchasedCheaper).toEqual({ was: 120, now: 90 });

        const different = Bookings.flattenOrder({
            orderCode: 'c2',
            status: 'CANCELLED',
            orderDate: '2026-01-01',
            orderHistoryDetailItems: [{
                status: 'CANCELLED',
                productSummary: { id: 'p1', title: 'Spa' },
                guests: [{ firstName: 'Cy', orderStatus: 'CANCELLED', priceDetails: { total: 0, refund: 120 } }]
            }]
        }).concat(Bookings.flattenOrder({
            orderCode: 'b2',
            status: 'BOOKED',
            orderDate: '2026-02-01',
            orderHistoryDetailItems: [{
                status: 'BOOKED',
                productSummary: { id: 'p2', title: 'Spa later' },
                guests: [{ firstName: 'Cy', orderStatus: 'BOOKED', priceDetails: { total: 90, refund: 0 } }]
            }]
        }));
        Bookings.markRepurchases(different);
        expect(different[1].repurchasedCheaper).toBeFalsy();
    });

    test('cheaperNow only for a comparable per-seat price', () => {
        function booked(paid) {
            return Bookings.flattenOrder({
                orderCode: 'o',
                status: 'BOOKED',
                orderHistoryDetailItems: [{
                    status: 'BOOKED',
                    productSummary: { id: 'x', title: 'Excursion' },
                    productTypeCategory: { id: 'pt_shoreX' },
                    guests: [{ firstName: 'Di', orderStatus: 'BOOKED', priceDetails: { total: paid } }]
                }]
            })[0];
        }
        const seat = booked(56.99);
        Bookings.applyCatalogPrice(seat, {
            price: [{ currency: 'USD', promotionalPrice: 50, formattedPromotionalPrice: '$50.00', salesUnit: { code: 'perSeat' } }]
        });
        expect(seat.cheaperNow).toBe(true);

        const daily = booked(56.99);
        Bookings.applyCatalogPrice(daily, {
            price: [{ currency: 'USD', promotionalPrice: null, formattedBasePrice: '$40.00', formattedDailyPrice: '$40.00', salesUnit: { code: 'perDay' } }]
        });
        expect(daily.cheaperNow).toBe(false);
        expect(daily.current.daily).toBe(true);
        expect(daily.current.label).toContain('/day');

        const soda = booked(76.93);
        Bookings.applyCatalogPrice(soda, {
            price: [{ currency: 'USD', promotionalPrice: '10.99', formattedPromotionalPrice: '$10.99', formattedBasePrice: '$18.00', formattedDailyPrice: '$18.00', formattedPromoDailyPrice: '$10.99', salesUnit: { code: 'perNight' } }],
            media: [
                { source: { path: '/vod/soda/main.m3u8' } },
                { source: { path: '/content/dam/commerce/products/royal/beverage-packages/soda.jpg' } }
            ]
        }, 7);
        expect(soda.cheaperNow).toBe(false);
        expect(soda.current.label).toBe('$10.99/night');
        expect(soda.image).toBe('https://www.royalcaribbean.com/media-assets/pmc/content/dam/commerce/products/royal/beverage-packages/soda.jpg?w=240');

        const dropped = booked(76.93);
        Bookings.applyCatalogPrice(dropped, {
            price: [{ currency: 'USD', promotionalPrice: '8.99', formattedPromotionalPrice: '$8.99', salesUnit: { code: 'perNight' } }]
        }, 7);
        expect(dropped.cheaperNow).toBe(true);
        expect(Bookings.guestRateLabel(76.93, 7, 'night')).toBe('($10.99/night)');
        expect(Bookings.guestRateLabel(76.93, 7, '')).toBe('');
        expect(Bookings.orderHistoryUrl('R', { bookingId: '690455' }, { shipCode: 'AL', sailDate: '2027-02-21' }))
            .toBe('https://www.royalcaribbean.com/account/cruise-planner/order-history?bookingId=690455&sailDate=20270221&shipCode=AL');

        const missing = booked(56.99);
        expect(missing.cheaperNow).toBe(false);
        expect(missing.current).toBeNull();
    });

    test('isBooked matches the stored brand only', () => {
        localStorage.setItem('gobo-R-ada', JSON.stringify({
            brand: 'R',
            bookings: { sailings: [{ key: 'AL|2027-02-21' }] }
        }));
        Bookings._keys = null;
        Bookings.index();
        expect(Bookings.isBooked('AL', '20270221', 'R')).toBe(true);
        expect(Bookings.isBooked('AL', '20270221', 'C')).toBe(false);
    });

    test('order-history 401 maps to an empty room and does not throw', () => {
        expect(() => Bookings.mapOrderHistory(401, '{')).not.toThrow();
        expect(Bookings.mapOrderHistory(401, '{')).toEqual({ detailError: true, addons: [] });
    });

    test('hero uses a docked port, not the shared dashboard photo', () => {
        const hero = Bookings.heroFromVoyage({
            voyageImage: { web: [{ fileReference: '/content/dam/dashboard/MIA-web.jpg' }] },
            itinerary: { portInfo: [
                { portType: 'EMBARK', portName: 'Miami', portImageURL: '/content/dam/miami.jpg' },
                { portType: 'DOCKED', portName: 'Willemstad', portImageURL: '/content/dam/willemstad.jpg' }
            ] }
        });
        expect(hero.url).toBe('https://www.royalcaribbean.com/media-assets/pmc/content/dam/willemstad.jpg?w=1024');
        expect(hero.caption).toBe('Willemstad');
    });

    test('planner link is per reservation on the brand host', () => {
        expect(Bookings.plannerUrl('R', { bookingId: '20419888' }, { shipCode: 'AL', sailDate: '2027-02-21' }))
            .toBe('https://www.royalcaribbean.com/account/cruise-planner?bookingId=20419888&sailDate=20270221&shipCode=AL');
        expect(Bookings.plannerUrl('C', { bookingId: '1' }, { shipCode: 'SL', sailDate: '2026-01-01' }))
            .toContain('https://www.celebritycruises.com/account/cruise-planner?');
    });
});
