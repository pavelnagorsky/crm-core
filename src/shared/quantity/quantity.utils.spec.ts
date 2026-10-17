import { QuantityUtils } from './quantity.utils.js';

describe('QuantityUtils', () => {
  it('canonicalizes valid quantities to three decimal places', () => {
    expect(QuantityUtils.canonical(' 2.5 ')).toBe('2.500');
    expect(QuantityUtils.canonical(3)).toBe('3.000');
  });

  it('leaves excessive precision unchanged for validation to reject', () => {
    expect(QuantityUtils.canonical('1.2345')).toBe('1.2345');
  });

  it('formats stored quantities at the inventory scale', () => {
    expect(QuantityUtils.format('4.2')).toBe('4.200');
  });
});
