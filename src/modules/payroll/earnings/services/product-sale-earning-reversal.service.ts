import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Prisma,
  StaffEarning,
  StaffEarningSource,
  StaffEarningType,
} from '@prisma/client';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { MoneyService } from '../../../../shared/money/money.service.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { AuditActor } from '../../../audit/interfaces/audit-actor.interface.js';
import { EarningCalculatorService } from './earning-calculator.service.js';
import { StaffEarningWriterService } from './staff-earning-writer.service.js';

@Injectable()
export class ProductSaleEarningReversalService {
  constructor(
    private readonly calculator: EarningCalculatorService,
    private readonly writer: StaffEarningWriterService,
  ) {}

  async reverse(
    locationId: string,
    orderId: string,
    reason: string,
    actor: AuditActor,
    tx: Prisma.TransactionClient,
    orderItemId?: string,
    baseAmountByOrderItem: Map<string, Prisma.Decimal> = new Map(),
    returnItemByOrderItem: Map<string, string> = new Map(),
  ): Promise<StaffEarning[]> {
    const originals = await tx.staffEarning.findMany({
      where: {
        locationId,
        orderId,
        orderItemId,
        type: StaffEarningType.PRODUCT_COMMISSION,
        source: StaffEarningSource.PRODUCT_SALE,
      },
    });
    const reversals: StaffEarning[] = [];
    for (const original of originals) {
      if (!original.orderItemId || original.baseAmount == null) continue;
      const existingReversals = await tx.staffEarning.findMany({
        where: {
          locationId,
          orderId,
          orderItemId: original.orderItemId,
          type: StaffEarningType.CORRECTION,
          source: StaffEarningSource.PRODUCT_SALE,
        },
      });
      const reversedBaseAmount = existingReversals.reduce(
        (total, reversal) =>
          total.plus(MoneyService.decimal(reversal.baseAmount).abs()),
        new Prisma.Decimal(0),
      );
      const remainingBaseAmount = original.baseAmount.minus(reversedBaseAmount);
      const requestedBaseAmount =
        baseAmountByOrderItem.get(original.orderItemId) ?? remainingBaseAmount;
      if (requestedBaseAmount.lte(0) || remainingBaseAmount.lte(0)) {
        reversals.push(...existingReversals);
        continue;
      }
      if (requestedBaseAmount.gt(remainingBaseAmount)) {
        throw new AppException(
          ErrorCode.ORDER_RETURN_QUANTITY_EXCEEDS_REMAINING,
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.writer.assertDateUnlocked(locationId, original.earnedOn, tx);
      const cumulativeBaseAmount = reversedBaseAmount.plus(requestedBaseAmount);
      const isFullOriginalReversal =
        reversedBaseAmount.isZero() &&
        requestedBaseAmount.equals(original.baseAmount);
      reversals.push(
        await this.writer.insert(
          {
            locationId,
            staffId: original.staffId,
            type: StaffEarningType.CORRECTION,
            source: StaffEarningSource.PRODUCT_SALE,
            earnedOn: original.earnedOn,
            amount: this.calculator
              .commission(requestedBaseAmount, original.ratePercent ?? 0)
              .neg(),
            currency: original.currency,
            baseAmount: requestedBaseAmount,
            ratePercent: original.ratePercent,
            description: original.description,
            reason,
            actorId: actor.id ?? null,
            actorName: actor.name,
            idempotencyKey: this.writer.idempotencyKey({
              kind: 'orderItemReversal',
              orderItemId: original.orderItemId,
              cumulativeBaseAmount,
            }),
            compensationPlanId: original.compensationPlanId,
            orderId,
            orderItemId: original.orderItemId,
            orderReturnItemId:
              returnItemByOrderItem.get(original.orderItemId) ?? null,
            reversesEarningId: isFullOriginalReversal ? original.id : null,
          },
          tx,
        ),
      );
    }
    return reversals;
  }
}
