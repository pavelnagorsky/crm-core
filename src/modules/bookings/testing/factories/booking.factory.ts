import {
  BookingExecutionMode,
  BookingChannel,
  BookingItem,
  BookingStatus,
} from '@prisma/client';
import { BookingWithItems } from '../../interfaces/booking-with-items.interface.js';
import { BookingFixtureOptions } from '../interfaces/booking-fixture-options.interface.js';
import { bookingItemPrices } from './booking-item-prices.factory.js';

/** Every fixture item obeys the database CHECK chargedPrice = listPrice - discountTotal. */
function assertPriceLayers(item: BookingItem): void {
  if (!item.chargedPrice.equals(item.listPrice.minus(item.discountTotal)))
    throw new Error(
      `Booking item fixture ${item.id}: chargedPrice ${item.chargedPrice.toString()} is not listPrice ${item.listPrice.toString()} - discountTotal ${item.discountTotal.toString()}; pass the layers with bookingItemPrices()`,
    );
}

export function booking(options: BookingFixtureOptions = {}): BookingWithItems {
  const { item, ...overrides } = options;
  const id = overrides.id ?? 'booking-1';
  const locationId = overrides.locationId ?? 'biz';
  const startAt = overrides.startAt ?? new Date('2026-09-24T10:00:00Z');
  const endAt = overrides.endAt ?? new Date('2026-09-24T11:00:00Z');
  const defaultItem: BookingItem = {
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
    ...bookingItemPrices('50.00'),
    customPrice: null,
    staffName: 'Anna',
    calendarEventId: null,
    discountChoice: null,
    discountChoiceRuleId: null,
    ...item,
  };
  const items = overrides.items ?? [defaultItem];
  items.forEach(assertPriceLayers);
  return {
    id,
    locationId,
    startAt,
    endAt,
    clientId: 'client',
    status: BookingStatus.CONFIRMED,
    channel: BookingChannel.MANUAL,
    trafficSource: null,
    trafficSourceDetail: null,
    isCustomTime: false,
    executionMode: BookingExecutionMode.SEQUENTIAL,
    bundleId: null,
    clientFirstName: 'A',
    clientLastName: 'B',
    clientPhone: '+79000000000',
    clientEmail: null,
    notes: null,
    internalNotes: null,
    promoCode: null,
    cancellationReason: null,
    cancelledBy: null,
    cancelledAt: null,
    reminderDueAt: null,
    reminderSentAt: null,
    reviewRequestSentAt: null,
    notifyClient: true,
    clientNoticeAt: null,
    clientNoticeType: null,
    clientNoticeFromStartAt: null,
    clientNoticeFromTotal: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    bookingPageId: null,
    bookingWidgetId: null,
    idempotencyKey: null,
    creationRequestHash: null,
    ...overrides,
    items,
  };
}
