import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { LocationService } from '../../location/services/location.service.js';
import { BookingRowVersion } from '../interfaces/booking-row-version.interface.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';

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

  async lockUnchangedBooking(
    tx: Prisma.TransactionClient,
    booking: BookingWithItems,
  ): Promise<void> {
    const rows = await tx.$queryRaw<
      BookingRowVersion[]
    >`SELECT "status", "updatedAt" FROM "Booking" WHERE "id" = ${booking.id} AND "locationId" = ${booking.locationId} AND "deletedAt" IS NULL FOR UPDATE`;
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
  }
}
