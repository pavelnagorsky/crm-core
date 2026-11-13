import { ApiProperty } from '@nestjs/swagger';
import { ClientNoticeType } from '@prisma/client';
import { ClientNoticeState } from '../interfaces/client-notice-state.interface.js';

/** An email to the client that waits out the undo window after a staff change. */
export class BookingClientNoticeDto {
  @ApiProperty({
    enum: ClientNoticeType,
    description:
      'CREATED: the booking confirmation; RESCHEDULED: the new time after staff moved it',
  })
  type: ClientNoticeType;

  @ApiProperty({
    type: Date,
    description:
      'When the email goes out, UTC. Moving the booking back before then cancels it',
  })
  sendAt: Date;

  static fromBooking(
    booking: ClientNoticeState,
  ): BookingClientNoticeDto | null {
    if (!booking.clientNoticeAt || !booking.clientNoticeType) return null;
    return Object.assign(new BookingClientNoticeDto(), {
      type: booking.clientNoticeType,
      sendAt: booking.clientNoticeAt,
    });
  }
}
