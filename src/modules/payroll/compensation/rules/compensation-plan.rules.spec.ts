import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import {
  assertCompensationVersionStart,
  planCoversDate,
} from './compensation-plan.rules.js';

describe('compensation plan rules', () => {
  it('allows the first version', () => {
    expect(() =>
      assertCompensationVersionStart(null, TimeUtils.dateOnly('2026-09-01')),
    ).not.toThrow();
  });

  it('rejects a version that does not start after the latest from-date', () => {
    expect(() =>
      assertCompensationVersionStart(
        {
          effectiveFrom: TimeUtils.dateOnly('2026-09-01'),
          effectiveTo: null,
        },
        TimeUtils.dateOnly('2026-09-01'),
      ),
    ).toThrow(AppException);
    try {
      assertCompensationVersionStart(
        {
          effectiveFrom: TimeUtils.dateOnly('2026-09-10'),
          effectiveTo: null,
        },
        TimeUtils.dateOnly('2026-09-01'),
      );
    } catch (e) {
      expect((e as AppException).errorCode).toBe(
        ErrorCode.COMPENSATION_PLAN_EFFECTIVE_FROM_INVALID.code,
      );
    }
  });

  it('rejects opening a version inside an already closed span', () => {
    expect(() =>
      assertCompensationVersionStart(
        {
          effectiveFrom: TimeUtils.dateOnly('2026-09-01'),
          effectiveTo: TimeUtils.dateOnly('2026-10-31'),
        },
        TimeUtils.dateOnly('2026-10-15'),
      ),
    ).toThrow(AppException);
  });

  it('allows a version after a closed span', () => {
    expect(() =>
      assertCompensationVersionStart(
        {
          effectiveFrom: TimeUtils.dateOnly('2026-09-01'),
          effectiveTo: TimeUtils.dateOnly('2026-09-30'),
        },
        TimeUtils.dateOnly('2026-10-01'),
      ),
    ).not.toThrow();
  });

  it('treats effectiveTo as inclusive', () => {
    const plan = {
      effectiveFrom: TimeUtils.dateOnly('2026-09-01'),
      effectiveTo: TimeUtils.dateOnly('2026-09-30'),
    };
    expect(planCoversDate(plan, TimeUtils.dateOnly('2026-09-01'))).toBe(true);
    expect(planCoversDate(plan, TimeUtils.dateOnly('2026-09-30'))).toBe(true);
    expect(planCoversDate(plan, TimeUtils.dateOnly('2026-10-01'))).toBe(false);
  });
});
