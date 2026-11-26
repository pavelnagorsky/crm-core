import { ForbiddenException } from '@nestjs/common';
import { AuditActorRole } from '../../../audit/enums/audit-actor-role.enum.js';
import { PaymentInputMethod } from '../../../payments/enums/payment-input-method.enum.js';
import { booking } from '../../testing/factories/booking.factory.js';
import { BookingPaymentService } from './booking-payment.service.js';

const actor = { id: 'user-1', name: 'Anna', role: AuditActorRole.STAFF };

describe('BookingPaymentService.pay', () => {
  function setup(lockedStaffId: string) {
    const current = booking({ locationId: 'location-1' });
    const locked = booking({
      locationId: 'location-1',
      item: { staffId: lockedStaffId },
    });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: current.id }]),
      booking: { findUniqueOrThrow: vi.fn().mockResolvedValue(locked) },
    };
    const db = {
      $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
    };
    const payments = {
      lockKeyForReplay: vi.fn().mockResolvedValue(null),
    };
    const lifecycle = { completeInTransaction: vi.fn() };
    const service = new BookingPaymentService(
      db as never,
      {
        getLocale: vi.fn().mockResolvedValue({ timezone: 'Europe/Minsk' }),
        getPaymentTracking: vi.fn().mockResolvedValue({
          mode: 'MANUAL',
          since: new Date(0),
        }),
      } as never,
      {} as never,
      {} as never,
      payments as never,
      lifecycle as never,
      {} as never,
      { lockLimits: vi.fn() } as never,
    );
    return { service, current, lifecycle };
  }

  const dto = { method: PaymentInputMethod.CASH, idempotencyKey: 'key-1' };

  it('refuses a master whose visit was reassigned before the lock', async () => {
    const { service, current, lifecycle } = setup('boris');
    const anna = current.items[0].staffId;
    await expect(
      service.pay(current, dto, actor, false, anna),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(lifecycle.completeInTransaction).not.toHaveBeenCalled();
  });
});

describe('BookingPaymentService lock order', () => {
  function setup() {
    const order: string[] = [];
    const payments = {
      lockKeyForReplay: vi.fn(async () => {
        order.push('payment key');
        return null;
      }),
      lockUnusedKey: vi.fn(async () => {
        order.push('payment key');
      }),
    };
    const pricingContext = {
      lockLimits: vi.fn(async () => {
        order.push('limits');
      }),
    };
    const service = new BookingPaymentService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      payments as never,
      {} as never,
      {} as never,
      pricingContext as never,
    );
    return { service, order, pricingContext };
  }

  const plan = (confirm: boolean) =>
    ({
      payment: {
        input: { method: PaymentInputMethod.CASH, idempotencyKey: 'key-1' },
        request: {},
      },
      confirmProductItemIds: confirm ? ['item-1'] : [],
      confirmAllDraftProducts: false,
      expectedProductTotal: null,
      canReplace: false,
      timezone: 'Europe/Minsk',
      now: new Date(0),
    }) as never;

  it('locks the limited promotions after the payment key when products are confirmed', async () => {
    const { service, order } = setup();
    await service.lockForBooking(
      {} as never,
      { id: 'booking-1', locationId: 'location-1' },
      plan(true),
    );
    await service.lockForNewBooking({} as never, 'location-1', plan(true));
    expect(order).toEqual(['payment key', 'limits', 'payment key', 'limits']);
  });

  it('takes no promotion lock without products to confirm', async () => {
    const { service, pricingContext } = setup();
    await service.lockForBooking(
      {} as never,
      { id: 'booking-1', locationId: 'location-1' },
      plan(false),
    );
    expect(pricingContext.lockLimits).not.toHaveBeenCalled();
  });
});
