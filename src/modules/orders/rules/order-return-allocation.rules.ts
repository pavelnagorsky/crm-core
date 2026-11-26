import { OrderReturnStatus, Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ReturnAllocationSource } from '../interfaces/return-allocation-source.interface.js';
import { ReturnAllocation } from '../interfaces/return-allocation.interface.js';

/** Quantity and money already returned by posted returns. */
export function postedReturns(line: ReturnAllocationSource): {
  quantity: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  lineCost: Prisma.Decimal;
} {
  return line.returnItems
    .filter((item) => item.return.status === OrderReturnStatus.POSTED)
    .reduce(
      (sum, item) => ({
        quantity: sum.quantity.plus(item.quantity),
        lineTotal: sum.lineTotal.plus(item.lineTotal),
        discountTotal: sum.discountTotal.plus(item.discountTotal),
        lineCost: sum.lineCost.plus(item.lineCostSnapshot ?? 0),
      }),
      {
        quantity: MoneyUtils.decimal(0),
        lineTotal: MoneyUtils.decimal(0),
        discountTotal: MoneyUtils.decimal(0),
        lineCost: MoneyUtils.decimal(0),
      },
    );
}

/**
 * Share of the actual line money for `quantity` more returned units, cumulative: the line
 * total and its discount are allocated separately, so all returns of a line add up to exactly
 * its lineTotal, discountTotal and lineSubtotal (docs/pricing-stage7-api.md, «Возвраты»).
 * The line total is allocated half-up, the discount rounded down, the remainder going to the
 * return that completes the line (1+1+1 of 3 pcs with 10.00 off: 3.33, 3.33, 3.34). Both the
 * return preview and the return itself use this function.
 */
export function allocateReturn(
  line: ReturnAllocationSource,
  quantity: Prisma.Decimal,
): ReturnAllocation {
  const returned = postedReturns(line);
  const lineTotal = MoneyUtils.allocateCumulative(
    line.lineTotal,
    line.quantity,
    quantity,
    returned.quantity,
    returned.lineTotal,
  );
  const discountTotal = MoneyUtils.allocateCumulativeDown(
    line.discountTotal,
    line.quantity,
    quantity,
    returned.quantity,
    returned.discountTotal,
  );
  return {
    lineSubtotal: lineTotal.plus(discountTotal),
    discountTotal,
    lineTotal,
    lineCostSnapshot:
      line.lineCostSnapshot == null
        ? null
        : MoneyUtils.allocateCumulative(
            line.lineCostSnapshot,
            line.quantity,
            quantity,
            returned.quantity,
            returned.lineCost,
          ),
  };
}
