import { StaffEarningType } from '@prisma/client';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { EarningCalculatorService } from './earning-calculator.service.js';
import { money } from '../utils/money.js';

describe('EarningCalculatorService', () => {
  const calculator = new EarningCalculatorService();

  it('snapshots service commission half-up to kopecks', () => {
    expect(money(calculator.commission(50, 40))).toBe('20.00');
    expect(money(calculator.commission('33.33', '30'))).toBe('10.00');
    expect(money(calculator.commission('10.00', '0'))).toBe('0.00');
  });

  it('computes planned shift hours including overnight', () => {
    expect(money(calculator.hoursFromShift(9 * 60, 18 * 60))).toBe('9.00');
    expect(money(calculator.hoursFromShift(22 * 60, 6 * 60))).toBe('8.00');
    expect(money(calculator.hoursFromShift(10 * 60, 10 * 60))).toBe('0.00');
    expect(money(calculator.hourly('8.00', '15.50'))).toBe('124.00');
  });

  it('keeps daily salary share unrounded so the month can be summed once', () => {
    const share = calculator.dailySalaryShare('30000', 30);
    expect(share.toString()).toBe('1000');
    expect(money(calculator.dailySalaryShare('40000', 0))).toBe('0.00');
  });

  it('tops up only the shortfall for a guaranteed salary', () => {
    expect(money(calculator.guaranteedTopUp('40000', '28000'))).toBe('12000.00');
    expect(money(calculator.guaranteedTopUp('40000', '55000'))).toBe('0.00');
    expect(money(calculator.guaranteedTopUp('40000', '40000'))).toBe('0.00');
  });

  it('stores deductions as negative and rejects empty bonus', () => {
    expect(money(calculator.manualAmount(StaffEarningType.BONUS, '1500'))).toBe('1500.00');
    expect(money(calculator.manualAmount(StaffEarningType.DEDUCTION, '200'))).toBe('-200.00');
    expect(money(calculator.manualAmount(StaffEarningType.DEDUCTION, '-200'))).toBe('-200.00');
    expect(money(calculator.manualAmount(StaffEarningType.CORRECTION, '-75.5'))).toBe('-75.50');
    expect(() => calculator.manualAmount(StaffEarningType.BONUS, '0')).toThrow(AppException);
    expect(() => calculator.manualAmount(StaffEarningType.BONUS, '-10')).toThrow(AppException);
    try {
      calculator.manualAmount(StaffEarningType.CORRECTION, '0');
    } catch (e) {
      expect((e as AppException).errorCode).toBe(ErrorCode.STAFF_EARNING_AMOUNT_INVALID.code);
    }
  });
});
