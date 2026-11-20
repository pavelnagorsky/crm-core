import { ApiProperty } from '@nestjs/swagger';
import { ReviewResponseDto } from '../../reviews/dto/review-response.dto.js';
import { ReviewWithStaff } from '../../reviews/interfaces/review-with-staff.interface.js';
import { BookingTrafficDetails } from '../interfaces/booking-traffic-details.interface.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';
import { BookingResponseDto } from './booking-response.dto.js';
import { BookingTrafficTouchResponseDto } from './booking-traffic-touch-response.dto.js';

/** Booking card in the staff panel: the booking plus the client's review of the visit. */
export class BookingDetailsResponseDto extends BookingResponseDto {
  @ApiProperty({
    type: () => ReviewResponseDto,
    nullable: true,
    description:
      'Review of this visit, hidden ones included. Null when there is none or the user lacks review:read',
  })
  review: ReviewResponseDto | null;

  @ApiProperty({
    type: () => BookingTrafficTouchResponseDto,
    nullable: true,
    description:
      'The touch recorded with an online booking (UTM, referrer host, click id type). Null for a direct visit and for manual bookings',
  })
  traffic: BookingTrafficTouchResponseDto | null;

  @ApiProperty({
    type: Boolean,
    description:
      "This is the client's first booking in the brand: the one that brought the client",
  })
  isClientAcquisition: boolean;

  static fromBooking(
    booking: BookingWithItems,
    review: ReviewWithStaff | null,
    traffic: BookingTrafficDetails,
  ): BookingDetailsResponseDto {
    return Object.assign(new BookingDetailsResponseDto(), {
      ...BookingResponseDto.fromEntity(booking),
      review: review ? ReviewResponseDto.fromEntity(review) : null,
      traffic: traffic.touch
        ? BookingTrafficTouchResponseDto.fromEntity(traffic.touch)
        : null,
      isClientAcquisition: traffic.isClientAcquisition,
    });
  }
}
