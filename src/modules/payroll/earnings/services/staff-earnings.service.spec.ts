import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { BookingStatus, Prisma } from '@prisma/client';
import { booking as bookingFixture } from '../../../bookings/testing/factories/booking.factory.js';
import { BookingFixtureOptions } from '../../../bookings/testing/interfaces/booking-fixture-options.interface.js';
import { DatabaseService } from '../../../../database/database.service.js';
import { AuditActorRole } from '../../../audit/enums/audit-actor-role.enum.js';
import { BookingWithItems } from '../../../bookings/interfaces/booking-with-items.interface.js';
import { LocationService } from '../../../location/services/location.service.js';
import { StaffService } from '../../../staff/services/staff.service.js';
import type { CompensationPlanWithRates } from '../../compensation/interfaces/compensation-plan-with-rates.interface.js';
import { StaffCompensationService } from '../../compensation/services/staff-compensation.service.js';
import { EarningCalculator } from '../calculators/earning.calculator.js';
import { PayrollPeriodEarningsRequestDto } from '../dto/payroll-period-earnings-request.dto.js';
import { ProductSaleEarningReversalService } from './product-sale-earning-reversal.service.js';
import { StaffEarningWriterService } from './staff-earning-writer.service.js';
import { StaffEarningsService } from './staff-earnings.service.js';

function booking(options: BookingFixtureOptions = {}): BookingWithItems {
  return bookingFixture({
    status: BookingStatus.COMPLETED,
    startAt: new Date('2026-09-15T10:00:00Z'),
    endAt: new Date('2026-09-15T11:00:00Z'),
    item: { id: 'booking-item-1' },
    ...options,
  });
}

