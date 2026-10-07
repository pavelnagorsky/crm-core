import { QuantityService } from './quantity.service.js';

describe('QuantityService', () => {
  it('canonicalizes valid quantities to three decimal places', () => {
    expect(QuantityService.canonical(' 2.5 ')).toBe('2.500');
    expect(QuantityService.canonical(3)).toBe('3.000');
  });

  it('leaves excessive precision unchanged for validation to reject', () => {
    expect(QuantityService.canonical('1.2345')).toBe('1.2345');
  });

  it('formats stored quantities at the inventory scale', () => {
    expect(QuantityService.format('4.2')).toBe('4.200');
  });
});
