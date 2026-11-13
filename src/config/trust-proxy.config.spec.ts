import { trustProxy } from './trust-proxy.config.js';

describe('trustProxy', () => {
  it('trusts private networks by default', () => {
    expect(trustProxy(undefined)).toBe('loopback, linklocal, uniquelocal');
    expect(trustProxy('  ')).toBe('loopback, linklocal, uniquelocal');
  });

  it('parses numeric values as hop counts', () => {
    expect(trustProxy('2')).toBe(2);
  });

  it('passes address lists through', () => {
    expect(trustProxy('10.0.0.1, 10.0.0.2')).toBe('10.0.0.1, 10.0.0.2');
  });
});
