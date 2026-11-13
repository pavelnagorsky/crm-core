import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { LocationService } from '../../location/services/location.service.js';
import { BookingRowVersion } from '../interfaces/booking-row-version.interface.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';
import { ClientNoticeState } from '../interfaces/client-notice-state.interface.js';

@Injectable()
export class BookingWriteLockService {
  constructor(private readonly locationService: LocationService) {}

  async lockActiveLocation(
    locationId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (
      !(await this.locationService.acquireActiveOperationLock(locationId, tx))
    ) {
      throw new NotFoundException('Location not found');
    }
  }

  /**
   * Returns the locked pending client email: the cron clears it without touching `updatedAt`,
   * so the copy loaded before the lock may be stale.
   */
  async lockUnchangedBooking(
    tx: Prisma.TransactionClient,
    booking: BookingWithItems,
  ): Promise<ClientNoticeState> {
    const rows = await tx.$queryRaw<
      BookingRowVersion[]
    >`SELECT "status", "updatedAt", "clientNoticeAt", "clientNoticeType", "clientNoticeFromStartAt" FROM "Booking" WHERE "id" = ${booking.id} AND "locationId" = ${booking.locationId} AND "deletedAt" IS NULL FOR UPDATE`;
    if (
      !rows[0] ||
      rows[0].status !== booking.status ||
      rows[0].updatedAt.getTime() !== booking.updatedAt.getTime()
    ) {
      throw new AppException(
        ErrorCode.BOOKING_CONCURRENT_UPDATE,
        HttpStatus.CONFLICT,
      );
    }
    const { clientNoticeAt, clientNoticeType, clientNoticeFromStartAt } =
      rows[0];
    return { clientNoticeAt, clientNoticeType, clientNoticeFromStartAt };
  }
}
