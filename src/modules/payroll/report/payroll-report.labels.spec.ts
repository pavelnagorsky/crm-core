import { labelOf } from '../../../shared/i18n/label-of.js';
import { safeSheetName } from './payroll-report.labels.js';

describe('payroll report labels', () => {
  it('translates known keys and keeps unknown values', () => {
    const map = { BONUS: 'Бонус' };
    expect(labelOf(map, 'BONUS')).toBe('Бонус');
    expect(labelOf(map, 'UNKNOWN')).toBe('UNKNOWN');
    expect(labelOf(map, null)).toBe('');
  });

  it('sanitizes Excel sheet names', () => {
    expect(safeSheetName('Анна / колорист', 'сотрудник')).toBe('Анна   колорист');
    expect(safeSheetName('', 'сотрудник')).toBe('сотрудник');
    expect(safeSheetName('x'.repeat(40), 'сотрудник').length).toBe(31);
  });
});
