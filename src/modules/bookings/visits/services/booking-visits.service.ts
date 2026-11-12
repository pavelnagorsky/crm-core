import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../database/database.service.js';
import { BookingVisit } from '../interfaces/booking-visit.interface.js';

@Injectable()
export class BookingVisitsService {
  constructor(private readonly db: DatabaseService) {}

  /** Visits of the location's bookings by id; deleted bookings are absent. */
  async findByBookingIds(
    locationId: string,
    bookingIds: readonly string[],
  ): Promise<Map<string, BookingVisit>> {
    if (bookingIds.length === 0) return new Map();
    const bookings = await this.db.booking.findMany({
      where: { id: { in: [...bookingIds] }, locationId, deletedAt: null },
      select: {
        id: true,
        startAt: true,
        items: {
          select: { serviceId: true, serviceTitle: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    return new Map(
      bookings.map((booking) => [
        booking.id,
        {
          startAt: booking.startAt,
          services: booking.items.map((item) => ({
            id: item.serviceId,
            name: item.serviceTitle,
          })),
        },
      ]),
    );
  }
}
