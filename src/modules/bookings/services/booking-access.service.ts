import { ForbiddenException, Injectable } from '@nestjs/common';
import { Permission } from '../../access/enums/permission.enum.js';
import { hasPermission } from '../../access/utils/assert-permission.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { StaffAccessService } from '../../staff/services/staff-access.service.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';

@Injectable()
export class BookingAccessService {
  constructor(private readonly staffAccess: StaffAccessService) {}

  readStaffId(
    token: TokenPayloadDto,
    locationId: string,
  ): Promise<string | undefined> {
    return this.staffAccess.resolveStaffId(
      token,
      locationId,
      Permission.BOOKING_READ,
      Permission.BOOKING_READ_OWN,
    );
  }

  async assertRead(
    token: TokenPayloadDto,
    booking: BookingWithItems,
  ): Promise<void> {
    this.assertParticipant(
      booking,
      await this.readStaffId(token, booking.locationId),
    );
  }

  async assertManage(
    token: TokenPayloadDto,
    booking: BookingWithItems,
  ): Promise<void> {
    const staffId = await this.staffAccess.resolveStaffId(
      token,
      booking.locationId,
      Permission.BOOKING_MANAGE,
      Permission.BOOKING_MANAGE_OWN,
    );
    this.assertParticipant(booking, staffId);
  }

  async assertEdit(
    token: TokenPayloadDto,
    booking: BookingWithItems,
  ): Promise<void> {
    await this.assertManage(token, booking);
    if (
      booking.status === BookingStatus.COMPLETED &&
      !hasPermission(token, Permission.BOOKING_MANAGE, booking.locationId)
    ) {
      throw new ForbiddenException(
        'Completed bookings can only be edited by a manager or owner',
      );
    }
  }

  private assertParticipant(
    booking: BookingWithItems,
    staffId: string | undefined,
  ): void {
    if (staffId && !booking.items.some((item) => item.staffId === staffId)) {
      throw new ForbiddenException('Access denied');
    }
  }
}
