import { ApiProperty } from '@nestjs/swagger';
import { ReviewResponseDto } from '../../reviews/dto/review-response.dto.js';
import { ReviewWithStaff } from '../../reviews/interfaces/review-with-staff.interface.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';
import { BookingResponseDto } from './booking-response.dto.js';

/** Booking card in the staff panel: the booking plus the client's review of the visit. */
export class BookingDetailsResponseDto extends BookingResponseDto {
  @ApiProperty({
    type: () => ReviewResponseDto,
    nullable: true,
    description:
      'Review of this visit, hidden ones included. Null when there is none or the user lacks review:read',
  })
  review: ReviewResponseDto | null;

  static fromBooking(
    booking: BookingWithItems,
    review: ReviewWithStaff | null,
  ): BookingDetailsResponseDto {
    return Object.assign(new BookingDetailsResponseDto(), {
      ...BookingResponseDto.fromEntity(booking),
      review: review ? ReviewResponseDto.fromEntity(review) : null,
    });
  }
}
