import { normalizeStaffName } from './staff-name.rules.js';

describe('normalizeStaffName', () => {
  it('ignores case, ё and extra whitespace', () => {
    expect(normalizeStaffName('  Алёна \t  ПЕТРОВА ')).toBe('алена петрова');
    expect(normalizeStaffName('Алена Петрова')).toBe(
      normalizeStaffName('алёна   петрова'),
    );
  });
});
