import { parseImportDate } from './review-import-date.rules.js';

const MINSK = 'Europe/Minsk';
const BERLIN = 'Europe/Berlin';
const now = new Date('2026-11-11T09:00:00Z');

const at = (value: Parameters<typeof parseImportDate>[0], zone = MINSK) =>
  parseImportDate(value, zone, now)?.at.toISOString();

describe('parseImportDate', () => {
  // Server zone differs from UTC and from every location zone used below.
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('reads text dates as wall-clock time of the location', () => {
    expect(at('05.03.2025 14:30')).toBe('2025-03-05T11:30:00.000Z');
    expect(at('5.3.2025 14:30:15')).toBe('2025-03-05T11:30:15.000Z');
    expect(at('2025-03-05 14:30')).toBe('2025-03-05T11:30:00.000Z');
    expect(at('2025-03-05T14:30:15.250')).toBe('2025-03-05T11:30:15.000Z');
  });

  it('places a date without time at noon of the location', () => {
    expect(at('05.03.2025')).toBe('2025-03-05T09:00:00.000Z');
    expect(at('2025-03-05')).toBe('2025-03-05T09:00:00.000Z');
  });

  it('reads Excel date cells with UTC getters, ignoring the server zone', () => {
    expect(at(new Date(Date.UTC(2025, 2, 5, 14, 30)))).toBe(
      '2025-03-05T11:30:00.000Z',
    );
    expect(at(new Date(Date.UTC(2025, 2, 5)))).toBe('2025-03-05T09:00:00.000Z');
  });

  it('follows daylight saving time of the location', () => {
    expect(at('15.01.2025 10:00', BERLIN)).toBe('2025-01-15T09:00:00.000Z');
    expect(at('15.07.2025 10:00', BERLIN)).toBe('2025-07-15T08:00:00.000Z');
    // 02:30 does not exist on the spring-forward night: shifted by the gap.
    expect(at('30.03.2025 02:30', BERLIN)).toBe('2025-03-30T01:30:00.000Z');
  });

  it('keeps an explicit offset as is', () => {
    expect(at('2025-03-05T14:30:00Z')).toBe('2025-03-05T14:30:00.000Z');
    expect(at('2025-03-05T14:30+05:00')).toBe('2025-03-05T09:30:00.000Z');
  });

  it('builds the same key for the same day written differently', () => {
    const key = (value: string) => parseImportDate(value, MINSK, now)?.key;
    expect(key('05.03.2025')).toBe('2025-03-05T12:00:00');
    expect(key('2025-03-05')).toBe(key('05.03.2025'));
    expect(key('05.03.2025 14:30')).toBe(key('2025-03-05T14:30:00'));
  });

  it.each([
    ['31.02.2025'],
    ['2025-13-01'],
    ['05.03.2025 25:00'],
    ['05.03.2025 14:60'],
    ['31.12.1999 23:59'],
    ['12.11.2026'],
    ['2026-11-11T12:01:00Z'],
    ['март 2025'],
    ['03/05/2025'],
    [''],
    [45000],
    [null],
    [true],
  ])('rejects %j', (value) => {
    expect(parseImportDate(value, MINSK, now)).toBeNull();
  });

  it('accepts the first moment of 2000 and the current moment', () => {
    // Minsk was UTC+2 in winter 2000: the historical offset applies.
    expect(at('01.01.2000 00:00')).toBe('1999-12-31T22:00:00.000Z');
    expect(at('2026-11-11T09:00:00Z')).toBe(now.toISOString());
  });
});
