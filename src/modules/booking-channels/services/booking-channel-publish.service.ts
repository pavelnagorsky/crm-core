import { HttpStatus, Injectable } from '@nestjs/common';
import { BookingVisibility } from '@prisma/client';
import { LocationService } from '../../location/location.service.js';
import { ServicesService } from '../../services/services.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { BookingChannelStatus } from '../enums/booking-channel-status.enum.js';

export function publishedAtFor(status: BookingChannelStatus): Date | null {
  return status === BookingChannelStatus.PUBLISHED ? new Date() : null;
}

@Injectable()
export class BookingChannelPublishService {
  constructor(
    private readonly locationService: LocationService,
    private readonly servicesService: ServicesService,
  ) {}

  async assertTransition(
    locationId: string,
    current: BookingChannelStatus,
    next: BookingChannelStatus,
  ): Promise<void> {
    if (current === next) {
      throw new AppException(
        ErrorCode.BOOKING_CHANNEL_STATUS_ALREADY_SET,
        HttpStatus.CONFLICT,
      );
    }
    if (next === BookingChannelStatus.PUBLISHED)
      await this.assertCanPublish(locationId);
  }

  private async assertCanPublish(locationId: string): Promise<void> {
    const location = await this.locationService.findById(locationId);
    if (location.bookingVisibility === BookingVisibility.PRIVATE) {
      throw new AppException(
        ErrorCode.BOOKING_CHANNEL_CLOSED,
        HttpStatus.CONFLICT,
      );
    }
    const bookable = await this.servicesService.countBookable(locationId);
    if (bookable === 0) {
      throw new AppException(
        ErrorCode.BOOKING_CHANNEL_NOT_BOOKABLE,
        HttpStatus.CONFLICT,
      );
    }
  }
}
