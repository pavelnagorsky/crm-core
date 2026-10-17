import { HttpStatus, Injectable } from '@nestjs/common';
import { PayrollPeriod, Prisma } from '@prisma/client';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { PayrollPeriodVersion } from '../interfaces/payroll-period-version.interface.js';

@Injectable()
export class PayrollPeriodLockService {
  async lockLocation(
    locationId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    // A row lock cannot protect a date range that has no period yet.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payroll-period:${locationId}`}, 0))`;
  }

  async lockUnchangedPeriod(
    expected: PayrollPeriod,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const rows = await tx.$queryRaw<
      PayrollPeriodVersion[]
    >`SELECT "status", "updatedAt" FROM "PayrollPeriod" WHERE "id" = ${expected.id} FOR UPDATE`;
    if (!rows[0])
      throw new AppException(
        ErrorCode.PAYROLL_PERIOD_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    if (
      rows[0].status !== expected.status ||
      rows[0].updatedAt.getTime() !== expected.updatedAt.getTime()
    ) {
      throw new AppException(
        ErrorCode.PAYROLL_PERIOD_CONCURRENT_UPDATE,
        HttpStatus.CONFLICT,
      );
    }
  }
}
