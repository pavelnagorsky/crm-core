import { HttpStatus, Injectable } from '@nestjs/common';
import { OrderItemStatus, OrderStatus } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';

@Injectable()
export class OrderStateAssertionService {
  assertActive(status: OrderStatus): void {
    if (status !== OrderStatus.ACTIVE) {
      throw new AppException(ErrorCode.ORDER_NOT_ACTIVE, HttpStatus.CONFLICT);
    }
  }

  assertAllItemsDraft(order: OrderWithItems): void {
    if (order.items.some((item) => item.status !== OrderItemStatus.DRAFT)) {
      throw new AppException(
        ErrorCode.ORDER_ITEM_NOT_DRAFT,
        HttpStatus.CONFLICT,
      );
    }
  }

  assertVersion(current: number, expected: number): void {
    if (current !== expected) {
      throw new AppException(ErrorCode.ORDER_CHANGED, HttpStatus.CONFLICT);
    }
  }

  assertVersionClaimed(claimed: boolean): void {
    if (!claimed) {
      throw new AppException(ErrorCode.ORDER_CHANGED, HttpStatus.CONFLICT);
    }
  }
}
