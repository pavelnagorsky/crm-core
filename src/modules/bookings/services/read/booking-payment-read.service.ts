import { Injectable } from '@nestjs/common';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { PaymentTracking } from '../../../location/interfaces/payment-tracking.interface.js';
import { LocationService } from '../../../location/services/location.service.js';
import { BookingOrderProducts } from '../../../orders/interfaces/booking-order-products.interface.js';
import { OrdersFacade } from '../../../orders/orders.facade.js';
import { OrderPaymentTotals } from '../../../payments/interfaces/order-payment-totals.interface.js';
import { PaymentsFacade } from '../../../payments/payments.facade.js';
import { isPaymentTracked } from '../../../payments/rules/payment-tracking.rules.js';
import { VisitPaymentSummary } from '../../interfaces/visit-payment-summary.interface.js';
import { VisitSummaryBooking } from '../../interfaces/visit-summary-booking.interface.js';
import { visitServicesDue } from '../../rules/visit-payment-due.rules.js';

/** Payment of visits for cards and the calendar, read in batches. */
@Injectable()
export class BookingPaymentReadService {
  constructor(
    private readonly locations: LocationService,
    private readonly orders: OrdersFacade,
    private readonly payments: PaymentsFacade,
  ) {}

  async summary(booking: VisitSummaryBooking): Promise<VisitPaymentSummary> {
    return (await this.summaries([booking])).get(booking.id)!;
  }

  /** Keyed by booking id; every given booking is present. */
  async summaries(
    bookings: readonly VisitSummaryBooking[],
  ): Promise<Map<string, VisitPaymentSummary>> {
    const products = await this.orders.productTotalsByBookings(
      bookings.map((booking) => booking.id),
    );
    const [totals, tracking] = await Promise.all([
      this.payments.totalsByOrders(
        [...products.values()].map((row) => row.orderId),
      ),
      this.trackingByLocation(bookings),
    ]);
    return new Map(
      bookings.map((booking) => {
        const order = products.get(booking.id);
        return [
          booking.id,
          this.toSummary(
            booking,
            order,
            order ? totals.get(order.orderId) : undefined,
            isPaymentTracked(tracking.get(booking.locationId)!, booking.startAt),
          ),
        ];
      }),
    );
  }

  /** Payment tracking of each location of the batch, usually one. */
  private async trackingByLocation(
    bookings: readonly VisitSummaryBooking[],
  ): Promise<Map<string, PaymentTracking>> {
    const locationIds = [
      ...new Set(bookings.map((booking) => booking.locationId)),
    ];
    const tracking = await Promise.all(
      locationIds.map((id) => this.locations.getPaymentTracking(id)),
    );
    return new Map(locationIds.map((id, index) => [id, tracking[index]]));
  }

  private toSummary(
    booking: VisitSummaryBooking,
    order: BookingOrderProducts | undefined,
    totals: OrderPaymentTotals | undefined,
    tracked: boolean,
  ): VisitPaymentSummary {
    const servicesAmount = visitServicesDue(booking);
    const productsAmount = order?.productsNet ?? MoneyUtils.decimal(0);
    return {
      bookingId: booking.id,
      orderId: order?.orderId ?? null,
      servicesAmount,
      productsAmount,
      amountDue: servicesAmount.plus(productsAmount),
      totals: totals ?? null,
      tracked,
      draftProductsCount: order?.draftProductsCount ?? 0,
    };
  }
}
