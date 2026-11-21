import { NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { lockedOrderAmountDue } from '../rules/order-payment-due.rules.js';
import { OrderLockService } from './order-lock.service.js';

const d = (value: string) => new Prisma.Decimal(value);
type Visit = {
  deleted: boolean;
  servicesDue: Prisma.Decimal;
  staffIds: string[];
};
const liveVisit: Visit = {
  deleted: false,
  servicesDue: d('90'),
  staffIds: ['staff-1'],
};

function setup(visit: Visit | null, hasOrder = true) {
  const calls: string[] = [];
  const order = {
    id: 'order-1',
    locationId: 'location-1',
    bookingId: visit ? 'booking-1' : null,
    currency: 'BYN',
    status: OrderStatus.ACTIVE,
    items: [],
  };
  const persistence = {
    findBookingIdInTransaction: vi.fn(async () => {
      calls.push('read booking id');
      return order.bookingId;
    }),
    findForBookingInTransaction: vi.fn(async () => {
      calls.push('find order');
      return hasOrder ? order : null;
    }),
    lockOrder: vi.fn(async () => {
      calls.push('lock order');
    }),
    findInTransaction: vi.fn(async () => order),
  };
  const visits = {
    lockForOrder: vi.fn(async () => {
      calls.push('lock booking');
      return visit;
    }),
  };
  const service = new OrderLockService(persistence as never, visits as never);
  return { service, calls, visits, persistence };
}

describe('OrderLockService.lockOrderWithVisit', () => {
  it('locks the booking of a visit order before the order', async () => {
    const { service, calls } = setup(liveVisit);
    const locked = await service.lockOrderWithVisit(
      {} as never,
      'location-1',
      'order-1',
    );
    expect(calls).toEqual(['read booking id', 'lock booking', 'lock order']);
    expect(lockedOrderAmountDue(locked).toFixed(2)).toBe('90.00');
  });

  it('does not lock a booking for a sale', async () => {
    const { service, calls, visits } = setup(null);
    await service.lockOrderWithVisit({} as never, 'location-1', 'order-1');
    expect(visits.lockForOrder).not.toHaveBeenCalled();
    expect(calls).toEqual(['read booking id', 'lock order']);
  });
});

describe('OrderLockService.lockVisitOrder', () => {
  it('locks the booking, then the visit order', async () => {
    const { service, calls } = setup(liveVisit);
    const locked = await service.lockVisitOrder(
      {} as never,
      'location-1',
      'booking-1',
    );
    expect(calls).toEqual(['lock booking', 'find order', 'lock order']);
    expect(locked.visit).toBe(liveVisit);
  });

  it.each([
    ['gone', null],
    ['deleted', { ...liveVisit, deleted: true }],
  ])('answers 404 for a booking that is %s', async (_, visit) => {
    const { service, persistence } = setup(visit);
    await expect(
      service.lockVisitOrder({} as never, 'location-1', 'booking-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(persistence.lockOrder).not.toHaveBeenCalled();
  });

  it('answers 404 PAYMENT_OPERATION_NOT_FOUND for a visit without an order', async () => {
    const { service, persistence } = setup(liveVisit, false);
    await expect(
      service.lockVisitOrder({} as never, 'location-1', 'booking-1'),
    ).rejects.toMatchObject({
      errorCode: 'PAYMENT_OPERATION_NOT_FOUND',
      status: 404,
    });
    expect(persistence.lockOrder).not.toHaveBeenCalled();
  });
});
