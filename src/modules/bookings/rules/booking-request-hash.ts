import { createHash } from 'node:crypto';
import { CreateBookingDto } from '../dto/create-booking.dto.js';
import { BookingAttribution } from '../interfaces/booking-attribution.interface.js';

/** Hash guest intent before resolving mutable prices, client profiles or available staff. */
export function bookingRequestHash(
  locationId: string,
  dto: CreateBookingDto,
  attribution: BookingAttribution,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        locationId,
        source: attribution.source,
        bookingPageId: attribution.bookingPageId,
        bookingWidgetId: attribution.bookingWidgetId,
        bundleId: dto.bundleId ?? null,
        serviceIds: dto.serviceIds?.length
          ? dto.serviceIds
          : dto.serviceId
            ? [dto.serviceId]
            : [],
        startAt: dto.startAt,
        staffId: dto.staffId ?? null,
        staffAssignments: (dto.staffAssignments ?? [])
          .map(({ serviceId, staffId }) => ({
            serviceId,
            staffId: staffId ?? null,
          }))
          .sort(
            (a, b) =>
              a.serviceId.localeCompare(b.serviceId) ||
              (a.staffId ?? '').localeCompare(b.staffId ?? ''),
          ),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName?.trim() || null,
        phone: dto.phone.trim(),
        email: dto.email ?? null,
        notes: dto.notes ?? null,
      }),
    )
    .digest('hex');
}
