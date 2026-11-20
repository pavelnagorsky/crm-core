import { OrderStatus, PaymentType, Prisma } from '@prisma/client';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { OrderStateRules } from '../rules/order-state.rules.js';
import { OrderPaymentService } from './order-payment.service.js';

const actor = { id: 'owner-1', name: 'Owner', role: AuditActorRole.OWNER };
const d = (value: string) => new Prisma.Decimal(value);

function setup(
  visit: { deleted: boolean; servicesDue: Prisma.Decimal } | null,
) {
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
    inTransaction: vi.fn((run: (tx: object) => unknown) => run({})),
    findBookingIdInTransaction: vi.fn(async () => {
      calls.push('read booking id');
      return order.bookingId;
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
  const payments = {
    findOperation: vi.fn(),
    void: vi.fn().mockResolvedValue(null),
  };
  const service = new OrderPaymentService(
    {} as never,
    persistence as never,
    payments as never,
    new OrderStateRules(),
    visits as never,
  );
  return { service, calls, payments, visits };
}

describe('OrderPaymentService', () => {
  it('locks the booking of a visit order before the order', async () => {
    const { service, calls } = setup({ deleted: false, servicesDue: d('90') });
    const locked = await service.lockOrderWithVisit(
      {} as never,
      'location-1',
      'order-1',
    );
    expect(calls).toEqual(['read booking id', 'lock booking', 'lock order']);
    expect(service.amountDue(locked).toFixed(2)).toBe('90.00');
  });

  it('does not lock a booking for a sale', async () => {
    const { service, calls, visits } = setup(null);
    await service.lockOrderWithVisit({} as never, 'location-1', 'order-1');
    expect(visits.lockForOrder).not.toHaveBeenCalled();
    expect(calls).toEqual(['read booking id', 'lock order']);
  });

  it('refuses to void an active refund of a deleted visit', async () => {
    const { service, payments } = setup({
      deleted: true,
      servicesDue: d('0'),
    });
    payments.findOperation.mockResolvedValue({
      type: PaymentType.REFUND,
      payments: [{ voidedAt: null }],
    });
    await expect(
      service.voidOperation('location-1', 'order-1', 'op-1', {}, actor),
    ).rejects.toMatchObject({
      errorCode: 'BOOKING_PAYMENT_NOT_ALLOWED',
      status: 409,
    });
    expect(payments.void).not.toHaveBeenCalled();
  });

  it('still voids a payment of a deleted visit, which only takes money off', async () => {
    const { service, payments } = setup({
      deleted: true,
      servicesDue: d('0'),
    });
    payments.findOperation.mockResolvedValue({
      type: PaymentType.PAYMENT,
      payments: [{ voidedAt: null }],
    });
    await service.voidOperation('location-1', 'order-1', 'op-1', {}, actor);
    expect(payments.void).toHaveBeenCalledOnce();
  });

  it('voids a refund of a visit that is not deleted', async () => {
    const { service, payments } = setup({
      deleted: false,
      servicesDue: d('90'),
    });
    await service.voidOperation('location-1', 'order-1', 'op-1', {}, actor);
    expect(payments.findOperation).not.toHaveBeenCalled();
    expect(payments.void).toHaveBeenCalledOnce();
  });
});
