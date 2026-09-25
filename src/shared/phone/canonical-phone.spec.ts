import { canonicalPhone } from './canonical-phone.js';

describe('canonicalPhone', () => {
  it('collapses Belarus and Russia trunk prefixes to the same E.164 number', () => {
    expect(canonicalPhone('+375 (29) 111-22-33')).toBe('+375291112233');
    expect(canonicalPhone('375291112233')).toBe('+375291112233');
    expect(canonicalPhone('8 029 111-22-33')).toBe('+375291112233');
    expect(canonicalPhone('00375291112233')).toBe('+375291112233');
    expect(canonicalPhone('8 916 123-45-67')).toBe('+79161234567');
    expect(canonicalPhone('79161234567')).toBe('+79161234567');
  });

  it('keeps an empty or non-numeric value empty', () => {
    expect(canonicalPhone('')).toBe('');
    expect(canonicalPhone('телефон')).toBe('');
    expect(canonicalPhone('00')).toBe('');
  });
});
