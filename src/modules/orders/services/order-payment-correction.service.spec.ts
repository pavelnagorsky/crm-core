import { ForbiddenException } from '@nestjs/common';
import { OrderStatus, PaymentType, Prisma } from '@prisma/client';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { OrderPaymentCorrectionService } from './order-payment-correction.service.js';

const actor = { id: 'owner-1', name: 'Owner', role: AuditActorRole.OWNER };
const now = new Date('2026-11-21T10:00:00.000Z');
type Visit = {
  deleted: boolean;
  servicesDue: Prisma.Decimal;
  staffIds: string[];
};
const visitOf = (deleted: boolean): Visit => ({
  deleted,
  servicesDue: new Prisma.Decimal(deleted ? 0 : 90),
  staffIds: ['staff-1'],
});

function setup(visit: Visit | null) {
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
  };
  const locks = {
    lockOrderWithVisit: vi.fn(async () => ({ order, visit })),
    lockVisitOrder: vi.fn(async () => ({ order, visit })),
  };
  const payments = {
    findOperation: vi.fn(),
    void: vi.fn().mockResolvedValue(null),
    undo: vi.fn().mockResolvedValue(null),
  };
  const service = new OrderPaymentCorrectionService(
    persistence as never,
    locks as never,
    payments as never,
  );
  return { service, payments };
}

const undo = {
  locationId: 'location-1',
  bookingId: 'booking-1',
  operationId: 'op-1',
  actor,
  now,
};

describe('OrderPaymentCorrectionService.voidOperation', () => {
  it('refuses to void an active refund of a deleted visit', async () => {
    const { service, payments } = setup(visitOf(true));
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
    const { service, payments } = setup(visitOf(true));
    payments.findOperation.mockResolvedValue({
      type: PaymentType.PAYMENT,
      payments: [{ voidedAt: null }],
    });
    await service.voidOperation('location-1', 'order-1', 'op-1', {}, actor);
    expect(payments.void).toHaveBeenCalledOnce();
  });

  it('does not read the operation for a live visit', async () => {
    const { service, payments } = setup(visitOf(false));
    await service.voidOperation('location-1', 'order-1', 'op-1', {}, actor);
    expect(payments.findOperation).not.toHaveBeenCalled();
    expect(payments.void).toHaveBeenCalledOnce();
  });
});

describe('OrderPaymentCorrectionService.undoVisitPayment', () => {
  it('undoes in the journal of the locked visit order', async () => {
    const { service, payments } = setup(visitOf(false));
    const result = await service.undoVisitPayment(undo);
    expect(payments.undo).toHaveBeenCalledWith(
      {},
      {
        locationId: 'location-1',
        orderId: 'order-1',
        operationId: 'op-1',
        actor,
        now,
      },
      'BYN',
    );
    expect(result).toEqual({ change: null, bookingId: 'booking-1' });
  });

  it('lets a master of the visit undo', async () => {
    const { service, payments } = setup(visitOf(false));
    await service.undoVisitPayment({ ...undo, participantStaffId: 'staff-1' });
    expect(payments.undo).toHaveBeenCalledOnce();
  });

  it('refuses a master who no longer takes part in the locked visit: 403', async () => {
    const { service, payments } = setup(visitOf(false));
    await expect(
      service.undoVisitPayment({ ...undo, participantStaffId: 'staff-2' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(payments.undo).not.toHaveBeenCalled();
  });
});
