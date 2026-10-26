import {
  BookingExecutionMode,
  BookingSource,
  BookingStatus,
  Prisma,
} from '@prisma/client';
import { BookingWithItems } from '../../interfaces/booking-with-items.interface.js';
import { BookingFixtureOptions } from '../interfaces/booking-fixture-options.interface.js';

export function booking(options: BookingFixtureOptions = {}): BookingWithItems {
  const { item, ...overrides } = options;
  const id = overrides.id ?? 'booking-1';
  const locationId = overrides.locationId ?? 'biz';
  const startAt = overrides.startAt ?? new Date('2026-09-24T10:00:00Z');
  const endAt = overrides.endAt ?? new Date('2026-09-24T11:00:00Z');
  return {
    id,
    locationId,
    startAt,
    endAt,
    clientId: 'client',
    status: BookingStatus.CONFIRMED,
    source: BookingSource.MANUAL,
    isCustomTime: false,
    executionMode: BookingExecutionMode.SEQUENTIAL,
    bundleId: null,
    clientFirstName: 'A',
    clientLastName: 'B',
    clientPhone: '+79000000000',
    clientEmail: null,
    notes: null,
    internalNotes: null,
    cancellationReason: null,
    cancelledBy: null,
    cancelledAt: null,
    reminderSentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    bookingPageId: null,
    bookingWidgetId: null,
    ...overrides,
    items: overrides.items ?? [
      {
        id: `${id}-item-1`,
        bookingId: id,
        locationId,
        serviceId: 'haircut',
        staffId: 'anna',
        sortOrder: 0,
        startAt,
        endAt,
        serviceTitle: 'Стрижка',
        serviceDuration: 60,
        listPrice: item?.chargedPrice ?? new Prisma.Decimal('50.00'),
        chargedPrice: new Prisma.Decimal('50.00'),
        customPrice: null,
        staffName: 'Anna',
        calendarEventId: null,
        ...item,
      },
    ],
  };
}
