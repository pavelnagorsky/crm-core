import { HttpStatus } from '@nestjs/common';
import { BookingStatus, OrderItemStatus, OrderItemType } from '@prisma/client';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { thrownAppException } from '../../payments/testing/thrown-app-exception.js';
import {
  assertProductsConfirmable,
  confirmsProducts,
  productItemIdsToConfirm,
} from './visit-payment-step.rules.js';

const none = { confirmProductItemIds: [], confirmAllDraftProducts: false };
const listed = {
  confirmProductItemIds: ['item-1'],
  confirmAllDraftProducts: false,
};
const all = { confirmProductItemIds: [], confirmAllDraftProducts: true };

describe('confirmsProducts', () => {
  it('is true for listed lines or all drafts', () => {
    expect(confirmsProducts(none)).toBe(false);
    expect(confirmsProducts(listed)).toBe(true);
    expect(confirmsProducts(all)).toBe(true);
  });
});

describe('assertProductsConfirmable', () => {
  it.each([BookingStatus.NO_SHOW, BookingStatus.CANCELLED])(
    'refuses to sell products of a %s visit: 409 BOOKING_PAYMENT_NOT_ALLOWED',
    (status) => {
      const error = thrownAppException(() =>
        assertProductsConfirmable({ status }, listed),
      );
      expect(error.errorCode).toBe(ErrorCode.BOOKING_PAYMENT_NOT_ALLOWED.code);
      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    },
  );

  it('lets a closed visit be paid without selling products', () => {
    expect(() =>
      assertProductsConfirmable({ status: BookingStatus.NO_SHOW }, none),
    ).not.toThrow();
  });

  it('lets a visit that took place sell products', () => {
    expect(() =>
      assertProductsConfirmable({ status: BookingStatus.COMPLETED }, all),
    ).not.toThrow();
  });
});

describe('productItemIdsToConfirm', () => {
  const items = [
    {
      id: 'draft-product',
      type: OrderItemType.PRODUCT,
      status: OrderItemStatus.DRAFT,
    },
    {
      id: 'sold-product',
      type: OrderItemType.PRODUCT,
      status: OrderItemStatus.CONFIRMED,
    },
    {
      id: 'draft-service',
      type: OrderItemType.SERVICE,
      status: OrderItemStatus.DRAFT,
    },
  ];

  it('takes every draft product line for all drafts', () => {
    expect(productItemIdsToConfirm(all, items)).toEqual(['draft-product']);
  });

  it('takes the listed lines otherwise', () => {
    expect(productItemIdsToConfirm(listed, items)).toEqual(['item-1']);
  });
});
