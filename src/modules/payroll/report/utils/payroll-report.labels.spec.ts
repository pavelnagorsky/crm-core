import { labelOf } from '../../../../shared/i18n/label-of.js';

describe('payroll report labels', () => {
  it('translates known keys and keeps unknown values', () => {
    const map = { BONUS: 'Бонус' };
    expect(labelOf(map, 'BONUS')).toBe('Бонус');
    expect(labelOf(map, 'UNKNOWN')).toBe('UNKNOWN');
    expect(labelOf(map, null)).toBe('');
  });
});
