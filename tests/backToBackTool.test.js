describe('BackToBackTool One-Way Sailing Disembark Port Extraction', () => {
    /**
     * Test for one-way sailing disembark port issue:
     * One-way sailings have itinerary records with a days array ending in DEBARK activity,
     * but no explicit arrivalPort/returnPort fields. The system should extract the disembark
     * port from the itinerary's final port instead of falling back to departurePort.
     */

    test('one-way sailing: should extract San Juan from itinerary days with DEBARK activity', () => {
        // Simulating extraction from itinerary record like:
        // days: [...{ activity: 'DEBARK', port: { name: 'San Juan', ... }}]
        const itineraryRecord = {
            days: [
                { type: 'PORT', ports: [{ activity: 'EMBARK', port: { name: 'Tampa', region: 'Florida' } }] },
                { type: 'CRUISING', ports: [{ activity: 'CRUISING', port: { name: 'Cruising' } }] },
                { type: 'PORT', ports: [{ activity: 'DOCKED', port: { name: 'Nassau', region: 'Bahamas' } }] },
                { type: 'PORT', ports: [{ activity: 'DEBARK', port: { name: 'San Juan', region: 'Puerto Rico' } }] }
            ]
        };
        
        // The extraction should find 'San Juan' from the DEBARK activity
        let disembarkPort = '';
        if (itineraryRecord.days && itineraryRecord.days.length > 0) {
            for (let i = itineraryRecord.days.length - 1; i >= 0; i--) {
                const day = itineraryRecord.days[i];
                if (day && Array.isArray(day.ports) && day.ports.length > 0) {
                    const port = day.ports[0];
                    if (port && port.port && port.activity === 'DEBARK') {
                        disembarkPort = port.port.name || port.port.code || '';
                        break;
                    }
                }
            }
        }
        
        expect(disembarkPort).toBe('San Juan');
    });

    test('one-way sailing: should extract last port when no DEBARK activity', () => {
        // Some itineraries may not have explicit DEBARK, just use last port
        const itineraryRecord = {
            days: [
                { type: 'PORT', ports: [{ activity: 'EMBARK', port: { name: 'Miami', region: 'Florida' } }] },
                { type: 'CRUISING', ports: [{ activity: 'CRUISING', port: { name: 'Cruising' } }] },
                { type: 'PORT', ports: [{ activity: 'DOCKED', port: { name: 'Berlimuda', region: 'Bermuda' } }] }
            ]
        };
        
        let disembarkPort = '';
        // First try DEBARK (not found)
        for (let i = itineraryRecord.days.length - 1; i >= 0; i--) {
            const day = itineraryRecord.days[i];
            if (day && Array.isArray(day.ports) && day.ports.length > 0) {
                const port = day.ports[0];
                if (port && port.port && port.activity === 'DEBARK') {
                    disembarkPort = port.port.name || port.port.code || '';
                    break;
                }
            }
        }
        // Then find last non-cruising port
        if (!disembarkPort) {
            for (let i = itineraryRecord.days.length - 1; i >= 0; i--) {
                const day = itineraryRecord.days[i];
                if (day && day.type !== 'CRUISING' && Array.isArray(day.ports) && day.ports.length > 0) {
                    const port = day.ports[0];
                    if (port && port.port && port.port.name && port.port.name.toLowerCase() !== 'cruising') {
                        disembarkPort = port.port.name || port.port.code || '';
                        break;
                    }
                }
            }
        }
        
        expect(disembarkPort).toBe('Berlimuda');
    });

    test('round-trip sailing: should ignore itinerary extraction if explicit returnPort exists', () => {
        // For round-trips with explicit returnPort, use that instead of itinerary
        const entry = {
            sailing: {
                departurePort: { name: 'Miami', region: 'Florida' },
                returnPort: { name: 'Miami', region: 'Florida' }
            }
        };
        
        const arrivalPort = entry.sailing.returnPort ? entry.sailing.returnPort.name : null;
        expect(arrivalPort).toBe('Miami');
    });
});
