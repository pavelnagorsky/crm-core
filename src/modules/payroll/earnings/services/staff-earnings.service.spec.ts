import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { BookingStatus, CommissionBase, Prisma } from '@prisma/client';
import { bookingItemPrices } from '../../../bookings/testing/factories/booking-item-prices.factory.js';
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

  it('uses the allocated bundle price and separate idempotency keys for each actual master', async () => {
    compensation.resolveForDate.mockResolvedValue({ id: 'plan-1' });
    compensation.resolveServicePercent.mockReturnValue('40');
    db.staffEarning.upsert.mockImplementation(({ create: data }) =>
      Promise.resolve({ id: data.idempotencyKey, ...data }),
    );
    const first = {
      ...booking().items[0],
      ...bookingItemPrices('48'),
    };
    const second = {
      ...first,
      id: 'booking-item-2',
      staffId: 'boris',
      ...bookingItemPrices('72'),
    };
    const visit = booking({
      executionMode: 'PARALLEL',
      bundleId: 'bundle',
      items: [first, second],
    });
    const result = await service.recordForCompletedBooking(visit, db as never);
    expect(
      result.map((item) => [
        item.staffId,
        item.baseAmount?.toString(),
        item.amount.toString(),
      ]),
    ).toEqual([
      ['anna', '48', '19.2'],
      ['boris', '72', '28.8'],
    ]);
    await service.recordForCompletedBooking(visit, db as never);
    const calls = db.staffEarning.upsert.mock.calls.map(
      ([args]) => args.where.locationId_idempotencyKey.idempotencyKey,
    );
    expect(calls).toEqual([
      'booking-item:booking-item-1:SERVICE_COMMISSION',
      'booking-item:booking-item-2:SERVICE_COMMISSION',
      'booking-item:booking-item-1:SERVICE_COMMISSION',
      'booking-item:booking-item-2:SERVICE_COMMISSION',
    ]);
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
          listAmount: new Prisma.Decimal(80),
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

  describe('commission base', () => {
    const discounted = (customPrice: string | null = null) =>
      booking({
        items: [
          {
            ...booking().items[0],
            ...bookingItemPrices('100.00', '20.00'),
            customPrice: customPrice ? new Prisma.Decimal(customPrice) : null,
          },
        ],
      });

    const planWith = (commissionBase: CommissionBase | undefined) =>
      compensation.resolveForDate.mockResolvedValue({
        id: 'plan-1',
        commissionBase,
        productCommissionPercent: new Prisma.Decimal(10),
      } as CompensationPlanWithRates);

    const echoUpsert = () =>
      db.staffEarning.upsert.mockImplementation(({ create: data }) =>
        Promise.resolve({ id: 'earn-1', ...data }),
      );

    it.each([
      [undefined, null, '80', '32'],
      [CommissionBase.CHARGED, null, '80', '32'],
      [CommissionBase.LIST, null, '100', '40'],
      [CommissionBase.CHARGED, '60.00', '60', '24'],
      [CommissionBase.LIST, '60.00', '100', '40'],
      [CommissionBase.CHARGED, '130.00', '130', '52'],
      [CommissionBase.LIST, '130.00', '130', '52'],
    ])(
      'takes a booking commission from the right price (plan %s, own price %s)',
      async (commissionBase, customPrice, expectedBase, expectedAmount) => {
        planWith(commissionBase);
        compensation.resolveServicePercent.mockReturnValue('40');
        echoUpsert();

        const [earning] = await service.recordForCompletedBooking(
          discounted(customPrice),
          db as never,
        );

        expect(earning.baseAmount?.toString()).toBe(expectedBase);
        expect(earning.amount.toString()).toBe(expectedAmount);
      },
    );

    const syncTx = () => ({
      payrollPeriod: { findFirst: vi.fn().mockResolvedValue(null) },
      staffEarning: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { staffId: 'anna', amount: new Prisma.Decimal('40.00') },
          ]),
        upsert: vi.fn(({ create: data }) =>
          Promise.resolve({ id: 'adjustment-1', ...data }),
        ),
        findUnique: vi.fn(),
      },
    });

    it('corrects a changed booking against the list price base', async () => {
      const tx = syncTx();
      planWith(CommissionBase.LIST);
      compensation.resolveServicePercent.mockReturnValue('40');

      // Own price 130 is above the list price 100: the base grows from 100 to 130.
      const corrections = await service.syncForCompletedBooking(
        discounted('130.00'),
        { name: 'Owner', role: AuditActorRole.OWNER },
        tx as never,
      );

      expect(corrections[0].amount.toFixed(2)).toBe('12.00');
      expect(corrections[0].baseAmount?.toString()).toBe('130');
    });

    it('does not correct a booking whose list price commission is unchanged', async () => {
      const tx = syncTx();
      planWith(CommissionBase.LIST);
      compensation.resolveServicePercent.mockReturnValue('40');

      // The own price 60 is below the list price: the LIST base stays 100.
      await expect(
        service.syncForCompletedBooking(
          discounted('60.00'),
          { name: 'Owner', role: AuditActorRole.OWNER },
          tx as never,
        ),
      ).resolves.toEqual([]);
      expect(tx.staffEarning.upsert).not.toHaveBeenCalled();
    });

    const productTx = () => ({
      payrollPeriod: { findFirst: vi.fn().mockResolvedValue(null) },
      staffEarning: {
        upsert: vi.fn(({ create: data }) =>
          Promise.resolve({ id: 'earning-1', ...data }),
        ),
        findUnique: vi.fn(),
      },
    });

    it.each([
      [undefined, '80', '100', '80', '8'],
      [CommissionBase.CHARGED, '80', '100', '80', '8'],
      [CommissionBase.LIST, '80', '100', '100', '10'],
      [CommissionBase.LIST, '130', '100', '130', '13'],
    ])(
      'takes a product commission from the right base (plan %s, line %s, list %s)',
      async (commissionBase, amount, listAmount, expectedBase, expected) => {
        planWith(commissionBase);

        const [earning] = await service.recordForProductOrder(
          'biz',
          'order-1',
          new Date('2026-09-15T10:00:00.000Z'),
          'RUB',
          [
            {
              orderItemId: 'order-item-1',
              staffId: 'anna',
              amount: new Prisma.Decimal(amount),
              listAmount: new Prisma.Decimal(listAmount),
              description: 'Shampoo',
            },
          ],
          productTx() as never,
        );

        expect(earning.baseAmount?.toString()).toBe(expectedBase);
        expect(earning.amount.toString()).toBe(expected);
      },
    );

    const reversalTx = (reversedBases: string[], originalBase = '100.00') => ({
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
              baseAmount: new Prisma.Decimal(originalBase),
              ratePercent: new Prisma.Decimal('10.00'),
              description: 'Shampoo',
              compensationPlanId: 'plan-1',
              orderItemId: 'order-item-1',
            },
          ])
          .mockResolvedValueOnce(
            reversedBases.map((base) => ({
              baseAmount: new Prisma.Decimal(`-${base}`),
            })),
          ),
        upsert: vi.fn(({ create: data }) =>
          Promise.resolve({ id: 'reversal-1', ...data }),
        ),
        findUnique: vi.fn(),
      },
    });

    // A line of 4 pcs sold for 80.00 (list 100.00): the LIST earning base is 100.00.
    const returnOf = (
      tx: ReturnType<typeof reversalTx>,
      quantity: string,
      returnedLineTotal: string,
      returnedQuantity: string,
    ) =>
      service.reverseForProductOrderItemAmount(
        'biz',
        'order-1',
        'order-item-1',
        new Prisma.Decimal(returnedLineTotal),
        'customer returned part',
        { id: 'owner-1', name: 'Owner', role: AuditActorRole.OWNER },
        tx as never,
        'return-item-1',
        {
          lineQuantity: new Prisma.Decimal(4),
          lineTotal: new Prisma.Decimal('80.00'),
          returnedQuantity: new Prisma.Decimal(returnedQuantity),
          quantity: new Prisma.Decimal(quantity),
        },
      );

    it('reverses the same share of the list price base on a partial return', async () => {
      const [reversal] = await returnOf(reversalTx([]), '1', '20.00', '0');

      expect(reversal.baseAmount?.toFixed(2)).toBe('25.00');
      expect(reversal.amount.toFixed(2)).toBe('-2.50');
      expect(reversal.reversesEarningId).toBeNull();
    });

    it('reverses the rest of the list price base on the return that completes the line', async () => {
      const [reversal] = await returnOf(
        reversalTx(['25.00']),
        '3',
        '60.00',
        '1',
      );

      expect(reversal.baseAmount?.toFixed(2)).toBe('75.00');
      expect(reversal.amount.toFixed(2)).toBe('-7.50');
    });

    it('keeps reversing the returned line total when the base is the line total', async () => {
      const [reversal] = await returnOf(
        reversalTx([], '80.00'),
        '1',
        '20.00',
        '0',
      );

      expect(reversal.baseAmount?.toFixed(2)).toBe('20.00');
      expect(reversal.amount.toFixed(2)).toBe('-2.00');
    });
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
            listAmount: new Prisma.Decimal(80),
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
