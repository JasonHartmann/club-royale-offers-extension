(function initB2BTestSuite(factory) {
    let PortsTravelTimes = null;
    if (typeof module !== 'undefined' && module.exports) {
        PortsTravelTimes = require('../features/portsTravelTimes');
        if (typeof globalThis !== 'undefined') {
            globalThis.PortsTravelTimes = PortsTravelTimes;
        }
        if (typeof window === 'undefined') {
            global.PortsTravelTimes = PortsTravelTimes;
        }
        factory(require('../utils/b2bUtils'), { env: 'node', PortsTravelTimes });
    } else if (typeof window !== 'undefined') {
        factory(window.B2BUtils, { env: 'browser', window, PortsTravelTimes: window.PortsTravelTimes });
    }
})(function runSuite(B2BUtils, context) {
    if (!B2BUtils || typeof B2BUtils.computeB2BDepth !== 'function') {
        if (context && context.env === 'node') {
            throw new Error('B2BUtils.computeB2BDepth is not available for tests');
        }
        if (context && context.window) {
            context.window.console.error('[B2B TEST] B2BUtils.computeB2BDepth not available');
        }
        return;
    }

    function row(code, ship, departPort, departDate, nights, options = {}) {
        const departRegion = options.departRegion || '';
        const arrivalPort = options.arrivalPort || departPort;
        const arrivalRegion = options.arrivalRegion || departRegion;
        return {
            offer: { campaignOffer: { offerCode: code } },
            sailing: {
                shipName: ship,
                shipCode: ship,
                departurePort: { name: departPort, region: departRegion },
                arrivalPort: { name: arrivalPort, region: arrivalRegion },
                sailDate: departDate,
                itineraryDescription: nights + ' Nights ' + departPort
            }
        };
    }

    function chainRows() {
        return [
            row('A', 'SHIP1', 'Miami', '2025-01-01', 3),
            row('B', 'SHIP1', 'Miami', '2025-01-04', 3),
            row('C', 'SHIP1', 'Miami', '2025-01-07', 3)
        ];
    }

    function sideBySideRows() {
        return [
            row('A', 'SHIP1', 'Miami', '2025-01-01', 3),
            row('B', 'SHIP2', 'Miami', '2025-01-04', 3),
            row('C', 'SHIP1', 'Miami', '2025-01-04', 3)
        ];
    }

    const scenarios = [
        {
            label: 'Simple chain without side-by-side',
            rows: chainRows,
            options: { allowSideBySide: false },
            expectations: { 0: 3, 1: 2, 2: 1 }
        },
        {
            label: 'Side-by-side disabled prefers same ship',
            rows: sideBySideRows,
            options: { allowSideBySide: false },
            expectations: { 0: 2 }
        },
        {
            label: 'Side-by-side enabled allows alternate ships',
            rows: sideBySideRows,
            options: { allowSideBySide: true },
            expectations: { 0: 2 }
        },
        {
            label: 'Filter predicate removes middle offer',
            rows: chainRows,
            options: {
                allowSideBySide: false,
                filterPredicate: (row) => row.offer.campaignOffer.offerCode !== 'B'
            },
            expectations: { 0: 1, 2: 1 }
        },
        {
            label: 'Exact port matching (driving range = 0)',
            rows: () => [
                row('A', 'SHIP1', 'Fort Lauderdale', '2025-01-01', 3, { departRegion: '', arrivalPort: 'Fort Lauderdale', arrivalRegion: '' }),
                row('B', 'SHIP1', 'Fort Lauderdale', '2025-01-04', 3, { departRegion: '', arrivalPort: 'Fort Lauderdale', arrivalRegion: '' })
            ],
            options: { allowSideBySide: false, drivingRangeHours: 0 },
            expectations: { 0: 2, 1: 1 }
        },
        {
            label: 'Nearby ports within 1-hour driving range',
            rows: () => [
                row('A', 'SHIP1', 'Fort Lauderdale', '2025-01-01', 3, { departRegion: '', arrivalPort: 'Fort Lauderdale', arrivalRegion: '' }),
                row('B', 'SHIP1', 'Miami', '2025-01-04', 3, { departRegion: '', arrivalPort: 'Miami', arrivalRegion: '' })
            ],
            options: { allowSideBySide: false, drivingRangeHours: 1 },
            expectations: { 0: 2, 1: 1 }
        },
        {
            label: 'Port outside driving range blocks match',
            rows: () => [
                row('A', 'SHIP1', 'Fort Lauderdale', '2025-01-01', 3, { departRegion: '', arrivalPort: 'Fort Lauderdale', arrivalRegion: '' }),
                row('B', 'SHIP1', 'Port Canaveral', '2025-01-04', 3, { departRegion: '', arrivalPort: 'Port Canaveral', arrivalRegion: '' })
            ],
            options: { allowSideBySide: false, drivingRangeHours: 1 },
            expectations: { 0: 1, 1: 1 }
        },
        {
            label: 'Port within 3-hour range matches',
            rows: () => [
                row('A', 'SHIP1', 'Fort Lauderdale', '2025-01-01', 3, { departRegion: '', arrivalPort: 'Fort Lauderdale', arrivalRegion: '' }),
                row('B', 'SHIP1', 'Port Canaveral', '2025-01-04', 3, { departRegion: '', arrivalPort: 'Port Canaveral', arrivalRegion: '' })
            ],
            options: { allowSideBySide: false, drivingRangeHours: 4 },
            expectations: { 0: 2, 1: 1 }
        },
        {
            label: 'Driving range respects side-by-side setting',
            rows: () => [
                row('A', 'SHIP1', 'Fort Lauderdale', '2025-01-01', 3, { departRegion: '', arrivalPort: 'Fort Lauderdale', arrivalRegion: '' }),
                row('B', 'SHIP2', 'Miami', '2025-01-04', 3, { departRegion: '', arrivalPort: 'Miami', arrivalRegion: '' })
            ],
            options: { allowSideBySide: false, drivingRangeHours: 1 },
            expectations: { 0: 1, 1: 1 }
        },
        {
            label: 'Driving range with side-by-side enabled',
            rows: () => [
                row('A', 'SHIP1', 'Fort Lauderdale', '2025-01-01', 3, { departRegion: '', arrivalPort: 'Fort Lauderdale', arrivalRegion: '' }),
                row('B', 'SHIP2', 'Miami', '2025-01-04', 3, { departRegion: '', arrivalPort: 'Miami', arrivalRegion: '' })
            ],
            options: { allowSideBySide: true, drivingRangeHours: 1 },
            expectations: { 0: 2, 1: 1 }
        },
        {
            label: 'Port normalization works with driving range',
            rows: () => [
                row('A', 'SHIP1', 'Orlando (Port Canaveral)', '2025-01-01', 3, { departRegion: '', arrivalPort: 'Orlando (Port Canaveral)', arrivalRegion: '' }),
                row('B', 'SHIP1', 'Port Canaveral', '2025-01-04', 3, { departRegion: '', arrivalPort: 'Port Canaveral', arrivalRegion: '' })
            ],
            options: { allowSideBySide: false, drivingRangeHours: 0 },
            expectations: { 0: 2, 1: 1 }
        },
        {
            label: 'Regional test for backward compatibility (region matching removed, exact port fallback)',
            rows: () => [
                row('A', 'SHIP1', 'Miami', '2025-01-01', 3, { departRegion: 'Caribbean', arrivalPort: 'Miami', arrivalRegion: 'Caribbean' }),
                row('B', 'SHIP1', 'Key West', '2025-01-04', 3, { departRegion: 'Caribbean', arrivalPort: 'Key West', arrivalRegion: 'Caribbean' })
            ],
            options: { allowSideBySide: false, drivingRangeHours: 0 },
            expectations: { 0: 1, 1: 1 }
        }
    ];

    function materializeRows(rowsConfig) {
        return typeof rowsConfig === 'function' ? rowsConfig() : rowsConfig;
    }

    function evaluateScenario(scenario) {
        const rows = materializeRows(scenario.rows);
        const depths = B2BUtils.computeB2BDepth(rows, scenario.options || {});
        return Object.entries(scenario.expectations).map(([idx, expected]) => ({
            label: `${scenario.label} (row ${idx})`,
            expected,
            actual: depths.get(Number(idx))
        }));
    }

    if (context && context.env === 'node') {
        describe('B2BUtils.computeB2BDepth', () => {
            scenarios.forEach((scenario) => {
                test(scenario.label, () => {
                    const results = evaluateScenario(scenario);
                    results.forEach(({ expected, actual, label }) => {
                        expect(actual).toBe(expected);
                    });
                });
            });
        });
    }

    if (context && context.env === 'browser' && context.window) {
        context.window.runB2BTests = function runB2BTests() {
            scenarios.forEach((scenario) => {
                const results = evaluateScenario(scenario);
                results.forEach(({ expected, actual, label }) => {
                    const ok = actual === expected;
                    context.window.console[ok ? 'log' : 'error'](
                        `[B2B TEST] ${label}: ${ok ? 'PASS' : 'FAIL'} (expected=${expected}, actual=${actual})`
                    );
                });
            });
            context.window.console.log('[B2B TEST] Tests complete');
        };
    }

});
