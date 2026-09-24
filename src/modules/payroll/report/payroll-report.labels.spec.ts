import { EARNING_TYPE_LABEL, labelOf, safeSheetName } from './payroll-report.labels.js';

describe('payroll report labels', () => {
  it('translates known keys and keeps unknown values', () => {
    expect(labelOf(EARNING_TYPE_LABEL, 'BONUS')).toBe('Бонус');
    expect(labelOf(EARNING_TYPE_LABEL, 'UNKNOWN')).toBe('UNKNOWN');
    expect(labelOf(EARNING_TYPE_LABEL, null)).toBe('');
  });

  it('sanitizes Excel sheet names', () => {
    expect(safeSheetName('Анна / колорист')).toBe('Анна   колорист');
    expect(safeSheetName('')).toBe('staff');
    expect(safeSheetName('x'.repeat(40)).length).toBe(31);
  });
});
