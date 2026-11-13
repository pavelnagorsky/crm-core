import { ApiProperty } from '@nestjs/swagger';
import { IdResponseDto } from '../../../shared/dto/id-response.dto.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';
import { BookingClientNoticeDto } from './booking-client-notice.dto.js';

export class BookingWriteResponseDto extends IdResponseDto {
  @ApiProperty({
    type: () => BookingClientNoticeDto,
    nullable: true,
    description:
      'The email this change queued for the client; null when the client will not be emailed',
  })
  clientNotice: BookingClientNoticeDto | null;

  static fromBooking(booking: BookingWithItems): BookingWriteResponseDto {
    return Object.assign(new BookingWriteResponseDto(), {
      id: booking.id,
      clientNotice: BookingClientNoticeDto.fromBooking(booking),
    });
  }
}
