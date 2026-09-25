import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Booking, BookingSource, BookingStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { BusinessService } from '../../business/business.service.js';
import { StaffService } from '../../staff/staff.service.js';
import { EarningCalculatorService } from './earning-calculator.service.js';
import type { CompensationPlanWithRates } from '../compensation/interfaces/compensation-plan-with-rates.interface.js';
import { StaffCompensationService } from '../compensation/staff-compensation.service.js';
import { StaffEarningsService } from './staff-earnings.service.js';

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    businessId: 'biz',
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
  };
}

describe('StaffEarningsService', () => {
  const db = {
    staffEarning: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  const compensation = {
    resolveForDate: vi.fn(),
    resolveServicePercent: vi.fn(),
  };
  const business = {
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
        { provide: BusinessService, useValue: business },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
      ],
    }).compile();
    service = module.get(StaffEarningsService);
  });

  it('skips a completed booking when payroll is not configured', async () => {
    compensation.resolveForDate.mockResolvedValue(null);
    await expect(service.recordForCompletedBooking(booking())).resolves.toBeNull();
    expect(db.staffEarning.create).not.toHaveBeenCalled();
  });

  it('creates a snapshot earning from the booking price and applicable percent', async () => {
    compensation.resolveForDate.mockResolvedValue({ id: 'plan-1' } as CompensationPlanWithRates);
    compensation.resolveServicePercent.mockReturnValue('40');
    db.staffEarning.create.mockImplementation(({ data }: { data: { amount: Prisma.Decimal } }) =>
      Promise.resolve({ id: 'earn-1', ...data }),
    );

    const created = await service.recordForCompletedBooking(
      booking({ customPrice: new Prisma.Decimal('50.00') }),
    );

    expect(created?.amount.toString()).toBe('20');
    expect(db.staffEarning.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: 'booking:booking-1:SERVICE_COMMISSION',
        baseAmount: expect.anything(),
        ratePercent: expect.anything(),
        currency: 'RUB',
      }),
    });
  });

  it('does not fail the booking flow when earning persistence throws', async () => {
    compensation.resolveForDate.mockRejectedValue(new Error('db down'));
    await expect(service.recordForCompletedBooking(booking())).resolves.toBeNull();
  });

  it('reuses an existing reversal instead of inserting a second one', async () => {
    db.staffEarning.findFirst.mockResolvedValue({
      id: 'orig',
      staffId: 'anna',
      amount: new Prisma.Decimal('20'),
      currency: 'RUB',
      earnedOn: new Date('2026-09-15'),
      baseAmount: new Prisma.Decimal('50'),
      ratePercent: new Prisma.Decimal('40'),
      description: 'Стрижка',
      compensationPlanId: 'plan-1',
    });
    db.staffEarning.findUnique.mockResolvedValue({ id: 'rev-1' });

    const reversal = await service.reverseForBooking(booking(), 'Клиент отменил визит');
    expect(reversal).toEqual({ id: 'rev-1' });
    expect(db.staffEarning.create).not.toHaveBeenCalled();
  });
});
