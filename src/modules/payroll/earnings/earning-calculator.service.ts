import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, StaffEarningType } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { dec } from '../utils/money.js';

@Injectable()
export class EarningCalculatorService {
  commission(base: Prisma.Decimal | string | number, percent: Prisma.Decimal | string | number): Prisma.Decimal {
    return dec(base).mul(dec(percent)).div(100).toDecimalPlaces(2);
  }

  hourly(hours: Prisma.Decimal | string | number, rate: Prisma.Decimal | string | number): Prisma.Decimal {
    return dec(hours).mul(dec(rate)).toDecimalPlaces(2);
  }

  hoursFromShift(startMinutes: number, endMinutes: number): Prisma.Decimal {
    let minutes = endMinutes - startMinutes;
    if (minutes < 0) minutes += 24 * 60;
    if (minutes <= 0) return dec(0);
    return dec(minutes).div(60).toDecimalPlaces(2);
  }

  dailySalaryShare(monthlySalary: Prisma.Decimal | string | number, daysInMonth: number): Prisma.Decimal {
    if (daysInMonth <= 0) return dec(0);
    return dec(monthlySalary).div(daysInMonth);
  }

  guaranteedTopUp(salary: Prisma.Decimal | string | number, alreadyEarned: Prisma.Decimal | string | number): Prisma.Decimal {
    const diff = dec(salary).minus(dec(alreadyEarned));
    return diff.gt(0) ? diff.toDecimalPlaces(2) : dec(0);
  }

  manualAmount(type: StaffEarningType, raw: string): Prisma.Decimal {
    const value = dec(raw);
    if (value.isZero()) throw new AppException(ErrorCode.STAFF_EARNING_AMOUNT_INVALID, HttpStatus.BAD_REQUEST);
    if (type === StaffEarningType.BONUS && value.lte(0)) {
      throw new AppException(ErrorCode.STAFF_EARNING_AMOUNT_INVALID, HttpStatus.BAD_REQUEST);
    }
    if (type === StaffEarningType.DEDUCTION) return value.abs().negated();
    return value;
  }
}
