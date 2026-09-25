import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, StaffEarningType } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';

@Injectable()
export class EarningCalculatorService {
  commission(base: Prisma.Decimal | string | number, percent: Prisma.Decimal | string | number): Prisma.Decimal {
    return MoneyService.quantize(MoneyService.decimal(base).mul(MoneyService.decimal(percent)).div(100));
  }

  hourly(hours: Prisma.Decimal | string | number, rate: Prisma.Decimal | string | number): Prisma.Decimal {
    return MoneyService.quantize(MoneyService.decimal(hours).mul(MoneyService.decimal(rate)));
  }

  /** Exact hours. Quantize only the money product, not this intermediate value. */
  hoursFromShift(startMinutes: number, endMinutes: number): Prisma.Decimal {
    let minutes = endMinutes - startMinutes;
    if (minutes < 0) minutes += 24 * 60;
    if (minutes <= 0) return MoneyService.decimal(0);
    return MoneyService.decimal(minutes).div(60);
  }

  dailySalaryShare(monthlySalary: Prisma.Decimal | string | number, daysInMonth: number): Prisma.Decimal {
    if (daysInMonth <= 0) return MoneyService.decimal(0);
    return MoneyService.decimal(monthlySalary).div(daysInMonth);
  }

  guaranteedTopUp(salary: Prisma.Decimal | string | number, alreadyEarned: Prisma.Decimal | string | number): Prisma.Decimal {
    const diff = MoneyService.decimal(salary).minus(MoneyService.decimal(alreadyEarned));
    return diff.gt(0) ? MoneyService.quantize(diff) : MoneyService.decimal(0);
  }

  manualAmount(type: StaffEarningType, raw: string): Prisma.Decimal {
    const value = MoneyService.decimal(raw);
    if (value.isZero()) throw new AppException(ErrorCode.STAFF_EARNING_AMOUNT_INVALID, HttpStatus.BAD_REQUEST);
    if (type === StaffEarningType.BONUS && value.lte(0)) {
      throw new AppException(ErrorCode.STAFF_EARNING_AMOUNT_INVALID, HttpStatus.BAD_REQUEST);
    }
    if (type === StaffEarningType.DEDUCTION) return value.abs().negated();
    return value;
  }
}
