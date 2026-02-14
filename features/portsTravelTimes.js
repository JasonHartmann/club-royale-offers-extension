const PORT_ALIAS_MAP = {
  orlando: 'port canaveral',
  'orlando (port canaveral)': 'port canaveral',
  'port everglades': 'fort lauderdale',
  'fort lauderdale (port everglades)': 'fort lauderdale',
  'cape liberty (new york)': 'cape liberty',
  bayonne: 'cape liberty',
  'shanghai (baoshan)': 'shanghai',
  baoshan: 'shanghai',
  'barcelona (tarragona)': 'tarragona',
  tarragona: 'tarragona',
  colon: 'colon',
  cartagena: 'cartagena'
};

const PORT_TRAVEL_TIMES = {
  'fort lauderdale-miami': 39,
  'miami-port canaveral': 227,
  'miami-tampa': 268,
  'fort lauderdale-port canaveral': 219,
  'fort lauderdale-tampa': 224,
  'port canaveral-tampa': 116,
  'baltimore-cape liberty': 198,
  'boston-cape liberty': 265,
  'los angeles-san diego': 128,
  'seattle-vancouver': 176,
  'anchorage-seward': 141,
  'montreal-quebec city': 179,
  'amsterdam-rotterdam': 67,
  'ravenna-trieste': 216,
  'ravenna-venice': 139,
  'trieste-venice': 102,
  'hong kong-shenzhen': 48,
  'barcelona-tarragona': 72
};

const KNOWN_PORTS = new Set(Object.keys(PORT_TRAVEL_TIMES).flatMap(pair => pair.split('-')));

const PortsTravelTimes = {
  normalizePort(port) {
    if (!port) return '';
    const normalizeKey = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const normalizedInput = normalizeKey(port);
    if (PORT_ALIAS_MAP[normalizedInput]) return PORT_ALIAS_MAP[normalizedInput];
    let stripped = normalizedInput.replace(/\s*\([^)]*\)/g, '').trim();
    if (!stripped) return normalizedInput;
    if (PORT_ALIAS_MAP[stripped]) return PORT_ALIAS_MAP[stripped];
    if (KNOWN_PORTS.has(stripped)) return stripped;
    let candidate = stripped;
    while (!KNOWN_PORTS.has(candidate) && candidate.includes(' ')) {
      candidate = candidate.replace(/\s+\S+$/, '');
    }
    return PORT_ALIAS_MAP[candidate] || candidate;
  },

  getTravelTime(port1, port2) {
    const normalizedPorts = [this.normalizePort(port1), this.normalizePort(port2)].sort();
    const key = normalizedPorts.join('-');
    return PORT_TRAVEL_TIMES[key] || null;
  },

  getNearbyPorts(port, limitMinutes) {
    const normPort = this.normalizePort(port);
    const nearby = new Set();
    for (const [pairKey, mins] of Object.entries(PORT_TRAVEL_TIMES)) {
      if (Number(mins) > limitMinutes) continue;
      const [p1, p2] = pairKey.split('-');
      if (p1 === normPort) {
        nearby.add(p2);
      } else if (p2 === normPort) {
        nearby.add(p1);
      }
    }
    nearby.add(normPort);
    return Array.from(nearby);
  }
};

if (typeof window !== 'undefined') window.PortsTravelTimes = PortsTravelTimes;
if (typeof globalThis !== 'undefined') globalThis.PortsTravelTimes = PortsTravelTimes;
if (typeof module !== 'undefined' && module.exports) module.exports = PortsTravelTimes;
