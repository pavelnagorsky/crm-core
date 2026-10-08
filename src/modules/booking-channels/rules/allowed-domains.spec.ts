import {
  isDomainAllowed,
  normalizeAllowedDomain,
  normalizeAllowedDomains,
} from './allowed-domains.js';

describe('allowed domains', () => {
  it('strips protocol, path, port and a leading www', () => {
    expect(normalizeAllowedDomain('https://www.Example.com:443/book')).toBe(
      'example.com',
    );
    expect(normalizeAllowedDomain('WWW.Example.com')).toBe('example.com');
    expect(normalizeAllowedDomain('shop.example.com')).toBe('shop.example.com');
    expect(normalizeAllowedDomain('localhost')).toBe('localhost');
  });

  it('rejects values that are not a hostname', () => {
    expect(normalizeAllowedDomain('not a host')).toBeNull();
    expect(normalizeAllowedDomain('*.example.com')).toBeNull();
    expect(normalizeAllowedDomain('')).toBeNull();
  });

  it('deduplicates and rejects an invalid entry', () => {
    expect(
      normalizeAllowedDomains([
        'https://example.com/a',
        'example.com',
        'www.example.com',
      ]),
    ).toEqual(['example.com']);
    expect(normalizeAllowedDomains(['example.com', 'bad host'])).toBeNull();
    expect(normalizeAllowedDomains([])).toEqual([]);
  });

  it('matches the request origin after the same normalization', () => {
    expect(isDomainAllowed([], undefined)).toBe(true);
    expect(isDomainAllowed(['example.com'], undefined)).toBe(false);
    expect(isDomainAllowed(['example.com'], 'https://www.example.com')).toBe(
      true,
    );
    expect(isDomainAllowed(['example.com'], 'https://shop.example.com')).toBe(
      false,
    );
    expect(isDomainAllowed(['localhost'], 'http://localhost:3000')).toBe(true);
  });
});