describe('StaffEarningsService', () => {
  const db = {
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    staffEarning: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    payrollPeriod: { findFirst: vi.fn() },
  };
  const compensation = {
    resolveForDate: vi.fn(),
    resolveServicePercent: vi.fn(),
  };
  const location = {
    getLocale: vi.fn().mockResolvedValue({ timezone: 'UTC', currency: 'RUB' }),
  };

  let service: StaffEarningsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        StaffEarningsService,
        EarningCalculator,
        StaffEarningWriterService,
        ProductSaleEarningReversalService,
        { provide: DatabaseService, useValue: db },
        { provide: StaffCompensationService, useValue: compensation },
        { provide: StaffService, useValue: {} },
        { provide: LocationService, useValue: location },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
      ],
    }).compile();
    service = module.get(StaffEarningsService);
  });

  it('skips a completed booking when payroll is not configured', async () => {
    compensation.resolveForDate.mockResolvedValue(null);
    await expect(
      service.recordForCompletedBooking(booking(), db as never),
    ).resolves.toEqual([]);
    expect(db.staffEarning.upsert).not.toHaveBeenCalled();
  });

  it('creates a snapshot earning from the booking price and applicable percent', async () => {
    compensation.resolveForDate.mockResolvedValue({
      id: 'plan-1',
    } as CompensationPlanWithRates);
    compensation.resolveServicePercent.mockReturnValue('40');
    db.staffEarning.upsert.mockImplementation(
      ({ create: data }: { create: { amount: Prisma.Decimal } }) =>
        Promise.resolve({ id: 'earn-1', ...data }),
    );

    const created = await service.recordForCompletedBooking(
      booking({
        items: [
          {
            ...booking().items[0],
            customPrice: new Prisma.Decimal('50.00'),
          },
        ],
      }),
      db as never,
    );

    expect(created[0].amount.toString()).toBe('20');
    expect(db.staffEarning.upsert).toHaveBeenCalledWith({
      where: expect.anything(),
      update: expect.anything(),
      create: expect.objectContaining({
        idempotencyKey: 'booking-item:booking-item-1:SERVICE_COMMISSION',
        bookingItemId: 'booking-item-1',
        baseAmount: expect.anything(),
        ratePercent: expect.anything(),
        currency: 'RUB',
      }),
    });
  });

  it('propagates earning persistence failures to the booking transaction', async () => {
    compensation.resolveForDate.mockRejectedValue(new Error('db down'));
    await expect(
      service.recordForCompletedBooking(booking(), db as never),
    ).rejects.toThrow('db down');
  });

  it('reuses an existing reversal instead of inserting a second one', async () => {
    db.staffEarning.findMany.mockResolvedValue([
      {
        id: 'orig',
        staffId: 'anna',
        amount: new Prisma.Decimal('20'),
        currency: 'RUB',
        earnedOn: new Date('2026-09-15'),
        baseAmount: new Prisma.Decimal('50'),
        ratePercent: new Prisma.Decimal('40'),
        description: 'Стрижка',
        compensationPlanId: 'plan-1',
        bookingItemId: 'booking-item-1',
      },
    ]);
    db.staffEarning.findUnique.mockResolvedValue({ id: 'rev-1' });

    const reversal = await service.reverseForBooking(
      booking(),
      'Клиент отменил визит',
    );
    expect(reversal).toEqual([{ id: 'rev-1' }]);
    expect(db.staffEarning.upsert).not.toHaveBeenCalled();
  });

  it('adds only the delta when a completed booking price changes', async () => {
    const tx = {
      payrollPeriod: { findFirst: vi.fn().mockResolvedValue(null) },
      staffEarning: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { staffId: 'anna', amount: new Prisma.Decimal('20.00') },
          ]),
        upsert: vi.fn(({ create: data }) =>
          Promise.resolve({ id: 'adjustment-1', ...data }),
        ),
        findUnique: vi.fn(),
      },
    };
    compensation.resolveForDate.mockResolvedValue({
      id: 'plan-1',
    } as CompensationPlanWithRates);
    compensation.resolveServicePercent.mockReturnValue('40');

    const corrections = await service.syncForCompletedBooking(
      booking({
        items: [
          {
            ...booking().items[0],
            customPrice: new Prisma.Decimal('75.00'),
          },
        ],
      }),
      { name: 'Owner', role: AuditActorRole.OWNER },
      tx as never,
    );

    expect(corrections[0].amount.toFixed(2)).toBe('10.00');
    expect(tx.staffEarning.upsert).toHaveBeenCalledWith({
      where: expect.anything(),
      update: expect.anything(),
      create: expect.objectContaining({
        type: 'CORRECTION',
        bookingItemId: 'booking-item-1',
        amount: expect.anything(),
      }),
    });
  });

  it('restores the net commission when a reversed booking is completed again', async () => {
    const tx = {
      payrollPeriod: { findFirst: vi.fn().mockResolvedValue(null) },
      staffEarning: {
        findMany: vi.fn().mockResolvedValue([
          { staffId: 'anna', amount: new Prisma.Decimal('20.00') },
          { staffId: 'anna', amount: new Prisma.Decimal('-20.00') },
        ]),
        upsert: vi.fn(({ create: data }) =>
          Promise.resolve({ id: 'adjustment-1', ...data }),
        ),
        findUnique: vi.fn(),
      },
    };
    compensation.resolveForDate.mockResolvedValue({
      id: 'plan-1',
    } as CompensationPlanWithRates);
    compensation.resolveServicePercent.mockReturnValue('40');

    const corrections = await service.syncForCompletedBooking(
      booking(),
      { name: 'Owner', role: AuditActorRole.OWNER },
      tx as never,
    );

    expect(corrections[0].amount.toFixed(2)).toBe('20.00');
    expect(tx.staffEarning.upsert).toHaveBeenCalledWith({
      where: expect.anything(),
      update: expect.anything(),
      create: expect.objectContaining({
        type: 'CORRECTION',
        bookingItemId: 'booking-item-1',
        amount: expect.anything(),
      }),
    });
  });

  it('moves booking commission from the old staff member to the new one', async () => {
    const tx = {
      payrollPeriod: { findFirst: vi.fn().mockResolvedValue(null) },
      staffEarning: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { staffId: 'anna', amount: new Prisma.Decimal('20.00') },
          ]),
        upsert: vi.fn(({ create: data }) =>
          Promise.resolve({ id: `adjustment-${data.staffId}`, ...data }),
        ),
        findUnique: vi.fn(),
      },
    };
    compensation.resolveForDate.mockResolvedValue({
      id: 'plan-1',
    } as CompensationPlanWithRates);
    compensation.resolveServicePercent.mockReturnValue('40');

    const corrections = await service.syncForCompletedBooking(
      booking({
        items: [
          {
            ...booking().items[0],
            staffId: 'boris',
            staffName: 'Boris',
          },
        ],
      }),
      { name: 'Owner', role: AuditActorRole.OWNER },
      tx as never,
    );

    const byStaff = new Map(
      corrections.map((earning) => [
        earning.staffId,
        earning.amount.toFixed(2),
      ]),
    );
    expect(byStaff.get('anna')).toBe('-20.00');
    expect(byStaff.get('boris')).toBe('20.00');
  });

  it('materializes product commission from a final order line amount', async () => {
    const tx = {
      payrollPeriod: { findFirst: vi.fn().mockResolvedValue(null) },
      staffEarning: {
        upsert: vi.fn(({ create: data }) =>
          Promise.resolve({ id: 'earning-1', ...data }),
        ),
        findUnique: vi.fn(),
      },
      staffCompensationPlan: { findFirst: vi.fn() },
    };
    compensation.resolveForDate.mockResolvedValue({
      id: 'plan-1',
      productCommissionPercent: new Prisma.Decimal(10),
    } as CompensationPlanWithRates);

    const [earning] = await service.recordForProductOrder(
      'biz',
      'order-1',
      new Date('2026-09-15T10:00:00.000Z'),
      'RUB',
      [
        {
          orderItemId: 'order-item-1',
          staffId: 'anna',
          amount: new Prisma.Decimal(80),
          description: 'Shampoo',
        },
      ],
      tx as never,
    );

    expect(earning.amount.toFixed(2)).toBe('8.00');
    expect(tx.staffEarning.upsert).toHaveBeenCalledWith({
      where: expect.anything(),
      update: expect.anything(),
      create: expect.objectContaining({
        orderId: 'order-1',
        orderItemId: 'order-item-1',
        baseAmount: expect.anything(),
        idempotencyKey: 'order-item:order-item-1:PRODUCT_COMMISSION',
      }),
    });
  });

  it('creates a partial product commission reversal linked to an order return item', async () => {
    const tx = {
      payrollPeriod: { findFirst: vi.fn().mockResolvedValue(null) },
      staffEarning: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'earning-1',
              staffId: 'anna',
              amount: new Prisma.Decimal('10.00'),
              currency: 'RUB',
              earnedOn: new Date('2026-09-15T00:00:00.000Z'),
              baseAmount: new Prisma.Decimal('100.00'),
              ratePercent: new Prisma.Decimal('10.00'),
              description: 'Shampoo',
              compensationPlanId: 'plan-1',
              orderItemId: 'order-item-1',
            },
          ])
          .mockResolvedValueOnce([]),
        upsert: vi.fn(({ create: data }) =>
          Promise.resolve({ id: 'reversal-1', ...data }),
        ),
        findUnique: vi.fn(),
      },
    };

    const [reversal] = await service.reverseForProductOrderItemAmount(
      'biz',
      'order-1',
      'order-item-1',
      new Prisma.Decimal('30.00'),
      'customer returned part',
      { id: 'owner-1', name: 'Owner', role: AuditActorRole.OWNER },
      tx as never,
      'return-item-1',
    );

    expect(reversal.amount.toFixed(2)).toBe('-3.00');
    expect(tx.staffEarning.upsert).toHaveBeenCalledWith({
      where: expect.anything(),
      update: expect.anything(),
      create: expect.objectContaining({
        type: 'CORRECTION',
        source: 'PRODUCT_SALE',
        orderId: 'order-1',
        orderItemId: 'order-item-1',
        orderReturnItemId: 'return-item-1',
        baseAmount: expect.objectContaining({}),
        idempotencyKey:
          'order-item:order-item-1:PRODUCT_COMMISSION:reversal:30.00',
        reversesEarningId: null,
      }),
    });
    const data = tx.staffEarning.upsert.mock.calls[0][0].create;
    expect(data.baseAmount.toFixed(2)).toBe('30.00');
  });

  it('does not consult payroll locks when an order creates no commission', async () => {
    const tx = {
      payrollPeriod: { findFirst: vi.fn() },
      staffEarning: { upsert: vi.fn(), findUnique: vi.fn() },
    };
    compensation.resolveForDate.mockResolvedValue(null);

    await expect(
      service.recordForProductOrder(
        'biz',
        'order-1',
        new Date('2026-09-15T10:00:00.000Z'),
        'RUB',
        [
          {
            orderItemId: 'order-item-1',
            staffId: 'anna',
            amount: new Prisma.Decimal(80),
            description: 'Shampoo',
          },
        ],
        tx as never,
      ),
    ).resolves.toEqual([]);
    expect(tx.payrollPeriod.findFirst).not.toHaveBeenCalled();
  });

  it('offsets the second earnings page by a full page and breaks date ties by id', async () => {
    db.staffEarning.findMany.mockResolvedValue([]);
    db.staffEarning.count.mockResolvedValue(40);

    await service.searchByPeriod('period-1', {
      page: 2,
      pageSize: 25,
    } as PayrollPeriodEarningsRequestDto);

    expect(db.staffEarning.findMany).toHaveBeenCalledWith({
      where: {
        location: { deletedAt: null, brand: { deletedAt: null } },
        payrollResult: { periodId: 'period-1' },
      },
      orderBy: [{ earnedOn: 'desc' }, { id: 'desc' }],
      skip: 25,
      take: 25,
    });
  });
});
