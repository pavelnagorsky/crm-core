import { HttpStatus, Injectable } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';

@Injectable()
export class BookingDeletionPolicyService {
  async assertLocationDeletionAllowed(
    locationId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.assertNoOpenBookings({ locationId }, tx);
  }

  async assertBrandDeletionAllowed(
    brandId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.assertNoOpenBookings(
      { location: { brandId, deletedAt: null } },
      tx,
    );
  }

  private async assertNoOpenBookings(
    scope: Prisma.BookingWhereInput,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const openBookingsCount = await tx.booking.count({
      where: {
        ...scope,
        deletedAt: null,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        endAt: { gt: new Date() },
      },
    });
    if (openBookingsCount > 0) {
      throw new AppException(
        ErrorCode.BUSINESS_HAS_OPEN_BOOKINGS,
        HttpStatus.CONFLICT,
        { openBookingsCount },
      );
    }
  }
}
