import { Injectable } from '@nestjs/common';
import { Order } from '@prisma/client';
import { BookingVisitsService } from '../../bookings/visits/services/booking-visits.service.js';
import { LocationService } from '../../location/services/location.service.js';
import { isPaymentTracked } from '../../payments/rules/payment-tracking.rules.js';
import { orderPaymentMoment } from '../rules/order-payment-tracking.rules.js';

/** Whether orders are in payment tracking of their location, for `OrderResponseDto.payment`. */
@Injectable()
export class OrderPaymentTrackingService {
  constructor(
    private readonly locations: LocationService,
    private readonly visits: BookingVisitsService,
  ) {}

  /** Keyed by order id; every given order is present. */
  async trackedByOrder(
    locationId: string,
    orders: readonly Pick<Order, 'id' | 'bookingId' | 'occurredAt'>[],
  ): Promise<Map<string, boolean>> {
    const bookingIds = orders.flatMap((order) =>
      order.bookingId ? [order.bookingId] : [],
    );
    const [tracking, startAt] = await Promise.all([
      this.locations.getPaymentTracking(locationId),
      this.visits.startAtByBookingIds(locationId, bookingIds),
    ]);
    return new Map(
      orders.map((order) => [
        order.id,
        isPaymentTracked(
          tracking,
          orderPaymentMoment(
            order,
            order.bookingId ? startAt.get(order.bookingId) : undefined,
          ),
        ),
      ]),
    );
  }
}
