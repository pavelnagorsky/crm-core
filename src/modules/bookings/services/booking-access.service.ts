import { ForbiddenException, Injectable } from '@nestjs/common';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read, Write } from '../../access/utils/permission.js';
import { hasPermission } from '../../access/utils/assert-permission.js';
import { canReadBrandClients } from '../../access/utils/can-read-brand-clients.js';
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
      Read(Claim.BOOKING),
      Read(Claim.BOOKING_OWN),
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

  /** Own staff profile when the caller creates only bookings they take part in; undefined for booking:write. */
  createStaffId(
    token: TokenPayloadDto,
    locationId: string,
  ): Promise<string | undefined> {
    return this.staffAccess.resolveStaffId(
      token,
      locationId,
      Write(Claim.BOOKING),
      Write(Claim.BOOKING_OWN),
    );
  }

  async assertManage(
    token: TokenPayloadDto,
    booking: BookingWithItems,
  ): Promise<void> {
    await this.assertManageParticipant(token, booking);
  }

  /**
   * As `assertManage`; returns the caller's own staff profile when they may manage only
   * bookings they take part in (booking.own:write), so that a write checks it again on the
   * locked booking. Undefined for booking:write.
   */
  async assertManageParticipant(
    token: TokenPayloadDto,
    booking: BookingWithItems,
  ): Promise<string | undefined> {
    const staffId = await this.staffAccess.resolveStaffId(
      token,
      booking.locationId,
      Write(Claim.BOOKING),
      Write(Claim.BOOKING_OWN),
    );
    this.assertParticipant(booking, staffId);
    return staffId;
  }

  async assertEdit(
    token: TokenPayloadDto,
    booking: BookingWithItems,
  ): Promise<void> {
    await this.assertManage(token, booking);
    if (
      booking.status === BookingStatus.COMPLETED &&
      !hasPermission(token, Write(Claim.BOOKING), booking.locationId)
    ) {
      throw new ForbiddenException(
        'Completed bookings can only be edited by a manager or owner',
      );
    }
  }

  /** Client history follows client reading: client:read, or creating bookings in the brand. */
  assertClientRead(token: TokenPayloadDto, brandId: string): void {
    if (!canReadBrandClients(token, brandId))
      throw new ForbiddenException('Access denied');
  }

  /** Reviews are a separate permission: staff reading their own bookings do not see them. */
  canReadReview(token: TokenPayloadDto, locationId: string): boolean {
    return hasPermission(token, Read(Claim.REVIEW), locationId);
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
