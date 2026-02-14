const PortsTravelTimes = require('../features/portsTravelTimes');

describe('PortsTravelTimes', () => {
  test('normalizePort handles aliases', () => {
    expect(PortsTravelTimes.normalizePort('Orlando')).toBe('port canaveral');
    expect(PortsTravelTimes.normalizePort('Port Everglades')).toBe('fort lauderdale');
    expect(PortsTravelTimes.normalizePort('Cape Liberty (New York)')).toBe('cape liberty');
    expect(PortsTravelTimes.normalizePort('Barcelona (Tarragona)')).toBe('tarragona');
    expect(PortsTravelTimes.normalizePort('Baoshan')).toBe('shanghai');
    expect(PortsTravelTimes.normalizePort('Miami')).toBe('miami');
  });

  test('normalizePort removes parentheticals', () => {
    expect(PortsTravelTimes.normalizePort('Fort Lauderdale (Port Everglades) Extra')).toBe('fort lauderdale');
    expect(PortsTravelTimes.normalizePort('Shanghai (Baoshan)')).toBe('shanghai');
  });

  test('getTravelTime symmetric lookup', () => {
    expect(PortsTravelTimes.getTravelTime('fort lauderdale', 'miami')).toBe(39);
    expect(PortsTravelTimes.getTravelTime('miami', 'fort lauderdale')).toBe(39);
    expect(PortsTravelTimes.getTravelTime('Miami', 'Port Canaveral')).toBe(227);
    expect(PortsTravelTimes.getTravelTime('port canaveral', 'tampa')).toBe(116);
    expect(PortsTravelTimes.getTravelTime('los angeles', 'san diego')).toBe(128);
    expect(PortsTravelTimes.getTravelTime('unknown', 'port canaveral')).toBe(null);
  });

  test('getNearbyPorts within limit', () => {
    expect(PortsTravelTimes.getNearbyPorts('fort lauderdale', 50)).toEqual(expect.arrayContaining(['miami']));
    expect(PortsTravelTimes.getNearbyPorts('miami', 300)).toEqual(expect.arrayContaining(['port canaveral', 'tampa']));
    expect(PortsTravelTimes.getNearbyPorts('port canaveral', 120)).toEqual(expect.arrayContaining(['tampa']));
    expect(PortsTravelTimes.getNearbyPorts('fort lauderdale', 0)).toEqual(['fort lauderdale']);
    expect(PortsTravelTimes.getNearbyPorts('unknown', 60)).toEqual(['unknown']);
  });

  test('getNearbyPorts excludes over limit', () => {
    expect(PortsTravelTimes.getNearbyPorts('fort lauderdale', 30)).toEqual(['fort lauderdale']); // 39 > 30
    expect(PortsTravelTimes.getNearbyPorts('miami', 200)).toEqual(expect.not.arrayContaining(['tampa'])); // 268 > 200
  });

  test('getNearbyPorts unique and includes self', () => {
    const nearby = PortsTravelTimes.getNearbyPorts('miami', 300);
    expect(nearby.includes('miami')).toBe(true);
    expect(new Set(nearby).size).toBe(nearby.length); // no dups
  });
});