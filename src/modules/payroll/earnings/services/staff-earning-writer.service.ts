import { randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, StaffEarning, StaffEarningType } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { PrismaErrorCode } from '../../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { lockedPeriodWhere } from '../../periods/utils/locked-period.js';

export type StaffEarningIdempotencyInput =
  | { kind: 'manual' }
  | { kind: 'product'; externalId: string }
  | { kind: 'shift'; shiftId: string }
  | { kind: 'salary'; periodId: string; staffId: string }
  | { kind: 'salaryPeriod'; periodId: string }
  | { kind: 'correction'; resultId: string }
  | { kind: 'bookingItem'; bookingItemId: string }
  | { kind: 'bookingAdjustment'; bookingItemId: string }
  | { kind: 'earningReversal'; earningId: string }
  | { kind: 'orderItem'; orderItemId: string }
  | {
      kind: 'orderItemReversal';
      orderItemId: string;
      cumulativeBaseAmount?: Prisma.Decimal;
    };

@Injectable()
export class StaffEarningWriterService {
  constructor(private readonly db: DatabaseService) {}

  async assertDateUnlocked(
    locationId: string,
    earnedOn: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const locked = await this.store(tx).payrollPeriod.findFirst({
      where: lockedPeriodWhere(locationId, earnedOn),
      select: { id: true },
    });
    if (locked) {
      throw new AppException(
        ErrorCode.STAFF_EARNING_DATE_LOCKED,
        HttpStatus.CONFLICT,
      );
    }
  }

  idempotencyKey(input: StaffEarningIdempotencyInput): string {
    switch (input.kind) {
      case 'manual':
        return `manual:${randomUUID()}`;
      case 'product':
        return `product:${input.externalId}:${StaffEarningType.PRODUCT_COMMISSION}`;
      case 'shift':
        return `shift:${input.shiftId}:${StaffEarningType.HOURLY}`;
      case 'salary':
        return `salary:${input.periodId}:${input.staffId}`;
      case 'salaryPeriod':
        return `salary:${input.periodId}:`;
      case 'correction':
        return `correction:${input.resultId}:${randomUUID()}`;
      case 'bookingItem':
        return `booking-item:${input.bookingItemId}:${StaffEarningType.SERVICE_COMMISSION}`;
      case 'bookingAdjustment':
        return `booking-item:${input.bookingItemId}:adjustment:${randomUUID()}`;
      case 'earningReversal':
        return `earning:${input.earningId}:reversal`;
      case 'orderItem':
        return `order-item:${input.orderItemId}:${StaffEarningType.PRODUCT_COMMISSION}`;
      case 'orderItemReversal':
        return `order-item:${input.orderItemId}:${StaffEarningType.PRODUCT_COMMISSION}:reversal${
          input.cumulativeBaseAmount
            ? `:${input.cumulativeBaseAmount.toFixed(2)}`
            : ''
        }`;
    }
  }

  async insert(
    data: Prisma.StaffEarningUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<StaffEarning> {
    const db = this.store(tx);
    try {
      return await db.staffEarning.create({ data });
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
        const existing = await db.staffEarning.findUnique({
          where: {
            locationId_idempotencyKey: {
              locationId: data.locationId,
              idempotencyKey: data.idempotencyKey,
            },
          },
        });
        if (existing) return existing;
      }
      throw e;
    }
  }

  private store(tx?: Prisma.TransactionClient) {
    return tx ?? this.db;
  }
}
