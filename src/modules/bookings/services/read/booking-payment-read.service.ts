import { Injectable } from '@nestjs/common';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { OrdersFacade } from '../../../orders/orders.facade.js';
import { PaymentsFacade } from '../../../payments/payments.facade.js';
import { VisitPaymentSummary } from '../../interfaces/visit-payment-summary.interface.js';
import { VisitSummaryBooking } from '../../interfaces/visit-summary-booking.interface.js';
import { visitServicesDue } from '../../rules/visit-payment-due.rules.js';

/** Payment of visits for cards and the calendar, read in batches. */
@Injectable()
export class BookingPaymentReadService {
  constructor(
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
    const totals = await this.payments.totalsByOrders(
      [...products.values()].map((row) => row.orderId),
    );
    const result = new Map<string, VisitPaymentSummary>();
    for (const booking of bookings) {
      const order = products.get(booking.id);
      const servicesAmount = visitServicesDue(booking);
      const productsAmount = order?.productsNet ?? MoneyUtils.decimal(0);
      result.set(booking.id, {
        bookingId: booking.id,
        orderId: order?.orderId ?? null,
        servicesAmount,
        productsAmount,
        amountDue: servicesAmount.plus(productsAmount),
        totals: order ? (totals.get(order.orderId) ?? null) : null,
      });
    }
    return result;
  }
}
