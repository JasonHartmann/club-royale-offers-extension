// Utility to compute simplified route labels used by BackToBackTool
function computeSimplifiedRoute(meta) {
    try {
        const timeline = Array.isArray(meta && meta.timeline) ? meta.timeline : [];
        const stops = timeline.map(item => {
            const lbl = item && item.label ? String(item.label) : '';
            const parts = lbl.split(',');
            const portName = (parts[0] || '').trim();
            const region = (parts[1] || '').trim();
            return { portName: portName || '', region: region || '' };
        }).filter(s => {
            if (!s) return false;
            // omit generic cruising/sea-day entries
            const p = (s.portName || '').toLowerCase();
            const r = (s.region || '').toLowerCase();
            if (p === 'cruising' || r === 'cruising') return false;
            return Boolean(s.portName || s.region);
        });

        const origin = (stops[0] && stops[0].portName) || meta && meta.embarkPort || 'Embark TBA';
        const dest = (stops[stops.length - 1] && stops[stops.length - 1].portName) || meta && meta.disembarkPort || 'Return TBA';

                    const midParts = [];
                    if (stops.length > 1) {
                        // start with null so the origin-region doesn't suppress the first region
                        let lastRegion = null;
            for (let i = 1; i < stops.length - 1; i++) {
                const stop = stops[i];
                const prev = stops[i - 1] || {};
                const base = stop.region || stop.portName || '';
                const baseLower = String(base).toLowerCase();
                if (stop.portName && prev.portName && stop.portName === prev.portName) {
                    midParts.push((base) + ' (Overnight)');
                    lastRegion = baseLower;
                } else {
                    if (base && baseLower === lastRegion) {
                        continue;
                    }
                    midParts.push(base);
                    if (base) lastRegion = baseLower;
                }
            }
        }

        if (midParts.length) {
            return `${origin} → ${midParts.join(' → ')} → ${dest}`;
        }

        if (stops.length === 2) {
            const maybeRegion = stops[1] && stops[1].region ? stops[1].region : null;
            const originRegion = (stops[0] && stops[0].region) ? stops[0].region : '';
            if (maybeRegion && maybeRegion.toLowerCase() !== originRegion.toLowerCase()) {
                return `${origin} → ${maybeRegion} → ${dest}`;
            }
        }

        return `${origin} → ${dest}`;
    } catch (e) {
        return (meta && typeof meta.embarkPort === 'string' && typeof meta.disembarkPort === 'string') ? `${meta.embarkPort} → ${meta.disembarkPort}` : 'Route TBA';
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { computeSimplifiedRoute };
if (typeof window !== 'undefined') window.B2BRoute = { computeSimplifiedRoute };
