import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { thrownAppException } from '../../payments/testing/thrown-app-exception.js';
import { assertFinanceSummaryPeriod } from './finance-summary-period.js';

describe('assertFinanceSummaryPeriod', () => {
  it('accepts one day and 62 days', () => {
    expect(() =>
      assertFinanceSummaryPeriod('2026-11-20', '2026-11-20'),
    ).not.toThrow();
    expect(() =>
      assertFinanceSummaryPeriod('2026-11-01', '2027-01-01'),
    ).not.toThrow();
  });

  it('refuses an end before the start: 400 DASHBOARD_CUSTOM_RANGE_INVALID', () => {
    const error = thrownAppException(() =>
      assertFinanceSummaryPeriod('2026-11-20', '2026-11-19'),
    );
    expect(error.errorCode).toBe(ErrorCode.DASHBOARD_CUSTOM_RANGE_INVALID.code);
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('refuses 63 days: 400 FINANCE_SUMMARY_RANGE_TOO_LONG', () => {
    const error = thrownAppException(() =>
      assertFinanceSummaryPeriod('2026-11-01', '2027-01-02'),
    );
    expect(error.errorCode).toBe(ErrorCode.FINANCE_SUMMARY_RANGE_TOO_LONG.code);
  });
});
