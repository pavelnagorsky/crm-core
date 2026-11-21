import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { BookingVisitsService } from '../../bookings/visits/services/booking-visits.service.js';
import { VisitPaymentFacts } from '../../bookings/visits/interfaces/visit-payment-facts.interface.js';
import { LockedOrder } from '../interfaces/locked-order.interface.js';
import { OrderPersistenceService } from './order-persistence.service.js';

/**
 * Entry locks of order money operations, in the global lock order: the booking of a visit
 * order first (FOR SHARE, which keeps its status, prices, masters and deletion stable), then
 * the order (FOR UPDATE).
 */
@Injectable()
export class OrderLockService {
  constructor(
    private readonly persistence: OrderPersistenceService,
    private readonly visits: BookingVisitsService,
  ) {}

  /** An order by id with the facts of its visit (null for a sale). 404 for an unknown order. */
  async lockOrderWithVisit(
    tx: Prisma.TransactionClient,
    locationId: string,
    orderId: string,
  ): Promise<LockedOrder> {
    // The booking of an order never changes, so it can be read before the locks.
    const bookingId = await this.persistence.findBookingIdInTransaction(
      tx,
      locationId,
      orderId,
    );
    const visit = bookingId
      ? await this.visits.lockForOrder(tx, locationId, bookingId)
      : null;
    await this.persistence.lockOrder(tx, orderId);
    const order = await this.persistence.findInTransaction(
      tx,
      locationId,
      orderId,
    );
    return { order, visit };
  }

  /**
   * The visit order of a live booking with the facts of the visit. 404 Booking not found for a
   * missing or deleted booking, 404 PAYMENT_OPERATION_NOT_FOUND for a visit without an order.
   * The order of a booking never changes, so it is found before its lock.
   */
  async lockVisitOrder(
    tx: Prisma.TransactionClient,
    locationId: string,
    bookingId: string,
  ): Promise<LockedOrder & { visit: VisitPaymentFacts }> {
    const visit = await this.visits.lockForOrder(tx, locationId, bookingId);
    if (!visit || visit.deleted)
      throw new NotFoundException('Booking not found');
    const found = await this.persistence.findForBookingInTransaction(
      tx,
      locationId,
      bookingId,
    );
    if (!found)
      throw new AppException(
        ErrorCode.PAYMENT_OPERATION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    await this.persistence.lockOrder(tx, found.id);
    return { order: found, visit };
  }
}
