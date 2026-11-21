import { HttpStatus } from '@nestjs/common';
import { Booking, OrderItem } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { OrderItemStatus } from '../../orders/enums/order-item-status.enum.js';
import { OrderItemType } from '../../orders/enums/order-item-type.enum.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { VisitPaymentPlan } from '../interfaces/visit-payment-plan.interface.js';
import { CLOSED_WITHOUT_VISIT_STATUSES } from './visit-payment-due.rules.js';

/** Whether the step sells product lines of the visit order. */
export function confirmsProducts(
  plan: Pick<VisitPaymentPlan, 'confirmProductItemIds' | 'confirmAllDraftProducts'>,
): boolean {
  return plan.confirmProductItemIds.length > 0 || plan.confirmAllDraftProducts;
}

/**
 * 409 BOOKING_PAYMENT_NOT_ALLOWED when a NO_SHOW or CANCELLED visit would sell products:
 * the visit did not take place.
 */
export function assertProductsConfirmable(
  booking: Pick<Booking, 'status'>,
  plan: Pick<VisitPaymentPlan, 'confirmProductItemIds' | 'confirmAllDraftProducts'>,
): void {
  if (
    CLOSED_WITHOUT_VISIT_STATUSES.includes(booking.status as BookingStatus) &&
    confirmsProducts(plan)
  )
    throw new AppException(
      ErrorCode.BOOKING_PAYMENT_NOT_ALLOWED,
      HttpStatus.CONFLICT,
    );
}

/** Product lines the step confirms: every draft product line, or the listed ones. */
export function productItemIdsToConfirm(
  plan: Pick<VisitPaymentPlan, 'confirmProductItemIds' | 'confirmAllDraftProducts'>,
  items: readonly Pick<OrderItem, 'id' | 'type' | 'status'>[],
): string[] {
  if (!plan.confirmAllDraftProducts) return plan.confirmProductItemIds;
  return items
    .filter(
      (item) =>
        item.type === OrderItemType.PRODUCT &&
        item.status === OrderItemStatus.DRAFT,
    )
    .map((item) => item.id);
}
