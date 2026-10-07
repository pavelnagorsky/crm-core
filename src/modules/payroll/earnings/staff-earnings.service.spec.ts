import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BookingSource, BookingStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { LocationService } from '../../location/location.service.js';
import { StaffService } from '../../staff/staff.service.js';
import { EarningCalculatorService } from './earning-calculator.service.js';
import type { CompensationPlanWithRates } from '../compensation/interfaces/compensation-plan-with-rates.interface.js';
import { StaffCompensationService } from '../compensation/staff-compensation.service.js';
import { PayrollPeriodEarningsRequestDto } from './dto/payroll-period-earnings-request.dto.js';
import { StaffEarningsService } from './staff-earnings.service.js';
import { BookingWithItems } from '../../bookings/interfaces/booking-with-items.interface.js';

function booking(
  overrides: Record<string, unknown> & {
    bookingPageId?: string | null;
    bookingWidgetId?: string | null;
    items?: BookingWithItems['items'];
  } = {},
): BookingWithItems {
  return {
    id: 'booking-1',
    locationId: 'biz',
    staffId: 'anna',
    serviceId: 'haircut',
    clientId: 'client',
    startAt: new Date('2026-09-15T10:00:00.000Z'),
    endAt: new Date('2026-09-15T11:00:00.000Z'),
    status: BookingStatus.COMPLETED,
    source: BookingSource.MANUAL,
    clientFirstName: 'A',
    clientLastName: 'B',
    clientPhone: '+79000000000',
    clientEmail: null,
    serviceTitle: 'Стрижка',
    serviceDuration: 60,
    servicePrice: new Prisma.Decimal('50.00'),
    customPrice: null,
    staffName: 'Anna',
    calendarEventId: null,
    notes: null,
    internalNotes: null,
    cancellationReason: null,
    cancelledBy: null,
    cancelledAt: null,
    reminderSentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
    bookingPageId: overrides.bookingPageId ?? null,
    bookingWidgetId: overrides.bookingWidgetId ?? null,
    items: overrides.items ?? [
      {
        id: 'booking-item-1',
        bookingId: 'booking-1',
        locationId: 'biz',
        serviceId: 'haircut',
        staffId: 'anna',
        sortOrder: 0,
        startAt: new Date('2026-09-15T10:00:00.000Z'),
        endAt: new Date('2026-09-15T11:00:00.000Z'),
        serviceTitle: 'РЎС‚СЂРёР¶РєР°',
        serviceDuration: 60,
        listPrice: new Prisma.Decimal('50.00'),
        chargedPrice: new Prisma.Decimal('50.00'),
        customPrice: null,
        staffName: 'Anna',
        calendarEventId: null,
      },
    ],
  } as unknown as BookingWithItems;
}

describe('StaffEarningsService', () => {
  const db = {
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    staffEarning: {
      create: vi.fn(),
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
        EarningCalculatorService,
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
    expect(db.staffEarning.create).not.toHaveBeenCalled();
  });

  it('creates a snapshot earning from the booking price and applicable percent', async () => {
    compensation.resolveForDate.mockResolvedValue({
      id: 'plan-1',
    } as CompensationPlanWithRates);
    compensation.resolveServicePercent.mockReturnValue('40');
    db.staffEarning.create.mockImplementation(
      ({ data }: { data: { amount: Prisma.Decimal } }) =>
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
    expect(db.staffEarning.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
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
    expect(db.staffEarning.create).not.toHaveBeenCalled();
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
        create: vi.fn(({ data }) =>
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
      { name: 'Owner' },
      tx as never,
    );

    expect(corrections[0].amount.toFixed(2)).toBe('10.00');
    expect(tx.staffEarning.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'CORRECTION',
        bookingItemId: 'booking-item-1',
        amount: expect.anything(),
      }),
    });
  });

  it('materializes product commission from a final order line amount', async () => {
    const tx = {
      payrollPeriod: { findFirst: vi.fn().mockResolvedValue(null) },
      staffEarning: {
        create: vi.fn(({ data }) =>
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
    expect(tx.staffEarning.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        orderItemId: 'order-item-1',
        baseAmount: expect.anything(),
        idempotencyKey: 'order-item:order-item-1:PRODUCT_COMMISSION',
      }),
    });
  });

  it('does not consult payroll locks when an order creates no commission', async () => {
    const tx = {
      payrollPeriod: { findFirst: vi.fn() },
      staffEarning: { create: vi.fn(), findUnique: vi.fn() },
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
      where: { payrollResult: { periodId: 'period-1' } },
      orderBy: [{ earnedOn: 'desc' }, { id: 'desc' }],
      skip: 25,
      take: 25,
    });
  });
});
